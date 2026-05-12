-- P5 Contact Player structural release:
-- Linked Contact / linked user is an identity bridge only.
-- Preserve historical group contact and match participant records; do not
-- automatically create group membership, Match Proxy authority, or mutate
-- historical match participant rows when a Contact Player links to a user.

create or replace function public.handle_contact_claimed(
  p_guest_id uuid,
  p_claimed_user_id uuid,
  p_source_review_decision_id uuid default null,
  p_claimed_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_guest public.guests%rowtype;
  v_person_id uuid;
  v_claim_id uuid;
  v_old_display_name text;
  v_claimed_display_name text;
  v_saved_owner_count integer := 0;
  v_archived_contact_count integer := 0;
  v_group_contact_count integer := 0;
  v_owner_notification_count integer := 0;
  v_saved_notification_count integer := 0;
  v_keeper_notification_count integer := 0;
  v_match_notification_count integer := 0;
  v_suggestion_count integer := 0;
begin
  if p_guest_id is null or p_claimed_user_id is null then
    raise exception 'invalid_contact_claim';
  end if;

  select *
  into v_guest
  from public.guests g
  where g.id = p_guest_id;

  if not found then
    raise exception 'guest_not_found';
  end if;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  v_old_display_name := nullif(trim(coalesce(v_guest.display_name, '')), '');

  select nullif(trim(coalesce(pd.display_name, '')), '')
  into v_claimed_display_name
  from public.profile_display pd
  where pd.id = p_claimed_user_id;

  insert into public.contact_claims (
    guest_id,
    person_id,
    claimed_user_id,
    source_review_decision_id,
    old_display_name_snapshot,
    claimed_user_display_name_snapshot,
    claimed_at
  )
  values (
    p_guest_id,
    v_person_id,
    p_claimed_user_id,
    p_source_review_decision_id,
    v_old_display_name,
    v_claimed_display_name,
    coalesce(p_claimed_at, now())
  )
  on conflict (claimed_user_id, person_id)
  do update set
    guest_id = coalesce(public.contact_claims.guest_id, excluded.guest_id),
    source_review_decision_id = coalesce(public.contact_claims.source_review_decision_id, excluded.source_review_decision_id),
    old_display_name_snapshot = coalesce(public.contact_claims.old_display_name_snapshot, excluded.old_display_name_snapshot),
    claimed_user_display_name_snapshot = coalesce(nullif(public.contact_claims.claimed_user_display_name_snapshot, ''), excluded.claimed_user_display_name_snapshot)
  returning id into v_claim_id;

  update public.guests g
  set
    status = 'inactive',
    claimed_by_user_id = p_claimed_user_id,
    claimed_at = coalesce(g.claimed_at, p_claimed_at, now()),
    contact_claim_id = coalesce(g.contact_claim_id, v_claim_id)
  where g.person_id = v_person_id
    and (g.status = 'active' or g.claimed_by_user_id = p_claimed_user_id);

  with owners as (
    select cr.owner_user_id, max(cr.created_at) as saved_at
    from public.contact_records cr
    where cr.person_id = v_person_id
      and cr.owner_user_id is not null
      and cr.owner_user_id <> p_claimed_user_id
    group by cr.owner_user_id

    union

    select pr.actor_user_id as owner_user_id, max(pr.created_at) as saved_at
    from public.person_relationships pr
    where pr.person_id = v_person_id
      and pr.actor_user_id is not null
      and pr.actor_user_id <> p_claimed_user_id
      and pr.relationship_type in ('saved', 'direct_contact', 'imported_by', 'group_contact')
    group by pr.actor_user_id
  ),
  upserted as (
    insert into public.user_invite_circle (
      owner_user_id,
      target_user_id,
      source,
      source_contact_id,
      migrated_from_guest_id,
      source_person_id,
      contact_claim_id
    )
    select distinct
      o.owner_user_id,
      p_claimed_user_id,
      'manual',
      p_guest_id,
      p_guest_id,
      v_person_id,
      v_claim_id
    from owners o
    on conflict (owner_user_id, target_user_id)
    do update set
      source_contact_id = coalesce(public.user_invite_circle.source_contact_id, excluded.source_contact_id),
      migrated_from_guest_id = coalesce(public.user_invite_circle.migrated_from_guest_id, excluded.migrated_from_guest_id),
      source_person_id = coalesce(public.user_invite_circle.source_person_id, excluded.source_person_id),
      contact_claim_id = coalesce(public.user_invite_circle.contact_claim_id, excluded.contact_claim_id)
    returning 1
  )
  select count(*)::integer into v_saved_owner_count from upserted;

  insert into public.person_relationships (actor_user_id, person_id, relationship_type)
  select p_claimed_user_id, v_person_id, 'linked'
  where not exists (
    select 1
    from public.person_relationships pr
    where pr.actor_user_id = p_claimed_user_id
      and pr.person_id = v_person_id
      and pr.relationship_type = 'linked'
  );

  with archived as (
    update public.contact_records cr
    set
      archived_at = coalesce(cr.archived_at, p_claimed_at, now()),
      archive_reason = coalesce(cr.archive_reason, 'linked_to_registered_user'),
      replaced_by_user_id = coalesce(cr.replaced_by_user_id, p_claimed_user_id)
    where cr.person_id = v_person_id
      and cr.archived_at is null
    returning 1
  )
  select count(*)::integer into v_archived_contact_count from archived;

  with updated_group_contacts as (
    update public.group_contacts gc
    set
      migrated_to_user_id = coalesce(gc.migrated_to_user_id, p_claimed_user_id),
      migrated_at = coalesce(gc.migrated_at, p_claimed_at, now()),
      contact_claim_id = coalesce(gc.contact_claim_id, v_claim_id)
    where gc.person_id = v_person_id
      and gc.removed_at is null
    returning 1
  )
  select count(*)::integer into v_group_contact_count from updated_group_contacts;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note,
    dedupe_key
  )
  select distinct
    cr.owner_user_id,
    'contact_joined_playerhoods',
    null::uuid,
    null::uuid,
    p_claimed_user_id,
    coalesce(v_old_display_name, 'Your contact') || ' has registered as ' || coalesce(v_claimed_display_name, 'a PlayerHoods player') || '.',
    'contact_claim:' || v_claim_id::text || ':owner'
  from public.contact_records cr
  where cr.person_id = v_person_id
    and cr.owner_user_id is not null
    and cr.owner_user_id <> p_claimed_user_id
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_owner_notification_count = row_count;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note,
    dedupe_key
  )
  select distinct
    pr.actor_user_id,
    'saved_contact_joined_playerhoods',
    null::uuid,
    null::uuid,
    p_claimed_user_id,
    'A player you saved has registered as ' || coalesce(v_claimed_display_name, 'a PlayerHoods player') || '. Your saved players have been updated.',
    'contact_claim:' || v_claim_id::text || ':saved'
  from public.person_relationships pr
  where pr.person_id = v_person_id
    and pr.actor_user_id is not null
    and pr.actor_user_id <> p_claimed_user_id
    and pr.relationship_type = 'saved'
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_saved_notification_count = row_count;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note,
    dedupe_key
  )
  select distinct
    public.group_boundary_keeper_id(gc.group_id),
    'group_contact_joined_playerhoods',
    null::uuid,
    null::uuid,
    p_claimed_user_id,
    coalesce(v_old_display_name, 'A shared contact') || ' has registered as ' || coalesce(v_claimed_display_name, 'a PlayerHoods player') || '. The group Shared Contact now points to their PlayerHoods identity.',
    'contact_claim:' || v_claim_id::text || ':group:' || gc.group_id::text
  from public.group_contacts gc
  where gc.person_id = v_person_id
    and gc.contact_claim_id = v_claim_id
    and gc.removed_at is null
    and public.group_boundary_keeper_id(gc.group_id) is not null
    and public.group_boundary_keeper_id(gc.group_id) <> p_claimed_user_id
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_keeper_notification_count = row_count;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note,
    dedupe_key
  )
  select distinct
    m.organizer_id,
    'match_contact_joined_playerhoods',
    m.id,
    null::uuid,
    p_claimed_user_id,
    coalesce(v_old_display_name, 'A contact player') || ' has registered as ' || coalesce(v_claimed_display_name, 'a PlayerHoods player') || '. Future invitations can use their PlayerHoods account.',
    'contact_claim:' || v_claim_id::text || ':match:' || m.id::text
  from public.match_participants mp
  join public.guests g on g.id = coalesce(mp.guest_id, mp.migrated_from_guest_id, mp.source_contact_id)
  join public.matches m on m.id = mp.match_id
  where g.person_id = v_person_id
    and m.organizer_id <> p_claimed_user_id
    and m.status = 'active'::public.match_status
    and coalesce(m.start_at_utc, (m.match_date::timestamp + m.start_time) at time zone 'UTC') >= now()
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_match_notification_count = row_count;

  with saved_candidates as (
    select o.owner_user_id as suggested_user_id, max(o.saved_at) as saved_contact_at
    from (
      select cr.owner_user_id, cr.created_at as saved_at
      from public.contact_records cr
      where cr.person_id = v_person_id
        and cr.owner_user_id is not null

      union all

      select pr.actor_user_id as owner_user_id, pr.created_at as saved_at
      from public.person_relationships pr
      where pr.person_id = v_person_id
        and pr.actor_user_id is not null
        and pr.relationship_type = 'saved'
    ) o
    where o.owner_user_id <> p_claimed_user_id
    group by o.owner_user_id
  ),
  match_candidates as (
    select mp2.user_id as suggested_user_id, max(coalesce(m.start_at_utc, m.created_at)) as last_shared_match_at
    from public.match_participants claimed
    join public.guests claimed_guest
      on claimed_guest.id = coalesce(claimed.guest_id, claimed.migrated_from_guest_id, claimed.source_contact_id)
     and claimed_guest.person_id = v_person_id
    join public.match_participants mp2
      on mp2.match_id = claimed.match_id
     and mp2.user_id is not null
     and mp2.user_id <> p_claimed_user_id
     and mp2.removed_at is null
     and mp2.status <> 'removed'::public.match_participant_status
    join public.matches m on m.id = claimed.match_id
    group by mp2.user_id
  ),
  candidates as (
    select
      coalesce(sc.suggested_user_id, mc.suggested_user_id) as suggested_user_id,
      sc.saved_contact_at,
      mc.last_shared_match_at,
      sc.suggested_user_id is not null as source_saved_contact,
      mc.suggested_user_id is not null as source_shared_match
    from saved_candidates sc
    full join match_candidates mc on mc.suggested_user_id = sc.suggested_user_id
  ),
  inserted as (
    insert into public.contact_claim_suggestions (
      claim_id,
      user_id,
      suggested_user_id,
      source_saved_contact,
      source_shared_match,
      saved_contact_at,
      last_shared_match_at
    )
    select
      v_claim_id,
      p_claimed_user_id,
      c.suggested_user_id,
      c.source_saved_contact,
      c.source_shared_match,
      c.saved_contact_at,
      c.last_shared_match_at
    from candidates c
    where c.suggested_user_id is not null
      and c.suggested_user_id <> p_claimed_user_id
      and not exists (
        select 1
        from public.user_invite_circle uic
        where uic.owner_user_id = p_claimed_user_id
          and uic.target_user_id = c.suggested_user_id
      )
    on conflict (user_id, suggested_user_id)
    do update set
      source_saved_contact = public.contact_claim_suggestions.source_saved_contact or excluded.source_saved_contact,
      source_shared_match = public.contact_claim_suggestions.source_shared_match or excluded.source_shared_match,
      saved_contact_at = greatest(public.contact_claim_suggestions.saved_contact_at, excluded.saved_contact_at),
      last_shared_match_at = greatest(public.contact_claim_suggestions.last_shared_match_at, excluded.last_shared_match_at),
      updated_at = now()
    returning 1
  )
  select count(*)::integer into v_suggestion_count from inserted;

  return jsonb_build_object(
    'claim_id', v_claim_id,
    'saved_owner_count', v_saved_owner_count,
    'group_contact_count', v_group_contact_count,
    'group_member_count', 0,
    'archived_contact_count', v_archived_contact_count,
    'match_participant_migrated_count', 0,
    'match_participant_merged_count', 0,
    'match_participant_replaced_count', 0,
    'owner_notification_count', v_owner_notification_count,
    'saved_notification_count', v_saved_notification_count,
    'keeper_notification_count', v_keeper_notification_count,
    'match_notification_count', v_match_notification_count,
    'suggestion_count', v_suggestion_count,
    'permission_boundary', 'linked_identity_only'
  );
