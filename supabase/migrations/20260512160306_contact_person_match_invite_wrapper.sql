-- P4 Contact Player structural release:
-- Add a person_id-first match invite wrapper and person-level contact target list.
-- This keeps legacy guest_id RPCs available internally while preventing new
-- match invite UI from depending on guest_id/contact_record_id/contact channels.

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

  if not public.can_user_have_contact_person_exposure(v_uid, p_person_id) then
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

  select count(*)
  into v_any_channel_count
  from public.guests g
  where g.person_id = p_person_id
    and g.status = 'active'
    and (
      nullif(btrim(g.email), '') is not null
      or nullif(btrim(g.phone), '') is not null
    );

  select count(*)
  into v_reachable_channel_count
  from public.guests g
  where g.person_id = p_person_id
    and g.status = 'active'
    and (
      (
        nullif(btrim(g.email), '') is not null
        and not public.is_contact_communication_opted_out('email', nullif(btrim(g.email), ''), 'match_invites')
      )
      or (
        nullif(btrim(g.phone), '') is not null
        and not public.is_contact_communication_opted_out('sms', nullif(btrim(g.phone), ''), 'match_invites')
      )
    );

  if v_reachable_channel_count = 0 then
    if v_any_channel_count > 0 then
      raise exception 'contact_communication_opted_out';
    end if;
    raise exception 'contact_invite_channel_unavailable';
  end if;

  select
    g.id,
    nullif(btrim(g.email), ''),
    nullif(btrim(g.phone), ''),
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(g.display_name), ''), 'Contact Player')
  into v_guest_id, v_guest_email, v_guest_phone, v_guest_name
  from public.guests g
  left join public.people p
    on p.person_id = g.person_id
  where g.person_id = p_person_id
    and g.status = 'active'
    and (
      (
        nullif(btrim(g.email), '') is not null
        and not public.is_contact_communication_opted_out('email', nullif(btrim(g.email), ''), 'match_invites')
      )
      or (
        nullif(btrim(g.phone), '') is not null
        and not public.is_contact_communication_opted_out('sms', nullif(btrim(g.phone), ''), 'match_invites')
      )
    )
  order by
    case
      when exists (
        select 1
        from public.user_roster_guests urg
        where urg.owner_user_id = v_uid
          and urg.guest_id = g.id
      ) then 0
      else 1
    end,
    g.created_at
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
    'nominated',
    v_guest_id,
    v_uid,
    now(),
    v_uid,
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
  'P4 person_id-first Contact Player match invite wrapper. Validates trusted exposure, resolves registered-user or private contact channel internally, and does not expose guest/contact/channel identifiers to the caller.';

grant execute on function public.rpc_match_invite_contact_person(uuid, uuid) to authenticated, service_role;

create or replace function public.rpc_match_contact_person_targets(
  p_match_id uuid,
  p_search text default null
)
returns table(
  person_id uuid,
  display_name text,
  avatar_url text,
  source text,
  can_invite boolean,
  eligible_via text,
  sort_name text
)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_search text := nullif(btrim(p_search), '');
  v_can_call boolean := false;
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

  v_can_call := public.is_match_organizer(p_match_id, v_uid)
    or (
      v_match.can_participants_invite_users = true
      and (
        public.is_user_in_scope_groups(coalesce(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
        or public.is_user_match_associated(p_match_id, v_uid)
      )
    );

  if not v_can_call then
    return;
  end if;

  return query
  with already_active_people as (
    select distinct coalesce(g.person_id, p.person_id) as person_id
    from public.match_participants mp
    left join public.guests g
      on g.id = mp.guest_id
    left join public.people p
      on p.linked_user_id = mp.user_id
    where mp.match_id = p_match_id
      and mp.removed_at is null
      and coalesce(g.person_id, p.person_id) is not null
  ),
  exposed_people as (
    select distinct
      cr.person_id,
      'direct_contact'::text as source,
      1 as priority
    from public.contact_records cr
    where cr.owner_user_id = v_uid
      and cr.archived_at is null
      and cr.person_id is not null

    union all

    select distinct
      pr.person_id,
      'saved_contact'::text as source,
      2 as priority
    from public.person_relationships pr
    where pr.actor_user_id = v_uid
      and pr.relationship_type = 'saved'

    union all

    select distinct
      gc.person_id,
      'group_contact'::text as source,
      3 as priority
    from public.group_contacts gc
    join public.group_members gm
      on gm.group_id = gc.group_id
     and gm.user_id = v_uid
     and gm.status = 'active'
     and gm.accepted_at is not null
     and gm.removed_at is null
    where gc.removed_at is null

    union all

    select distinct
      cis.person_id,
      'direct_intro_share'::text as source,
      4 as priority
    from public.contact_intro_shares cis
    where cis.recipient_user_id = v_uid
      and cis.status in ('pending', 'saved')
      and cis.revoked_at is null
  ),
  ranked as (
    select distinct on (ep.person_id)
      ep.person_id,
      ep.source,
      ep.priority
    from exposed_people ep
    where ep.person_id is not null
    order by ep.person_id, ep.priority
  ),
  eligible as (
    select
      r.person_id,
      coalesce(nullif(btrim(p.display_name), ''), 'Contact Player') as display_name,
      p.avatar_url,
      r.source,
      lower(coalesce(nullif(btrim(p.display_name), ''), r.person_id::text)) as sort_name,
      p.linked_user_id,
      exists (
        select 1
        from public.guests g
        where g.person_id = r.person_id
          and g.status = 'active'
          and (
            (
              nullif(btrim(g.email), '') is not null
              and not public.is_contact_communication_opted_out('email', nullif(btrim(g.email), ''), 'match_invites')
            )
            or (
              nullif(btrim(g.phone), '') is not null
              and not public.is_contact_communication_opted_out('sms', nullif(btrim(g.phone), ''), 'match_invites')
            )
          )
      ) as has_reachable_channel
    from ranked r
    join public.people p
      on p.person_id = r.person_id
     and p.status = 'active'
    where r.person_id not in (select aap.person_id from already_active_people aap)
  )
  select
    e.person_id,
    e.display_name,
    e.avatar_url,
    e.source,
    (e.linked_user_id is not null or e.has_reachable_channel) as can_invite,
    case
      when e.linked_user_id is not null then 'registered_user_path'
      when e.has_reachable_channel then 'private_invite_channel'
      else 'no_invite_channel'
    end as eligible_via,
    e.sort_name
  from eligible e
  where (
    v_search is null
    or e.display_name ilike '%' || v_search || '%'
  )
  order by e.sort_name nulls last, e.person_id;
end;
$$;

comment on function public.rpc_match_contact_person_targets(uuid, text) is
  'P4 person-level Contact Player invite candidates for match UI. Returns person/card metadata only; no guest_id, contact_record_id, phone, email, or private channel fields.';

grant execute on function public.rpc_match_contact_person_targets(uuid, text) to authenticated, service_role;

create or replace function public.rpc_validate_contact_person_match_invite_p4()
returns table(check_name text, ok boolean, details text)
language sql
security definer
set search_path to public
as $$
  select
    'rpc_match_invite_contact_person_exists'::text,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'rpc_match_invite_contact_person'
    ),
    'person_id-first invite wrapper is installed'::text
  union all
  select
    'rpc_match_contact_person_targets_exists'::text,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'rpc_match_contact_person_targets'
    ),
    'person-level target list is installed'::text;
$$;

grant execute on function public.rpc_validate_contact_person_match_invite_p4() to authenticated, service_role;
