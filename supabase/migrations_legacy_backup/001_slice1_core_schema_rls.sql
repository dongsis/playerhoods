-- ============================================================================
-- Slice 1 — Core Schema + RLS (playerhoods.com v1 Frozen)
-- File: supabase/migrations/001_slice1_core_schema_rls.sql
-- ============================================================================
-- Key freezes implemented:
-- - Group is the only relationship container
-- - Match visibility: ORG + match participants (pending/confirmed) only
-- - No Invite Group (no bulk invitation feature)
-- - match.status is lifecycle only (active/cancelled/archived), no formed
-- - match_participants.status: pending/confirmed/removed only
-- - admission_mode: invite/request
-- - Guest add status depends on match.admission_mode (enforced later in Slice 2 RPC;
--   Slice 1 allows rows but RLS constrains who can insert/update)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0) Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.group_member_status as enum ('pending','active','removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_status as enum ('active','cancelled','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_admission_mode as enum ('invite','request');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_participant_status as enum ('pending','confirmed','removed');
exception when duplicate_object then null; end $$;

-- How the participant row was created (source-of-truth for auditing)
do $$ begin
  create type public.match_join_method as enum ('invited','requested','guest_add');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2) Profile / Clubs / Courts (v1 minimal schema)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  middle_name text,
  last_name text not null default '',
  display_name text,
  avatar_url text,
  gender text default 'unspecified', -- keep text for v1 flexibility
  level text,                        -- v1: free text
  availability_note text,            -- short description
  plays_singles boolean not null default true,
  plays_doubles boolean not null default true,
  primary_club_id uuid,
  secondary_club_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_text text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  court_code text not null, -- e.g. "1", "A", "CRT10"
  surface text,
  notes text,
  created_at timestamptz not null default now(),
  unique (club_id, court_code)
);

alter table public.profiles
  add constraint profiles_primary_club_fk
  foreign key (primary_club_id) references public.clubs(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 3) Groups / Group Members
-- ----------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  boundary_keeper_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.group_member_status not null default 'pending',
  join_method text not null default 'invited', -- free text; governance can tighten later
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  unique (group_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4) Matches / Guests / Match Participants
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete restrict,
  status public.match_status not null default 'active',
  admission_mode public.match_admission_mode not null default 'invite',

  -- location
  club_id uuid references public.clubs(id) on delete set null,
  court_ids uuid[] not null default '{}',

  -- scheduling
  match_date date not null default (now() at time zone 'utc')::date,
  start_time time not null default time '09:00',
  duration_minutes int not null default 90,

  -- game / capacity
  game_type text not null default 'doubles', -- v1: text (singles/doubles)
  required_count int not null default 4,

  -- registration visibility boundary (Group-scoped default)
  invitation_scope_group_ids uuid[] not null default '{}',

  -- capability flags
  can_participants_invite_users boolean not null default false,
  can_participants_add_guests boolean not null default false,
  can_participants_manage_participants boolean not null default false,

  -- formed notification marker (derived is_formed computed elsewhere)
  formed_at timestamptz,

  created_at timestamptz not null default now()
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  status public.match_participant_status not null default 'pending',
  join_method public.match_join_method not null,

  -- Exactly one of user_id or guest_id must be set
  user_id uuid references auth.users(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete cascade,

  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  removed_at timestamptz,

  constraint match_participants_exactly_one_identity
    check (
      (user_id is not null and guest_id is null)
      or
      (user_id is null and guest_id is not null)
    ),
  -- prevent duplicate spot for same identity
  unique (match_id, user_id),
  unique (match_id, guest_id)
);

-- ----------------------------------------------------------------------------
-- 5) Helper functions (security definer for RLS checks)
-- ----------------------------------------------------------------------------
create or replace function public.is_group_active_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;

create or replace function public.is_match_participant_active(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
      and mp.status in ('pending','confirmed')
  );
$$;

create or replace function public.is_match_organizer(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.organizer_id = p_user_id
  );
$$;

-- ----------------------------------------------------------------------------
-- 6) RLS enable
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.courts enable row level security;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

alter table public.matches enable row level security;
alter table public.guests enable row level security;
alter table public.match_participants enable row level security;

-- ----------------------------------------------------------------------------
-- 7) RLS policies
-- ----------------------------------------------------------------------------

-- 7.1 profiles
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_upsert_self on public.profiles;
create policy profiles_upsert_self
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- 7.2 clubs/courts (read for all authenticated; write later via admin)
drop policy if exists clubs_select_auth on public.clubs;
create policy clubs_select_auth
on public.clubs for select
to authenticated
using (true);

drop policy if exists courts_select_auth on public.courts;
create policy courts_select_auth
on public.courts for select
to authenticated
using (true);

-- 7.3 groups
-- Read group only if user is a member (pending or active).
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member
on public.groups for select
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.status in ('pending','active')
  )
);

-- Create group: creator becomes BK + created_by
drop policy if exists groups_insert_self on public.groups;
create policy groups_insert_self
on public.groups for insert
to authenticated
with check (
  created_by = auth.uid()
  and boundary_keeper_id = auth.uid()
);

