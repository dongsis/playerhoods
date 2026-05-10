-- ContactClaimed flow for accepted identity links.
-- Governance: append-only drift correction. Existing contact/person identity link acceptance now
-- records a stable claim, migrates saved/group/match relationships idempotently, and exposes
-- private "People you may know" suggestions for the claimed user.

alter table public.guests
  add column if not exists claimed_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists contact_claim_id uuid;

create table if not exists public.contact_claims (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid null references public.guests(id) on delete set null,
  person_id uuid null references public.people(person_id) on delete set null,
  claimed_user_id uuid not null references public.profiles(id) on delete cascade,
  source_review_decision_id uuid null references public.identity_link_review_decisions(id) on delete set null,
  old_display_name_snapshot text,
  claimed_user_display_name_snapshot text,
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (claimed_user_id, person_id)
);

create unique index if not exists uq_contact_claims_claimed_guest
  on public.contact_claims (claimed_user_id, guest_id)
  where guest_id is not null;

create index if not exists idx_contact_claims_claimed_user
  on public.contact_claims (claimed_user_id, claimed_at desc);

comment on table public.contact_claims is
  'Stable audit log for Contact Player / guest identity claims. One row is reused for repeated accepts of the same claimed person.';

alter table public.contact_claims enable row level security;

drop policy if exists contact_claims_select_claimed_user on public.contact_claims;
create policy contact_claims_select_claimed_user
  on public.contact_claims
  for select
  to authenticated
  using (claimed_user_id = auth.uid());

grant all on table public.contact_claims to authenticated;
grant all on table public.contact_claims to service_role;

alter table public.guests
  drop constraint if exists guests_contact_claim_id_fkey;

alter table public.guests
  add constraint guests_contact_claim_id_fkey
  foreign key (contact_claim_id) references public.contact_claims(id) on delete set null;

alter table public.user_invite_circle
  add column if not exists source_contact_id uuid references public.guests(id) on delete set null,
  add column if not exists migrated_from_guest_id uuid references public.guests(id) on delete set null,
  add column if not exists source_person_id uuid references public.people(person_id) on delete set null,
  add column if not exists contact_claim_id uuid references public.contact_claims(id) on delete set null;

alter table public.group_members
  add column if not exists source_contact_id uuid references public.guests(id) on delete set null,
  add column if not exists migrated_from_guest_id uuid references public.guests(id) on delete set null,
  add column if not exists source_person_id uuid references public.people(person_id) on delete set null,
  add column if not exists contact_claim_id uuid references public.contact_claims(id) on delete set null;

alter table public.group_contacts
  add column if not exists migrated_to_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists migrated_at timestamptz,
  add column if not exists contact_claim_id uuid references public.contact_claims(id) on delete set null;

alter table public.match_participants
  add column if not exists source_contact_id uuid references public.guests(id) on delete set null,
  add column if not exists migrated_from_guest_id uuid references public.guests(id) on delete set null,
  add column if not exists source_person_id uuid references public.people(person_id) on delete set null,
  add column if not exists contact_claim_id uuid references public.contact_claims(id) on delete set null,
  add column if not exists replaced_by_participant_id uuid references public.match_participants(id) on delete set null,
  add column if not exists migrated_at timestamptz;

alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists uq_notifications_recipient_kind_dedupe
  on public.notifications (recipient_user_id, kind, dedupe_key)
  where dedupe_key is not null;

create table if not exists public.contact_claim_suggestions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.contact_claims(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  suggested_user_id uuid not null references public.profiles(id) on delete cascade,
  source_saved_contact boolean not null default false,
  source_shared_match boolean not null default false,
  saved_contact_at timestamptz,
  last_shared_match_at timestamptz,
  saved_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_claim_suggestions_not_self check (user_id <> suggested_user_id),
  unique (user_id, suggested_user_id)
);

create index if not exists idx_contact_claim_suggestions_user_open
  on public.contact_claim_suggestions (user_id, created_at desc)
  where dismissed_at is null and saved_at is null;

comment on table public.contact_claim_suggestions is
  'Private post-claim onboarding cards. Sources are intentionally stored for ranking only and are not displayed to the claimed user.';

alter table public.contact_claim_suggestions enable row level security;

drop policy if exists contact_claim_suggestions_select_own on public.contact_claim_suggestions;
create policy contact_claim_suggestions_select_own
  on public.contact_claim_suggestions
  for select
  to authenticated
  using (user_id = auth.uid());

