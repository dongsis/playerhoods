-- =============================================================================
-- Migration: 0001_enable_rls
-- Purpose: Ensure RLS is enabled so CREATE POLICY actually takes effect.
-- Notes:
--   - This is SAFE/IDEMPOTENT: enabling twice is fine.
--   - FORCE RLS is NOT enabled here by default (you can opt-in per table).
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.club_admins               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.club_identities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clubs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.guests                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.match_courts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.match_participant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.match_participants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.matches                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_personal_remarks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_roster_guests        ENABLE ROW LEVEL SECURITY;

COMMIT;

-- -----------------------------------------------------------------------------
-- OPTIONAL: FORCE RLS (only if you intentionally want RLS to apply even to table
-- owners / elevated roles; be careful because it can break SECURITY DEFINER
-- maintenance patterns if misused).
--
-- Example:
-- ALTER TABLE public.match_participants FORCE ROW LEVEL SECURITY;
-- -----------------------------------------------------------------------------