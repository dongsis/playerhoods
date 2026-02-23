-- Migration: v1.5 3b — Harden match_participant_actions table
--
-- 1. REVOKE table-level write permissions from anon/authenticated.
--    Writes must go through SECURITY DEFINER RPCs (function owner = postgres
--    retains INSERT; RLS alone is insufficient because table grants can leak
--    from Supabase project defaults or earlier migrations).
--
-- 2. GRANT SELECT to authenticated (organizer SELECT policy handles row filtering).
--
-- 3. ADD CONSTRAINT on action_type to prevent spelling drift.
--    Historical v1.3 values: invited, nominated, requested, accepted, approved,
--                            withdrawn, removed, guest_added, declined
--    New v1.5 values:        reenter, manual_confirm
--
-- 4. ADD indexes for typical query patterns (match_id, match_participant_id).

BEGIN;

-- ============================================================================
-- 1 & 2. Table-level permissions
-- ============================================================================

REVOKE ALL ON TABLE public.match_participant_actions FROM anon;
REVOKE ALL ON TABLE public.match_participant_actions FROM authenticated;

-- Organizer reads via SELECT policy; write is SECURITY DEFINER-only.
GRANT SELECT ON TABLE public.match_participant_actions TO authenticated;

-- ============================================================================
-- 3. action_type constraint
-- ============================================================================

-- Diagnostic: log any action_type values not covered by the constraint
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT DISTINCT action_type, count(*) AS cnt
    FROM public.match_participant_actions
    WHERE action_type NOT IN (
      'invited','nominated','requested','accepted','approved',
      'withdrawn','removed','guest_added','declined',
      'reenter','manual_confirm'
    )
    GROUP BY action_type
  LOOP
    RAISE WARNING 'match_participant_actions: unknown action_type=% (% rows) — not yet in constraint',
      v_row.action_type, v_row.cnt;
  END LOOP;
END $$;

ALTER TABLE public.match_participant_actions
  DROP CONSTRAINT IF EXISTS match_participant_actions_action_type_chk;

ALTER TABLE public.match_participant_actions
  ADD CONSTRAINT match_participant_actions_action_type_chk
  CHECK (action_type IN (
    -- v1.3 historical values (verb form, as written by old RPCs)
    'invite', 'nominate', 'request_join', 'accept', 'approve',
    'withdraw', 'decline', 'remove', 'add_guest_org', 'add_guest_participant',
    -- v1.3 past-tense aliases (if any rows used these)
    'invited', 'nominated', 'requested', 'accepted', 'approved',
    'withdrawn', 'removed', 'guest_added', 'declined',
    -- v1.5 new values
    'reenter', 'manual_confirm'
  )) NOT VALID;

-- Validate separately — raises a clearer error that shows which rows fail
ALTER TABLE public.match_participant_actions
  VALIDATE CONSTRAINT match_participant_actions_action_type_chk;

-- ============================================================================
-- 4. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS mpa_match_id_created_at_idx
  ON public.match_participant_actions (match_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mpa_mp_id_created_at_idx
  ON public.match_participant_actions (match_participant_id, created_at DESC);

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'match_participant_actions'
      AND constraint_name = 'match_participant_actions_action_type_chk'
  ) THEN
    RAISE EXCEPTION 'v1.5-3b: action_type constraint not created';
  END IF;

  -- Indexes exist
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'mpa_match_id_created_at_idx') THEN
    RAISE EXCEPTION 'v1.5-3b: mpa_match_id_created_at_idx not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'mpa_mp_id_created_at_idx') THEN
    RAISE EXCEPTION 'v1.5-3b: mpa_mp_id_created_at_idx not created';
  END IF;

  RAISE NOTICE 'v1.5-3b complete: permissions hardened, action_type constrained, indexes created';
END $$;

COMMIT;
