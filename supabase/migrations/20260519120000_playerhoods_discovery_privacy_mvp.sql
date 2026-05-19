-- PlayerHoods Discovery / Invite Privacy MVP.
-- Centralizes profile visibility, request-to-add, direct add, invite, and recommendation checks.

alter table public.profiles
  add column if not exists discovery_volume text not null default 'recommended',
  add column if not exists accepting_new_invites boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_discovery_volume_check;

alter table public.profiles
  add constraint profiles_discovery_volume_check
  check (discovery_volume in ('quiet', 'playerhood', 'recommended'));

comment on column public.profiles.discovery_volume is
  'Player Discovery Volume: quiet | playerhood | recommended.';

comment on column public.profiles.accepting_new_invites is
  'Accept New Invites: whether visible players can invite this player to new matches.';

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_no_self check (blocker_user_id <> blocked_user_id)
);

comment on table public.user_blocks is
  'User-level block graph. A block in either direction overrides discovery, lookup, add, save, invite, and recommendation.';

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_participants on public.user_blocks;
create policy user_blocks_select_participants
  on public.user_blocks
  for select
  to authenticated
  using (blocker_user_id = auth.uid() or blocked_user_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_user_id = auth.uid());

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_user_id = auth.uid());

grant select, insert, delete on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;

create table if not exists public.user_lookup_visibility_grants (
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  grant_context text not null,
  visibility text not null check (visibility in ('requestable', 'visible')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  primary key (viewer_user_id, target_user_id, grant_context),
  constraint user_lookup_visibility_grants_context_check
    check (grant_context in ('exact_contact_lookup', 'same_public_venue_name_search', 'same_public_club_name_search'))
);

comment on table public.user_lookup_visibility_grants is
  'Short-lived proof that a viewer reached a target through an allowed exact contact lookup or scoped venue/club name lookup.';

alter table public.user_lookup_visibility_grants enable row level security;

drop policy if exists user_lookup_visibility_grants_select_own on public.user_lookup_visibility_grants;
create policy user_lookup_visibility_grants_select_own
  on public.user_lookup_visibility_grants
  for select
  to authenticated
  using (viewer_user_id = auth.uid());

grant select on public.user_lookup_visibility_grants to authenticated;
grant all on public.user_lookup_visibility_grants to service_role;

create table if not exists public.user_save_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'allowed', 'declined')),
  request_source text not null default 'contact_lookup',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint user_save_requests_no_self check (requester_user_id <> target_user_id)
);

comment on table public.user_save_requests is
  'Privacy-aware user-to-user save requests. Used when direct add/save is not permitted.';

create unique index if not exists uq_user_save_requests_pending_pair
  on public.user_save_requests (requester_user_id, target_user_id)
  where status = 'pending';

create index if not exists idx_user_save_requests_target_status_created
  on public.user_save_requests (target_user_id, status, created_at desc);

create index if not exists idx_user_save_requests_pair_created
  on public.user_save_requests (requester_user_id, target_user_id, created_at desc);

alter table public.user_save_requests enable row level security;

drop policy if exists user_save_requests_select_participants on public.user_save_requests;
create policy user_save_requests_select_participants
  on public.user_save_requests
  for select
  to authenticated
  using (requester_user_id = auth.uid() or target_user_id = auth.uid());

grant select on public.user_save_requests to authenticated;
grant all on public.user_save_requests to service_role;

create or replace function public.is_blocked_either_direction(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_user_id = p_viewer_user_id and ub.blocked_user_id = p_target_user_id)
       or (ub.blocker_user_id = p_target_user_id and ub.blocked_user_id = p_viewer_user_id)
  );
$$;

grant execute on function public.is_blocked_either_direction(uuid, uuid) to authenticated, service_role;

create or replace function public.has_existing_add_relationship(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.user_invite_circle uic
    where uic.owner_user_id = p_viewer_user_id
      and uic.target_user_id = p_target_user_id
  );
$$;

grant execute on function public.has_existing_add_relationship(uuid, uuid) to authenticated, service_role;

create or replace function public.has_active_shared_match_context(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.match_participants viewer_mp
    join public.match_participants target_mp
      on target_mp.match_id = viewer_mp.match_id
     and target_mp.user_id = p_target_user_id
     and target_mp.removed_at is null
    join public.matches m on m.id = viewer_mp.match_id
    where viewer_mp.user_id = p_viewer_user_id
      and viewer_mp.removed_at is null
      and coalesce(m.start_at_utc, (m.match_date::timestamp + m.start_time) at time zone 'UTC') >= now() - interval '18 hours'
  );
$$;

grant execute on function public.has_active_shared_match_context(uuid, uuid) to authenticated, service_role;

create or replace function public.has_confirmed_match_history(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.match_participants viewer_mp
    join public.match_participants target_mp
      on target_mp.match_id = viewer_mp.match_id
     and target_mp.user_id = p_target_user_id
     and target_mp.removed_at is null
    where viewer_mp.user_id = p_viewer_user_id
      and viewer_mp.removed_at is null
      and viewer_mp.participant_accepted_at is not null
      and viewer_mp.org_approved_at is not null
      and target_mp.participant_accepted_at is not null
      and target_mp.org_approved_at is not null
  );
