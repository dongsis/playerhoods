-- ============================================================================
-- Add INSERT policy for groups
-- Creator becomes boundary keeper
-- ============================================================================

begin;

drop policy if exists groups_insert_self on public.groups;

create policy groups_insert_self
on public.groups
for insert
to authenticated
with check (
  created_by = auth.uid()
  and boundary_keeper_id = auth.uid()
);

commit;
