-- Migration: v1.5 Phase 1B — Backfill participant_accepted_at from user_accepted_at
-- Description: One-time data migration. Safe to run on live DB.
-- After this, participant_accepted_at is authoritative for all historical rows.
-- user_accepted_at is preserved (not dropped until 1G, after full stabilization).

BEGIN;

-- ============================================================================
-- Backfill participant_accepted_at where user_accepted_at exists
-- ============================================================================

UPDATE public.match_participants
SET
  participant_accepted_at  = user_accepted_at,
  participant_accepted_via = 'in_app'
WHERE
  user_accepted_at IS NOT NULL
  AND participant_accepted_at IS NULL;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  v_unfilled bigint;
BEGIN
  -- Any row with user_accepted_at set should now also have participant_accepted_at set
  SELECT count(*) INTO v_unfilled
  FROM public.match_participants
  WHERE user_accepted_at IS NOT NULL
    AND participant_accepted_at IS NULL;

  IF v_unfilled > 0 THEN
    RAISE EXCEPTION 'v1.5-1B: % rows still have user_accepted_at but no participant_accepted_at', v_unfilled;
  END IF;

  -- Any row with participant_accepted_at set should have participant_accepted_via set
  SELECT count(*) INTO v_unfilled
  FROM public.match_participants
  WHERE participant_accepted_at IS NOT NULL
    AND participant_accepted_via IS NULL;

  IF v_unfilled > 0 THEN
    RAISE EXCEPTION 'v1.5-1B: % rows have participant_accepted_at but no participant_accepted_via', v_unfilled;
  END IF;

  RAISE NOTICE 'v1.5-1B complete: participant_accepted_at backfilled from user_accepted_at';
END $$;

COMMIT;