$$;

grant execute on function public.has_confirmed_match_history(uuid, uuid) to authenticated, service_role;

create or replace function public.has_shared_private_group_team_or_league(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.group_members viewer_gm
    join public.group_members target_gm
      on target_gm.group_id = viewer_gm.group_id
     and target_gm.user_id = p_target_user_id
     and target_gm.status = 'active'
     and target_gm.accepted_at is not null
     and target_gm.removed_at is null
    where viewer_gm.user_id = p_viewer_user_id
      and viewer_gm.status = 'active'
      and viewer_gm.accepted_at is not null
      and viewer_gm.removed_at is null
  );
$$;

grant execute on function public.has_shared_private_group_team_or_league(uuid, uuid) to authenticated, service_role;

create or replace function public.has_trusted_playing_context(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    public.has_existing_add_relationship(p_viewer_user_id, p_target_user_id)
    or public.has_active_shared_match_context(p_viewer_user_id, p_target_user_id)
    or public.has_confirmed_match_history(p_viewer_user_id, p_target_user_id)
    or public.has_shared_private_group_team_or_league(p_viewer_user_id, p_target_user_id);
$$;

grant execute on function public.has_trusted_playing_context(uuid, uuid) to authenticated, service_role;

create or replace function public.is_suitable_recommended_player(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.user_sports viewer_sport
    join public.user_sports target_sport
      on target_sport.sport_id = viewer_sport.sport_id
     and target_sport.user_id = p_target_user_id
    where viewer_sport.user_id = p_viewer_user_id
  )
  and exists (
    select 1
    from public.user_play_cities viewer_city
    join public.user_play_cities target_city
      on lower(btrim(target_city.city_name)) = lower(btrim(viewer_city.city_name))
     and lower(coalesce(btrim(target_city.region), '')) = lower(coalesce(btrim(viewer_city.region), ''))
     and lower(btrim(target_city.country)) = lower(btrim(viewer_city.country))
     and target_city.user_id = p_target_user_id
    where viewer_city.user_id = p_viewer_user_id
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = p_target_user_id
      and coalesce(p.availability_status, 'available') <> 'inactive'
  );
$$;

grant execute on function public.is_suitable_recommended_player(uuid, uuid) to authenticated, service_role;

create or replace function public.get_lookup_visibility(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_context text default 'passive_recommendation'
) returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_discovery_volume text;
  v_context text := coalesce(nullif(btrim(p_context), ''), 'passive_recommendation');
begin
  if p_viewer_user_id is null or p_target_user_id is null then
    return 'none';
  end if;

  if p_viewer_user_id = p_target_user_id then
    return 'visible';
  end if;

  if public.is_blocked_either_direction(p_viewer_user_id, p_target_user_id) then
    return 'none';
  end if;

  select coalesce(p.discovery_volume, 'recommended')
  into v_discovery_volume
  from public.profiles p
  where p.id = p_target_user_id;

  if v_discovery_volume is null then
    return 'none';
  end if;

  if public.has_trusted_playing_context(p_viewer_user_id, p_target_user_id) then
    return 'visible';
  end if;

  if v_context = 'exact_contact_lookup' then
    if v_discovery_volume = 'recommended' then
      return 'visible';
    end if;

    return 'requestable';
  end if;

  if v_context in ('same_public_venue_name_search', 'same_public_club_name_search') then
    if not public.users_share_save_request_club(p_viewer_user_id, p_target_user_id) then
      return 'none';
    end if;

    if v_discovery_volume = 'recommended' then
      return 'visible';
    end if;

    if v_discovery_volume = 'playerhood' then
      return 'requestable';
    end if;

    return 'none';
  end if;

  if v_context in ('passive_recommendation', 'city_discovery', 'venue_discovery') then
    if v_discovery_volume = 'recommended'
      and public.is_suitable_recommended_player(p_viewer_user_id, p_target_user_id)
    then
      return 'visible';
    end if;

    return 'none';
  end if;

  return 'none';
end;
$$;

grant execute on function public.get_lookup_visibility(uuid, uuid, text) to authenticated, service_role;

create or replace function public.has_lookup_visibility_grant(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_context text,
  p_visibility text default null
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.user_lookup_visibility_grants grant_row
    where grant_row.viewer_user_id = p_viewer_user_id
      and grant_row.target_user_id = p_target_user_id
      and grant_row.grant_context = coalesce(nullif(btrim(p_context), ''), 'passive_recommendation')
      and grant_row.expires_at > now()
      and (
        p_visibility is null
        or grant_row.visibility = p_visibility
        or (p_visibility = 'requestable' and grant_row.visibility = 'visible')
      )
  );
$$;

grant execute on function public.has_lookup_visibility_grant(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.can_view_basic_profile(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_context text default 'passive_recommendation'
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_context text := coalesce(nullif(btrim(p_context), ''), 'passive_recommendation');
begin
  if public.get_lookup_visibility(p_viewer_user_id, p_target_user_id, v_context) <> 'visible' then
    return false;
  end if;

  if v_context in ('exact_contact_lookup', 'same_public_venue_name_search', 'same_public_club_name_search')
    and p_viewer_user_id <> p_target_user_id
    and not public.has_existing_add_relationship(p_viewer_user_id, p_target_user_id)
    and not public.has_trusted_playing_context(p_viewer_user_id, p_target_user_id)
    and not public.has_lookup_visibility_grant(p_viewer_user_id, p_target_user_id, v_context, 'visible')
  then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.can_view_basic_profile(uuid, uuid, text) to authenticated, service_role;

create or replace function public.can_request_add(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_context text default 'exact_contact_lookup'
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_context text := coalesce(nullif(btrim(p_context), ''), 'exact_contact_lookup');
begin
  if public.get_lookup_visibility(p_viewer_user_id, p_target_user_id, v_context) <> 'requestable' then
    return false;
  end if;

  if public.is_blocked_either_direction(p_viewer_user_id, p_target_user_id) then
    return false;
  end if;

  if v_context in ('exact_contact_lookup', 'same_public_venue_name_search', 'same_public_club_name_search')
    and not public.has_lookup_visibility_grant(p_viewer_user_id, p_target_user_id, v_context, 'requestable')
  then
    return false;
  end if;

  return not exists (
      select 1
      from public.user_save_requests usr
      where usr.requester_user_id = p_viewer_user_id
        and usr.target_user_id = p_target_user_id
        and (
          usr.status = 'pending'
          or (
            usr.status = 'declined'
            and usr.created_at > now() - interval '30 days'
          )
        )
    );
end;
$$;

grant execute on function public.can_request_add(uuid, uuid, text) to authenticated, service_role;

create or replace function public.can_direct_add(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_context text default 'passive_recommendation'
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_context text := coalesce(nullif(btrim(p_context), ''), 'passive_recommendation');
begin
  if public.get_lookup_visibility(p_viewer_user_id, p_target_user_id, v_context) <> 'visible' then
    return false;
  end if;

  if public.is_blocked_either_direction(p_viewer_user_id, p_target_user_id) then
    return false;
  end if;

  if v_context in ('exact_contact_lookup', 'same_public_venue_name_search', 'same_public_club_name_search')
    and p_viewer_user_id <> p_target_user_id
    and not public.has_existing_add_relationship(p_viewer_user_id, p_target_user_id)
    and not public.has_trusted_playing_context(p_viewer_user_id, p_target_user_id)
    and not public.has_lookup_visibility_grant(p_viewer_user_id, p_target_user_id, v_context, 'visible')
  then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.can_direct_add(uuid, uuid, text) to authenticated, service_role;

create or replace function public.can_invite_user(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_match_id uuid default null,
  p_context text default 'passive_recommendation'
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.can_view_basic_profile(p_viewer_user_id, p_target_user_id, p_context)
    and exists (
      select 1
      from public.profiles p
      where p.id = p_target_user_id
        and p.accepting_new_invites = true
    )
    and not public.is_blocked_either_direction(p_viewer_user_id, p_target_user_id)
    and (
      p_match_id is null
      or not exists (
        select 1
        from public.match_participants mp
        where mp.match_id = p_match_id
          and mp.user_id = p_target_user_id
          and mp.removed_at is null
      )
    );
$$;

grant execute on function public.can_invite_user(uuid, uuid, uuid, text) to authenticated, service_role;

create or replace function public.can_recommend_user(
  p_viewer_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.get_lookup_visibility(p_viewer_user_id, p_target_user_id, 'passive_recommendation') = 'visible'
    and exists (
      select 1
      from public.profiles p
      where p.id = p_target_user_id
        and p.accepting_new_invites = true
    )
    and not public.is_blocked_either_direction(p_viewer_user_id, p_target_user_id);
$$;

grant execute on function public.can_recommend_user(uuid, uuid) to authenticated, service_role;

create or replace function public.can_admit_user_to_match(
  p_match_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.status = 'active'
      and p_actor_id is not null
      and p_target_user_id is not null
      and p_target_user_id <> p_actor_id
      and not exists (
        select 1
        from public.match_participants active_mp
        where active_mp.match_id = p_match_id
          and active_mp.user_id = p_target_user_id
          and active_mp.removed_at is null
      )
      and (
        p_actor_id = m.organizer_id
        or (
          m.can_participants_invite_users = true
          and (
            public.is_user_in_scope_groups(
              coalesce(m.invitation_scope_group_ids, '{}'::uuid[]),
              p_actor_id
            )
            or public.is_user_match_associated(p_match_id, p_actor_id)
          )
        )
      )
      and (
        exists (
          select 1
          from public.match_participants removed_mp
          where removed_mp.match_id = p_match_id
            and removed_mp.user_id = p_target_user_id
            and removed_mp.removed_at is not null
        )
        or public.can_invite_user(p_actor_id, p_target_user_id, p_match_id, 'passive_recommendation')
      )
  );
$$;

comment on function public.can_admit_user_to_match(uuid, uuid, uuid) is
  'Match admission predicate backed by PlayerHoods discovery privacy. Organizer/participant caller gates remain; target eligibility uses centralized can_invite_user instead of venue/city-only switches.';

grant execute on function public.can_admit_user_to_match(uuid, uuid, uuid) to authenticated, service_role;

drop function if exists public.rpc_match_admission_targets(uuid, text);

create function public.rpc_match_admission_targets(
  p_match_id uuid,
  p_search text default null
) returns table (
  target_kind text,
  target_id uuid,
  display_name text,
  avatar_url text,
  source text,
  action_kind text,
  can_admit boolean,
  eligible_via text,
  sort_name text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_scope_ids uuid[] := '{}'::uuid[];
  v_venue_context uuid;
  v_can_call boolean;
  v_search text := nullif(btrim(p_search), '');
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

  v_scope_ids := coalesce(v_match.invitation_scope_group_ids, '{}'::uuid[]);
  v_venue_context := coalesce(
    v_match.venue_id,
    (select primary_venue_id from public.profiles where id = v_match.organizer_id)
  );

  return query
  with already_active_users as (
    select mp.user_id
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.removed_at is null
      and mp.user_id is not null
  ),
  reentry_src as (
    select distinct mp.user_id, 'reentry'::text as src, 1 as pri
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id is not null
      and mp.removed_at is not null
      and mp.user_id <> v_match.organizer_id
      and mp.user_id <> v_uid
      and mp.user_id not in (select user_id from already_active_users)
  ),
  invite_circle_src as (
    select uic.target_user_id as user_id, 'invite_circle'::text as src, 2 as pri
    from public.user_invite_circle uic
    where uic.owner_user_id = v_uid
      and uic.target_user_id <> v_match.organizer_id
      and uic.target_user_id <> v_uid
      and uic.target_user_id not in (select user_id from already_active_users)
  ),
  venue_context_src as (
    select rel.user_id, 'club_members'::text as src, 3 as pri
    from public.venue_user_relationships rel
    where v_venue_context is not null
      and rel.venue_id = v_venue_context
      and rel.relationship_type in ('member', 'guest', 'starred')
      and rel.user_id <> v_match.organizer_id
      and rel.user_id <> v_uid
      and rel.user_id not in (select user_id from already_active_users)
      and exists (
        select 1
        from public.venue_user_relationships caller_rel
        where caller_rel.venue_id = v_venue_context
          and caller_rel.user_id = v_uid
          and caller_rel.relationship_type in ('member', 'guest', 'starred')
      )
  ),
  scope_members as (
    select distinct gm.user_id
    from public.group_members gm
    where gm.group_id = any(v_scope_ids)
      and gm.status = 'active'
      and gm.accepted_at is not null
      and gm.removed_at is null
      and gm.user_id is not null
  ),
  shared_group_members as (
    select distinct gm_other.user_id
    from public.group_members gm_caller
    join public.group_members gm_other
      on gm_caller.group_id = gm_other.group_id
    where gm_caller.user_id = v_uid
      and gm_caller.status = 'active'
      and gm_caller.accepted_at is not null
      and gm_caller.removed_at is null
      and gm_other.status = 'active'
      and gm_other.accepted_at is not null
      and gm_other.removed_at is null
      and gm_other.user_id is not null
      and gm_other.user_id <> v_uid
      and gm_other.user_id <> v_match.organizer_id
  ),
  groups_src as (
    select sm.user_id, 'groups'::text as src, 4 as pri
    from scope_members sm
    union all
    select sgm.user_id, 'groups'::text as src, 4 as pri
    from shared_group_members sgm
  ),
  all_user_sources as (
    select * from reentry_src
    union all
    select * from invite_circle_src
    union all
    select * from venue_context_src
    union all
    select * from groups_src
  ),
  deduped_users as (
    select distinct on (aus.user_id)
      aus.user_id,
      aus.src
    from all_user_sources aus
    where aus.user_id <> v_uid
      and (
        aus.src = 'reentry'
        or public.can_view_basic_profile(v_uid, aus.user_id, 'passive_recommendation')
      )
    order by aus.user_id, aus.pri
  )
  select
    'user'::text as target_kind,
    du.user_id as target_id,
    p.display_name,
    p.avatar_url,
    du.src as source,
    'admit_user'::text as action_kind,
    public.can_admit_user_to_match(p_match_id, v_uid, du.user_id) as can_admit,
    case
      when public.can_admit_user_to_match(p_match_id, v_uid, du.user_id) then 'invite_allowed'
      else 'invite_forbidden'
    end as eligible_via,
    lower(coalesce(nullif(btrim(p.display_name), ''), du.user_id::text)) as sort_name
  from deduped_users du
  join public.profiles p on p.id = du.user_id
  where (
    v_search is null
    or p.display_name ilike '%' || v_search || '%'
  )
  order by sort_name nulls last, target_id;
end;
$$;

comment on function public.rpc_match_admission_targets(uuid, text) is
  'Registered-player match invite candidates only. Contact Players use rpc_match_contact_person_targets, which returns person-level cards without guest/contact/channel identifiers.';

grant execute on function public.rpc_match_admission_targets(uuid, text) to authenticated, service_role;

drop function if exists public.rpc_player_profile_get(uuid);
drop function if exists public.rpc_player_profile_get(uuid, text);

create function public.rpc_player_profile_get(
  p_target_user_id uuid,
  p_context text default 'passive_recommendation'
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  gender text,
  looking_to_play text,
  preferred_play_times text[],
  sport_profiles jsonb,
  shared_venue_names text[],
  shared_group_names text[],
  shared_match_count integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_context text := coalesce(nullif(btrim(p_context), ''), 'passive_recommendation');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'profile_not_found';
  end if;

  if not public.can_view_basic_profile(v_uid, p_target_user_id, v_context) then
    return;
  end if;

  return query
  with target_profile as (
    select
      p.id,
      p.display_name,
      p.avatar_url,
      p.gender,
      p.looking_to_play,
      p.preferred_play_times
    from public.profiles p
    where p.id = p_target_user_id
  ),
  sport_rows as (
    select
      s.id as sport_id,
      s.code as sport_code,
      s.display_name as sport_name,
      usp.level,
      usp.years_playing,
      coalesce(usp.preferred_formats, '{}'::text[]) as preferred_formats,
      usp.current_frequency,
      usp.play_style,
      usp.competition_experience,
      usp.teams_played_on,
      usp.line_played,
      usp.highlights,
      usp.gear_primary,
      usp.gear_secondary,
      usp.gear_shoes
    from public.user_sports us
    join public.sports s
      on s.id = us.sport_id
    left join public.user_sport_profiles usp
      on usp.user_id = us.user_id
     and usp.sport_id = us.sport_id
    where us.user_id = p_target_user_id
    order by s.id
  )
  select
    tp.id as user_id,
    tp.display_name,
    tp.avatar_url,
    tp.gender,
    tp.looking_to_play,
    coalesce(tp.preferred_play_times, '{}'::text[]) as preferred_play_times,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sport_id', sr.sport_id,
            'sport_code', sr.sport_code,
            'sport_name', sr.sport_name,
            'level', sr.level,
            'years_playing', sr.years_playing,
            'preferred_formats', sr.preferred_formats,
            'current_frequency', sr.current_frequency,
            'play_style', sr.play_style,
            'competition_experience', sr.competition_experience,
            'teams_played_on', sr.teams_played_on,
            'line_played', sr.line_played,
            'highlights', sr.highlights,
            'gear_primary', sr.gear_primary,
            'gear_secondary', sr.gear_secondary,
            'gear_shoes', sr.gear_shoes
          )
          order by sr.sport_id
        )
        from sport_rows sr
      ),
      '[]'::jsonb
    ) as sport_profiles,
    '{}'::text[] as shared_venue_names,
    '{}'::text[] as shared_group_names,
    0::integer as shared_match_count
  from target_profile tp;
end;
$$;

comment on function public.rpc_player_profile_get(uuid, text) is
  'Returns a basic player profile only when centralized visibility allows it. Relationship graph details are intentionally not exposed.';

grant execute on function public.rpc_player_profile_get(uuid, text) to authenticated, service_role;

create or replace function public.rpc_profile_update_discovery_preferences(
  p_discovery_volume text default null,
  p_accepting_new_invites boolean default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_discovery_volume text := null;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_discovery_volume is not null then
    v_discovery_volume := lower(btrim(p_discovery_volume));
    if v_discovery_volume not in ('quiet', 'playerhood', 'recommended') then
      raise exception 'invalid_discovery_volume';
    end if;
  end if;

  update public.profiles
  set
    discovery_volume = case
      when p_discovery_volume is not null then v_discovery_volume
      else discovery_volume
    end,
    accepting_new_invites = case
      when p_accepting_new_invites is not null then p_accepting_new_invites
      else accepting_new_invites
    end,
    updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.rpc_profile_update_discovery_preferences(text, boolean) to authenticated, service_role;

drop function if exists public.rpc_player_search_by_contact_info(text);

create or replace function public.rpc_player_search_by_contact_info(
  p_query text
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  primary_sport text,
  visibility text,
  is_saved boolean,
  can_add boolean,
  can_request_add boolean,
  can_invite boolean,
  request_status text,
  next_eligible_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_phone text := public.normalize_discovery_phone(p_query);
  v_context text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_query is null then
    return;
  end if;

  if v_email is not null and position('@' in v_email) > 0 then
    v_context := 'exact_contact_lookup';

    return query
    with candidate_matches as (
      select p.id, p.display_name, p.avatar_url
      from public.profiles p
      where p.id <> v_uid
        and exists (
          select 1
          from public.v_user_verified_emails vve
          where vve.user_id = p.id
            and vve.email_normalized = v_email
        )
      order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
      limit 10
    ),
    visible_matches as (
      select
        cm.*,
        public.get_lookup_visibility(v_uid, cm.id, v_context) as lookup_visibility
      from candidate_matches cm
    ),
    recent_requests as (
      select distinct on (usr.target_user_id)
        usr.target_user_id,
        usr.status,
        case
          when usr.status = 'pending' then null::timestamptz
          when usr.status = 'declined' and usr.created_at > now() - interval '30 days' then usr.created_at + interval '30 days'
          else null::timestamptz
        end as next_eligible_at
      from public.user_save_requests usr
      where usr.requester_user_id = v_uid
      order by usr.target_user_id, usr.created_at desc
    ),
    grant_matches as (
      insert into public.user_lookup_visibility_grants (
        viewer_user_id,
        target_user_id,
        grant_context,
        visibility,
        expires_at
      )
      select
        v_uid,
        vm.id,
        v_context,
        vm.lookup_visibility,
        now() + interval '30 minutes'
      from visible_matches vm
      where vm.lookup_visibility in ('visible', 'requestable')
      on conflict (viewer_user_id, target_user_id, grant_context)
      do update set
        visibility = excluded.visibility,
        expires_at = excluded.expires_at,
        created_at = now()
      returning target_user_id
    )
    select
      vm.id,
      vm.display_name,
      vm.avatar_url,
      (
        select s.display_name
        from public.user_sports us
        join public.sports s on s.id = us.sport_id
        where us.user_id = vm.id
        order by s.display_name
        limit 1
      ),
      vm.lookup_visibility,
      public.has_existing_add_relationship(v_uid, vm.id),
      vm.lookup_visibility = 'visible'
        and not public.is_blocked_either_direction(v_uid, vm.id),
      vm.lookup_visibility = 'requestable'
        and coalesce(rr.status, '') <> 'pending'
        and (rr.next_eligible_at is null or rr.next_eligible_at <= now())
        and not public.is_blocked_either_direction(v_uid, vm.id),
      vm.lookup_visibility = 'visible'
        and exists (
          select 1
          from public.profiles invite_profile
          where invite_profile.id = vm.id
            and invite_profile.accepting_new_invites = true
        )
        and not public.is_blocked_either_direction(v_uid, vm.id),
      rr.status,
      rr.next_eligible_at
    from visible_matches vm
    left join recent_requests rr on rr.target_user_id = vm.id
    left join grant_matches gm on gm.target_user_id = vm.id
    where vm.lookup_visibility <> 'none';
    return;
  end if;

  if v_phone is not null then
    v_context := 'exact_contact_lookup';

    return query
    with candidate_matches as (
      select p.id, p.display_name, p.avatar_url
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id <> v_uid
        and public.normalize_discovery_phone(coalesce(nullif(btrim(p.contact_phone), ''), u.phone::text)) = v_phone
      order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
      limit 10
    ),
    visible_matches as (
      select
        cm.*,
        public.get_lookup_visibility(v_uid, cm.id, v_context) as lookup_visibility
      from candidate_matches cm
    ),
    recent_requests as (
      select distinct on (usr.target_user_id)
        usr.target_user_id,
        usr.status,
        case
          when usr.status = 'pending' then null::timestamptz
          when usr.status = 'declined' and usr.created_at > now() - interval '30 days' then usr.created_at + interval '30 days'
          else null::timestamptz
        end as next_eligible_at
      from public.user_save_requests usr
      where usr.requester_user_id = v_uid
      order by usr.target_user_id, usr.created_at desc
    ),
    grant_matches as (
      insert into public.user_lookup_visibility_grants (
        viewer_user_id,
        target_user_id,
        grant_context,
        visibility,
        expires_at
      )
      select
        v_uid,
        vm.id,
        v_context,
        vm.lookup_visibility,
        now() + interval '30 minutes'
      from visible_matches vm
      where vm.lookup_visibility in ('visible', 'requestable')
      on conflict (viewer_user_id, target_user_id, grant_context)
      do update set
        visibility = excluded.visibility,
        expires_at = excluded.expires_at,
        created_at = now()
      returning target_user_id
    )
    select
      vm.id,
      vm.display_name,
      vm.avatar_url,
      (
        select s.display_name
        from public.user_sports us
        join public.sports s on s.id = us.sport_id
        where us.user_id = vm.id
        order by s.display_name
        limit 1
      ),
      vm.lookup_visibility,
      public.has_existing_add_relationship(v_uid, vm.id),
      vm.lookup_visibility = 'visible'
        and not public.is_blocked_either_direction(v_uid, vm.id),
      vm.lookup_visibility = 'requestable'
        and coalesce(rr.status, '') <> 'pending'
        and (rr.next_eligible_at is null or rr.next_eligible_at <= now())
        and not public.is_blocked_either_direction(v_uid, vm.id),
      vm.lookup_visibility = 'visible'
        and exists (
          select 1
          from public.profiles invite_profile
          where invite_profile.id = vm.id
            and invite_profile.accepting_new_invites = true
        )
        and not public.is_blocked_either_direction(v_uid, vm.id),
      rr.status,
      rr.next_eligible_at
    from visible_matches vm
    left join recent_requests rr on rr.target_user_id = vm.id
    left join grant_matches gm on gm.target_user_id = vm.id
    where vm.lookup_visibility <> 'none';
    return;
  end if;

  if char_length(v_query) < 2 then
    return;
  end if;

  v_context := 'same_public_venue_name_search';

  return query
  with candidate_matches as (
    select p.id, p.display_name, p.avatar_url
    from public.profiles p
    where p.id <> v_uid
      and lower(btrim(coalesce(p.display_name, ''))) = lower(v_query)
      and public.users_share_save_request_club(v_uid, p.id)
    order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
    limit 10
  ),
  visible_matches as (
    select
      cm.*,
      public.get_lookup_visibility(v_uid, cm.id, v_context) as lookup_visibility
    from candidate_matches cm
  ),
  recent_requests as (
    select distinct on (usr.target_user_id)
      usr.target_user_id,
      usr.status,
      case
        when usr.status = 'pending' then null::timestamptz
        when usr.status = 'declined' and usr.created_at > now() - interval '30 days' then usr.created_at + interval '30 days'
        else null::timestamptz
      end as next_eligible_at
    from public.user_save_requests usr
    where usr.requester_user_id = v_uid
    order by usr.target_user_id, usr.created_at desc
  ),
  grant_matches as (
    insert into public.user_lookup_visibility_grants (
      viewer_user_id,
      target_user_id,
      grant_context,
      visibility,
      expires_at
    )
    select
      v_uid,
      vm.id,
      v_context,
      vm.lookup_visibility,
      now() + interval '30 minutes'
    from visible_matches vm
    where vm.lookup_visibility in ('visible', 'requestable')
    on conflict (viewer_user_id, target_user_id, grant_context)
    do update set
      visibility = excluded.visibility,
      expires_at = excluded.expires_at,
      created_at = now()
    returning target_user_id
  )
  select
    vm.id,
    vm.display_name,
    vm.avatar_url,
    (
      select s.display_name
      from public.user_sports us
      join public.sports s on s.id = us.sport_id
      where us.user_id = vm.id
      order by s.display_name
      limit 1
    ),
    vm.lookup_visibility,
    public.has_existing_add_relationship(v_uid, vm.id),
    vm.lookup_visibility = 'visible'
      and not public.is_blocked_either_direction(v_uid, vm.id),
    vm.lookup_visibility = 'requestable'
      and coalesce(rr.status, '') <> 'pending'
      and (rr.next_eligible_at is null or rr.next_eligible_at <= now())
      and not public.is_blocked_either_direction(v_uid, vm.id),
    vm.lookup_visibility = 'visible'
      and exists (
        select 1
        from public.profiles invite_profile
        where invite_profile.id = vm.id
          and invite_profile.accepting_new_invites = true
      )
      and not public.is_blocked_either_direction(v_uid, vm.id),
    rr.status,
    rr.next_eligible_at
  from visible_matches vm
  left join recent_requests rr on rr.target_user_id = vm.id
  left join grant_matches gm on gm.target_user_id = vm.id
  where vm.lookup_visibility <> 'none';
end;
$$;

comment on function public.rpc_player_search_by_contact_info(text) is
  'Known Contact Lookup and scoped same-venue exact-name lookup. Returns visible/requestable states without exposing email, phone, match source, mutual details, or relationship source.';

grant execute on function public.rpc_player_search_by_contact_info(text) to authenticated, service_role;

create or replace function public.rpc_city_players_discovery(
  p_city text,
  p_search text default null
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  shared_city_names text[],
  is_saved boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_city text := lower(btrim(coalesce(p_city, '')));
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_city = '' then
    return;
  end if;

  if not exists (
    select 1
    from public.user_play_cities my_city
    where my_city.user_id = v_uid
      and lower(btrim(my_city.city_name)) = v_city
  ) then
    return;
  end if;

  return query
  select
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    array_agg(distinct upc.city_name order by upc.city_name) as shared_city_names,
    public.has_existing_add_relationship(v_uid, p.id) as is_saved
  from public.profiles p
  join public.user_play_cities upc
    on upc.user_id = p.id
  where p.id <> v_uid
    and lower(btrim(upc.city_name)) = v_city
    and public.can_recommend_user(v_uid, p.id)
    and (
      v_search is null
      or lower(coalesce(nullif(btrim(p.display_name), ''), '')) like '%' || v_search || '%'
    )
  group by p.id, p.display_name, p.avatar_url
  order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
  limit 50;
end;
$$;

comment on function public.rpc_city_players_discovery(text, text) is
  'Recommended local player discovery. City alone is not a visibility boundary; rows must pass centralized recommendation checks.';

grant execute on function public.rpc_city_players_discovery(text, text) to authenticated, service_role;

create or replace function public.rpc_venue_people_discovery_v2(
  p_venue_id uuid,
  p_search text default null
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  relationship_type public.venue_relationship_type
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_search text := nullif(btrim(p_search), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_venue_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.venue_user_relationships caller_rel
    where caller_rel.venue_id = p_venue_id
      and caller_rel.user_id = v_uid
      and caller_rel.relationship_type in ('member', 'guest', 'starred')
  ) then
    return;
  end if;

  return query
  with candidate_matches as (
    select
      rel.user_id,
      p.display_name,
      p.avatar_url,
      rel.relationship_type
    from public.venue_user_relationships rel
    join public.profiles p
      on p.id = rel.user_id
    where rel.venue_id = p_venue_id
      and rel.relationship_type in ('member', 'guest', 'starred')
      and rel.user_id <> v_uid
      and (
        v_search is null
        or coalesce(p.display_name, '') ilike '%' || v_search || '%'
        or coalesce(p.first_name, '') ilike '%' || v_search || '%'
        or coalesce(p.last_name, '') ilike '%' || v_search || '%'
      )
    order by lower(coalesce(nullif(trim(p.display_name), ''), rel.user_id::text))
    limit 50
  ),
  visible_matches as (
    select
      cm.*,
      public.get_lookup_visibility(v_uid, cm.user_id, 'same_public_venue_name_search') as lookup_visibility
    from candidate_matches cm
  ),
  grant_matches as (
    insert into public.user_lookup_visibility_grants (
      viewer_user_id,
      target_user_id,
      grant_context,
      visibility,
      expires_at
    )
    select
      v_uid,
      vm.user_id,
      'same_public_venue_name_search',
      vm.lookup_visibility,
      now() + interval '30 minutes'
    from visible_matches vm
    where vm.lookup_visibility = 'visible'
    on conflict (viewer_user_id, target_user_id, grant_context)
    do update set
      visibility = excluded.visibility,
      expires_at = excluded.expires_at,
      created_at = now()
    returning target_user_id
  )
  select
    vm.user_id,
    vm.display_name,
    vm.avatar_url,
    vm.relationship_type
  from visible_matches vm
  left join grant_matches gm on gm.target_user_id = vm.user_id
  where vm.lookup_visibility = 'visible'
  order by lower(coalesce(nullif(trim(vm.display_name), ''), vm.user_id::text));
end;
$$;

comment on function public.rpc_venue_people_discovery_v2(uuid, text) is
  'Venue-scoped discovery filtered by centralized basic-profile visibility. Venue membership is a relevance context, not a standalone permission boundary.';

grant execute on function public.rpc_venue_people_discovery_v2(uuid, text) to authenticated, service_role;

create or replace function public.rpc_user_save_request_create(
  p_target_user_id uuid,
  p_source text default 'contact_lookup'
) returns table (
  request_id uuid,
  status text,
  next_eligible_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.user_save_requests%rowtype;
  v_inserted public.user_save_requests%rowtype;
  v_source text := coalesce(nullif(btrim(p_source), ''), 'contact_lookup');
  v_context text := case
    when v_source in ('venue_name_search', 'club_name_search') then 'same_public_venue_name_search'
    else 'exact_contact_lookup'
  end;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'invalid_target';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_target_user_id) then
    raise exception 'target_not_found';
  end if;

  if public.has_existing_add_relationship(v_uid, p_target_user_id) then
    return query select null::uuid, 'already_saved'::text, null::timestamptz;
    return;
  end if;

  select *
  into v_existing
  from public.user_save_requests usr
  where usr.requester_user_id = v_uid
    and usr.target_user_id = p_target_user_id
  order by usr.created_at desc
  limit 1;

  if v_existing.id is not null then
    if v_existing.status = 'pending' then
      return query select v_existing.id, v_existing.status, null::timestamptz;
      return;
    end if;

    if v_existing.status = 'declined' and v_existing.created_at > now() - interval '30 days' then
      return query select v_existing.id, v_existing.status, v_existing.created_at + interval '30 days';
      return;
    end if;
  end if;

  if not public.can_request_add(v_uid, p_target_user_id, v_context) then
    raise exception 'request_not_allowed';
  end if;

  insert into public.user_save_requests (
    requester_user_id,
    target_user_id,
    status,
    request_source
  )
  values (
    v_uid,
    p_target_user_id,
    'pending',
    v_source
  )
  returning * into v_inserted;

  insert into public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note,
    dedupe_key
  )
  values (
    p_target_user_id,
    'save_request',
    v_uid,
    'wants to add you to their PlayerHood.',
    'save_request:' || v_inserted.id::text
  )
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  return query select v_inserted.id, v_inserted.status, null::timestamptz;
end;
$$;

grant execute on function public.rpc_user_save_request_create(uuid, text) to authenticated, service_role;

create or replace function public.rpc_invite_circle_save_user(
  p_target_user_id uuid,
  p_source text default 'manual'
)
returns public.user_invite_circle
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_invite_circle;
  v_context text := 'passive_recommendation';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null then
    raise exception 'invalid_target';
  end if;

  if p_target_user_id = v_uid then
    raise exception 'cannot_save_self';
  end if;

  if p_source is null or p_source not in (
    'manual',
    'venue_member',
    'group_member',
    'match_player',
    'played_with_auto'
  ) then
    raise exception 'invalid_source';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'target_not_found';
  end if;

  v_context := case
    when p_source in ('venue_member') then 'same_public_venue_name_search'
    when p_source = 'manual'
      and public.has_lookup_visibility_grant(v_uid, p_target_user_id, 'exact_contact_lookup', 'visible')
    then 'exact_contact_lookup'
    when p_source = 'manual'
      and public.has_lookup_visibility_grant(v_uid, p_target_user_id, 'same_public_venue_name_search', 'visible')
    then 'same_public_venue_name_search'
    else 'passive_recommendation'
  end;

  if not public.can_direct_add(v_uid, p_target_user_id, v_context) then
    raise exception 'direct_add_not_allowed';
  end if;

  insert into public.user_invite_circle (owner_user_id, target_user_id, source)
  values (v_uid, p_target_user_id, p_source)
  on conflict (owner_user_id, target_user_id)
  do update set source = public.user_invite_circle.source
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.rpc_invite_circle_save_user(uuid, text) is
  'Add target to caller My PlayerHood. Idempotent, private, one-way, silent, and gated by centralized direct-add visibility.';

grant execute on function public.rpc_invite_circle_save_user(uuid, text) to authenticated, service_role;
