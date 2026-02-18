-- ============================================================================
-- v1.3 — Add derived UTC start time for matches
-- Source: match_date + start_time + clubs.timezone
-- ============================================================================

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS start_at_utc timestamptz;

COMMENT ON COLUMN public.matches.start_at_utc IS
'Derived UTC timestamp computed from match_date, start_time, and clubs.timezone';
