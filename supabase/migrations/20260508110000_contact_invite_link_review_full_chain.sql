-- Contact invite account-claim full chain:
-- 1) Signing in should make matching guest participant rows visible as related matches.
-- 2) It must not silently create the accepted contact identity link that hides review UI.
-- 3) Review candidates and accept/keep-separate must work for verified email and auth phone.

create or replace function public.rpc_reconcile_identity_guest_participants()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  select distinct
    vc.contact_type,
    vc.contact_normalized,
    v_uid,
    'guest_participant',
    mp.id,
    v_uid
  from (
    select
      case when vve.email_type = 'profile_contact' then 'profile_contact' else 'auth' end as contact_type,
      vve.email_normalized as contact_normalized
    from public.v_user_verified_emails vve
    where vve.user_id = v_uid

    union all

    select
      'auth_phone'::text as contact_type,
      public.normalize_discovery_phone(u.phone::text) as contact_normalized
    from auth.users u
    where u.id = v_uid
      and u.phone is not null
      and public.normalize_discovery_phone(u.phone::text) is not null
      and u.phone_confirmed_at is not null
  ) vc
  join public.match_participants mp on mp.removed_at is null
  join public.guests g on g.id = mp.guest_id
  where (
      vc.contact_type in ('auth', 'profile_contact')
      and lower(trim(coalesce(g.email, ''))) = vc.contact_normalized
    )
    or (
      vc.contact_type = 'auth_phone'
      and public.normalize_discovery_phone(g.phone) = vc.contact_normalized
    )
  on conflict (user_id, linked_type, linked_id) do nothing;
end;
$$;

comment on function public.rpc_reconcile_identity_guest_participants() is
  'Links matching guest participant rows to the current user by verified email or auth phone for match visibility. Does not create contact identity links; explicit review acceptance remains required.';

grant all on function public.rpc_reconcile_identity_guest_participants() to authenticated;
grant all on function public.rpc_reconcile_identity_guest_participants() to service_role;

drop function if exists public.rpc_identity_link_candidates();

create or replace function public.rpc_identity_link_candidates()
returns table(
  guest_id uuid,
  person_id uuid,
  display_name text,
  guest_email text,
  matched_email_normalized text,
  matched_email_type text,
  match_participant_count integer,
  contact_owner_count integer,
  group_contact_count integer,
  last_match_at timestamptz,
  guest_phone text,
  matched_contact_normalized text,
  matched_contact_type text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  return query
  with verified_contacts as (
    select
      vve.email_normalized as contact_normalized,
      vve.email_type as contact_type
    from public.v_user_verified_emails vve
    where vve.user_id = v_uid

    union all

    select
      public.normalize_discovery_phone(u.phone::text) as contact_normalized,
      'auth_phone'::text as contact_type
    from auth.users u
    where u.id = v_uid
      and u.phone is not null
      and public.normalize_discovery_phone(u.phone::text) is not null
      and u.phone_confirmed_at is not null
  ),
  guest_matches as (
    select
      g.id as guest_id,
      g.person_id,
      g.display_name,
      g.email as guest_email,
      g.phone as guest_phone,
      vc.contact_normalized as matched_contact_normalized,
      vc.contact_type as matched_contact_type
    from public.guests g
    join verified_contacts vc
      on (
        vc.contact_type in ('auth', 'profile_contact')
        and lower(trim(coalesce(g.email, ''))) = vc.contact_normalized
      )
      or (
        vc.contact_type = 'auth_phone'
        and public.normalize_discovery_phone(g.phone) = vc.contact_normalized
      )
    where g.status = 'active'
      and not exists (
        select 1
        from public.identity_links il
        where il.user_id = v_uid
          and il.linked_type = 'contact'
          and il.linked_id = g.id
      )
      and not exists (
        select 1
        from public.identity_link_review_decisions d
        where d.user_id = v_uid
          and d.guest_id = g.id
          and d.email_normalized = vc.contact_normalized
          and d.decision = 'kept_separate'
      )
  )
  select
    gm.guest_id,
    gm.person_id,
    gm.display_name,
    gm.guest_email,
    gm.matched_contact_normalized as matched_email_normalized,
    gm.matched_contact_type as matched_email_type,
    count(distinct mp.id)::integer as match_participant_count,
    count(distinct cr.contact_record_id)::integer as contact_owner_count,
    count(distinct gc.group_contact_id)::integer as group_contact_count,
    max(m.start_at_utc) as last_match_at,
    gm.guest_phone,
    gm.matched_contact_normalized,
    gm.matched_contact_type
  from guest_matches gm
  left join public.match_participants mp
    on mp.guest_id = gm.guest_id
   and mp.removed_at is null
  left join public.matches m
    on m.id = mp.match_id
  left join public.contact_records cr
    on cr.guest_id = gm.guest_id
   and cr.archived_at is null
  left join public.group_contacts gc
    on gc.person_id = gm.person_id
   and gc.removed_at is null
  group by
    gm.guest_id,
    gm.person_id,
    gm.display_name,
    gm.guest_email,
    gm.guest_phone,
    gm.matched_contact_normalized,
    gm.matched_contact_type
  order by max(m.start_at_utc) desc nulls last, lower(gm.display_name), gm.guest_id;
end;
$$;

comment on function public.rpc_identity_link_candidates() is
  'Returns explicit verified-contact identity-link review candidates for the current user. Supports verified email and auth phone. Does not create identity_links.';

grant all on function public.rpc_identity_link_candidates() to authenticated;
grant all on function public.rpc_identity_link_candidates() to service_role;

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
  v_contact_normalized text;
  v_contact_type text;
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
    now()
  )
  on conflict (user_id, guest_id, email_normalized)
  do update set
    decision = 'accepted',
    decided_at = now();

  with inserted as (
    insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
    values (
      v_contact_type,
      v_contact_normalized,
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
    v_contact_type,
    v_contact_normalized,
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
  'Explicitly accepts a verified email/phone identity link candidate for the current user. Creates contact and guest_participant identity_links, soft-archives owner-private contact records for other owners, and notifies those owners.';

grant all on function public.rpc_identity_link_accept(uuid) to authenticated;
grant all on function public.rpc_identity_link_accept(uuid) to service_role;

create or replace function public.rpc_identity_link_keep_separate(
  p_guest_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_guest public.guests%rowtype;
  v_contact_normalized text;
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

  select vc.contact_normalized
  into v_contact_normalized
  from (
    select
      vve.email_normalized as contact_normalized,
      case when vve.email_type = 'auth' then 0 else 1 end as priority
    from public.v_user_verified_emails vve
    where vve.user_id = v_uid
      and lower(trim(coalesce(v_guest.email, ''))) = vve.email_normalized

    union all

    select
      public.normalize_discovery_phone(u.phone::text) as contact_normalized,
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
    'kept_separate',
    now()
  )
  on conflict (user_id, guest_id, email_normalized)
  do update set
    decision = 'kept_separate',
    decided_at = now();
end;
$$;

comment on function public.rpc_identity_link_keep_separate(uuid) is
  'Marks a verified email/phone identity-link candidate as keep-separate for now so it no longer appears in review prompts until the evidence changes.';

grant all on function public.rpc_identity_link_keep_separate(uuid) to authenticated;
grant all on function public.rpc_identity_link_keep_separate(uuid) to service_role;