grant all on table public.contact_claim_suggestions to authenticated;
grant all on table public.contact_claim_suggestions to service_role;

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
  v_group_member_count integer := 0;
  v_group_contact_count integer := 0;
  v_match_participant_migrated_count integer := 0;
  v_match_participant_merged_count integer := 0;
  v_match_participant_replaced_count integer := 0;
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
  select count(*)::integer into v_group_contact_count from archived;

  with group_sources as (
    select distinct gc.group_id, gc.created_by
    from public.group_contacts gc
    where gc.person_id = v_person_id
      and gc.removed_at is null
  ),
  upserted as (
    insert into public.group_members (
      group_id,
      user_id,
      status,
      join_method,
      invited_by,
      accepted_at,
      source_contact_id,
      migrated_from_guest_id,
      source_person_id,
      contact_claim_id
    )
    select
      gs.group_id,
      p_claimed_user_id,
      'active'::public.group_member_status,
      'contact_claimed',
      gs.created_by,
      coalesce(p_claimed_at, now()),
      p_guest_id,
      p_guest_id,
      v_person_id,
      v_claim_id
    from group_sources gs
    on conflict (group_id, user_id)
    do update set
      status = 'active'::public.group_member_status,
      accepted_at = coalesce(public.group_members.accepted_at, excluded.accepted_at),
      removed_at = null,
      removed_by = null,
      source_contact_id = coalesce(public.group_members.source_contact_id, excluded.source_contact_id),
      migrated_from_guest_id = coalesce(public.group_members.migrated_from_guest_id, excluded.migrated_from_guest_id),
      source_person_id = coalesce(public.group_members.source_person_id, excluded.source_person_id),
      contact_claim_id = coalesce(public.group_members.contact_claim_id, excluded.contact_claim_id)
    returning 1
  )
  select count(*)::integer into v_group_member_count from upserted;

  update public.group_contacts gc
  set
    migrated_to_user_id = coalesce(gc.migrated_to_user_id, p_claimed_user_id),
    migrated_at = coalesce(gc.migrated_at, p_claimed_at, now()),
    contact_claim_id = coalesce(gc.contact_claim_id, v_claim_id),
    removed_at = coalesce(gc.removed_at, p_claimed_at, now())
  where gc.person_id = v_person_id
    and gc.removed_at is null;

  with person_guests as (
    select g.id
    from public.guests g
    where g.person_id = v_person_id
  ),
  guest_rows as (
    select mp.*
    from public.match_participants mp
    join person_guests pg on pg.id = mp.guest_id
    where mp.removed_at is null
      and mp.status <> 'removed'::public.match_participant_status
  ),
  target_rows as (
    select
      gr.id as guest_mp_id,
      ump.id as user_mp_id,
      gr.status as guest_status,
      gr.confirmed_at as guest_confirmed_at,
      gr.org_approved_at as guest_org_approved_at,
      gr.org_approved_by as guest_org_approved_by,
      gr.participant_accepted_at as guest_participant_accepted_at,
      gr.participant_accepted_via as guest_participant_accepted_via,
      gr.manual_confirmed_by as guest_manual_confirmed_by,
      gr.nominated_by as guest_nominated_by
    from guest_rows gr
    join public.match_participants ump
      on ump.match_id = gr.match_id
     and ump.user_id = p_claimed_user_id
     and ump.removed_at is null
     and ump.status <> 'removed'::public.match_participant_status
  ),
  merged as (
    update public.match_participants ump
    set
      status = case
        when ump.status = 'confirmed'::public.match_participant_status
          or tr.guest_status = 'confirmed'::public.match_participant_status
          then 'confirmed'::public.match_participant_status
        when ump.status = 'pending'::public.match_participant_status
          or tr.guest_status = 'pending'::public.match_participant_status
          then 'pending'::public.match_participant_status
        else ump.status
      end,
      confirmed_at = coalesce(ump.confirmed_at, tr.guest_confirmed_at),
      org_approved_at = coalesce(ump.org_approved_at, tr.guest_org_approved_at),
      org_approved_by = coalesce(ump.org_approved_by, tr.guest_org_approved_by),
      participant_accepted_at = coalesce(ump.participant_accepted_at, tr.guest_participant_accepted_at),
      participant_accepted_via = coalesce(ump.participant_accepted_via, tr.guest_participant_accepted_via),
      manual_confirmed_by = coalesce(ump.manual_confirmed_by, tr.guest_manual_confirmed_by),
      nominated_by = coalesce(ump.nominated_by, tr.guest_nominated_by),
      source_contact_id = coalesce(ump.source_contact_id, p_guest_id),
      migrated_from_guest_id = coalesce(ump.migrated_from_guest_id, p_guest_id),
      source_person_id = coalesce(ump.source_person_id, v_person_id),
      contact_claim_id = coalesce(ump.contact_claim_id, v_claim_id),
      migrated_at = coalesce(ump.migrated_at, p_claimed_at, now())
    from target_rows tr
    where ump.id = tr.user_mp_id
    returning tr.guest_mp_id, ump.id as user_mp_id
  ),
  replaced as (
    update public.match_participants gmp
    set
      status = 'removed'::public.match_participant_status,
      removed_at = coalesce(gmp.removed_at, p_claimed_at, now()),
      removed_by = coalesce(gmp.removed_by, p_claimed_user_id),
      removal_note = coalesce(gmp.removal_note, 'Migrated to registered PlayerHoods user after contact claim.'),
      confirmed_at = null,
      source_contact_id = coalesce(gmp.source_contact_id, p_guest_id),
      migrated_from_guest_id = coalesce(gmp.migrated_from_guest_id, p_guest_id),
      source_person_id = coalesce(gmp.source_person_id, v_person_id),
      contact_claim_id = coalesce(gmp.contact_claim_id, v_claim_id),
      replaced_by_participant_id = coalesce(gmp.replaced_by_participant_id, merged.user_mp_id),
      migrated_at = coalesce(gmp.migrated_at, p_claimed_at, now())
    from merged
    where gmp.id = merged.guest_mp_id
    returning 1
  )
  select
    (select count(*)::integer from merged),
    (select count(*)::integer from replaced)
  into v_match_participant_merged_count, v_match_participant_replaced_count;

  with person_guests as (
    select g.id
    from public.guests g
    where g.person_id = v_person_id
  ),
  candidates as (
    select
      mp.id,
      mp.match_id,
      row_number() over (
        partition by mp.match_id
        order by
          case when mp.status = 'confirmed'::public.match_participant_status then 0 else 1 end,
          mp.created_at
      ) as rn
    from public.match_participants mp
    join person_guests pg on pg.id = mp.guest_id
    where mp.removed_at is null
      and mp.status <> 'removed'::public.match_participant_status
      and not exists (
        select 1
        from public.match_participants existing
        where existing.match_id = mp.match_id
          and existing.user_id = p_claimed_user_id
          and existing.removed_at is null
          and existing.status <> 'removed'::public.match_participant_status
      )
  ),
  upgraded as (
    update public.match_participants mp
    set
      user_id = p_claimed_user_id,
      guest_id = null,
      source_contact_id = coalesce(mp.source_contact_id, p_guest_id),
      migrated_from_guest_id = coalesce(mp.migrated_from_guest_id, p_guest_id),
      source_person_id = coalesce(mp.source_person_id, v_person_id),
      contact_claim_id = coalesce(mp.contact_claim_id, v_claim_id),
      migrated_at = coalesce(mp.migrated_at, p_claimed_at, now())
    from candidates c
    where mp.id = c.id
      and c.rn = 1
    returning mp.match_id, mp.id
  ),
  superseded as (
    update public.match_participants mp
    set
      status = 'removed'::public.match_participant_status,
      removed_at = coalesce(mp.removed_at, p_claimed_at, now()),
      removed_by = coalesce(mp.removed_by, p_claimed_user_id),
      removal_note = coalesce(mp.removal_note, 'Migrated to registered PlayerHoods user after contact claim.'),
      confirmed_at = null,
      source_contact_id = coalesce(mp.source_contact_id, p_guest_id),
      migrated_from_guest_id = coalesce(mp.migrated_from_guest_id, p_guest_id),
      source_person_id = coalesce(mp.source_person_id, v_person_id),
      contact_claim_id = coalesce(mp.contact_claim_id, v_claim_id),
      replaced_by_participant_id = coalesce(mp.replaced_by_participant_id, upgraded.id),
      migrated_at = coalesce(mp.migrated_at, p_claimed_at, now())
    from candidates c
    join upgraded on upgraded.match_id = c.match_id
    where mp.id = c.id
      and c.rn > 1
    returning 1
  )
  select
    (select count(*)::integer from upgraded),
    v_match_participant_replaced_count + (select count(*)::integer from superseded)
  into v_match_participant_migrated_count, v_match_participant_replaced_count;

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
    public.group_boundary_keeper_id(gm.group_id),
    'group_contact_joined_playerhoods',
    null::uuid,
    null::uuid,
    p_claimed_user_id,
    coalesce(v_old_display_name, 'A contact player') || ' has registered as ' || coalesce(v_claimed_display_name, 'a PlayerHoods player') || ' and was added to the group.',
    'contact_claim:' || v_claim_id::text || ':group:' || gm.group_id::text
  from public.group_members gm
  where gm.user_id = p_claimed_user_id
    and gm.contact_claim_id = v_claim_id
    and public.group_boundary_keeper_id(gm.group_id) is not null
    and public.group_boundary_keeper_id(gm.group_id) <> p_claimed_user_id
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
    coalesce(v_old_display_name, 'A contact player') || ' has registered as ' || coalesce(v_claimed_display_name, 'a PlayerHoods player') || '. The lineup has been updated.',
    'contact_claim:' || v_claim_id::text || ':match:' || m.id::text
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  where mp.contact_claim_id = v_claim_id
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
    join public.match_participants mp2
      on mp2.match_id = claimed.match_id
     and mp2.user_id is not null
     and mp2.user_id <> p_claimed_user_id
     and mp2.removed_at is null
     and mp2.status <> 'removed'::public.match_participant_status
    join public.matches m on m.id = claimed.match_id
    where claimed.contact_claim_id = v_claim_id
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
    'group_member_count', v_group_member_count,
    'archived_contact_count', v_group_contact_count,
    'match_participant_migrated_count', v_match_participant_migrated_count,
    'match_participant_merged_count', v_match_participant_merged_count,
    'match_participant_replaced_count', v_match_participant_replaced_count,
    'owner_notification_count', v_owner_notification_count,
    'saved_notification_count', v_saved_notification_count,
    'keeper_notification_count', v_keeper_notification_count,
    'match_notification_count', v_match_notification_count,
    'suggestion_count', v_suggestion_count
  );
