create or replace function public.rpc_match_accept_invite(p_match_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path to public
as $$
declare
  v_mp             public.match_participants;
  v_was_unaccepted boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  perform 1
  from public.matches
  where id = p_match_id
    and status = 'active';

  if not found then
    raise exception 'Match is not active or does not exist';
  end if;

  select mp.*
  into v_mp
  from public.match_participants mp
  left join public.identity_links il
    on il.linked_type = 'guest_participant'
   and il.linked_id = mp.id
   and il.user_id = auth.uid()
  where mp.match_id = p_match_id
    and (mp.user_id = auth.uid() or il.user_id is not null)
  order by
    case when mp.user_id = auth.uid() then 0 else 1 end,
    mp.created_at desc
  limit 1
  for update of mp;

  if not found then
    raise exception 'You are not a participant in this match';
  end if;

  if v_mp.removed_at is not null then
    raise exception 'You were removed from this match';
  end if;

  if v_mp.status not in ('pending', 'confirmed') then
    raise exception 'Accept is not allowed for participant status: %', v_mp.status;
  end if;

  if v_mp.confirmed_at is not null then
    return v_mp;
  end if;

  if v_mp.join_method = 'requested'
     and v_mp.nominated_by is null
     and v_mp.participant_accepted_at is not null then
    raise exception 'Self-requested participants have acceptance recorded at request time. Waiting for organizer approval.';
  end if;

  if v_mp.join_method not in ('invited', 'nominated', 'requested') then
    raise exception 'Accept is not available for join method: %', v_mp.join_method;
  end if;

  v_was_unaccepted := (v_mp.participant_accepted_at is null);

  if not v_was_unaccepted then
    perform public.match_participant_reconcile_status(v_mp.id);
    select * into v_mp from public.match_participants where id = v_mp.id;
    return v_mp;
  end if;

  update public.match_participants
  set
    participant_accepted_at = now(),
    participant_accepted_via = 'in_app'
  where id = v_mp.id;

  perform public.match_participant_reconcile_status(v_mp.id);

  insert into public.match_participant_actions (
    match_id,
    match_participant_id,
    action_type,
    note,
    created_by
  ) values (
    p_match_id,
    v_mp.id,
    'accept',
    null,
    auth.uid()
  );

  select * into v_mp from public.match_participants where id = v_mp.id;
  return v_mp;
end;
$$;

comment on function public.rpc_match_accept_invite(uuid)
is 'Accept an invited, nominated, or reconfirmable requested participant. Supports direct user rows and guest_participant identity links.';
