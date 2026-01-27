-- ============================================================================
-- Slice 2.6 — Guest Directory + Match-Scoped Add Guest Semantics
-- File: 016_guest_directory_add_guest_rpc.sql
--
-- Depends on:
--   - 013_match_group_boundary_check.sql (match_guests, match_participants)
--   - 014_fix_matches_policy_stack.sql (matches RLS)
--   - 015_fix_group_members_rls_recursion.sql (SECURITY DEFINER pattern)
--
-- Goals:
--   1) Provide atomic add_guest_to_match RPC
--   2) Check "already added" at MATCH scope (not system scope)
--   3) Allow confirmed participants (not just creator) to add guests
--   4) Proper removal semantics: creator removes anyone, non-creator self-exit only
--
-- Non-goals:
--   - No GroupContract_v1 changes
--   - No new enums
--   - No Guest-to-User historical merge
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) SECURITY DEFINER helper functions (avoid RLS recursion)
-- ---------------------------------------------------------------------------

-- Check if a user is a confirmed participant of a match
-- In match_participants, presence = confirmed (no status column)
create or replace function public.is_match_participant(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
  );
$$;

-- Check if a guest (by email) is already a participant of a match
create or replace function public.is_guest_in_match(p_match_id uuid, p_email text, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.match_participants mp
    join public.match_guests mg on mg.id = mp.guest_id
    where mp.match_id = p_match_id
      and mg.created_by = p_created_by
      and lower(trim(mg.email)) = lower(trim(p_email))
  );
$$;

-- Check if user is the match creator
create or replace function public.is_match_creator(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.created_by = p_user_id
  );
$$;

-- Tighten function permissions
revoke all on function public.is_match_participant(uuid, uuid) from public;
revoke all on function public.is_guest_in_match(uuid, text, uuid) from public;
revoke all on function public.is_match_creator(uuid, uuid) from public;
grant execute on function public.is_match_participant(uuid, uuid) to authenticated;
grant execute on function public.is_guest_in_match(uuid, text, uuid) to authenticated;
grant execute on function public.is_match_creator(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) RPC: add_guest_to_match (atomic operation)
-- ---------------------------------------------------------------------------

-- Return type for the RPC
drop type if exists public.add_guest_result cascade;
create type public.add_guest_result as (
  status text,           -- 'success' | 'already_in_match' | 'unauthorized' | 'match_not_found'
  guest_id uuid,         -- the guest id (new or existing)
  participant_id uuid    -- the match_participant id (null if already_in_match)
);

create or replace function public.add_guest_to_match(
  p_match_id uuid,
  p_email text,
  p_display_name text default null
)
returns public.add_guest_result
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_normalized_email text;
  v_guest_id uuid;
  v_participant_id uuid;
  v_result public.add_guest_result;
begin
  -- Get caller
  v_caller_id := auth.uid();
  if v_caller_id is null then
    v_result.status := 'unauthorized';
    return v_result;
  end if;

  -- Normalize email
  v_normalized_email := lower(trim(p_email));
  if v_normalized_email is null or v_normalized_email = '' or position('@' in v_normalized_email) < 2 then
    raise exception 'Invalid email format';
  end if;

  -- Check match exists
  if not exists (select 1 from public.matches where id = p_match_id) then
    v_result.status := 'match_not_found';
    return v_result;
  end if;

  -- Authorization: caller must be creator OR a confirmed participant
  if not public.is_match_creator(p_match_id, v_caller_id)
     and not public.is_match_participant(p_match_id, v_caller_id) then
    v_result.status := 'unauthorized';
    return v_result;
  end if;

  -- Check if this guest email is already in this match (match-scoped check)
  -- We check across ALL guests in the match, not just caller's directory
  if exists (
    select 1
    from public.match_participants mp
    join public.match_guests mg on mg.id = mp.guest_id
    where mp.match_id = p_match_id
      and lower(trim(mg.email)) = v_normalized_email
  ) then
    v_result.status := 'already_in_match';
    -- Find the existing guest_id for reference
    select mg.id into v_result.guest_id
    from public.match_participants mp
    join public.match_guests mg on mg.id = mp.guest_id
    where mp.match_id = p_match_id
      and lower(trim(mg.email)) = v_normalized_email
    limit 1;
    return v_result;
  end if;

  -- Find or create guest in caller's directory
  select id into v_guest_id
  from public.match_guests
  where created_by = v_caller_id
    and lower(trim(email)) = v_normalized_email;

  if v_guest_id is null then
    -- Create new guest entry in caller's directory
    insert into public.match_guests (created_by, email, display_name)
    values (v_caller_id, v_normalized_email, nullif(trim(p_display_name), ''))
    returning id into v_guest_id;
  else
    -- Optionally update display_name if provided and guest has none
    if p_display_name is not null and trim(p_display_name) <> '' then
      update public.match_guests
      set display_name = coalesce(display_name, nullif(trim(p_display_name), '')),
          updated_at = now()
      where id = v_guest_id
        and display_name is null;
    end if;
  end if;

  -- Insert into match_participants (guest path)
  insert into public.match_participants (
    match_id,
    guest_id,
    user_id,
    invited_by,
    enforce_group_boundary,
    provenance_group_id
  )
  values (
    p_match_id,
    v_guest_id,
    null,
    v_caller_id,
    false,
    null
  )
  returning id into v_participant_id;

  v_result.status := 'success';
  v_result.guest_id := v_guest_id;
  v_result.participant_id := v_participant_id;
  return v_result;
