create or replace function public.rpc_get_queued_confirmed_lineup_deliveries_for_match(
  p_match_id uuid,
  p_limit integer default 10
) returns table(
  id uuid,
  channel text,
  provider text,
  destination text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
begin
  if p_match_id is null then
    raise exception 'match_id_required';
  end if;

  return query
  with claimable as (
    select nd.id
    from public.notification_deliveries nd
    join public.match_participant_notification_events e on e.delivery_id = nd.id
    where nd.delivery_status = 'queued'
      and nd.payload->>'template_type' = 'confirmed_lineup'
      and nd.payload->>'match_id' = p_match_id::text
      and e.match_id = p_match_id
      and e.notification_type = 'confirmed_lineup'
    order by nd.created_at asc
    limit v_limit
    for update of nd skip locked
  )
  update public.notification_deliveries d
  set delivery_status = 'sending',
      attempt_count = d.attempt_count + 1,
      last_attempt_at = now()
  from claimable c
  where d.id = c.id
  returning d.id, d.channel, d.provider, d.destination, d.payload, d.attempt_count;
end;
$$;

comment on function public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid, integer)
is 'Service-role scoped claimant for already queued confirmed_lineup deliveries for one match. Prevents Form Match delivery drain from claiming unrelated notification backlog.';

revoke all on function public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid, integer) from public;
revoke all on function public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid, integer) from anon;
revoke all on function public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid, integer) from authenticated;
revoke all on function public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid, integer) from service_role;
grant execute on function public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid, integer) to service_role;
