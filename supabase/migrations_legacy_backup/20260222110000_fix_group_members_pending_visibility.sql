-- Fix: group members who are pending (invited) should also be able to see the
-- active roster of the group so they can make an informed decision before accepting.
--
-- Before: only ACTIVE members could see the active roster
--   (is_group_active_member_any → checks status = 'active')
-- After:  any member (active OR pending) can see the active roster
--   (is_group_member_any → checks status IN ('pending', 'active'))
--
-- Security note: this does NOT expose removed members or members of other groups.
-- Pending members can only see active rows of groups they've been invited to.

drop policy if exists group_members_select_active_roster_for_active_members on public.group_members;

create policy group_members_select_active_roster_for_active_members
on public.group_members for select to authenticated
using (
  status = 'active'
  and public.is_group_member_any(group_id, auth.uid())
);
