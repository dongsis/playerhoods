alter table public.contact_records
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists replaced_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_contact_records_owner_active
  on public.contact_records (owner_user_id, archived_at, created_at desc);

comment on table public.contact_records is
  'Owner-private Contact Player records. Private phone/email/notes live here, not on the shared person node. Archived records are soft-retained for history.';

create or replace function public.rpc_roster_guest_list()
returns setof public.guests
language sql
security definer
set search_path to 'public'
as $$
  select g.*
  from public.user_roster_guests urg
  join public.guests g
    on g.id = urg.guest_id
  join lateral (
    select cr.contact_record_id
    from public.contact_records cr
    where cr.owner_user_id = urg.owner_user_id
      and cr.guest_id = g.id
      and cr.archived_at is null
    order by cr.created_at desc
    limit 1
  ) active_contact on true
  where urg.owner_user_id = auth.uid()
    and g.status = 'active'
  order by lower(g.display_name), g.created_at desc;
$$;

comment on function public.rpc_roster_guest_list() is
  'List caller-owned active Contact Players. Soft-archived owner-private contact records are excluded by default.';

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
    il.user_id as linked_user_id,
    case when il.user_id is not null then 'linked_user'::text else 'contact_only'::text end as resolution_state
  from public.user_roster_guests urg
  join public.guests g on g.id = urg.guest_id
  join lateral (
    select cr.contact_record_id
    from public.contact_records cr
    where cr.owner_user_id = urg.owner_user_id
      and cr.guest_id = g.id
      and cr.archived_at is null
    order by cr.created_at desc
    limit 1
  ) active_contact on true
  left join public.identity_links il
    on il.linked_type = 'contact'
   and il.linked_id = g.id
   and il.user_id = auth.uid()
  where urg.owner_user_id = auth.uid()
    and g.status = 'active'
  order by g.display_name;
end;
$$;

comment on function public.rpc_contact_player_resolution() is
  'Returns caller roster guests with gender, lightweight availability status, linked_user_id (nullable), and resolution_state (contact_only | linked_user). Soft-archived owner-private contact records are excluded from active contact views.';

create or replace function public.rpc_roster_guest_update(
  p_guest_id uuid,
  p_display_name text,
  p_email text default null::text,
  p_phone text default null::text,
  p_notes text default null::text,
  p_gender text default null::text,
  p_availability_status text default null::text,
  p_availability_note text default null::text,
  p_availability_until text default null::text
)
returns public.guests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_guest public.guests;
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_gender text := nullif(lower(trim(coalesce(p_gender, ''))), '');
  v_availability_status text := coalesce(nullif(lower(trim(coalesce(p_availability_status, ''))), ''), 'available');
  v_availability_note text := nullif(trim(coalesce(p_availability_note, '')), '');
  v_availability_until date := nullif(trim(coalesce(p_availability_until, '')), '')::date;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_guest_id is null then
    raise exception 'guest_id_required';
  end if;

  if v_display_name is null then
    raise exception 'display_name_required';
  end if;

  if v_gender is not null and v_gender not in ('male', 'female', 'unspecified') then
    raise exception 'invalid_gender';
  end if;

  if v_availability_status not in ('available', 'busy', 'away', 'inactive') then
    raise exception 'invalid_availability_status';
  end if;

  if not exists (
    select 1
    from public.user_roster_guests urg
    where urg.owner_user_id = v_uid
      and urg.guest_id = p_guest_id
  ) then
    raise exception 'not_authorized';
  end if;

  if not exists (
    select 1
    from public.contact_records cr
    where cr.owner_user_id = v_uid
      and cr.guest_id = p_guest_id
      and cr.archived_at is null
  ) then
    raise exception 'contact_archived';
  end if;

  update public.guests g
  set
    display_name = v_display_name,
    email = v_email,
    phone = v_phone,
    notes = v_notes,
    gender = coalesce(v_gender, g.gender),
    availability_status = coalesce(v_availability_status, g.availability_status),
    availability_note = v_availability_note,
    availability_until = v_availability_until
  where g.id = p_guest_id
    and g.status = 'active'
  returning g.* into v_guest;

  if v_guest.id is null then
    raise exception 'guest_not_found';
  end if;

  update public.contact_records cr
  set
    raw_name = v_guest.display_name,
    raw_phone = v_guest.phone,
    raw_email = v_guest.email,
    owner_notes = v_guest.notes
  where cr.contact_record_id = (
    select cr2.contact_record_id
    from public.contact_records cr2
    where cr2.owner_user_id = v_uid
      and cr2.guest_id = p_guest_id
      and cr2.archived_at is null
    order by cr2.created_at desc
    limit 1
  );

  return v_guest;
