-- =============================================================================
-- Grant cleanup: Revoke EXECUTE from anon on mutating RPCs
-- =============================================================================
-- Mutating RPCs should not be executable by unauthenticated (anon) users.
-- Preserves authenticated and service_role. Does not change default privileges.
-- =============================================================================

-- Match admission / participation
REVOKE EXECUTE ON FUNCTION public.rpc_match_invite_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_admit_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_manual_confirm(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_remove_participant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_org_approve_participant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_request_join(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_user_withdraw(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_create(integer, text, date, time without time zone, integer, uuid, uuid[], uuid[], boolean, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_nominate_guest(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_delegate_confirm_participant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_delegate_confirm_guest(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_match_delegate_confirm_user(uuid, uuid) FROM anon;

-- Roster
REVOKE EXECUTE ON FUNCTION public.rpc_roster_guest_create(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_roster_guest_create(text, text, text, text) FROM anon;

-- Identity / naming
REVOKE EXECUTE ON FUNCTION public.rpc_club_handle_set(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_group_set_display_name(uuid, text) FROM anon;

-- Club admin
REVOKE EXECUTE ON FUNCTION public.rpc_club_admin_grant(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_club_admin_revoke(uuid, uuid) FROM anon;
