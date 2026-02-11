-- ============================================================================
-- Fix — RLS recursion between groups <-> group_members
-- File: supabase/migrations/<timestamp>_fix_rls_groups_recursion.sql
-- ============================================================================
begin;

-- 1) Helper: boundary keeper id (read groups with row_security off)
create or replace function public.group_boundary_keeper_id(p_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select g.boundary_keeper_id
  from public.groups g
  where g.id = p_group_id
$$;

-- 2) Helper: membership checks (read group_members with row_security off)
create or replace function public.is_group_member_any(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status in ('pending','active')
  );
$$;

create or replace function public.is_group_active_member_any(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;

-- 3) Rebuild groups SELECT policy to avoid direct dependency recursion
drop policy if exists groups_select_member on public.groups;

create policy groups_select_member
on public.groups
for select
to authenticated
using (
  public.is_group_member_any(id, auth.uid())
);

-- (Optional) If you had an ANON select policy, keep it dropped in v1 (groups not public)
-- drop policy if exists groups_select_anon on public.groups;

-- 4) Rebuild group_members SELECT policies without referencing groups table directly
--    Use helper functions that bypass RLS (row_security=off)

drop policy if exists group_members_select_self on public.group_members;
create policy group_members_select_self
on public.group_members
for select
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists group_members_select_bk on public.group_members;
create policy group_members_select_bk
on public.group_members
for select
to authenticated
using (
  public.group_boundary_keeper_id(group_id) = auth.uid()
);

drop policy if exists group_members_select_active_roster_for_active_members on public.group_members;
create policy group_members_select_active_roster_for_active_members
on public.group_members
for select
to authenticated
using (
  status = 'active'
  and public.is_group_active_member_any(group_id, auth.uid())
);

commit;
