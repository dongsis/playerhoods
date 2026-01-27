-- ============================================================================
-- Slice 2.6 Hardening — Fix is_match_participant to check legacy participants
-- File: 017_fix_is_match_participant_legacy.sql
--
-- Depends on:
--   - 016_guest_directory_add_guest_rpc.sql
--
-- Problem:
--   The app uses legacy `participants` table (state='confirmed') but
--   is_match_participant() only checks `match_participants` (new table).
--   This causes non-organizer confirmed participants to fail authorization.
--
-- Fix:
--   Update is_match_participant() to check BOTH tables:
--   - match_participants (new, presence = confirmed)
--   - participants (legacy, state = 'confirmed')
--
-- Semantics preserved:
--   "Only confirmed/active participants may add guests; organizer always allowed."
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Replace is_match_participant to check both legacy and new tables
-- ---------------------------------------------------------------------------

create or replace function public.is_match_participant(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    -- Check NEW table: match_participants (presence = confirmed)
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
  )
  or exists (
    -- Check LEGACY table: participants (state = 'confirmed')
    select 1
    from public.participants p
    where p.match_id = p_match_id
      and p.user_id = p_user_id
      and p.state = 'confirmed'
  );
$$;

comment on function public.is_match_participant is
  'Slice 2.6 hardening: Checks if user is a confirmed participant. '
  'Checks both match_participants (new, presence=confirmed) and '
  'participants (legacy, state=confirmed).';

commit;

-- ============================================================================
-- VERIFICATION SQL
-- ============================================================================

/*
-- 1) Check function definition updated
select prosrc
from pg_proc
where proname = 'is_match_participant';
-- Expected: Should contain "public.participants" and "state = 'confirmed'"

-- 2) Test with a confirmed legacy participant
-- Replace UUIDs with real values from your DB:
-- select public.is_match_participant('match-uuid', 'user-uuid');
-- Expected: true if user is in participants with state='confirmed'

-- 3) Verify add_guest_to_match now works for legacy participants
-- As a confirmed participant (not organizer), call:
-- select * from public.add_guest_to_match('match-uuid', 'test@example.com', 'Test');
-- Expected: status = 'success' (not 'unauthorized')
*/
