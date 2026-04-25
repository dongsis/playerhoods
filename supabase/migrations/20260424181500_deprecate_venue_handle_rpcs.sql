COMMENT ON FUNCTION public.rpc_venue_handle_check(uuid, text)
IS 'Deprecated. Venue handles are no longer used in product UI. Use venue_user_relationships and rpc_venue_member_join_v2 instead.';

COMMENT ON FUNCTION public.rpc_venue_handle_set(uuid, text)
IS 'Deprecated. Venue handles are no longer used in product UI.';

REVOKE ALL ON FUNCTION public.rpc_venue_handle_check(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_venue_handle_check(uuid, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.rpc_venue_handle_set(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_venue_handle_set(uuid, text) FROM authenticated;
