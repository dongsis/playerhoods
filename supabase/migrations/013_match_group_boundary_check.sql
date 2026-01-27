-- ============================================================================
-- Governance Slice 2.5 — Match ↔ Group Boundary Check (people-first + guest)
-- File: 013_match_group_boundary_check.sql
--
-- Depends on:
--   - docs/playerhoods/governance/Group Execution State (Authoritative).md
--   - docs/specs/GroupContract_v1.md (no changes)
--   - 007_create_groups.sql
--   - 008_group_creation_semantics.sql
--   - 009_group_details_view_alignment.sql
--   - 010_invite_flow_rls.sql
--   - 011_accept_flow_rls.sql
--   - 012_removal_exit_rls.sql
--
-- Goals:
--   1) Matches are people-first: UI need not select a group.
--   2) Support non-user participants (email-based guests).
--   3) Conditional provenance: only required/used when boundary is enforced.
--   4) Match NEVER back-writes Group (no triggers/RPC here; DB model stays separate).
--
-- Non-goals:
--   - Link-based open join semantics (can be added later)
--   - GroupContract_v1 / group_details view changes
--   - New enums (per Execution State)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Helper: ensure pgcrypto exists (gen_random_uuid)
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Tables (create if missing; otherwise patch columns/constraints)
-- ---------------------------------------------------------------------------

-- 1.1 matches (minimal event container)
do $$
begin
  if to_regclass('public.matches') is null then
    create table public.matches (
      id uuid primary key default gen_random_uuid(),
      created_by uuid not null references auth.users(id) on delete cascade,
      title text,
      starts_at timestamptz,
      ends_at timestamptz,
      location text,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  else
    -- Ensure created_by exists (needed for boundary checks)
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='matches' and column_name='created_by'
    ) then
      alter table public.matches
        add column created_by uuid references auth.users(id) on delete cascade;
      -- If you already have an organizer/owner column, manually backfill and then set NOT NULL.
      -- We do NOT force NOT NULL here to avoid breaking existing rows.
    end if;

    -- Ensure timestamps exist (optional)
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='matches' and column_name='created_at'
    ) then
      alter table public.matches add column created_at timestamptz not null default now();
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='matches' and column_name='updated_at'
    ) then
      alter table public.matches add column updated_at timestamptz not null default now();
    end if;
  end if;
end $$;

-- 1.2 match_guests (non-user participants)
do $$
begin
  if to_regclass('public.match_guests') is null then
    create table public.match_guests (
      id uuid primary key default gen_random_uuid(),
      created_by uuid not null references auth.users(id) on delete cascade,
      email text not null,
      display_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint match_guests_email_format_chk check (position('@' in email) > 1)
    );
  end if;
end $$;

-- enforce case-insensitive uniqueness per creator (created_by + lower(email))
create unique index if not exists match_guests_created_by_email_lower_uniq
  on public.match_guests (created_by, lower(email));


-- 1.3 match_participants (either an auth user OR a guest)
do $$
begin
  if to_regclass('public.match_participants') is null then
    create table public.match_participants (
      id uuid primary key default gen_random_uuid(),
      match_id uuid not null references public.matches(id) on delete cascade,

      -- Exactly one of these must be present
      user_id uuid references auth.users(id) on delete cascade,
      guest_id uuid references public.match_guests(id) on delete cascade,

      invited_by uuid not null references auth.users(id) on delete cascade,

      -- Conditional provenance (proof anchor) for boundary-enforced path
      provenance_group_id uuid references public.groups(id) on delete set null,

      -- Boundary mode:
      -- - enforce_group_boundary = true  => require a proof anchor that both inviter and user are ACTIVE in that group
      -- - enforce_group_boundary = false => open/guest/link path; provenance SHOULD be NULL
      enforce_group_boundary boolean not null default true,

      created_at timestamptz not null default now(),

      constraint match_participants_exactly_one_identity_chk
        check (
          (user_id is not null and guest_id is null)
          or (user_id is null and guest_id is not null)
        ),

      constraint match_participants_open_should_not_have_provenance_chk
        check (
          enforce_group_boundary = true
          or provenance_group_id is null
        )
    );

    create index if not exists match_participants_match_id_idx on public.match_participants(match_id);
    create index if not exists match_participants_user_id_idx on public.match_participants(user_id);
    create index if not exists match_participants_guest_id_idx on public.match_participants(guest_id);
    create index if not exists match_participants_provenance_group_id_idx on public.match_participants(provenance_group_id);
  else
    -- Patch missing columns if table already exists
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='match_participants' and column_name='invited_by') then
      alter table public.match_participants
        add column invited_by uuid references auth.users(id) on delete cascade;
    end if;

    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='match_participants' and column_name='provenance_group_id') then
      alter table public.match_participants
        add column provenance_group_id uuid references public.groups(id) on delete set null;
    end if;

    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='match_participants' and column_name='enforce_group_boundary') then
      alter table public.match_participants
        add column enforce_group_boundary boolean not null default true;
    end if;

    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='match_participants' and column_name='created_at') then
      alter table public.match_participants
        add column created_at timestamptz not null default now();
    end if;

    -- Add constraints only if missing (best-effort)
    begin
      alter table public.match_participants
        add constraint match_participants_exactly_one_identity_chk
        check (
          (user_id is not null and guest_id is null)
          or (user_id is null and guest_id is not null)
        );
    exception when duplicate_object then
      null;
    end;

    begin
      alter table public.match_participants
        add constraint match_participants_open_should_not_have_provenance_chk
        check (
          enforce_group_boundary = true
          or provenance_group_id is null
        );
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) RLS enablement
-- ---------------------------------------------------------------------------
alter table public.matches enable row level security;
alter table public.match_guests enable row level security;
alter table public.match_participants enable row level security;