end;
$$;

comment on function public.handle_contact_claimed(uuid, uuid, uuid, timestamptz) is
  'Internal ContactClaimed flow. Called after rpc_identity_link_accept verifies identity ownership. Idempotently audits, soft-archives contact rows, migrates saved/group/match relationships, dedupes notifications, and creates private onboarding suggestions.';

revoke all on function public.handle_contact_claimed(uuid, uuid, uuid, timestamptz) from public;
grant all on function public.handle_contact_claimed(uuid, uuid, uuid, timestamptz) to service_role;

create or replace function public.rpc_contact_claim_suggestions_for_user()
returns table(
  suggestion_id uuid,
  suggested_user_id uuid,
  display_name text,
  avatar_url text,
  source_saved_contact boolean,
  source_shared_match boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    s.id as suggestion_id,
    s.suggested_user_id,
    pd.display_name,
    pd.avatar_url,
    s.source_saved_contact,
    s.source_shared_match
  from public.contact_claim_suggestions s
  join public.profile_display pd on pd.id = s.suggested_user_id
  where s.user_id = auth.uid()
    and s.dismissed_at is null
    and s.saved_at is null
    and not exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = auth.uid()
        and uic.target_user_id = s.suggested_user_id
    )
  order by
    (s.source_saved_contact and s.source_shared_match) desc,
    s.last_shared_match_at desc nulls last,
    s.saved_contact_at desc nulls last,
    s.created_at desc;
