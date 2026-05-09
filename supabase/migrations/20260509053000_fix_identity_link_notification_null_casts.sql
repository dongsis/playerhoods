create or replace function public.rpc_identity_link_accept(
  p_guest_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_guest public.guests%rowtype;
  v_person_id uuid;
  v_registered_person_id uuid;
  v_contact_normalized text;
  v_contact_type text;
  v_linked_match_participant_count integer := 0;
  v_saved_owner_count integer := 0;
  v_owner_notification_count integer := 0;
  v_saved_notification_count integer := 0;
  v_keeper_notification_count integer := 0;
  v_contact_link_inserted integer := 0;
  v_archived_contact_count integer := 0;
  v_link_accepted_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_guest
  from public.guests g
  where g.id = p_guest_id
    and g.status = 'active';

  if not found then
    raise exception 'guest_not_found';
  end if;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);

  select p.person_id
  into v_registered_person_id
  from public.people p
  where p.linked_user_id = v_uid
  limit 1;

  select vc.contact_normalized, vc.contact_type
  into v_contact_normalized, v_contact_type
  from (
    select
      vve.email_normalized as contact_normalized,
      case when vve.email_type = 'profile_contact' then 'profile_contact' else 'auth' end as contact_type,
      case when vve.email_type = 'auth' then 0 else 1 end as priority
    from public.v_user_verified_emails vve
    where vve.user_id = v_uid
      and lower(trim(coalesce(v_guest.email, ''))) = vve.email_normalized

    union all

    select
      public.normalize_discovery_phone(u.phone::text) as contact_normalized,
      'auth_phone'::text as contact_type,
      2 as priority
    from auth.users u
    where u.id = v_uid
      and u.phone is not null
      and public.normalize_discovery_phone(u.phone::text) is not null
      and u.phone_confirmed_at is not null
      and public.normalize_discovery_phone(v_guest.phone) = public.normalize_discovery_phone(u.phone::text)
  ) vc
  order by vc.priority
  limit 1;

  if v_contact_normalized is null then
    raise exception 'review_required';
  end if;

  insert into public.identity_link_review_decisions (
    user_id,
    guest_id,
    email_normalized,
    decision,
    decided_at
  )
  values (
    v_uid,
    p_guest_id,
    v_contact_normalized,
    'accepted',
    v_link_accepted_at
  )
  on conflict (user_id, guest_id, email_normalized)
  do update set
    decision = 'accepted',
    decided_at = v_link_accepted_at;

  update public.people p
  set
    linked_user_id = v_uid,
    person_type = case when p.person_type = 'registered_user' then 'registered_user' else 'linked_hybrid' end,
    updated_at = v_link_accepted_at
  where p.person_id = v_person_id
    and (
      p.linked_user_id = v_uid
      or v_registered_person_id is null
    );

  if v_registered_person_id is null then
    v_registered_person_id := v_person_id;
  end if;

  with person_guests as (
    select g.id
    from public.guests g
    where g.person_id = v_person_id
      and g.status = 'active'
  ),
  inserted as (
    insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
    select distinct
      v_contact_type,
      v_contact_normalized,
      v_uid,
      'contact',
      pg.id,
      v_uid
    from person_guests pg
    on conflict (user_id, linked_type, linked_id) do nothing
    returning 1
  )
  select count(*)::integer
  into v_contact_link_inserted
  from inserted;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  select distinct
    v_contact_type,
    v_contact_normalized,
    v_uid,
    'guest_participant',
    mp.id,
    v_uid
  from public.match_participants mp
  join public.guests g
    on g.id = mp.guest_id
   and g.person_id = v_person_id
  where mp.removed_at is null
  on conflict (user_id, linked_type, linked_id) do nothing;

  get diagnostics v_linked_match_participant_count = row_count;

  insert into public.user_invite_circle (owner_user_id, target_user_id, source)
  select distinct owner_user_id, v_uid, 'manual'
  from (
    select cr.owner_user_id
    from public.contact_records cr
    where cr.person_id = v_person_id
      and cr.owner_user_id <> v_uid

    union

    select pr.actor_user_id as owner_user_id
    from public.person_relationships pr
    where pr.person_id = v_person_id
      and pr.actor_user_id is not null
      and pr.actor_user_id <> v_uid
      and pr.relationship_type in ('saved', 'direct_contact', 'imported_by', 'group_contact')
  ) owners
  on conflict (owner_user_id, target_user_id) do nothing;

  get diagnostics v_saved_owner_count = row_count;

  insert into public.person_relationships (actor_user_id, person_id, relationship_type)
  select distinct pr.actor_user_id, v_person_id, pr.relationship_type
  from public.person_relationships pr
  where pr.person_id = v_registered_person_id
    and v_registered_person_id is not null
    and v_registered_person_id <> v_person_id
    and pr.actor_user_id is not null
    and not exists (
      select 1
      from public.person_relationships existing
      where existing.actor_user_id = pr.actor_user_id
        and existing.person_id = v_person_id
        and existing.relationship_type = pr.relationship_type
        and coalesce(existing.source_group_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(pr.source_group_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(existing.source_match_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(pr.source_match_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  insert into public.person_relationships (actor_user_id, person_id, relationship_type)
  select v_uid, v_person_id, 'linked'
  where not exists (
    select 1
    from public.person_relationships pr
    where pr.actor_user_id = v_uid
      and pr.person_id = v_person_id
      and pr.relationship_type = 'linked'
  );

  with archived as (
    update public.contact_records cr
    set
      archived_at = v_link_accepted_at,
      archive_reason = 'linked_to_registered_user',
      replaced_by_user_id = v_uid
    where cr.person_id = v_person_id
      and cr.archived_at is null
    returning cr.owner_user_id
  )
  select count(*)::integer
  into v_archived_contact_count
  from archived;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note
  )
  select distinct
    cr.owner_user_id,
    'contact_joined_playerhoods',
    null::uuid,
    null::uuid,
    v_uid,
    'Your contact ' || coalesce(v_guest.display_name, 'This player') || ' has joined PlayerHoods.'
  from public.contact_records cr
  where cr.person_id = v_person_id
    and cr.archived_at = v_link_accepted_at
    and cr.owner_user_id <> v_uid;

  get diagnostics v_owner_notification_count = row_count;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note
  )
  select distinct
    pr.actor_user_id,
    'saved_contact_joined_playerhoods',
    null::uuid,
    null::uuid,
    v_uid,
    coalesce(v_guest.display_name, 'This player') || ' has joined PlayerHoods. Your saved contact is now their PlayerHoods profile.'
  from public.person_relationships pr
  where pr.person_id = v_person_id
    and v_archived_contact_count > 0
    and pr.actor_user_id is not null
    and pr.actor_user_id <> v_uid
    and pr.relationship_type = 'saved';

  get diagnostics v_saved_notification_count = row_count;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note
  )
  select distinct
    public.group_boundary_keeper_id(gc.group_id),
    'group_contact_joined_playerhoods',
    null::uuid,
    null::uuid,
    v_uid,
    'A Contact Player in your Hood has joined PlayerHoods.'
  from public.group_contacts gc
  where gc.person_id = v_person_id
    and v_archived_contact_count > 0
    and gc.removed_at is null
    and public.group_boundary_keeper_id(gc.group_id) is not null
    and public.group_boundary_keeper_id(gc.group_id) <> v_uid;

  get diagnostics v_keeper_notification_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'guest_id', p_guest_id,
    'person_id', v_person_id,
    'linked_user_id', v_uid,
    'linked_match_participant_count', v_linked_match_participant_count,
    'saved_owner_count', v_saved_owner_count,
    'archived_contact_count', v_archived_contact_count,
    'owner_notification_count', v_owner_notification_count,
    'saved_notification_count', v_saved_notification_count,
    'keeper_notification_count', v_keeper_notification_count
  );
end;
$$;

comment on function public.rpc_identity_link_accept(uuid) is
  'Explicitly accepts a verified email/phone identity link candidate for the current user. Link acceptance is person-scoped: it links the canonical person when possible, links all active guest compatibility rows for that person, soft-archives active owner-private contact records, maps saved/contact owners to the registered-user invite path, and fans out owner/saved/keeper notifications. It does not grant proxy, match, group, or member authority.';

grant all on function public.rpc_identity_link_accept(uuid) to authenticated;
grant all on function public.rpc_identity_link_accept(uuid) to service_role;

create or replace function public.rpc_contact_player_resolution()
returns table(
  guest_id uuid,
  display_name text,
  email text,
  phone text,
  notes text,
  gender text,
  availability_status text,
  availability_note text,
  availability_until date,
  linked_user_id uuid,
  resolution_state text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select
    g.id as guest_id,
    g.display_name,
    g.email,
    g.phone,
    g.notes,
    g.gender,
    g.availability_status,
    g.availability_note,
    g.availability_until,
    coalesce(p.linked_user_id, linked.user_id) as linked_user_id,
    case when coalesce(p.linked_user_id, linked.user_id) is not null then 'linked_user'::text else 'contact_only'::text end as resolution_state
  from public.user_roster_guests urg
  join public.guests g on g.id = urg.guest_id
  join public.people p on p.person_id = g.person_id
  join lateral (
    select cr.contact_record_id
    from public.contact_records cr
    where cr.owner_user_id = urg.owner_user_id
      and cr.guest_id = g.id
      and cr.archived_at is null
    order by cr.created_at desc
    limit 1
  ) active_contact on true
  left join lateral (
    select il.user_id
    from public.identity_links il
    where il.linked_type = 'contact'
      and il.linked_id = g.id
    order by il.created_at desc
    limit 1
  ) linked on true
  where urg.owner_user_id = auth.uid()
    and g.status = 'active'
  order by g.display_name;
end;
$$;

comment on function public.rpc_contact_player_resolution() is
  'Returns caller active roster contacts. Soft-archived owner-private contact records are excluded; linked contacts resolve through people.linked_user_id or accepted identity_links so active UI can prefer the registered-user profile.';

create or replace function public.rpc_contact_player_lookup_v2(
  p_guest_ids uuid[]
) returns table(
  guest_id uuid,
  person_id uuid,
  display_name text,
  avatar_url text,
  primary_sport_id integer,
  linked_user_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    g.id as guest_id,
    g.person_id,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(g.display_name), ''), g.id::text) as display_name,
    p.avatar_url,
    p.primary_sport_id,
    coalesce(p.linked_user_id, linked.user_id) as linked_user_id
  from public.guests g
  left join public.people p
    on p.person_id = g.person_id
  left join lateral (
    select il.user_id
    from public.identity_links il
    where il.linked_type = 'contact'
      and il.linked_id = g.id
    order by il.created_at desc
    limit 1
  ) linked on true
  where g.status = 'active'
    and g.id = any(coalesce(p_guest_ids, array[]::uuid[]))
    and public.can_user_view_contact_player(g.id, auth.uid());
$$;

comment on function public.rpc_contact_player_lookup_v2(uuid[]) is
  'Scoped Contact Player lookup with linked_user_id. Active UI should render linked contacts as registered-user profiles while preserving historical contact rows.';

grant all on function public.rpc_contact_player_lookup_v2(uuid[]) to authenticated;
grant all on function public.rpc_contact_player_lookup_v2(uuid[]) to service_role;

create or replace function public.rpc_group_contact_list_v2(
  p_group_id uuid
) returns table(
  group_contact_id uuid,
  guest_id uuid,
  person_id uuid,
  display_name text,
  avatar_url text,
  linked_user_id uuid,
  membership_type text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_group_active_member(p_group_id, auth.uid())
    or public.group_boundary_keeper_id(p_group_id) = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    gc.group_contact_id,
    g.id as guest_id,
    gc.person_id,
    p.display_name,
    p.avatar_url,
    coalesce(p.linked_user_id, linked.user_id) as linked_user_id,
    gc.membership_type,
    gc.created_by,
    gc.created_at
  from public.group_contacts gc
  join lateral (
    select g.id
    from public.guests g
    where g.person_id = gc.person_id
      and g.status = 'active'
    order by g.created_at
    limit 1
  ) g on true
  join public.people p
    on p.person_id = gc.person_id
  left join lateral (
    select il.user_id
    from public.identity_links il
    where il.linked_type = 'contact'
      and il.linked_id = g.id
    order by il.created_at desc
    limit 1
  ) linked on true
  where gc.group_id = p_group_id
    and gc.removed_at is null
  order by p.display_name, gc.created_at;
end;
$$;

comment on function public.rpc_group_contact_list_v2(uuid) is
  'List group Contact Players with linked_user_id so Hoods and Group UI can render registered-user identity after link acceptance without granting group/member permissions.';

grant all on function public.rpc_group_contact_list_v2(uuid) to authenticated;
grant all on function public.rpc_group_contact_list_v2(uuid) to service_role;
