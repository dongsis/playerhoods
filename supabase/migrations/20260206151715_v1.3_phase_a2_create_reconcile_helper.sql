-- Migration: v1.3 Phase A2 - Create Reconcile Helper
-- Description: Create match_participant_reconcile_status helper function
-- Status: v1.3 Core Logic (Idempotent, Security Definer)

-- ============================================================================
-- Reconcile Status Helper (v1.3 Dual Confirmation Model)
-- ============================================================================

CREATE OR REPLACE FUNCTION match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp record;
BEGIN
  -- Fetch participant record
  SELECT
    id,
    status,
    user_id,
    guest_id,
    user_accepted_at,
    org_approved_at
  INTO v_mp
  FROM match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- Terminal state: do nothing if removed
  IF v_mp.status = 'removed' THEN
    RETURN;
  END IF;

  -- Guest participant: only needs org_approved_at
  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      -- Guest is effectively confirmed
      UPDATE match_participants
      SET status = 'confirmed'
      WHERE id = p_mp_id
        AND status != 'confirmed';  -- Only update if not already confirmed
    ELSE
      -- Guest is pending org approval
      UPDATE match_participants
      SET status = 'pending'
      WHERE id = p_mp_id
        AND status != 'pending';
    END IF;
    RETURN;
  END IF;

  -- User participant: needs both user_accepted_at AND org_approved_at
  IF v_mp.user_id IS NOT NULL THEN
    IF v_mp.user_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      -- User is effectively confirmed (both sides confirmed)
      UPDATE match_participants
      SET status = 'confirmed',
          confirmed_at = COALESCE(confirmed_at, now())  -- Set confirmed_at once
      WHERE id = p_mp_id
        AND status != 'confirmed';
    ELSE
      -- User is pending (waiting for one or both sides)
      UPDATE match_participants
      SET status = 'pending'
      WHERE id = p_mp_id
        AND status != 'pending';
    END IF;
    RETURN;
  END IF;

  -- Should never reach here (participant must have user_id or guest_id)
  RAISE EXCEPTION 'Invalid participant state: neither user_id nor guest_id set for participant %', p_mp_id;
END;
$$;

COMMENT ON FUNCTION match_participant_reconcile_status IS
  'v1.3: Synchronizes match_participants.status based on dual confirmation fields (user_accepted_at, org_approved_at). Must be called by any RPC that modifies these fields. Idempotent.';

-- ============================================================================
-- Grant execute to authenticated users (called via RPC)
-- ============================================================================

GRANT EXECUTE ON FUNCTION match_participant_reconcile_status TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'match_participant_reconcile_status'
  ) THEN
    RAISE EXCEPTION 'Function match_participant_reconcile_status not created';
  END IF;

  RAISE NOTICE 'Phase A2 complete: Reconcile helper created';
END $$;
