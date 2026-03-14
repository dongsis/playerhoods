-- ============================================================================
-- v1.3 — Add timezone to clubs (authoritative source of match timezone)
-- ============================================================================

ALTER TABLE public.clubs
ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Toronto';

COMMENT ON COLUMN public.clubs.timezone IS
'IANA timezone identifier (e.g., America/Toronto). Authoritative timezone for matches at this club.';
