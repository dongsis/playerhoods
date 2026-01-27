-- ============================================================================
-- Slice 2.5 Fix — Remove legacy permissive policies on matches
-- File: 014_fix_matches_policy_stack.sql
--
-- Purpose:
--   Supabase RLS policies are permissive (OR). Any legacy broad policy can bypass
--   intended ownership checks. We therefore remove legacy matches policies and
--   re-assert the ownership-only policy set.
-- ============================================================================

begin;

-- Ensure RLS stays enabled
alter table public.matches enable row level security;

-- ---------------------------------------------------------------------------
-- 1) Drop known legacy / duplicate policies (best-effort)
--    (These names are from your screenshot + common prior drafts.)
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated users can create matches" on public.matches;
drop policy if exists "Organizers can delete own matches" on public.matches;
drop policy if exists "Organizers can update own matches" on public.matches;

-- In case earlier drafts created these duplicates:
drop policy if exists matches_insert_policy on public.matches;
drop policy if exists matches_select_policy on public.matches;
drop policy if exists matches_update_policy on public.matches;

-- Optional: if any older policy names exist, add more DROP lines here
-- (keep append-only: do not modify history migrations)

-- ---------------------------------------------------------------------------
-- 2) Recreate the intended minimal ownership policies (authenticated only)
-- ---------------------------------------------------------------------------

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

commit;
