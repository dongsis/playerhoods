create or replace function public.rpc_match_confirmed_participant_sms_targets(p_match_id uuid)
returns table(participant_id uuid, phone text, contact_channel text)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_org_id uuid;
begin
  select organizer_id into v_org_id
  from public.matches
  where id = p_match_id;

  if not found then
    return;
  end if;

  return query
  select
    mp.id,
    nullif(trim(p.contact_phone), ''),
    coalesce(nullif(trim(p.contact_channel), ''), 'email')
  from public.match_participants mp
  join public.profiles p on p.id = mp.user_id
  where mp.match_id = p_match_id
    and mp.user_id is not null
    and mp.user_id <> v_org_id
    and mp.removed_at is null
    and mp.status = 'confirmed'
    and coalesce(nullif(trim(p.contact_channel), ''), 'email') in ('sms', 'both')
    and nullif(trim(p.contact_phone), '') is not null;

  return query
  select
    mp.id,
    nullif(trim(g.phone), ''),
    'sms'::text
  from public.match_participants mp
  join public.guests g on g.id = mp.guest_id
  where mp.match_id = p_match_id
    and mp.guest_id is not null
    and mp.removed_at is null
    and mp.status = 'confirmed'
    and nullif(trim(g.email), '') is null
    and nullif(trim(g.phone), '') is not null;
end;
$$;

alter function public.rpc_match_confirmed_participant_sms_targets(uuid) owner to postgres;

comment on function public.rpc_match_confirmed_participant_sms_targets(uuid) is
  'Returns SMS targets for confirmed participants after a match forms. Users respect contact_channel; guests use SMS only when no email is available.';

grant all on function public.rpc_match_confirmed_participant_sms_targets(uuid) to anon;
grant all on function public.rpc_match_confirmed_participant_sms_targets(uuid) to authenticated;
grant all on function public.rpc_match_confirmed_participant_sms_targets(uuid) to service_role;
