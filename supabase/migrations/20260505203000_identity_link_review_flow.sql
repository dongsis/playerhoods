create table if not exists public.identity_link_review_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  email_normalized text not null,
  decision text not null
    check (decision = any (array['accepted'::text, 'kept_separate'::text])),
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, guest_id, email_normalized)
);

create index if not exists idx_identity_link_review_decisions_user
  on public.identity_link_review_decisions (user_id, decided_at desc);

comment on table public.identity_link_review_decisions is
  'Per-user decisions for verified-email identity link review. Keeps explicit accept / keep-separate state without mutating historical guest records.';

grant all on table public.identity_link_review_decisions to authenticated;
grant all on table public.identity_link_review_decisions to service_role;

alter table public.identity_link_review_decisions enable row level security;

drop policy if exists identity_link_review_decisions_select_own on public.identity_link_review_decisions;
create policy identity_link_review_decisions_select_own
  on public.identity_link_review_decisions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists identity_link_review_decisions_insert_own on public.identity_link_review_decisions;
create policy identity_link_review_decisions_insert_own
  on public.identity_link_review_decisions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists identity_link_review_decisions_update_own on public.identity_link_review_decisions;
create policy identity_link_review_decisions_update_own
  on public.identity_link_review_decisions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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
  'Returns caller roster guests with gender, lightweight availability status, linked_user_id (nullable), and resolution_state (contact_only | linked_user). Link state is driven by accepted contact identity_links.';

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
  last_match_at timestamptz
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
  with verified_emails as (
    select vve.email_normalized, vve.email_type
    from public.v_user_verified_emails vve
    where vve.user_id = v_uid
  ),
  guest_matches as (
    select
      g.id as guest_id,
      g.person_id,
      g.display_name,
      g.email as guest_email,
      ve.email_normalized as matched_email_normalized,
      ve.email_type as matched_email_type
    from public.guests g
    join verified_emails ve
      on lower(trim(g.email)) = ve.email_normalized
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
          and d.email_normalized = ve.email_normalized
          and d.decision = 'kept_separate'
      )
  )
  select
    gm.guest_id,
    gm.person_id,
    gm.display_name,
    gm.guest_email,
    gm.matched_email_normalized,
    gm.matched_email_type,
    count(distinct mp.id)::integer as match_participant_count,
    count(distinct cr.contact_record_id)::integer as contact_owner_count,
    count(distinct gc.group_contact_id)::integer as group_contact_count,
    max(m.start_at) as last_match_at
  from guest_matches gm
  left join public.match_participants mp
    on mp.guest_id = gm.guest_id
   and mp.removed_at is null
  left join public.matches m
    on m.id = mp.match_id
  left join public.contact_records cr
    on cr.guest_id = gm.guest_id
  left join public.group_contacts gc
    on gc.person_id = gm.person_id
   and gc.removed_at is null
  group by
    gm.guest_id,
    gm.person_id,
    gm.display_name,
    gm.guest_email,
    gm.matched_email_normalized,
    gm.matched_email_type
  order by max(m.start_at) desc nulls last, lower(gm.display_name), gm.guest_id;
end;
$$;

comment on function public.rpc_identity_link_candidates() is
  'Returns explicit verified-email identity-link review candidates for the current user. Does not create identity_links.';

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

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  values (
    case when v_email_type = 'profile_contact' then 'profile_contact' else 'auth' end,
    v_email_normalized,
    v_uid,
    'contact',
    p_guest_id,
    v_uid
  )
  on conflict (user_id, linked_type, linked_id) do nothing;

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

  return jsonb_build_object(
    'ok', true,
    'guest_id', p_guest_id,
    'linked_user_id', v_uid,
    'linked_match_participant_count', v_linked_match_participant_count,
    'saved_owner_count', v_saved_owner_count
  );
end;
$$;

comment on function public.rpc_identity_link_accept(uuid) is
  'Explicitly accepts a verified-email identity link candidate for the current user. Creates contact and guest_participant identity_links without mutating historical match_participants.';

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
  v_email_normalized text;
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

  select vve.email_normalized
  into v_email_normalized
  from public.v_user_verified_emails vve
  where vve.user_id = v_uid
    and vve.email_normalized = lower(trim(v_guest.email))
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
  'Marks a verified-email identity-link candidate as keep-separate for now so it no longer appears in review prompts until the evidence changes.';

grant all on function public.rpc_identity_link_candidates() to authenticated;
grant all on function public.rpc_identity_link_accept(uuid) to authenticated;
grant all on function public.rpc_identity_link_keep_separate(uuid) to authenticated;
