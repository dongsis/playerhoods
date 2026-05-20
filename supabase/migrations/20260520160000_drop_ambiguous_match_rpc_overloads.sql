-- Drop legacy one-argument wrappers that conflict with canonical note-capable RPCs.
-- The canonical two-argument signatures keep p_note default null, so no-note calls
-- still follow the same business behavior without ambiguous function resolution.

drop function if exists public.rpc_match_remove_participant(uuid);
drop function if exists public.rpc_match_user_withdraw(uuid);
drop function if exists public.rpc_match_proxy_decline_participant(uuid);
drop function if exists public.rpc_match_proxy_withdraw_participant(uuid);

revoke all on function public.rpc_match_remove_participant(uuid, text) from public, anon;
revoke all on function public.rpc_match_user_withdraw(uuid, text) from public, anon;
revoke all on function public.rpc_match_proxy_decline_participant(uuid, text) from public, anon;
revoke all on function public.rpc_match_proxy_withdraw_participant(uuid, text) from public, anon;

grant all on function public.rpc_match_remove_participant(uuid, text) to authenticated, service_role;
grant all on function public.rpc_match_user_withdraw(uuid, text) to authenticated, service_role;
grant all on function public.rpc_match_proxy_decline_participant(uuid, text) to authenticated, service_role;
grant all on function public.rpc_match_proxy_withdraw_participant(uuid, text) to authenticated, service_role;
