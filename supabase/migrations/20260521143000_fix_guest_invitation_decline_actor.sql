create or replace function public.rpc_email_invitation_decline_as_guest(
  p_invitation_id uuid,
  p_system_actor_id uuid
)
returns public.email_invitations
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.email_invitations%rowtype;
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_actor_id uuid;
  v_match_count int := 0;
  v_match_mp_id uuid := null;
begin
  select * into v_inv
  from public.email_invitations
  where id = p_invitation_id;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if v_inv.status <> 'pending' then
    return v_inv;
  end if;

  if v_inv.related_type <> 'match' then
    raise exception 'related_type_not_supported';
  end if;

  if v_inv.match_participant_id is not null then
    select * into v_mp
    from public.match_participants
    where id = v_inv.match_participant_id
      and removed_at is null;

    if not found then
      raise exception 'anchored_participant_not_found';
    end if;

    if v_mp.match_id <> v_inv.related_id then
      raise exception 'anchor_participant_match_mismatch';
    end if;

    if v_mp.guest_id is null then
      raise exception 'anchor_not_guest_participant';
    end if;
  else
    select count(*), min(mp.id::text)::uuid
    into v_match_count, v_match_mp_id
    from public.match_participants mp
    join public.guests g on g.id = mp.guest_id
    where mp.match_id = v_inv.related_id
      and mp.removed_at is null
      and (
        (v_inv.target_email is not null and lower(trim(coalesce(g.email, ''))) = lower(trim(v_inv.target_email)))
        or (
          v_inv.target_phone is not null
          and regexp_replace(coalesce(g.phone, ''), '\D', '', 'g') = regexp_replace(v_inv.target_phone, '\D', '', 'g')
        )
      );

    if v_match_count = 0 then
      raise exception 'participant_not_found_for_invitation';
    end if;
    if v_match_count > 1 then
      raise exception 'participant_ambiguous_for_invitation';
    end if;

    select * into v_mp
    from public.match_participants
    where id = v_match_mp_id;

    update public.email_invitations
    set match_participant_id = v_mp.id,
        updated_at = now()
    where id = v_inv.id
      and match_participant_id is null;
  end if;

  select * into v_match
  from public.matches
  where id = v_mp.match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if p_system_actor_id is not null
     and exists(select 1 from auth.users where id = p_system_actor_id) then
    v_actor_id := p_system_actor_id;
  else
    v_actor_id := v_match.organizer_id;
  end if;

  perform public.apply_participant_exit(
    v_mp.id,
    v_actor_id,
    'withdraw',
    'Guest declined invitation via link'
  );

  update public.email_invitations
  set status = 'declined',
      declined_at = coalesce(declined_at, now()),
      updated_at = now()
  where id = v_inv.id
    and status = 'pending';

  select * into v_inv
  from public.email_invitations
  where id = v_inv.id;

  if v_inv.status = 'declined' then
    insert into public.email_invitation_events (invitation_id, event_type, actor_user_id)
    values (v_inv.id, 'invitation_declined', v_actor_id);
  end if;

  return v_inv;
end;
$$;

comment on function public.rpc_email_invitation_decline_as_guest(uuid, uuid) is
  'Declines a guest match invitation. If the supplied system actor is not an auth user, attributes the system-side participant exit to the match organizer, matching SMS RSVP decline behavior.';

grant all on function public.rpc_email_invitation_decline_as_guest(uuid, uuid) to anon, authenticated, service_role;