$$;

comment on function public.rpc_contact_claim_suggestions_for_user() is
  'Returns private People you may know cards for the current user after a contact claim. Source booleans are for ranking/testing only; UI must not display old contact names or source text.';

grant all on function public.rpc_contact_claim_suggestions_for_user() to authenticated;
grant all on function public.rpc_contact_claim_suggestions_for_user() to service_role;

create or replace function public.rpc_contact_claim_suggestion_save(
  p_suggestion_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_suggestion public.contact_claim_suggestions%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_suggestion
  from public.contact_claim_suggestions s
  where s.id = p_suggestion_id
    and s.user_id = v_uid
    and s.saved_at is null;

  if not found then
    raise exception 'suggestion_not_found';
  end if;

  insert into public.user_invite_circle (
    owner_user_id,
    target_user_id,
    source,
    contact_claim_id
  )
  values (
    v_uid,
    v_suggestion.suggested_user_id,
    'manual',
    v_suggestion.claim_id
  )
  on conflict (owner_user_id, target_user_id)
  do update set
    contact_claim_id = coalesce(public.user_invite_circle.contact_claim_id, excluded.contact_claim_id);

  update public.contact_claim_suggestions s
  set
    saved_at = coalesce(s.saved_at, now()),
    dismissed_at = coalesce(s.dismissed_at, now()),
    updated_at = now()
  where s.id = p_suggestion_id
    and s.user_id = v_uid;

  return jsonb_build_object('ok', true, 'suggestion_id', p_suggestion_id, 'saved_user_id', v_suggestion.suggested_user_id);
end;
$$;

grant all on function public.rpc_contact_claim_suggestion_save(uuid) to authenticated;
grant all on function public.rpc_contact_claim_suggestion_save(uuid) to service_role;

create or replace function public.rpc_contact_claim_suggestions_dismiss()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.contact_claim_suggestions s
  set
    dismissed_at = coalesce(s.dismissed_at, now()),
    updated_at = now()
  where s.user_id = v_uid
    and s.dismissed_at is null
    and s.saved_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'dismissed_count', v_count);