end;
$$;

comment on function public.handle_contact_claimed(uuid, uuid, uuid, timestamptz) is
  'P5 ContactClaimed flow. Called after explicit verified identity-link accept. Audits, soft-archives owner-private contacts, migrates saved-player visibility, preserves group_contacts and historical match_participants, and does not create group_members or Match Proxy authority.';

revoke all on function public.handle_contact_claimed(uuid, uuid, uuid, timestamptz) from public;
grant all on function public.handle_contact_claimed(uuid, uuid, uuid, timestamptz) to service_role;

create or replace function public.rpc_validate_linked_contact_permission_boundary_p5()
returns table(check_name text, ok boolean, issue_count bigint, details text)
language sql
security definer
set search_path to 'public'
as $$
  select
    'handle_contact_claimed_exists'::text,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'handle_contact_claimed'
        and pg_get_function_arguments(p.oid) = 'p_guest_id uuid, p_claimed_user_id uuid, p_source_review_decision_id uuid DEFAULT NULL::uuid, p_claimed_at timestamp with time zone DEFAULT now()'
    ) as ok,
    0::bigint as issue_count,
    'P5 ContactClaimed function is installed'::text
  union all
  select
    'historical_auto_group_members_from_claims'::text,
    count(*) = 0,
    count(*)::bigint,
    'Existing rows only; P5 function no longer creates group_members on link accept'::text
  from public.group_members gm
  where gm.contact_claim_id is not null
    and gm.join_method = 'contact_claimed'
  union all
  select
    'proxy_binding_table_has_no_claim_source_column'::text,
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'person_match_proxies'
        and column_name = 'contact_claim_id'
    ),
    0::bigint,
    'Identity link accept must not create Match Proxy bindings'::text
  ;
$$;

grant execute on function public.rpc_validate_linked_contact_permission_boundary_p5() to authenticated, service_role;
