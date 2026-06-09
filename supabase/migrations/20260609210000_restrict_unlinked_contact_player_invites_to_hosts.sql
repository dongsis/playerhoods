-- Restrict unlinked Contact Player invites to organizers.
-- No historical rows are backfilled here.

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
  v_join_method public.match_join_method;
  v_nominated_by uuid;
  v_guest_email text;
  v_guest_phone text;
  v_delivery_email text;
  v_delivery_phone text;
  v_email_opted_out boolean := false;
  v_sms_opted_out boolean := false;
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

  v_join_method := case
    when v_is_org then 'invited'::public.match_join_method
    else 'nominated'::public.match_join_method
  end;
  v_nominated_by := case when v_is_org then null::uuid else v_uid end;

  if not exists (
    select 1
    from public.user_roster_guests urg
    where urg.owner_user_id = v_uid
      and urg.guest_id = p_guest_id
  ) then
    raise exception 'guest_not_in_my_roster';
  end if;

  select
    nullif(btrim(g.email), ''),
    nullif(btrim(g.phone), ''),
    nullif(btrim(g.display_name), '')
  into v_guest_email, v_guest_phone, v_guest_name
  from public.guests g
  where g.id = p_guest_id
    and g.status = 'active';

  if not found then
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

  if not v_is_org then
    raise exception 'only_organizer_can_invite_contact_player';
  end if;

  select * into v_existing
  from public.match_participants
  where match_id = p_match_id
    and guest_id = p_guest_id
    and removed_at is null
  limit 1;

  if found then raise exception 'guest_already_active'; end if;

  v_email_opted_out := v_guest_email is not null and public.is_contact_communication_opted_out('email', v_guest_email, 'match_invites');
  v_sms_opted_out := v_guest_phone is not null and public.is_contact_communication_opted_out('sms', v_guest_phone, 'match_invites');
  v_delivery_email := case when v_email_opted_out then null else v_guest_email end;
  v_delivery_phone := case when v_sms_opted_out then null else v_guest_phone end;

  if (v_guest_email is not null or v_guest_phone is not null)
     and v_delivery_email is null
     and v_delivery_phone is null then
    raise exception 'contact_communication_opted_out';
  end if;

  insert into public.match_participants (
    match_id, join_method, guest_id, created_by, created_at, nominated_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) values (
    p_match_id, v_join_method, p_guest_id, v_uid, now(), v_nominated_by,
    null, null,
    case when v_is_org then now() else null end,
    case when v_is_org then v_uid else null end
  )
  returning * into v_mp;

  perform public.match_participant_reconcile_status(v_mp.id);
  select * into v_mp from public.match_participants where id = v_mp.id;

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  values (p_match_id, v_mp.id, 'nominate_guest', null, v_uid);

  if v_delivery_email is not null or v_delivery_phone is not null then
    select p.display_name into v_nominator_name from public.profiles p where p.id = v_uid;

    insert into public.email_invitations (
      inviter_user_id,
      target_email,
      target_phone,
      target_name,
      related_type,
      related_id,
      expires_at,
      match_participant_id,
      email_opted_out_at,
      sms_opted_out_at,
      delivery_suppressed_reason
    ) values (
      v_uid,
      case when v_delivery_email is not null then lower(btrim(v_delivery_email)) else null end,
      v_delivery_phone,
      v_guest_name,
      'match',
      p_match_id,
      null,
      v_mp.id,
      case when v_email_opted_out then now() else null end,
      case when v_sms_opted_out then now() else null end,
      case when v_email_opted_out or v_sms_opted_out then 'recipient_unsubscribed_channel' else null end
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
  'Compatibility Contact Player admission RPC. Organizer-created unlinked Contact Player rows are direct invites; non-organizer unlinked Contact Player calls are rejected. Linked contact rows continue through registered-user admission. Suppresses opted-out contact communication channels before creating invitation send events.';

grant execute on function public.rpc_match_nominate_guest(uuid, uuid) to authenticated, service_role;

create or replace function public.rpc_match_invite_contact_person(
  p_match_id uuid,
  p_person_id uuid
)
returns table(
  match_participant_id uuid,
  target_kind text,
  target_user_id uuid,
  target_person_id uuid
)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_person public.people%rowtype;
  v_guest_id uuid;
  v_guest_email text;
  v_guest_phone text;
  v_delivery_email text;
  v_delivery_phone text;
  v_guest_name text;
  v_email_opted_out boolean := false;
  v_sms_opted_out boolean := false;
  v_any_channel_count integer := 0;
  v_reachable_channel_count integer := 0;
  v_linked_user_id uuid;
  v_is_org boolean := false;
  v_join_method public.match_join_method;
  v_nominated_by uuid;
  v_mp public.match_participants%rowtype;
  v_inv public.email_invitations%rowtype;
  v_nominator_name text;
  v_evt_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  select * into v_person
  from public.people
  where person_id = p_person_id
    and status = 'active';

  if not found then
    raise exception 'person_not_found_or_inactive';
  end if;

  if not public.can_user_have_private_contact_person_scope(v_uid, p_person_id) then
    raise exception 'contact_person_not_visible';
  end if;

  v_is_org := v_match.organizer_id = v_uid;
  if not v_is_org then
    if not v_match.can_participants_invite_users then
      raise exception 'not_authorized_to_invite_contact_person';
    end if;

    if not (
      public.is_user_in_scope_groups(coalesce(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      or public.is_user_match_associated(p_match_id, v_uid)
    ) then
      raise exception 'not_authorized_to_invite_contact_person';
    end if;
  end if;

  v_join_method := case
    when v_is_org then 'invited'::public.match_join_method
    else 'nominated'::public.match_join_method
  end;
  v_nominated_by := case when v_is_org then null::uuid else v_uid end;

  v_linked_user_id := v_person.linked_user_id;

  if v_linked_user_id is null then
    select il.user_id
    into v_linked_user_id
    from public.identity_links il
    join public.guests g
      on g.id = il.linked_id
     and g.person_id = p_person_id
    where il.linked_type = 'contact'
    order by il.created_at desc
    limit 1;
  end if;

  if v_linked_user_id is not null then
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
      join public.guests g
        on g.id = mp.guest_id
       and g.person_id = p_person_id
      where mp.match_id = p_match_id
        and mp.removed_at is null
    ) then
      raise exception 'already_invited_or_participating';
    end if;

    v_mp := public.rpc_match_admit_user(p_match_id, v_linked_user_id);

    return query
    select v_mp.id, 'registered_user'::text, v_linked_user_id, p_person_id;
    return;
  end if;

  if not v_is_org then
    raise exception 'only_organizer_can_invite_contact_player';
  end if;

  if exists (
    select 1
    from public.match_participants mp
    join public.guests g
      on g.id = mp.guest_id
     and g.person_id = p_person_id
    where mp.match_id = p_match_id
      and mp.removed_at is null
  ) then
    raise exception 'already_invited_or_participating';
  end if;

  with private_guest_channels as (
    select distinct
      g.id,
      nullif(btrim(g.email), '') as email,
      nullif(btrim(g.phone), '') as phone
    from public.user_roster_guests urg
    join public.guests g
      on g.id = urg.guest_id
     and g.status = 'active'
    where urg.owner_user_id = v_uid
      and g.person_id = p_person_id

    union

    select distinct
      g.id,
      nullif(btrim(g.email), '') as email,
      nullif(btrim(g.phone), '') as phone
    from public.contact_records cr
    join public.guests g
      on g.id = cr.guest_id
     and g.status = 'active'
    where cr.owner_user_id = v_uid
      and cr.person_id = p_person_id
      and cr.archived_at is null

    union

    select distinct
      g.id,
      nullif(btrim(g.email), '') as email,
      nullif(btrim(g.phone), '') as phone
    from public.group_contacts gc
    join public.guests g
      on g.person_id = gc.person_id
     and g.status = 'active'
    where gc.created_by = v_uid
      and gc.person_id = p_person_id
      and gc.removed_at is null
  )
  select
    count(*)::integer,
    count(*) filter (
      where (
        email is not null
        and not public.is_contact_communication_opted_out('email', email, 'match_invites')
      )
      or (
        phone is not null
        and not public.is_contact_communication_opted_out('sms', phone, 'match_invites')
      )
    )::integer
  into v_any_channel_count, v_reachable_channel_count
  from private_guest_channels
  where email is not null or phone is not null;

  if v_reachable_channel_count = 0 then
    if v_any_channel_count > 0 then
      raise exception 'contact_communication_opted_out';
    end if;
    raise exception 'contact_invite_channel_unavailable';
  end if;

  with private_guest_channels as (
    select distinct
      g.id,
      nullif(btrim(g.email), '') as email,
      nullif(btrim(g.phone), '') as phone,
      0 as priority,
      g.created_at
    from public.user_roster_guests urg
    join public.guests g
      on g.id = urg.guest_id
     and g.status = 'active'
    where urg.owner_user_id = v_uid
      and g.person_id = p_person_id

    union

    select distinct
      g.id,
      nullif(btrim(g.email), '') as email,
      nullif(btrim(g.phone), '') as phone,
      1 as priority,
      g.created_at
    from public.contact_records cr
    join public.guests g
      on g.id = cr.guest_id
     and g.status = 'active'
    where cr.owner_user_id = v_uid
      and cr.person_id = p_person_id
      and cr.archived_at is null

    union

    select distinct
      g.id,
      nullif(btrim(g.email), '') as email,
      nullif(btrim(g.phone), '') as phone,
      2 as priority,
      g.created_at
    from public.group_contacts gc
    join public.guests g
      on g.person_id = gc.person_id
     and g.status = 'active'
    where gc.created_by = v_uid
      and gc.person_id = p_person_id
      and gc.removed_at is null
  )
  select
    g.id,
    pgc.email,
    pgc.phone,
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(g.display_name), ''), 'Contact Player')
  into v_guest_id, v_guest_email, v_guest_phone, v_guest_name
  from private_guest_channels pgc
  join public.guests g
    on g.id = pgc.id
  left join public.people p
    on p.person_id = g.person_id
  where (
      pgc.email is not null
      and not public.is_contact_communication_opted_out('email', pgc.email, 'match_invites')
    )
    or (
      pgc.phone is not null
      and not public.is_contact_communication_opted_out('sms', pgc.phone, 'match_invites')
    )
  order by pgc.priority, pgc.created_at
  limit 1;

  if v_guest_id is null then
    raise exception 'contact_invite_channel_unavailable';
  end if;

  v_email_opted_out := v_guest_email is not null and public.is_contact_communication_opted_out('email', v_guest_email, 'match_invites');
  v_sms_opted_out := v_guest_phone is not null and public.is_contact_communication_opted_out('sms', v_guest_phone, 'match_invites');
  v_delivery_email := case when v_email_opted_out then null else v_guest_email end;
  v_delivery_phone := case when v_sms_opted_out then null else v_guest_phone end;

  insert into public.match_participants (
    match_id,
    join_method,
    guest_id,
    created_by,
    created_at,
    nominated_by,
    participant_accepted_at,
    participant_accepted_via,
    org_approved_at,
    org_approved_by
  ) values (
    p_match_id,
    v_join_method,
    v_guest_id,
    v_uid,
    now(),
    v_nominated_by,
    null,
    null,
    case when v_is_org then now() else null end,
    case when v_is_org then v_uid else null end
  )
  returning * into v_mp;

  perform public.match_participant_reconcile_status(v_mp.id);
  select * into v_mp
  from public.match_participants
  where id = v_mp.id;

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  values (p_match_id, v_mp.id, 'invite_contact_person', null, v_uid);

  if v_delivery_email is not null or v_delivery_phone is not null then
    select p.display_name
    into v_nominator_name
    from public.profiles p
    where p.id = v_uid;

    insert into public.email_invitations (
      inviter_user_id,
      target_email,
      target_phone,
      target_name,
      related_type,
      related_id,
      expires_at,
      match_participant_id,
      email_opted_out_at,
      sms_opted_out_at,
      delivery_suppressed_reason
    ) values (
      v_uid,
      case when v_delivery_email is not null then lower(btrim(v_delivery_email)) else null end,
      v_delivery_phone,
      v_guest_name,
      'match',
      p_match_id,
      null,
      v_mp.id,
      case when v_email_opted_out then now() else null end,
      case when v_sms_opted_out then now() else null end,
      case when v_email_opted_out or v_sms_opted_out then 'recipient_unsubscribed_channel' else null end
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

  return query
  select v_mp.id, 'contact_person'::text, null::uuid, p_person_id;
end;
$$;

comment on function public.rpc_match_invite_contact_person(uuid, uuid) is
  'P4 person_id-first Contact Player match invite wrapper. Requires the caller to own or explicitly save a private contact scope, resolves registered-user or private contact channel internally, delegates linked Contact Persons to registered-user admission, and restricts unlinked Contact Player invites to organizers.';

grant execute on function public.rpc_match_invite_contact_person(uuid, uuid) to authenticated, service_role;
