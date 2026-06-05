create or replace function public.rpc_public_match_registered_request_join(
  p_public_token uuid
)
returns public.match_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.public_match_signup_links%rowtype;
  v_match public.matches%rowtype;
  v_existing public.match_participants%rowtype;
  v_result public.match_participants%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_link
  from public.public_match_signup_links
  where public_token = p_public_token
    and disabled_at is null;

  if not found then
    raise exception 'signup_link_not_found';
  end if;

  select * into v_match
  from public.matches
  where id = v_link.match_id
    and status = 'active';

  if not found then
    raise exception 'match_not_active';
  end if;

  if v_match.organizer_id = v_uid then
    raise exception 'organizer_cannot_request_own_match';
  end if;

  select * into v_existing
  from public.match_participants
  where match_id = v_match.id
    and user_id = v_uid
    and removed_at is null
  order by created_at desc
  limit 1
  for update;

  if found then
    perform public.match_participant_reconcile_status(v_existing.id);

    select * into v_existing
    from public.match_participants
    where id = v_existing.id;

    return v_existing;
  end if;

  v_result := public.apply_participant_admission(v_match.id, v_uid, v_uid, 'requested');
  return v_result;
end;
$$;

alter function public.rpc_public_match_registered_request_join(uuid) owner to postgres;

comment on function public.rpc_public_match_registered_request_join(uuid)
is 'Authenticated registered user requests a spot through an enabled public join token. Token supplies match access; writes through apply_participant_admission(requested). Does not create public signup/contact guest records.';

revoke all on function public.rpc_public_match_registered_request_join(uuid) from public;
revoke all on function public.rpc_public_match_registered_request_join(uuid) from anon;
revoke all on function public.rpc_public_match_registered_request_join(uuid) from authenticated;
revoke all on function public.rpc_public_match_registered_request_join(uuid) from service_role;
grant execute on function public.rpc_public_match_registered_request_join(uuid) to authenticated;