-- ---------------------------------------------------------------------------
-- 3) RLS policies (policy replacement discipline)
-- ---------------------------------------------------------------------------

-- 3.1 matches: creator owns their matches (minimal safe default)
drop policy if exists matches_select_own on public.matches;
create policy matches_select_own
on public.matches
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists matches_insert_own on public.matches;
create policy matches_insert_own
on public.matches
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists matches_update_own on public.matches;
create policy matches_update_own
on public.matches
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists matches_delete_own on public.matches;
create policy matches_delete_own
on public.matches
for delete
to authenticated
using (created_by = auth.uid());

-- 3.2 match_guests: only creator can manage their guest contacts
drop policy if exists match_guests_select_own on public.match_guests;
create policy match_guests_select_own
on public.match_guests
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists match_guests_insert_own on public.match_guests;
create policy match_guests_insert_own
on public.match_guests
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists match_guests_update_own on public.match_guests;
create policy match_guests_update_own
on public.match_guests
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists match_guests_delete_own on public.match_guests;
create policy match_guests_delete_own
on public.match_guests
for delete
to authenticated
using (created_by = auth.uid());

-- 3.3 match_participants:
--     - Only match creator can add participants (organizer-owned for MVP)
--     - Guest path allowed (enforce_group_boundary = false, provenance must be NULL)
--     - Group-based path: must provide provenance_group_id and prove both inviter and user are ACTIVE in that group
--       (Conditional provenance: used only when boundary enforced)
drop policy if exists match_participants_select_for_creator on public.match_participants;
create policy match_participants_select_for_creator
on public.match_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = match_participants.match_id
      and m.created_by = auth.uid()
  )
);

drop policy if exists match_participants_insert_by_creator on public.match_participants;
create policy match_participants_insert_by_creator
on public.match_participants
for insert
to authenticated
with check (
  invited_by = auth.uid()
  and exists (
    select 1
    from public.matches m
    where m.id = match_participants.match_id
      and m.created_by = auth.uid()
  )
  and (
    -- A) Guest path: allow adding an email guest without any group proof
    (guest_id is not null
      and user_id is null
      and enforce_group_boundary = false
      and provenance_group_id is null
      and exists (
        select 1 from public.match_guests g
        where g.id = match_participants.guest_id
          and g.created_by = auth.uid()
      )
    )

    or

    -- B) Group-based path: require proof anchor (provenance_group_id) and ACTIVE membership for both sides
    (user_id is not null
      and guest_id is null
      and enforce_group_boundary = true
      and provenance_group_id is not null
      and exists (
        select 1
        from public.group_members gm_inviter
        where gm_inviter.group_id = match_participants.provenance_group_id
          and gm_inviter.user_id = auth.uid()
          and gm_inviter.status = 'active'
      )
      and exists (
        select 1
        from public.group_members gm_participant
        where gm_participant.group_id = match_participants.provenance_group_id
          and gm_participant.user_id = match_participants.user_id
          and gm_participant.status = 'active'
      )
    )
  )
);

-- For MVP: only creator can remove participants they added (optional but consistent)
drop policy if exists match_participants_delete_by_creator on public.match_participants;
create policy match_participants_delete_by_creator
on public.match_participants
for delete
to authenticated
using (
  invited_by = auth.uid()
  and exists (
    select 1
    from public.matches m
    where m.id = match_participants.match_id
      and m.created_by = auth.uid()
  )
);

-- (Optional) prevent updates for now (append-only participants)
revoke update on public.match_participants from authenticated;

-- ---------------------------------------------------------------------------
-- 4) Post-migration verification queries (non-asserting; you will run them)
-- ---------------------------------------------------------------------------
-- NOTE: Supabase SQL editor cannot easily simulate auth.uid() without a session.
-- Use the Verification Checklist section for how to test in-app.
-- ---------------------------------------------------------------------------

commit;

