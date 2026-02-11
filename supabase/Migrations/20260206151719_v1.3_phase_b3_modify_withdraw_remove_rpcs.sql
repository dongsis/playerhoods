-- Migration: v1.3 Phase B3 - Modify Withdraw & Remove RPCs
-- Description: Update decline/leave (merge to withdraw) and remove to write removed_by
-- Status: v1.3 RPC Upgrade (Add removed_by tracking, merge decline/leave)

-- ============================================================================
-- 1. rpc_match_user_withdraw (v1.3 Unified RPC for decline/leave)
-- ============================================================================

-- Drop old functions
DROP FUNCTION IF EXISTS public.rpc_match_decline_invite(uuid);
DROP FUNCTION IF EXISTS public.rpc_match_leave(uuid);

-- Create unified withdraw function
CREATE OR REPLACE FUNCTION public.rpc_match_user_withdraw(p_match_id uuid)
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
    -- Already removed, idempotent
    RETURN v_mp;
  END IF;

  IF v_mp.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Cannot withdraw from status: %', v_mp.status;
  END IF;

  -- v1.3: Set status to removed + record who removed
  UPDATE match_participants
  SET
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid(),  -- v1.3 KEY: Record user self-withdrawal
    removal_note = CASE
      WHEN v_mp.join_method = 'invited' AND v_mp.status = 'pending' THEN 'User declined invitation'
      WHEN v_mp.status = 'confirmed' THEN 'User left match'
      ELSE 'User withdrew'
    END
  WHERE id = v_mp.id;

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_user_withdraw IS
  'v1.3: User withdraws from match (decline invite or leave). Sets status=removed and removed_by=user_id. Can be reactivated by ORG.';

-- ============================================================================
-- 2. rpc_match_remove_participant (v1.3 Update)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_remove_participant(p_match_participant_id uuid)
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

  -- Check permission: ORG always, or confirmed MP with can_participants_manage_participants
  IF NOT (
    is_match_organizer(v_match_id, auth.uid())
    OR (
      is_match_participant_confirmed(v_match_id, auth.uid())
      AND (SELECT can_participants_manage_participants FROM matches WHERE id = v_match_id)
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to remove participants';
  END IF;

  -- Check status
  IF v_mp.status = 'removed' THEN
    -- Already removed, idempotent
    RETURN v_mp;
  END IF;

  IF v_mp.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Cannot remove participant with status: %', v_mp.status;
  END IF;

  -- v1.3: Set status to removed + record who removed
  UPDATE match_participants
  SET
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid(),  -- v1.3 KEY: Record ORG/manager removal
    removal_note = CASE
      WHEN v_mp.status = 'pending' AND v_mp.join_method = 'requested' THEN 'Request rejected by organizer'
      WHEN v_mp.status = 'pending' AND v_mp.join_method = 'invited' THEN 'Invitation revoked by organizer'
      WHEN v_mp.status = 'confirmed' THEN 'Removed by organizer'
      ELSE 'Removed'
    END
  WHERE id = p_match_participant_id;

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_remove_participant IS
  'v1.3: ORG/manager removes participant. Sets status=removed and removed_by=remover_id. Can be reactivated by ORG.';

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_match_user_withdraw TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_remove_participant TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify old functions are dropped
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('rpc_match_decline_invite', 'rpc_match_leave')) THEN
    RAISE WARNING 'Old decline/leave functions still exist, may need manual cleanup';
  END IF;

  -- Verify new function exists
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_user_withdraw') THEN
    RAISE EXCEPTION 'New rpc_match_user_withdraw not created';
  END IF;

  RAISE NOTICE 'Phase B3 complete: rpc_match_user_withdraw created (unified decline/leave), rpc_match_remove_participant updated with removed_by';
END $$;