-- Update group only by BK
drop policy if exists groups_update_bk on public.groups;
create policy groups_update_bk
on public.groups for update
to authenticated
using (boundary_keeper_id = auth.uid())
with check (boundary_keeper_id = auth.uid());

-- 7.4 group_members
-- Members can see active members in same group; BK can also see pending.
drop policy if exists group_members_select on public.group_members;
create policy group_members_select
on public.group_members for select
to authenticated
using (
  -- BK sees all
  exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.boundary_keeper_id = auth.uid()
  )
  or
  -- active members can see active roster
  (
    group_members.status = 'active'
    and public.is_group_active_member(group_members.group_id, auth.uid())
  )
  or
  -- user can see their own membership row (pending/active/removed)
  (group_members.user_id = auth.uid())
);

-- Insert group member: BK invites a user (v1: only BK invites)
drop policy if exists group_members_insert_bk on public.group_members;
create policy group_members_insert_bk
on public.group_members for insert
to authenticated
with check (
  exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.boundary_keeper_id = auth.uid()
  )
  and invited_by = auth.uid()
);

-- Update membership: BK manages status; user can accept own invite (pending→active) later via RPC (Slice2)
drop policy if exists group_members_update_bk on public.group_members;
create policy group_members_update_bk
on public.group_members for update
to authenticated
using (
  exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.boundary_keeper_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.boundary_keeper_id = auth.uid()
  )
);

-- 7.5 matches (visibility: ORG or match participant pending/confirmed)
drop policy if exists matches_select_visibility on public.matches;
create policy matches_select_visibility
on public.matches for select
to authenticated
using (
  organizer_id = auth.uid()
  or public.is_match_participant_active(matches.id, auth.uid())
);

-- Create match: organizer must be self
drop policy if exists matches_insert_self on public.matches;
create policy matches_insert_self
on public.matches for insert
to authenticated
with check (organizer_id = auth.uid());

-- Update match: organizer only
drop policy if exists matches_update_organizer on public.matches;
create policy matches_update_organizer
on public.matches for update
to authenticated
using (organizer_id = auth.uid())
with check (organizer_id = auth.uid());

-- 7.6 guests
-- Guests are visible to match organizer + active participants (pending/confirmed) of any match that references the guest.
drop policy if exists guests_select_for_match_people on public.guests;
create policy guests_select_for_match_people
on public.guests for select
to authenticated
using (
  exists (
    select 1
    from public.match_participants mp
    join public.matches m on m.id = mp.match_id
    where mp.guest_id = guests.id
      and (
        m.organizer_id = auth.uid()
        or public.is_match_participant_active(m.id, auth.uid())
      )
  )
);

-- Insert guest: any authenticated (but will be gated by match_participants insert later)
drop policy if exists guests_insert_auth on public.guests;
create policy guests_insert_auth
on public.guests for insert
to authenticated
with check (created_by = auth.uid());

-- 7.7 match_participants
-- Read: organizer OR participant (pending/confirmed) in that match
drop policy if exists match_participants_select on public.match_participants;
create policy match_participants_select
on public.match_participants for select
to authenticated
using (
  public.is_match_organizer(match_participants.match_id, auth.uid())
  or public.is_match_participant_active(match_participants.match_id, auth.uid())
);

-- Insert user request (Pull): user can create own pending requested row
drop policy if exists match_participants_insert_request on public.match_participants;
create policy match_participants_insert_request
on public.match_participants for insert
to authenticated
with check (
  user_id = auth.uid()
  and join_method = 'requested'
  and status = 'pending'
  and created_by = auth.uid()
);

-- Insert invite user (Push): organizer can create pending invited row
drop policy if exists match_participants_insert_invite_by_org on public.match_participants;
create policy match_participants_insert_invite_by_org
on public.match_participants for insert
to authenticated
with check (
  public.is_match_organizer(match_participants.match_id, auth.uid())
  and join_method = 'invited'
  and status = 'pending'
  and created_by = auth.uid()
);

-- Insert guest spot: organizer OR allowed participant flag (participant flag enforcement in Slice 2 RPC)
-- For Slice 1, allow organizer to add guest rows only. Participant guest add will be enabled later after flags are in place.
drop policy if exists match_participants_insert_guest_by_org on public.match_participants;
create policy match_participants_insert_guest_by_org
on public.match_participants for insert
to authenticated
with check (
  public.is_match_organizer(match_participants.match_id, auth.uid())
  and join_method = 'guest_add'
  and created_by = auth.uid()
  and guest_id is not null
);

-- Update participant: organizer can confirm/remove; invited user can accept/decline their own invite (pending→confirmed/removed) later via RPC.
-- For Slice 1, keep updates restricted to organizer only to avoid partial logic in RLS.
drop policy if exists match_participants_update_org_only on public.match_participants;
create policy match_participants_update_org_only
on public.match_participants for update
to authenticated
using (public.is_match_organizer(match_participants.match_id, auth.uid()))
with check (public.is_match_organizer(match_participants.match_id, auth.uid()));

commit;
