-- =============================================================================
-- Guest invitation RPC permissions hardening
-- Restrict EXECUTE grants to explicit app roles only.
-- =============================================================================

REVOKE ALL ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) TO service_role;
