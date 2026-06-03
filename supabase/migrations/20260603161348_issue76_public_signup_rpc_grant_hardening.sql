-- Issue #76 follow-up: harden public signup RPC grants after the
-- initial public signup migration was applied remotely.
--
-- Host-facing RPCs must not be executable through the default PUBLIC grant.
-- Keep the public context RPC public, and keep mutation/delivery RPCs
-- service-role only as defined by the original migration.

revoke execute on function public.rpc_public_match_signup_link_get_or_create(uuid) from public;
revoke execute on function public.rpc_public_match_signup_link_get_or_create(uuid) from anon;
grant execute on function public.rpc_public_match_signup_link_get_or_create(uuid) to authenticated;
grant execute on function public.rpc_public_match_signup_link_get_or_create(uuid) to service_role;

revoke execute on function public.rpc_public_match_signup_participant_metadata(uuid) from public;
revoke execute on function public.rpc_public_match_signup_participant_metadata(uuid) from anon;
grant execute on function public.rpc_public_match_signup_participant_metadata(uuid) to authenticated;
grant execute on function public.rpc_public_match_signup_participant_metadata(uuid) to service_role;
