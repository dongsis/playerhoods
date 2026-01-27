-- ============================================================================
-- Slice 2.5.x — Group RLS Recursion Fix
-- File: 015_fix_group_members_rls_recursion.sql
--
-- Purpose:
-- - Eliminate infinite recursion in RLS policies on public.group_members
-- - Preserve existing semantics (no widening/tightening)
-- - Achieve via SECURITY DEFINER boolean helpers + policy replacement
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Helper functions (SECURITY DEFINER)
--    - minimal surface area: return boolean only
--    - set stable + locked search_path
-- ---------------------------------------------------------------------------

create or replace function public.is_active_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id  = p_user_id
      and gm.status   = 'active'
  );
$$;

create or replace function public.group_member_exists(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id  = p_user_id
  );
$$;

-- Tighten function permissions (best practice; policies call these under authenticated)
revoke all on function public.is_active_group_member(uuid, uuid) from public;
revoke all on function public.group_member_exists(uuid, uuid) from public;
grant execute on function public.is_active_group_member(uuid, uuid) to authenticated;
grant execute on function public.group_member_exists(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Replace SELECT policy to remove self-referential subquery
-- ---------------------------------------------------------------------------

drop policy if exists "group_members_can_read_members" on public.group_members;

create policy "group_members_can_read_members"
on public.group_members
for select
to authenticated
using (
  -- preserve the original intent: a user can read members of a group
  -- if the user is an active member of that same group
  public.is_active_group_member(group_members.group_id, auth.uid())
);

-- ---------------------------------------------------------------------------
-- 3) Replace can_invite_group_member to remove group_members subqueries
--    (This policy is for INSERT with join_method='invited' / status='pending'
--     per your Slice 2.2/010 semantics.)
-- ---------------------------------------------------------------------------

drop policy if exists "can_invite_group_member" on public.group_members;

create policy "can_invite_group_member"
on public.group_members
for insert
to authenticated
with check (
  -- keep original required shape (as per Slice 2.2 / 010)
  group_members.join_method = 'invited'
  and group_members.status = 'pending'
  and group_members.invited_by = auth.uid()
  and group_members.user_id <> auth.uid()

  -- prevent duplicates (no longer selects group_members directly)
  and not public.group_member_exists(group_members.group_id, group_members.user_id)

  -- inviter must be active member of the target group (no recursion)
  and public.is_active_group_member(group_members.group_id, auth.uid())

  -- preserve the 010 rule: organized + auto_join rejects invited inserts
  and not (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.group_type = 'organized'
        and g.join_policy = 'auto_join'
    )
  )
);

commit;
