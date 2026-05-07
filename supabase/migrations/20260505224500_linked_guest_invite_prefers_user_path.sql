create or replace function public.rpc_match_admit_user(
  p_match_id uuid,
  p_target_user_id uuid
) returns public.match_participants
language plpgsql
security definer
set search_path to public
as $$
declare
  v_match  public.matches%rowtype;
  v_uid    uuid := auth.uid();
  v_is_org boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if p_target_user_id = v_uid then
    raise exception 'cannot_admit_self';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'target_not_found';
  end if;

  if exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_target_user_id
      and mp.removed_at is null
  ) then
    raise exception 'already_invited_or_participating';
  end if;

  if exists (
    select 1
    from public.match_participants mp
    join public.identity_links il
      on il.linked_type = 'guest_participant'
     and il.linked_id = mp.id
     and il.user_id = p_target_user_id
    where mp.match_id = p_match_id
      and mp.guest_id is not null
      and mp.removed_at is null
  ) then
    raise exception 'already_invited_or_participating';
  end if;

  if not public.can_admit_user_to_match(p_match_id, v_uid, p_target_user_id) then
    raise exception 'forbidden';
  end if;

  v_is_org := public.is_match_organizer(p_match_id, v_uid);

  return public.apply_participant_admission(
    p_match_id,
    p_target_user_id,
    v_uid,
    case when v_is_org then 'invited' else 'nominated' end
  );
end;
$$;

comment on function public.rpc_match_admit_user(p_match_id uuid, p_target_user_id uuid)
is 'Unified admission write. Linked guest participant rows count as active duplicates for the same registered user, so future invitations prefer the registered-user path without creating parallel active rows.';

create or replace function public.rpc_match_nominate_guest(
  p_match_id uuid,
  p_guest_id uuid
)
returns public.match_participants
language plpgsql
security definer
set search_path to public
as $$
declare
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp public.match_participants%rowtype;
  v_is_org boolean;
  v_guest_email text;
  v_guest_phone text;
  v_guest_name text;
  v_nominator_name text;
  v_evt_id uuid;
  v_inv public.email_invitations%rowtype;
  v_linked_user_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_match from public.matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.status <> 'active' then raise exception 'match_not_active'; end if;

  v_is_org := (v_match.organizer_id = v_uid);
  if not v_is_org then
    if not v_match.can_participants_invite_users then
      raise exception 'not_authorized_to_nominate_guest';
    end if;

    if not (
      public.is_user_in_scope_groups(coalesce(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      or public.is_user_match_associated(p_match_id, v_uid)
    ) then
      raise exception 'not_authorized_to_nominate_guest';
    end if;
  end if;

  if not exists (
    select 1
    from public.user_roster_guests urg
    where urg.owner_user_id = v_uid
      and urg.guest_id = p_guest_id
  ) then
    raise exception 'guest_not_in_my_roster';
  end if;

  if not exists (
    select 1
    from public.guests g
    where g.id = p_guest_id
      and g.status = 'active'
  ) then
    raise exception 'guest_not_found_or_inactive';
  end if;

  select il.user_id
  into v_linked_user_id
  from public.identity_links il
  where il.linked_type = 'contact'
    and il.linked_id = p_guest_id
  order by il.created_at desc
  limit 1;

  if v_linked_user_id is not null then
    if exists (
      select 1
      from public.match_participants mp
      where mp.match_id = p_match_id
        and mp.guest_id = p_guest_id
        and mp.removed_at is null
    ) then
      raise exception 'already_invited_or_participating';
    end if;

    if exists (
      select 1
      from public.match_participants mp
      where mp.match_id = p_match_id
        and mp.user_id = v_linked_user_id
        and mp.removed_at is null
    ) then
      raise exception 'already_invited_or_participating';
    end if;

    if exists (
      select 1
      from public.match_participants mp
      join public.identity_links il
        on il.linked_type = 'guest_participant'
       and il.linked_id = mp.id
       and il.user_id = v_linked_user_id
      where mp.match_id = p_match_id
        and mp.guest_id is not null
        and mp.removed_at is null
    ) then
      raise exception 'already_invited_or_participating';
    end if;

    return public.rpc_match_admit_user(p_match_id, v_linked_user_id);
  end if;

  select * into v_existing
  from public.match_participants
  where match_id = p_match_id
    and guest_id = p_guest_id
    and removed_at is null
  limit 1;

  if found then raise exception 'guest_already_active'; end if;

  insert into public.match_participants (
    match_id, join_method, guest_id, created_by, created_at, nominated_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) values (
    p_match_id, 'nominated', p_guest_id, v_uid, now(), v_uid,
    null, null,
    case when v_is_org then now() else null end,
    case when v_is_org then v_uid else null end
  )
  returning * into v_mp;

  perform public.match_participant_reconcile_status(v_mp.id);
  select * into v_mp from public.match_participants where id = v_mp.id;

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  values (p_match_id, v_mp.id, 'nominate_guest', null, v_uid);

  select
    nullif(trim(g.email), ''),
    nullif(trim(g.phone), ''),
    nullif(trim(g.display_name), '')
  into v_guest_email, v_guest_phone, v_guest_name
  from public.guests g
  where g.id = p_guest_id;

  if v_guest_email is not null or v_guest_phone is not null then
    select p.display_name into v_nominator_name from public.profiles p where p.id = v_uid;

    insert into public.email_invitations (
      inviter_user_id, target_email, target_phone, target_name, related_type, related_id, expires_at, match_participant_id
    ) values (
      v_uid,
      case when v_guest_email is not null then trim(lower(v_guest_email)) else null end,
      v_guest_phone,
      v_guest_name,
      'match',
      p_match_id,
      null,
      v_mp.id
    )
    returning * into v_inv;

    insert into public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    values (
      'invitation.email_invitation_created',
      'email_invitation',
      v_inv.id,
      v_uid,
      jsonb_build_object(
        'invitation_id', v_inv.id,
        'related_type', v_inv.related_type,
        'related_id', v_inv.related_id,
        'target_email', v_inv.target_email,
        'target_phone', v_inv.target_phone,
        'target_name', v_inv.target_name,
        'inviter_user_id', v_inv.inviter_user_id,
        'inviter_display_name', coalesce(v_nominator_name, 'Someone'),
        'match_participant_id', v_inv.match_participant_id
      )
    )
    returning id into v_evt_id;

    perform public.rpc_process_domain_event(v_evt_id);
  end if;

  return v_mp;
end;
$$;

comment on function public.rpc_match_nominate_guest(uuid, uuid) is
  'Nominate Contact Player. If the contact is already linked to a registered user, future invitations prefer the registered-user path, skip new guest invitation tokens, and reject duplicate active guest/user rows with already_invited_or_participating.';
