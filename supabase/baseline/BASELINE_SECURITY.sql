-- Baseline security layer
-- Freeze source commit: 03522d7
-- Purpose: enforce baseline security boundary after BASELINE_SCHEMA.sql

BEGIN;

-- Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Ensure RLS is enabled on baseline tables.
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_personal_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roster_guests ENABLE ROW LEVEL SECURITY;

-- Invitation guest path permissions hardening.
REVOKE ALL ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) TO anon, authenticated, service_role;

-- Core invitation read/create path permissions.
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_create(text, text, text, uuid, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_get(uuid) TO anon, authenticated, service_role;

-- Optional guard checks for required RLS policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'match_participants' AND policyname = 'match_participants_select_v1_6_1'
  ) THEN
    RAISE EXCEPTION 'baseline security check failed: policy match_participants_select_v1_6_1 missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matches' AND policyname = 'matches_select_visibility'
  ) THEN
    RAISE EXCEPTION 'baseline security check failed: policy matches_select_visibility missing';
  END IF;
END $$;

COMMIT;
