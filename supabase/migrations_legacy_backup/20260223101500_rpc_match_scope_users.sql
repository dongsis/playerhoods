BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_match_scope_users(p_match_id uuid)
RETURNS TABLE (id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Allow only: organizer OR scope member
  IF NOT public.is_match_organizer(p_match_id, v_uid)
     AND NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_uid) THEN
    RAISE EXCEPTION 'not_in_scope';
  END IF;

  RETURN QUERY
  WITH scope_members AS (
    SELECT DISTINCT gm.user_id
    FROM public.group_members gm
    WHERE gm.group_id = ANY(v_match.invitation_scope_group_ids)
      AND gm.status = 'active'
      AND gm.removed_at IS NULL
      AND gm.user_id IS NOT NULL
  ),
  already_in_match AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.removed_at IS NULL
  )
  SELECT
    sm.user_id,      -- maps to output column 'id' by position; alias omitted to avoid ambiguity with pd.id
    pd.display_name
  FROM scope_members sm
  JOIN public.profile_display pd ON pd.id = sm.user_id
  WHERE sm.user_id <> v_uid
    AND sm.user_id NOT IN (SELECT user_id FROM already_in_match)
  ORDER BY pd.display_name;

END;
$$;

REVOKE ALL ON FUNCTION public.rpc_match_scope_users(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_scope_users(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_scope_users(uuid) TO authenticated;

COMMIT;