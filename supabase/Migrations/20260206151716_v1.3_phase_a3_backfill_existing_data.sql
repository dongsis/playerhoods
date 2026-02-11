-- Migration: v1.3 Phase A3 - Backfill Existing Data
-- Description: Backfill user_accepted_at, org_approved_at for existing participants
-- Status: v1.3 Data Migration (One-time, Idempotent)

-- ============================================================================
-- Backfill Strategy (Based on Current Status)
-- ============================================================================

-- Assumption: Existing data is in v1.0-v1.1 state (single-sided confirmation)
-- We infer dual confirmation fields from current status and join_method

-- ============================================================================
-- Step 1: Backfill confirmed participants (both sides confirmed)
-- ============================================================================

-- For confirmed user participants: assume both sides confirmed at confirmed_at time
UPDATE match_participants
SET
  user_accepted_at = COALESCE(confirmed_at, created_at),
  org_approved_at = COALESCE(confirmed_at, created_at)
WHERE status = 'confirmed'
  AND user_id IS NOT NULL
  AND user_accepted_at IS NULL  -- Only backfill if not already set
  AND org_approved_at IS NULL;

-- For confirmed guest participants: only org_approved_at needed
UPDATE match_participants
SET
  org_approved_at = COALESCE(confirmed_at, created_at)
WHERE status = 'confirmed'
  AND guest_id IS NOT NULL
  AND org_approved_at IS NULL;

-- ============================================================================
-- Step 2: Backfill pending invited participants (ORG already approved)
-- ============================================================================

-- Invited participants: ORG approved when created (invite = pre-approval)
-- User has not yet accepted
UPDATE match_participants
SET
  org_approved_at = created_at,
  user_accepted_at = NULL  -- Explicitly NULL (waiting for user)
WHERE status = 'pending'
  AND join_method = 'invited'
  AND org_approved_at IS NULL;

-- ============================================================================
-- Step 3: Backfill pending requested participants (User already accepted)
-- ============================================================================

-- Requested participants: User accepted when created (request = user intent)
-- ORG has not yet approved
UPDATE match_participants
SET
  user_accepted_at = created_at,
  org_approved_at = NULL  -- Explicitly NULL (waiting for ORG)
WHERE status = 'pending'
  AND join_method = 'requested'
  AND user_accepted_at IS NULL;

-- ============================================================================
-- Step 4: Backfill removed participants (preserve historical state)
-- ============================================================================

-- For removed participants: infer based on join_method
-- (We can't know exact confirmation state before removal, so use heuristics)

-- Removed invited: likely declined before accepting
UPDATE match_participants
SET
  org_approved_at = created_at,  -- ORG had approved (invite)
  user_accepted_at = NULL        -- User never accepted (declined)
WHERE status = 'removed'
  AND join_method = 'invited'
  AND org_approved_at IS NULL;

-- Removed requested: likely rejected by ORG
UPDATE match_participants
SET
  user_accepted_at = created_at, -- User had requested (accepted)
  org_approved_at = NULL         -- ORG never approved (rejected)
WHERE status = 'removed'
  AND join_method = 'requested'
  AND user_accepted_at IS NULL;

-- Removed confirmed: both had confirmed before removal
UPDATE match_participants
SET
  user_accepted_at = COALESCE(confirmed_at, created_at),
  org_approved_at = COALESCE(confirmed_at, created_at)
WHERE status = 'removed'
  AND user_id IS NOT NULL
  AND user_accepted_at IS NULL
  AND org_approved_at IS NULL
  AND confirmed_at IS NOT NULL;  -- Only if we have confirmed_at

-- ============================================================================
-- Step 5: Backfill removed_by (Critical for v1.3 reactivation logic)
-- ============================================================================

-- For removed participants without removed_by:
-- We cannot definitively know who removed them, so we use heuristics:
-- - If join_method = invited and status = removed: likely user declined → removed_by = user_id
-- - If join_method = requested and status = removed: likely ORG rejected → removed_by = organizer_id
-- - If confirmed then removed: unknown, default to user_id (assume self-withdrawal)

-- Declined invites (user-initiated)
UPDATE match_participants mp
SET removed_by = mp.user_id
FROM matches m
WHERE mp.match_id = m.id
  AND mp.status = 'removed'
  AND mp.join_method = 'invited'
  AND mp.removed_by IS NULL
  AND mp.user_id IS NOT NULL;

-- Rejected requests (ORG-initiated)
UPDATE match_participants mp
SET removed_by = m.organizer_id
FROM matches m
WHERE mp.match_id = m.id
  AND mp.status = 'removed'
  AND mp.join_method = 'requested'
  AND mp.removed_by IS NULL;

-- Confirmed then removed (default to user withdrawal)
UPDATE match_participants mp
SET removed_by = mp.user_id
FROM matches m
WHERE mp.match_id = m.id
  AND mp.status = 'removed'
  AND mp.confirmed_at IS NOT NULL
  AND mp.removed_by IS NULL
  AND mp.user_id IS NOT NULL;

-- Guests removed (default to ORG)
UPDATE match_participants mp
SET removed_by = m.organizer_id
FROM matches m
WHERE mp.match_id = m.id
  AND mp.status = 'removed'
  AND mp.guest_id IS NOT NULL
  AND mp.removed_by IS NULL;

-- ============================================================================
-- Step 6: Call reconcile for all pending/confirmed to verify consistency
-- ============================================================================

DO $$
DECLARE
  v_mp_id uuid;
BEGIN
  -- Call reconcile for all non-removed participants
  FOR v_mp_id IN
    SELECT id FROM match_participants WHERE status != 'removed'
  LOOP
    PERFORM match_participant_reconcile_status(v_mp_id);
  END LOOP;

  RAISE NOTICE 'Reconcile called for all non-removed participants';
END $$;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  v_count_user_confirmed_missing_fields int;
  v_count_guest_confirmed_missing_fields int;
  v_count_removed_missing_removed_by int;
BEGIN
  -- Check: Confirmed user participants must have both fields
  SELECT COUNT(*) INTO v_count_user_confirmed_missing_fields
  FROM match_participants
  WHERE status = 'confirmed'
    AND user_id IS NOT NULL
    AND (user_accepted_at IS NULL OR org_approved_at IS NULL);

  IF v_count_user_confirmed_missing_fields > 0 THEN
    RAISE WARNING '% confirmed user participants missing dual confirmation fields', v_count_user_confirmed_missing_fields;
  END IF;

  -- Check: Confirmed guest participants must have org_approved_at
  SELECT COUNT(*) INTO v_count_guest_confirmed_missing_fields
  FROM match_participants
  WHERE status = 'confirmed'
    AND guest_id IS NOT NULL
    AND org_approved_at IS NULL;

  IF v_count_guest_confirmed_missing_fields > 0 THEN
    RAISE WARNING '% confirmed guest participants missing org_approved_at', v_count_guest_confirmed_missing_fields;
  END IF;

  -- Check: Removed participants should have removed_by (CRITICAL for v1.3)
  SELECT COUNT(*) INTO v_count_removed_missing_removed_by
  FROM match_participants
  WHERE status = 'removed'
    AND removed_by IS NULL;

  IF v_count_removed_missing_removed_by > 0 THEN
    RAISE WARNING '% removed participants missing removed_by (may affect reactivation logic)', v_count_removed_missing_removed_by;
  END IF;

  RAISE NOTICE 'Phase A3 complete: Data backfill finished. Warnings above (if any) indicate data that needs manual review.';
END $$;
