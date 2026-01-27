-- ============================================================================
-- Slice 2.6 Bug Fix — Fix match_guests SELECT visibility (no recursion)
-- File: 019_fix_match_guests_rls_definer.sql
--
-- Goal:
--   Participants in the same match can read guest details (match-scoped),
--   without relying on nested RLS checks that can fail.
-- ============================================================================

begin;

-- 1) Remove prior participant-read policy variants (018)
drop policy if exists match_guests_select_for_participants on public.match_guests;

-- 2) Keep owner-only DML policies as-is, but replace SELECT with one policy
drop policy if exists match_guests_select_own on public.match_guests;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helper (does NOT query match_guests to avoid recursion)
-- ---------------------------------------------------------------------------
create or replace function public.can_view_match_guest_in_match(
  p_guest_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- User is match creator where this guest participates
    exists (
      select 1
      from public.match_participants mp
      join public.matches m on m.id = mp.match_id
      where mp.guest_id = p_guest_id
        and m.created_by = p_user_id
    )
    or
    -- User is confirmed legacy participant in same match as this guest
    exists (
      select 1
      from public.match_participants mp
      join public.participants p on p.match_id = mp.match_id
      where mp.guest_id = p_guest_id
        and p.user_id = p_user_id
        and p.state = 'confirmed'
    )
    or
    -- User is a participant (new table) in same match as this guest
    exists (
      select 1
      from public.match_participants mp_guest
      join public.match_participants mp_user
        on mp_guest.match_id = mp_user.match_id
      where mp_guest.guest_id = p_guest_id
        and mp_user.user_id = p_user_id
    );
$$;

-- permissions
revoke all on function public.can_view_match_guest_in_match(uuid, uuid) from public;
grant execute on function public.can_view_match_guest_in_match(uuid, uuid) to authenticated;

-- (Optional but recommended) ensure function owner is table owner-like role
-- If your migrations run as postgres, this is already postgres.
-- alter function public.can_view_match_guest_in_match(uuid, uuid) owner to postgres;

-- ---------------------------------------------------------------------------
-- SELECT policy: (owner can always see) OR (same-match visibility)
-- ---------------------------------------------------------------------------
create policy match_guests_select_policy
on public.match_guests
for select
to authenticated
using (
  -- creator can always read their guest record
  match_guests.created_by = auth.uid()
  or public.can_view_match_guest_in_match(match_guests.id, auth.uid())
);

commit;
