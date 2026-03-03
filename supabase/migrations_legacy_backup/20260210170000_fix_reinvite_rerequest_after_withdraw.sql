-- Migration: Unified restart participation logic
-- v1.3 simplified semantics:
--   ANY removed user can "Request to Join" again (scope only for first entry)
--   ORG can "Invite" any removed user again
--   Nominate handles re-nomination of removed users
--   removed_* fields are CLEARED on restart (they represent current removed state only)
--   rpc_match_reactivate_participant is deprecated (not dropped, just unused)

-- ============================================================================
-- 1. rpc_match_request_join: Unified re-request for all removed users
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_request_join(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_existing match_participants;
  v_new_mp match_participants;
BEGIN
  -- SECURITY DEFINER baseline
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Check for existing participant record
  SELECT * INTO v_existing
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF FOUND THEN
    -- Already pending or confirmed
    IF v_existing.status IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'You are already a participant in this match';
    END IF;

    -- Removed: re-request (scope NOT required — had prior relationship)
    IF v_existing.status = 'removed' THEN
      UPDATE match_participants
      SET
        status = 'pending',
        join_method = 'requested',
        user_accepted_at = now(),
        org_approved_at = NULL,
        org_approved_by = NULL,
        nominated_by = NULL,
        removed_at = NULL,
        removed_by = NULL,
        removal_note = NULL,
        confirmed_at = NULL
      WHERE id = v_existing.id;

      PERFORM match_participant_reconcile_status(v_existing.id);
      SELECT * INTO v_new_mp FROM match_participants WHERE id = v_existing.id;
      RETURN v_new_mp;
    END IF;
  END IF;

  -- First entry: scope required
  IF NOT is_user_in_match_scope(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not eligible to request join this match (not in scope groups)';
  END IF;

  -- Fresh request
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, auth.uid(), 'requested', 'pending',
    now(), NULL, NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_request_join IS
  'v1.3: User requests to join. Re-request allowed for any removed user (no scope check). First entry requires scope.';

-- ============================================================================
-- 2. rpc_match_invite_user: ORG-only. Re-invite any removed user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_invite_user(
  p_match_id uuid,
  p_user_id uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_existing match_participants;
  v_new_mp match_participants;
BEGIN
  -- SECURITY DEFINER baseline
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- v1.3: ORG-only (participant invite → use rpc_match_nominate_user)
  IF NOT is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can invite users';
  END IF;

  -- Cannot invite self
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Check for existing participant record
  SELECT * INTO v_existing
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Already pending or confirmed
    IF v_existing.status IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'User is already a participant in this match';
    END IF;

    -- Removed: re-invite
    IF v_existing.status = 'removed' THEN
      UPDATE match_participants
      SET
        status = 'pending',
        join_method = 'invited',
        user_accepted_at = NULL,
        org_approved_at = now(),
        org_approved_by = auth.uid(),
        nominated_by = NULL,
        removed_at = NULL,
        removed_by = NULL,
        removal_note = NULL,
        confirmed_at = NULL
      WHERE id = v_existing.id;

      PERFORM match_participant_reconcile_status(v_existing.id);
      SELECT * INTO v_new_mp FROM match_participants WHERE id = v_existing.id;
      RETURN v_new_mp;
    END IF;
  END IF;

  -- Fresh invite
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, org_approved_by, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'invited', 'pending',
    NULL, now(), auth.uid(), NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_invite_user IS
  'v1.3: ORG-only invite. Re-invite allowed for any removed user. Clears removed_* on restart.';

-- ============================================================================
-- 3. rpc_match_nominate_user: Handle re-nomination of removed users
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(
  p_match_id uuid,
  p_user_id uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_existing match_participants;
  v_new_mp match_participants;
BEGIN
  -- SECURITY DEFINER baseline
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Check permission: ORG or confirmed participant with can_participants_invite_users
  IF NOT (
    is_match_organizer(p_match_id, auth.uid())
    OR (
      is_match_participant_confirmed(p_match_id, auth.uid())
      AND v_match.can_participants_invite_users
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to nominate users';
  END IF;

  -- Cannot nominate self
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot nominate yourself (use request join instead)';
  END IF;

  -- Check for existing participant record
  SELECT * INTO v_existing
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Already pending or confirmed
    IF v_existing.status IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'User is already a participant';
    END IF;

    -- Removed: re-nominate
    IF v_existing.status = 'removed' THEN
      UPDATE match_participants
      SET
        status = 'pending',
        join_method = 'requested',
        nominated_by = auth.uid(),
        user_accepted_at = NULL,
        org_approved_at = NULL,
        org_approved_by = NULL,
        removed_at = NULL,
        removed_by = NULL,
        removal_note = NULL,
        confirmed_at = NULL
      WHERE id = v_existing.id;

      PERFORM match_participant_reconcile_status(v_existing.id);
      SELECT * INTO v_new_mp FROM match_participants WHERE id = v_existing.id;
      RETURN v_new_mp;
    END IF;
  END IF;

  -- Fresh nomination
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'requested', 'pending',
    NULL, NULL, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_nominate_user IS
  'v1.3: Nominate user. Re-nomination allowed for any removed user. join_method=requested, nominated_by=caller. Requires user accept + ORG approve.';

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_match_request_join TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_invite_user TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_nominate_user TO authenticated;