end;
$$;

comment on function public.rpc_roster_guest_update(uuid, text, text, text, text, text, text, text, text) is
  'Update a caller-owned active Contact Player in roster with lightweight availability fields. Soft-archived private contact records are read-only.';

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
  v_email_normalized text;
  v_email_type text;
  v_linked_match_participant_count integer := 0;
  v_saved_owner_count integer := 0;
  v_owner_notification_count integer := 0;
  v_contact_link_inserted integer := 0;
  v_archived_contact_count integer := 0;
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

  select
    vve.email_normalized,
    vve.email_type
  into
    v_email_normalized,
    v_email_type
  from public.v_user_verified_emails vve
  where vve.user_id = v_uid
    and vve.email_normalized = lower(trim(v_guest.email))
  order by case when vve.email_type = 'auth' then 0 else 1 end
  limit 1;

  if v_email_normalized is null then
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
    v_email_normalized,
    'accepted',
    now()
  )
  on conflict (user_id, guest_id, email_normalized)
  do update set
    decision = 'accepted',
    decided_at = now();

  with inserted as (
    insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
    values (
      case when v_email_type = 'profile_contact' then 'profile_contact' else 'auth' end,
      v_email_normalized,
      v_uid,
      'contact',
      p_guest_id,
      v_uid
    )
    on conflict (user_id, linked_type, linked_id) do nothing
    returning 1
  )
  select count(*)::integer
  into v_contact_link_inserted
  from inserted;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  select distinct
    case when v_email_type = 'profile_contact' then 'profile_contact' else 'auth' end,
    v_email_normalized,
    v_uid,
    'guest_participant',
    mp.id,
    v_uid
  from public.match_participants mp
  where mp.guest_id = p_guest_id
    and mp.removed_at is null
  on conflict (user_id, linked_type, linked_id) do nothing;

  get diagnostics v_linked_match_participant_count = row_count;

  insert into public.user_invite_circle (owner_user_id, target_user_id, source)
  select distinct
    cr.owner_user_id,
    v_uid,
    'manual'
  from public.contact_records cr
  where cr.guest_id = p_guest_id
    and cr.owner_user_id <> v_uid
  on conflict (owner_user_id, target_user_id) do nothing;

  get diagnostics v_saved_owner_count = row_count;

  if v_contact_link_inserted > 0 then
    update public.contact_records cr
    set
      archived_at = now(),
      archive_reason = 'linked_to_registered_user',
      replaced_by_user_id = v_uid
    where cr.guest_id = p_guest_id
      and cr.owner_user_id <> v_uid
      and cr.archived_at is null;

    get diagnostics v_archived_contact_count = row_count;

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
      null,
      null,
      v_uid,
      coalesce(v_guest.display_name, 'This player') ||
        ' is now on PlayerHoods. We saved their registered profile to your Hood and archived the old contact record. Future invitations will go to their PlayerHoods account. Your past contact notes and match history were not deleted.'
    from public.contact_records cr
    where cr.guest_id = p_guest_id
      and cr.owner_user_id <> v_uid;

    get diagnostics v_owner_notification_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'guest_id', p_guest_id,
    'linked_user_id', v_uid,
    'linked_match_participant_count', v_linked_match_participant_count,
    'saved_owner_count', v_saved_owner_count,
    'archived_contact_count', v_archived_contact_count,
    'owner_notification_count', v_owner_notification_count
  );
end;
$$;

comment on function public.rpc_identity_link_accept(uuid) is
  'Explicitly accepts a verified-email identity link candidate for the current user. Creates contact and guest_participant identity_links, soft-archives owner-private contact records for other owners, and notifies those owners.';
