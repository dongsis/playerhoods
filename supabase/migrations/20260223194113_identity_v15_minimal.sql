-- ============================================================================
-- Identity Model v1.5 — Minimal DB Implementation (append-only)
-- 1) group_display_name on group_members (group-context alias)
-- 2) user_personal_remarks table (private remark; owner-only via RLS)
-- 3) v_group_member_display view (effective_display_name priority resolver)
--    priority: personal_remark > group_display_name > display_name
-- ============================================================================
-- Notes:
-- - This migration is intentionally minimal and non-invasive.
-- - Does NOT modify existing meaning of profiles/display_name.
-- - Does NOT touch clubs/venues/discoverability.
-- - All objects are created idempotently where possible.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Safety: ensure extension for gen_random_uuid (normally exists on Supabase)
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Add group_display_name (group-scoped alias) to group_members
-- ---------------------------------------------------------------------------
alter table public.group_members
  add column if not exists group_display_name text;

comment on column public.group_members.group_display_name is
  'Identity v1.5: group-scoped alias shown within this group context. Optional.';

-- Optional (soft) length guard; keep permissive (no emoji policing here)
-- You can tighten later if you want strict enforcement in DB.
-- alter table public.group_members
--   add constraint group_members_group_display_name_len_chk
--   check (group_display_name is null or char_length(group_display_name) <= 32);

-- ---------------------------------------------------------------------------
-- 2) Private personal remarks table (owner-only)
--    - owner_id: the user who owns the remark (auth.uid())
--    - target_user_id: the user being labeled
--    - group_id: optional scope (recommended for group-context priority)
-- ---------------------------------------------------------------------------
create table if not exists public.user_personal_remarks (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid null references public.groups(id) on delete cascade,

  remark text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- one remark per (owner, target, group context). group_id nullable = global remark
  constraint user_personal_remarks_unique unique (owner_id, target_user_id, group_id)
);

comment on table public.user_personal_remarks is
  'Identity v1.5: private remark labels (owner-only). Used for display priority in group context.';

comment on column public.user_personal_remarks.group_id is
  'Optional scope. When set, remark applies within that group context.';

-- Keep updated_at fresh
create or replace function public.tg__set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at__user_personal_remarks on public.user_personal_remarks;
create trigger set_updated_at__user_personal_remarks
before update on public.user_personal_remarks
for each row
execute function public.tg__set_updated_at();

-- RLS: owner-only
alter table public.user_personal_remarks enable row level security;

drop policy if exists upr_select_own on public.user_personal_remarks;
create policy upr_select_own
on public.user_personal_remarks
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists upr_insert_own on public.user_personal_remarks;
create policy upr_insert_own
on public.user_personal_remarks
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists upr_update_own on public.user_personal_remarks;
create policy upr_update_own
on public.user_personal_remarks
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists upr_delete_own on public.user_personal_remarks;
create policy upr_delete_own
on public.user_personal_remarks
for delete
to authenticated
using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Group-context display resolver view
--    effective_display_name = coalesce(personal_remark, group_display_name, display_name)
-- ---------------------------------------------------------------------------
create or replace view public.v_group_member_display as
select
  gm.group_id,
  gm.user_id as member_user_id,

  coalesce(
    nullif(upr.remark, ''),
    nullif(gm.group_display_name, ''),
    p.display_name
  ) as effective_display_name,

  -- Optional debug/UX fields (useful for edit UIs)
  gm.group_display_name,
  p.display_name,
  upr.remark as personal_remark

from public.group_members gm
join public.profiles p
  on p.id = gm.user_id
left join public.user_personal_remarks upr
  on upr.owner_id = auth.uid()
 and upr.target_user_id = gm.user_id
 and upr.group_id = gm.group_id;

comment on view public.v_group_member_display is
  'Identity v1.5: group-context display resolver. Priority: personal_remark > group_display_name > display_name.';

-- Ensure authenticated can read the view (common Supabase pattern)
grant select on public.v_group_member_display to authenticated;

commit;