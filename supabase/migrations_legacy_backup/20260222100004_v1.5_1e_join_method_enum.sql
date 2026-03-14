-- Migration: v1.5 Phase 1E — Add nominated and manual to match_join_method enum
--
-- Current values: invited, requested, guest_add
-- Added: nominated (replaces join_method='requested'+nominated_by pattern)
--        manual     (organizer-confirmed or guest added directly)
--
-- Note: PostgreSQL enum ADD VALUE is not transactional (cannot be rolled back).
-- IF NOT EXISTS guards make this idempotent.

-- Cannot run inside a transaction (ADD VALUE limitation in some PG versions)
-- If your Supabase version requires it, run without BEGIN/COMMIT.

ALTER TYPE public.match_join_method ADD VALUE IF NOT EXISTS 'nominated';
ALTER TYPE public.match_join_method ADD VALUE IF NOT EXISTS 'manual';

-- ============================================================================
-- Verification (run as separate statement after the ALTER TYPE)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_join_method' AND e.enumlabel = 'nominated'
  ) THEN
    RAISE EXCEPTION 'v1.5-1E: nominated not added to match_join_method';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_join_method' AND e.enumlabel = 'manual'
  ) THEN
    RAISE EXCEPTION 'v1.5-1E: manual not added to match_join_method';
  END IF;

  RAISE NOTICE 'v1.5-1E complete: nominated and manual added to match_join_method enum';
END $$;
