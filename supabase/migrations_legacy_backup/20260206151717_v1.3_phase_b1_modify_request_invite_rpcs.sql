-- Migration: v1.3 Phase B1 - Modify Request & Invite RPCs
-- Description: Update rpc_match_request_join and rpc_match_invite_user to write dual confirmation fields
-- Status: v1.3 RPC Upgrade (Behavior change, backward compatible)

-- ============================================================================
-- 1. rpc_match_request_join (v1.3 Update)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_request_join(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_new_mp match_participants;
BEGIN
  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- v1.3: Check scope eligibility (request is GROUP-based)
  IF NOT is_user_in_match_scope(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not eligible to request join this match (not in scope groups)';
  END IF;

  -- Check if already participant (except removed)
  IF EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id
      AND user_id = auth.uid()
      AND status != 'removed'
  ) THEN
    RAISE EXCEPTION 'You are already a participant in this match';
  END IF;

  -- Check if was removed (cannot re-request if removed, must wait for reactivation)
  IF EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id
      AND user_id = auth.uid()
      AND status = 'removed'
  ) THEN
    RAISE EXCEPTION 'You were removed from this match. Please wait for organizer reactivation.';
  END IF;

  -- Insert new participant
  INSERT INTO match_participants (
    match_id,
    user_id,
    join_method,
    status,
    user_accepted_at,  -- v1.3: Request = user already accepted
    org_approved_at,   -- v1.3: Waiting for ORG
    nominated_by,      -- v1.3: NULL (not nominated, direct request)
    created_by
  ) VALUES (
    p_match_id,
    auth.uid(),
    'requested',
    'pending',
    now(),             -- v1.3 KEY: Request implies user acceptance
    NULL,              -- Waiting for ORG approval
    NULL,              -- Not nominated
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  -- v1.3: Call reconcile (will stay pending until ORG approves)
  PERFORM match_participant_reconcile_status(v_new_mp.id);

  -- Return updated record
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_request_join IS
  'v1.3: User requests to join match. Must be in scope groups. Sets user_accepted_at immediately. Requires ORG approval to become confirmed.';

-- ============================================================================
-- 2. rpc_match_invite_user (v1.3 Update)
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
  v_new_mp match_participants;
BEGIN
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
    RAISE EXCEPTION 'You do not have permission to invite users to this match';
  END IF;

  -- v1.3: NO scope check (invite is NOT restricted by scope)

  -- Check if user is self
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Check if already participant (except removed)
  IF EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id
      AND user_id = p_user_id
      AND status != 'removed'
  ) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- If was removed, cannot re-invite (must reactivate first)
  IF EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id
      AND user_id = p_user_id
      AND status = 'removed'
  ) THEN
    RAISE EXCEPTION 'User was removed from this match. Use reactivate instead of re-inviting.';
  END IF;

  -- Insert new participant
  INSERT INTO match_participants (
    match_id,
    user_id,
    join_method,
    status,
    user_accepted_at,  -- v1.3: Waiting for user
    org_approved_at,   -- v1.3: Invite = ORG pre-approval
    org_approved_by,   -- v1.3: Record who approved
    nominated_by,      -- v1.3: NULL (not nominated, direct invite)
    created_by
  ) VALUES (
    p_match_id,
    p_user_id,
    'invited',
    'pending',
    NULL,              -- Waiting for user acceptance
    now(),             -- v1.3 KEY: Invite implies ORG approval
    auth.uid(),        -- Record inviter
    NULL,              -- Not nominated
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  -- v1.3: Call reconcile (will stay pending until user accepts)
  PERFORM match_participant_reconcile_status(v_new_mp.id);

  -- Return updated record
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_invite_user IS
  'v1.3: Invite user to match. NOT restricted by scope. Sets org_approved_at immediately. Requires user acceptance to become confirmed.';

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_match_request_join TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_invite_user TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase B1 complete: rpc_match_request_join and rpc_match_invite_user updated for v1.3';
END $$;