end;
$$;

-- Grant execute to authenticated users
revoke all on function public.add_guest_to_match(uuid, text, text) from public;
grant execute on function public.add_guest_to_match(uuid, text, text) to authenticated;

comment on function public.add_guest_to_match is
  'Slice 2.6: Atomic add guest to match. '
  'Authorization: caller must be match creator OR confirmed participant. '
  'Checks "already added" at match scope. Returns status + guest_id + participant_id.';

-- ---------------------------------------------------------------------------
-- 3) RLS Policy Replacements: match_participants
-- ---------------------------------------------------------------------------

-- 3.1 SELECT: participants can see all participants in matches they participate in
--     (or are the creator of)
drop policy if exists match_participants_select_for_creator on public.match_participants;
drop policy if exists match_participants_select_policy on public.match_participants;

create policy match_participants_select_policy
on public.match_participants
for select
to authenticated
using (
  -- User is the match creator
  public.is_match_creator(match_participants.match_id, auth.uid())
  or
  -- User is a participant in this match
  public.is_match_participant(match_participants.match_id, auth.uid())
);

-- 3.2 INSERT: creator OR confirmed participant can add guests
--     (RPC is preferred, but direct insert also allowed for flexibility)
drop policy if exists match_participants_insert_by_creator on public.match_participants;
drop policy if exists match_participants_insert_policy on public.match_participants;

create policy match_participants_insert_policy
on public.match_participants
for insert
to authenticated
with check (
  invited_by = auth.uid()
  and (
    -- Authorization: creator OR existing participant
    public.is_match_creator(match_participants.match_id, auth.uid())
    or public.is_match_participant(match_participants.match_id, auth.uid())
  )
  and (
    -- A) Guest path: no group proof required
    (guest_id is not null
      and user_id is null
      and enforce_group_boundary = false
      and provenance_group_id is null
      and exists (
        select 1 from public.match_guests g
        where g.id = match_participants.guest_id
          and g.created_by = auth.uid()
      )
    )

    or

    -- B) Group-based path: require proof anchor and ACTIVE membership for both sides
    (user_id is not null
      and guest_id is null
      and enforce_group_boundary = true
      and provenance_group_id is not null
      and public.is_active_group_member(match_participants.provenance_group_id, auth.uid())
      and public.is_active_group_member(match_participants.provenance_group_id, match_participants.user_id)
    )
  )
);

-- 3.3 DELETE: creator can remove anyone; non-creator can only self-exit
drop policy if exists match_participants_delete_by_creator on public.match_participants;
drop policy if exists match_participants_delete_policy on public.match_participants;

create policy match_participants_delete_policy
on public.match_participants
for delete
to authenticated
using (
  -- Creator can delete any participant in their match
  public.is_match_creator(match_participants.match_id, auth.uid())
  or
  -- Non-creator can only delete their own participation (self-exit)
  (match_participants.user_id = auth.uid()
   and not public.is_match_creator(match_participants.match_id, auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 4) Ensure UPDATE is still disabled (append-only participants)
-- ---------------------------------------------------------------------------
-- Already revoked in 013; reaffirm for safety
revoke update on public.match_participants from authenticated;

commit;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================

/*
-- 1) Check RLS policies on match_participants
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'match_participants'
order by cmd, policyname;

-- 2) Check functions exist
select proname, prosecdef
from pg_proc
where proname in ('add_guest_to_match', 'is_match_participant', 'is_guest_in_match', 'is_match_creator');

-- 3) Test add_guest_to_match (as authenticated user, replace UUIDs with real ones)
-- select * from public.add_guest_to_match(
--   'your-match-id'::uuid,
--   'guest@example.com',
--   'Guest Name'
-- );

-- 4) Verify same email twice to same match returns 'already_in_match'
-- select * from public.add_guest_to_match(
--   'your-match-id'::uuid,
--   'guest@example.com',
--   'Guest Name'
-- );

-- 5) List my guest directory
-- select id, email, display_name, created_at
-- from public.match_guests
-- where created_by = auth.uid()
-- order by created_at desc;
*/
