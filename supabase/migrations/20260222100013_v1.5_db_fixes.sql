-- Migration: v1.5 DB Fixes (consolidated from dev migrations 13/14/15)
--
-- A. Drop orphan rpc_match_user_withdraw(uuid, text) overload
--    The action_notes migration was applied directly to production and added a p_note
--    variant. The v1.5 rewrite (20260222100006) replaced it with a single-param version,
--    leaving a second overload that PostgREST cannot resolve. Drop the stray one.
--    (Idempotent: DROP FUNCTION IF EXISTS)
--
-- B. Backfill confirmed_at for historically confirmed participants
--    The v1.5 match_formed view counts by confirmed_at IS NOT NULL, but pre-v1.5
--    participants confirmed via the old status-based path have confirmed_at IS NULL.
--    Strategy: prefer existing historical timestamps; fall back to created_at (not now()).
--    (Idempotent: all UPDATEs are guarded by WHERE confirmed_at IS NULL)
--
-- C. Correct confirmed_at timestamps for already-backfilled rows (corrective pass)
--    Uses fields not touched by step B (user_accepted_at, created_at) to compute
--    a more accurate estimate using LEAST() — never pushes confirmed_at later.
--    (Idempotent: LEAST() applied to already-correct values is a no-op)

BEGIN;

-- ============================================================================
-- A. Drop orphan rpc_match_user_withdraw(uuid, text)
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_user_withdraw(uuid, text);

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'rpc_match_user_withdraw'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'v1.5-db-fixes A: rpc_match_user_withdraw not found';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'v1.5-db-fixes A: rpc_match_user_withdraw still has % overloads', v_count;
  ELSE
    RAISE NOTICE 'v1.5-db-fixes A: rpc_match_user_withdraw — 1 canonical signature confirmed';
  END IF;
END $$;

-- ============================================================================
-- B. Backfill confirmed_at using historical timestamps
-- ============================================================================

-- B1: User participants — set timestamps reconcile needs to keep them confirmed
UPDATE public.match_participants
SET
  org_approved_at          = COALESCE(org_approved_at, participant_accepted_at, user_accepted_at, created_at),
  participant_accepted_at  = COALESCE(participant_accepted_at, user_accepted_at, created_at),
  participant_accepted_via = COALESCE(participant_accepted_via, 'backfill')
WHERE
  status      = 'confirmed'
  AND confirmed_at IS NULL
  AND removed_at   IS NULL
  AND user_id      IS NOT NULL
  AND guest_id     IS NULL;

-- B2: Guest participants — only need org_approved_at
UPDATE public.match_participants
SET
  org_approved_at = COALESCE(org_approved_at, created_at)
WHERE
  status      = 'confirmed'
  AND confirmed_at IS NULL
  AND removed_at   IS NULL
  AND guest_id     IS NOT NULL;

-- B3a: Set confirmed_at for user participants
UPDATE public.match_participants
SET
  confirmed_at = COALESCE(org_approved_at, participant_accepted_at, user_accepted_at, created_at, now())
WHERE
  status      = 'confirmed'
  AND confirmed_at IS NULL
  AND removed_at   IS NULL
  AND user_id      IS NOT NULL;

-- B3b: Set confirmed_at for guest participants
UPDATE public.match_participants
SET
  confirmed_at = COALESCE(org_approved_at, created_at, now())
WHERE
  status      = 'confirmed'
  AND confirmed_at IS NULL
  AND removed_at   IS NULL
  AND guest_id     IS NOT NULL;

-- ============================================================================
-- C. Corrective pass: refine confirmed_at using unmodified historical fields
--    user_accepted_at and created_at are never modified by any migration.
--    LEAST() ensures we only ever move confirmed_at earlier, never later.
-- ============================================================================

-- C1: Auto-confirmed participants (user_accepted_at IS NULL = organizer/created-method)
--     confirmed_at ← created_at (the moment they were added to the match)
UPDATE public.match_participants
SET
  confirmed_at = LEAST(confirmed_at, created_at)
WHERE
  status           = 'confirmed'
  AND removed_at   IS NULL
  AND user_id      IS NOT NULL
  AND guest_id     IS NULL
  AND user_accepted_at IS NULL;

-- C2: Historically accepted participants (had user_accepted_at from the old accept flow)
--     Use GREATEST(user_accepted_at, org_approved_at) if org_approved_at predates confirmed_at
UPDATE public.match_participants
SET
  confirmed_at = LEAST(
    confirmed_at,
    GREATEST(
      user_accepted_at,
      CASE
        WHEN org_approved_at < confirmed_at THEN org_approved_at
        ELSE user_accepted_at
      END
    )
  )
WHERE
  status           = 'confirmed'
  AND removed_at   IS NULL
  AND user_id      IS NOT NULL
  AND guest_id     IS NULL
  AND user_accepted_at IS NOT NULL;

-- C3: Guests — created_at as conservative lower bound
UPDATE public.match_participants
SET
  confirmed_at = LEAST(confirmed_at, created_at)
WHERE
  status         = 'confirmed'
  AND removed_at IS NULL
  AND guest_id   IS NOT NULL;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  v_null_count    bigint;
  v_invalid_count bigint;
BEGIN
  -- All confirmed rows must have confirmed_at set
  SELECT count(*) INTO v_null_count
  FROM public.match_participants
  WHERE status = 'confirmed' AND confirmed_at IS NULL AND removed_at IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'v1.5-db-fixes B/C: % confirmed rows still have confirmed_at IS NULL', v_null_count;
  END IF;

  -- confirmed_at must not precede created_at
  SELECT count(*) INTO v_invalid_count
  FROM public.match_participants
  WHERE status = 'confirmed' AND removed_at IS NULL AND confirmed_at < created_at;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'v1.5-db-fixes C: % rows have confirmed_at < created_at', v_invalid_count;
  END IF;

  RAISE NOTICE 'v1.5-db-fixes complete: overload dropped, confirmed_at backfilled and corrected';
END $$;

COMMIT;
