-- =============================================================================
-- Phase 4B: Simplify delegate_confirm_user and delegate_manual_confirm_targets
-- Introduces: caller gate, target-state classifier, write helper
-- Keeps external RPC names. Preserves lifecycle and permission semantics.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) can_delegate_confirm_user_caller — caller gate only (for targets list)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_delegate_confirm_user_caller(
  p_match_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%rowtype;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_match.status <> 'active' THEN
    RETURN false;
  END IF;

  IF public.is_match_organizer(p_match_id, p_actor_id) THEN
    RETURN false;
  END IF;

  IF NOT public.is_user_in_scope_groups(
    COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]),
    p_actor_id
  )
  AND NOT public.is_user_match_associated(p_match_id, p_actor_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_delegate_confirm_user_caller(uuid, uuid) IS
'Phase 4B: Caller gate for delegate confirm user. Non-org + (InScope OR MatchAssociated) + match active.';


-- -----------------------------------------------------------------------------
-- 2) check_delegate_confirm_user_target — full gate, raises on failure
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_delegate_confirm_user_target(
  p_match_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%rowtype;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  IF public.is_match_organizer(p_match_id, p_actor_id) THEN
    RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match';
  END IF;

  IF NOT public.is_user_in_scope_groups(
    COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]),
    p_actor_id
  )
  AND NOT public.is_user_match_associated(p_match_id, p_actor_id) THEN
    RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match';
  END IF;

  IF p_target_user_id = p_actor_id THEN
    RAISE EXCEPTION 'Cannot delegate-confirm yourself';
  END IF;

  IF public.is_user_match_associated(p_match_id, p_target_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF NOT public.do_users_share_group(p_target_user_id, p_actor_id) THEN
    RAISE EXCEPTION 'Target user is not in your shared groups';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_delegate_confirm_user_target(uuid, uuid, uuid) IS
'Phase 4B: Full gate for delegate confirm user target. Raises on failure. Includes caller gate + no self + target not active + ShareGroup.';

-- Boolean variant for targets RPC / other callers that need a check without raise
CREATE OR REPLACE FUNCTION public.can_delegate_confirm_user_target(
  p_match_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.can_delegate_confirm_user_caller(p_match_id, p_actor_id) THEN
    RETURN false;
  END IF;
  IF p_target_user_id = p_actor_id THEN
    RETURN false;
  END IF;
  IF public.is_user_match_associated(p_match_id, p_target_user_id) THEN
    RETURN false;
  END IF;
  IF NOT public.do_users_share_group(p_target_user_id, p_actor_id) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_delegate_confirm_user_target(uuid, uuid, uuid) IS
'Phase 4B: Boolean gate for delegate confirm user target. Use check_delegate_confirm_user_target when you need specific exceptions.';


-- -----------------------------------------------------------------------------
-- 3) get_delegate_user_target_state — classify target
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_delegate_user_target_state(
  p_match_id uuid,
  p_target_user_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.match_participants mp
        WHERE mp.match_id = p_match_id
          AND mp.user_id = p_target_user_id
          AND mp.status IN ('pending', 'confirmed')
      ) THEN 'active_present'
      WHEN EXISTS (
        SELECT 1 FROM public.match_participants mp
        WHERE mp.match_id = p_match_id
          AND mp.user_id = p_target_user_id
          AND mp.status = 'removed'
      ) THEN 'removed_present'
      ELSE 'absent'
    END;
$$;

COMMENT ON FUNCTION public.get_delegate_user_target_state(uuid, uuid) IS
'Phase 4B: Target state for delegate confirm. active_present | removed_present | absent.';


-- -----------------------------------------------------------------------------
-- 4) apply_delegate_confirm_user_target — write helper (re-entry or fresh)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_delegate_confirm_user_target(
  p_match_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state   text;
  v_existing public.match_participants%rowtype;
  v_new_mp   public.match_participants%rowtype;
  v_constraint text;
BEGIN
  v_state := public.get_delegate_user_target_state(p_match_id, p_target_user_id);

  IF v_state = 'active_present' THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF v_state = 'removed_present' THEN
    SELECT * INTO v_existing
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_target_user_id AND status = 'removed'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'removed_participant_not_found';
    END IF;

    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'nominated',
      participant_accepted_at  = now(),
      participant_accepted_via = 'delegate_manual',
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = p_actor_id,
      manual_confirmed_by      = p_actor_id
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',                 NULL, p_actor_id),
      (p_match_id, v_existing.id, 'delegate_manual_confirm', NULL, p_actor_id);

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- v_state = 'absent' → fresh insert
  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by,
      nominated_by, manual_confirmed_by,
      created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'nominated',
      now(), 'delegate_manual',
      NULL, NULL,
      p_actor_id, p_actor_id,
      p_actor_id
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uq_match_participants_active_user' THEN
        RAISE EXCEPTION 'User is already a participant in this match';
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'delegate_manual_confirm', NULL, p_actor_id);

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.apply_delegate_confirm_user_target(uuid, uuid, uuid) IS
'Phase 4B: Write helper for delegate confirm user. active_present→reject; removed_present→re-entry; absent→fresh insert.';


-- -----------------------------------------------------------------------------
-- 5) rpc_match_delegate_confirm_user — use helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  PERFORM public.check_delegate_confirm_user_target(p_match_id, v_uid, p_user_id);

  RETURN public.apply_delegate_confirm_user_target(p_match_id, v_uid, p_user_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_user(uuid, uuid) IS
'v1.6.3: Non-org delegate-confirms a user from friend-share groups. Fresh insert or re-entry. Sets participant_accepted_at via delegate_manual; organizer approval still required.';


-- -----------------------------------------------------------------------------
-- 6) rpc_match_delegate_manual_confirm_targets — use caller gate helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_manual_confirm_targets(p_match_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.can_delegate_confirm_user_caller(p_match_id, v_uid) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.status IN ('pending', 'confirmed')
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
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
    sgm.user_id,
    pd.display_name
  FROM shared_group_members sgm
  JOIN public.profile_display pd ON pd.id = sgm.user_id
  WHERE sgm.user_id NOT IN (SELECT user_id FROM already_active)
  ORDER BY pd.display_name;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_manual_confirm_targets(uuid) IS
'v1.6.3: Friend-group-only targets for delegate manual confirm. Caller: non-org + (InScope OR MatchAssociated). Returns empty when ineligible.';
