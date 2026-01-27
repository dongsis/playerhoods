begin;

-- Replace SELECT policy with organizer + participants visibility (match-scoped)
drop policy if exists match_guests_select_policy on public.match_guests;

create policy match_guests_select_policy
on public.match_guests
for select
to authenticated
using (
  -- (1) creator can always read
  match_guests.created_by = auth.uid()

  -- (2) match organizer can always read any guest in the match
  or exists (
    select 1
    from public.match_participants mp
    join public.matches m on m.id = mp.match_id
    where mp.guest_id = match_guests.id
      and (m.organizer_id = auth.uid() or m.created_by = auth.uid())
  )

  -- (3) same-match participants (your existing helper)
  or public.can_view_match_guest_in_match(match_guests.id, auth.uid())
);

commit;
