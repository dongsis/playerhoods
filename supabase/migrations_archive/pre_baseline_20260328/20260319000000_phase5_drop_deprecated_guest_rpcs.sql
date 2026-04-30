-- =============================================================================
-- Phase 5: Drop deprecated guest-match RPCs
-- No production data; prefer deletion over prolonged deprecation.
-- Use: rpc_match_nominate_guest + rpc_match_delegate_confirm_guest + rpc_match_org_approve_participant
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_add_guest_org(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_match_add_guest_participant(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_match_invite_guest_from_roster(uuid, uuid);
