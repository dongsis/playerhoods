-- Fix: 1) delegate_manual_confirm_targets ambiguous user_id
--       2) Activity subject names - RPC to resolve participant display names (bypasses RLS for lookup)

-- =============================================================================
-- 1) Fix ambiguous user_id in rpc_match_delegate_manual_confirm_targets
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_manual_confirm_targets(p_match_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_match.status <> 'active' THEN
    RETURN;
  END IF;

  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RETURN;
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_uid)
     AND NOT public.is_user_match_associated(p_match_id, v_uid) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id AS uid
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.status IN ('pending','confirmed')
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id AS uid
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other
      ON gm_caller.group_id = gm_other.group_id
    JOIN public.groups g
      ON g.id = gm_caller.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
      AND g.group_kind = 'friend'
  )
  SELECT
    sgm.uid AS user_id,
    pd.display_name
  FROM shared_group_members sgm
  JOIN public.profile_display pd ON pd.id = sgm.uid
  WHERE sgm.uid NOT IN (SELECT aa.uid FROM already_active aa)
  ORDER BY pd.display_name;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_manual_confirm_targets(uuid)
IS 'v1.6.3: Friend-group-only targets for delegate manual confirm. Fixed ambiguous user_id.';

-- =============================================================================
-- 2) RPC to resolve participant display names (for activity feed when RLS hides participant)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_match_participant_display_names(
  p_match_id uuid,
  p_participant_ids uuid[]
)
RETURNS TABLE(participant_id uuid, display_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Caller must be able to see the match (organizer, participant, or in scope)
  IF NOT (
    public.is_match_organizer(p_match_id, v_uid)
    OR EXISTS (SELECT 1 FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.user_id = v_uid)
    OR public.is_caller_in_match_scope(p_match_id)
    OR public.is_caller_match_associated(p_match_id)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    mp.id AS participant_id,
    COALESCE(
      pd.display_name,
      g.display_name::text,
      'Unknown'
    ) AS display_name
  FROM public.match_participants mp
  LEFT JOIN public.profile_display pd ON pd.id = mp.user_id
  LEFT JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.id = ANY(p_participant_ids);
END;
$$;

COMMENT ON FUNCTION public.rpc_match_participant_display_names(uuid, uuid[])
IS 'v1.7: Resolve participant display names for activity feed. Bypasses participant RLS for lookup. Caller must see match.';

GRANT EXECUTE ON FUNCTION public.rpc_match_participant_display_names(uuid, uuid[]) TO authenticated;
