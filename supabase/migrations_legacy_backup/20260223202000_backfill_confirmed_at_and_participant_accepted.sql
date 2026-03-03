-- =============================================================================
-- Migration: 20260223202000_backfill_confirmed_at_and_participant_accepted
--
-- Purpose: Fix two classes of stale data that cause UI display inconsistencies:
--
-- 1. confirmed_at IS NULL for status='confirmed' participants
--    Root cause: participants confirmed before v1.5 (or via direct status write)
--    never had confirmed_at set. The match_formed/match_counts views now use
--    confirmed_at IS NOT NULL to count confirmed participants, so these rows
--    show confirmed_count = 0 in the header even though they appear in the
--    CONFIRMED section (which uses status='confirmed').
--    Fix: set confirmed_at = COALESCE(org_approved_at, participant_accepted_at,
--         user_accepted_at, created_at) for all confirmed rows missing it.
--
-- 2. participant_accepted_at IS NULL for join_method='requested' participants
--    Root cause: v1.3 requested participants may have been created before the
--    participant_accepted_at column existed (1A migration). The 1B backfill
--    only copies user_accepted_at → participant_accepted_at, but some old
--    requested rows had user_accepted_at = NULL too (v1.3 request flow did
--    not always set user_accepted_at). A requesting user has implicitly
--    accepted by requesting, so we backfill from created_at.
--    Fix: set participant_accepted_at = COALESCE(user_accepted_at, created_at)
--         for non-removed requested participants missing it.
--
-- Both fixes are safe / idempotent (WHERE guards prevent double-writes).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Backfill confirmed_at for confirmed participants
-- ---------------------------------------------------------------------------
UPDATE public.match_participants
SET confirmed_at = COALESCE(
  org_approved_at,
  participant_accepted_at,
  user_accepted_at,
  created_at
)
WHERE status       = 'confirmed'
  AND confirmed_at IS NULL
  AND removed_at   IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill participant_accepted_at for requested participants
--    (requesting = implicit user acceptance; use created_at as timestamp)
-- ---------------------------------------------------------------------------
UPDATE public.match_participants
SET
  participant_accepted_at  = COALESCE(user_accepted_at, created_at),
  participant_accepted_via = 'in_app'
WHERE join_method           = 'requested'
  AND participant_accepted_at IS NULL
  AND removed_at             IS NULL;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing_confirmed    bigint;
  v_missing_accepted     bigint;
BEGIN
  SELECT count(*) INTO v_missing_confirmed
  FROM public.match_participants
  WHERE status = 'confirmed' AND confirmed_at IS NULL AND removed_at IS NULL;

  IF v_missing_confirmed > 0 THEN
    RAISE WARNING '20260223202000: % confirmed rows still have confirmed_at IS NULL (investigate)', v_missing_confirmed;
  END IF;

  SELECT count(*) INTO v_missing_accepted
  FROM public.match_participants
  WHERE join_method = 'requested' AND participant_accepted_at IS NULL AND removed_at IS NULL;

  IF v_missing_accepted > 0 THEN
    RAISE WARNING '20260223202000: % requested rows still have participant_accepted_at IS NULL (investigate)', v_missing_accepted;
  END IF;

  RAISE NOTICE '20260223202000: backfill complete (confirmed_at, participant_accepted_at for requested)';
END $$;

COMMIT;
