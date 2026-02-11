-- Migration: v1.3 Phase B2 - Modify Accept & Approve RPCs
-- Description: Update rpc_match_accept_invite and rpc_match_confirm_participant (rename to org_approve)
-- Status: v1.3 RPC Upgrade (Behavior change, rename confirm → approve)

-- ============================================================================
-- 1. rpc_match_accept_invite (v1.3 Update)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_accept_invite(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp match_participants;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp
  FROM match_participants
  WHERE match_id = p_match_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Check status
  IF v_mp.status = 'removed' THEN
    RAISE EXCEPTION 'Cannot accept: You were removed from this match. Wait for organizer reactivation.';
  END IF;

  IF v_mp.status = 'confirmed' THEN
    -- Already confirmed, idempotent
    RETURN v_mp;
  END IF;

  -- Check join_method (should be invited for this RPC)
  IF v_mp.join_method != 'invited' THEN
    RAISE EXCEPTION 'This action is only for invited participants. Use appropriate action for your join method.';
  END IF;

  -- v1.3: Set user_accepted_at (idempotent with COALESCE)
  UPDATE match_participants
  SET user_accepted_at = COALESCE(user_accepted_at, now())
  WHERE id = v_mp.id;

  -- v1.3: Call reconcile (may transition to confirmed if org_approved_at exists)
  PERFORM match_participant_reconcile_status(v_mp.id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_accept_invite IS
  'v1.3: User accepts invitation. Sets user_accepted_at. Becomes confirmed if ORG already approved (org_approved_at exists).';

-- ============================================================================
-- 2. rpc_match_org_approve_participant (v1.3 New Name, ORG Only)
-- ============================================================================

-- Drop old function if exists
DROP FUNCTION IF EXISTS public.rpc_match_confirm_participant(uuid);

-- Create new function with v1.3 semantics
CREATE OR REPLACE FUNCTION public.rpc_match_org_approve_participant(p_match_participant_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp match_participants;
  v_match_id uuid;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_match_participant_id;
  END IF;

  v_match_id := v_mp.match_id;

  -- v1.3: ORG ONLY (no MP approve)
  IF NOT is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can approve participants';
  END IF;

  -- Check status
  IF v_mp.status = 'removed' THEN
    RAISE EXCEPTION 'Cannot approve: Participant is removed. Use reactivate first.';
  END IF;

  IF v_mp.status = 'confirmed' THEN
    -- Already confirmed, idempotent
    RETURN v_mp;
  END IF;

  -- v1.3: Set org_approved_at (idempotent with COALESCE)
  UPDATE match_participants
  SET
    org_approved_at = COALESCE(org_approved_at, now()),
    org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  -- v1.3: Call reconcile (may transition to confirmed if user_accepted_at exists)
  PERFORM match_participant_reconcile_status(p_match_participant_id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_org_approve_participant IS
  'v1.3: ORG approves participant. ORG ONLY. Sets org_approved_at. Becomes confirmed if user already accepted (user_accepted_at exists).';

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_match_accept_invite TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_org_approve_participant TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify old function is dropped
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_confirm_participant'
  ) THEN
    RAISE WARNING 'Old rpc_match_confirm_participant still exists, may need manual cleanup';
  END IF;

  -- Verify new function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_org_approve_participant'
  ) THEN
    RAISE EXCEPTION 'New rpc_match_org_approve_participant not created';
  END IF;

  RAISE NOTICE 'Phase B2 complete: rpc_match_accept_invite updated, rpc_match_org_approve_participant created (ORG only)';
END $$;
