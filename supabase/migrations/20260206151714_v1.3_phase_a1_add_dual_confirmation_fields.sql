-- Migration: v1.3 Phase A1 - Add Dual Confirmation Fields
-- Description: Add user_accepted_at, org_approved_at, and audit fields to match_participants
-- Status: v1.3 Schema Extension (Append-only)

-- ============================================================================
-- Add dual confirmation fields (v1.3 core requirement)
-- ============================================================================

ALTER TABLE match_participants
  ADD COLUMN IF NOT EXISTS user_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS org_approved_at timestamptz NULL;

COMMENT ON COLUMN match_participants.user_accepted_at IS
  'v1.3: Timestamp when user confirmed availability/acceptance. NULL = not yet accepted. Required for user participants to become confirmed.';

COMMENT ON COLUMN match_participants.org_approved_at IS
  'v1.3: Timestamp when organizer approved this participant. NULL = not yet approved. Required for all participants to become confirmed.';

-- ============================================================================
-- Add audit fields (v1.3 requirement)
-- ============================================================================

ALTER TABLE match_participants
  ADD COLUMN IF NOT EXISTS org_approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS nominated_by uuid NULL,
  ADD COLUMN IF NOT EXISTS removed_by uuid NULL,
  ADD COLUMN IF NOT EXISTS removal_note text NULL;

COMMENT ON COLUMN match_participants.org_approved_by IS
  'v1.3: User ID of the organizer who approved this participant. NULL if not yet approved.';

COMMENT ON COLUMN match_participants.nominated_by IS
  'v1.3: User ID of the participant who nominated this user (for join_method=requested with nomination). NULL if not nominated or if direct request/invite.';

COMMENT ON COLUMN match_participants.removed_by IS
  'v1.3 CRITICAL: User ID who removed this participant. Must be set when status=removed. Used to distinguish user-withdrawal vs org-removal for reactivation logic.';

COMMENT ON COLUMN match_participants.removal_note IS
  'v1.3: Optional note explaining why participant was removed (e.g., "declined", "rejected", "capacity reached").';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify all columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_participants' AND column_name = 'user_accepted_at'
  ) THEN
    RAISE EXCEPTION 'Column user_accepted_at not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_participants' AND column_name = 'org_approved_at'
  ) THEN
    RAISE EXCEPTION 'Column org_approved_at not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_participants' AND column_name = 'removed_by'
  ) THEN
    RAISE EXCEPTION 'Column removed_by not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_participants' AND column_name = 'nominated_by'
  ) THEN
    RAISE EXCEPTION 'Column nominated_by not created';
  END IF;

  RAISE NOTICE 'Phase A1 complete: All dual confirmation and audit fields added';
END $$;