end;
$$;

grant all on function public.rpc_contact_claim_suggestions_dismiss() to authenticated;
grant all on function public.rpc_contact_claim_suggestions_dismiss() to service_role;

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
  v_review_decision_id uuid;
  v_contact_claim_result jsonb := '{}'::jsonb;
  v_linked_match_participant_count integer := 0;
  v_contact_link_inserted integer := 0;
  v_link_accepted_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_guest
  from public.guests g
  where g.id = p_guest_id
    and (
      g.status = 'active'
      or g.claimed_by_user_id = v_uid
      or exists (
        select 1
        from public.contact_claims cc
        where cc.guest_id = p_guest_id
          and cc.claimed_user_id = v_uid
      )
    );

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
    decided_at = v_link_accepted_at
  returning id into v_review_decision_id;

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
    on g.id = coalesce(mp.guest_id, mp.migrated_from_guest_id, mp.source_contact_id)
   and g.person_id = v_person_id
  where mp.removed_at is null
     or mp.contact_claim_id is not null
  on conflict (user_id, linked_type, linked_id) do nothing;

  get diagnostics v_linked_match_participant_count = row_count;

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

  v_contact_claim_result := public.handle_contact_claimed(
    p_guest_id,
    v_uid,
    v_review_decision_id,
    v_link_accepted_at
  );

  return jsonb_build_object(
    'ok', true,
    'guest_id', p_guest_id,
    'person_id', v_person_id,
    'linked_user_id', v_uid,
    'linked_match_participant_count', v_linked_match_participant_count,
    'contact_link_inserted_count', v_contact_link_inserted
  ) || v_contact_claim_result;
end;
$$;

comment on function public.rpc_identity_link_accept(uuid) is
  'Explicitly accepts a verified email/phone identity link candidate for the current user. After verified identity association, it runs the internal ContactClaimed flow: contact audit, soft archive, saved-player migration, group auto-active membership, match participant migration/merge, deduped notifications, and private People you may know suggestions.';

grant all on function public.rpc_identity_link_accept(uuid) to authenticated;
grant all on function public.rpc_identity_link_accept(uuid) to service_role;

create or replace function public.rpc_validate_contact_claimed_flow()
returns table(
  check_name text,
  issue_count bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    'duplicate_contact_claim_suggestions'::text as check_name,
    count(*)::bigint as issue_count
  from (
    select user_id, suggested_user_id
    from public.contact_claim_suggestions
    group by user_id, suggested_user_id
    having count(*) > 1
  ) dupes

  union all

  select
    'duplicate_claim_notifications'::text,
    count(*)::bigint
  from (
    select recipient_user_id, kind, dedupe_key
    from public.notifications
    where dedupe_key is not null
      and dedupe_key like 'contact_claim:%'
    group by recipient_user_id, kind, dedupe_key
    having count(*) > 1
  ) dupes

  union all

  select
    'claimed_active_guests'::text,
    count(*)::bigint
  from public.guests g
  where g.contact_claim_id is not null
    and g.status = 'active'

  union all

  select
    'suggestions_already_saved'::text,
    count(*)::bigint
  from public.contact_claim_suggestions s
  where s.saved_at is null
    and exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = s.user_id
        and uic.target_user_id = s.suggested_user_id
    );
$$;

comment on function public.rpc_validate_contact_claimed_flow() is
  'Validation SQL for ContactClaimed migration governance. All issue_count rows should be zero after claim flow settles, except suggestions_already_saved may indicate stale cards hidden by read RPC.';

grant all on function public.rpc_validate_contact_claimed_flow() to authenticated;
grant all on function public.rpc_validate_contact_claimed_flow() to service_role;
