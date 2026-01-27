-- ============================================================================
-- Slice 2.6 Bug Fix — Allow match participants to read guest details
-- File: 018_match_guests_read_for_participants.sql
--
-- Problem:
--   match_guests_select_own only allows created_by = auth.uid()
--   This blocks participants from seeing guest names in match details
--
-- Fix:
--   Add permissive SELECT policy: match participants can see guests in their match
-- ============================================================================

begin;

-- Add SELECT policy for match participants to see guests in their matches
-- This is additive (permissive OR with existing policy)
drop policy if exists match_guests_select_for_participants on public.match_guests;

create policy match_guests_select_for_participants
on public.match_guests
for select
to authenticated
using (
  -- User can see a guest if that guest is a participant in a match the user is also in
  exists (
    select 1
    from public.match_participants mp_guest
    join public.match_participants mp_user
      on mp_guest.match_id = mp_user.match_id
    where mp_guest.guest_id = match_guests.id
      and mp_user.user_id = auth.uid()
  )
  or
  -- Or if user is the match creator (via matches table)
  exists (
    select 1
    from public.match_participants mp
    join public.matches m on m.id = mp.match_id
    where mp.guest_id = match_guests.id
      and m.created_by = auth.uid()
  )
  or
  -- Or check legacy participants table
  exists (
    select 1
    from public.match_participants mp_guest
    join public.participants p_user
      on mp_guest.match_id = p_user.match_id
    where mp_guest.guest_id = match_guests.id
      and p_user.user_id = auth.uid()
      and p_user.state = 'confirmed'
  )
);

comment on policy match_guests_select_for_participants on public.match_guests is
  'Slice 2.6 fix: Allow participants to see guest details in matches they belong to.';

commit;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
/*
select policyname, cmd from pg_policies
where schemaname='public' and tablename='match_guests';

-- Expected: match_guests_select_own + match_guests_select_for_participants
*/
