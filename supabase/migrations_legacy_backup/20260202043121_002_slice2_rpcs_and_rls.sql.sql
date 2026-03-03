-- ============================================================================
-- Slice 2 — RPC + Behavior Logic (playerhoods.com v1 Frozen)
-- File: supabase/migrations/002_slice2_rpcs_and_rls.sql
-- ============================================================================
-- RPC-only state transitions:
-- - Group: accept own invite (pending -> active)
-- - Match: request join (pull) -> MP pending(requested) [eligible by invitation_scope_group_ids]
-- - Match: invite user (push) -> MP pending(invited) [ORG or allowed confirmed participant]
-- - Match: accept/decline invite by invited user
-- - Match: organizer confirm pending participant
-- - Match: add guest (status depends ONLY on match.admission_mode)
-- - Match: self leave
-- - Match: remove participant (ORG or allowed manager)
--
-- Frozen constraints honored:
-- - No Invite Group / bulk invites
-- - match.status NOT expanded
-- - match_participants.status limited to pending/confirmed/removed
-- - Guest Add: invite->confirmed, request->pending then org confirm
-- - Participant privileges via match flags only
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Helper functions for eligibility & capability checks
-- ----------------------------------------------------------------------------
create or replace function public.is_user_in_match_scope(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and exists (
        select 1
        from unnest(m.invitation_scope_group_ids) as gid
        where public.is_group_active_member(gid, p_user_id)
      )
  );
$$;

create or replace function public.is_match_participant_confirmed(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
      and mp.status = 'confirmed'
  );
$$;

create or replace function public.can_invite_users(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_invite_users = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;

create or replace function public.can_add_guests(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_add_guests = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;

create or replace function public.can_manage_participants(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_manage_participants = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;

-- ----------------------------------------------------------------------------
-- 2) RLS adjustments to support RPC-only behavior
-- ----------------------------------------------------------------------------

-- 2.1 group_members: allow self accept own pending invite (pending -> active)
drop policy if exists group_members_update_self_accept on public.group_members;
create policy group_members_update_self_accept
on public.group_members for update
to authenticated
using (
  group_members.user_id = auth.uid()
  and group_members.status = 'pending'
)
with check (
  group_members.user_id = auth.uid()
  and group_members.status = 'active'
);

-- 2.2 match_participants: allow invited user accept/decline their own invite
drop policy if exists match_participants_update_self_invite on public.match_participants;
create policy match_participants_update_self_invite
on public.match_participants for update
to authenticated
using (
  match_participants.user_id = auth.uid()
  and match_participants.join_method = 'invited'
  and match_participants.status = 'pending'
)
with check (
  match_participants.user_id = auth.uid()
  and match_participants.join_method = 'invited'
  and match_participants.status in ('confirmed','removed')
);

-- 2.3 match_participants: allow self leave (pending/confirmed -> removed) for own row
drop policy if exists match_participants_update_self_leave on public.match_participants;
create policy match_participants_update_self_leave
on public.match_participants for update
to authenticated
using (
  match_participants.user_id = auth.uid()
  and match_participants.status in ('pending','confirmed')
)
with check (
  match_participants.user_id = auth.uid()
  and match_participants.status = 'removed'
);

-- 2.4 match_participants: request insert must be eligible via invitation_scope_group_ids
drop policy if exists match_participants_insert_request on public.match_participants;
create policy match_participants_insert_request
on public.match_participants for insert
to authenticated
with check (
  match_participants.user_id = auth.uid()
  and match_participants.join_method = 'requested'
  and match_participants.status = 'pending'
  and match_participants.created_by = auth.uid()
  and public.is_user_in_match_scope(match_participants.match_id, auth.uid())
);

-- 2.5 match_participants: invite insert must pass can_invite_users
drop policy if exists match_participants_insert_invite_by_org on public.match_participants;
create policy match_participants_insert_invite_by_org
on public.match_participants for insert
to authenticated
with check (
  public.can_invite_users(match_participants.match_id, auth.uid())
  and match_participants.join_method = 'invited'
  and match_participants.status = 'pending'
  and match_participants.created_by = auth.uid()
  and match_participants.user_id is not null
  and match_participants.guest_id is null
);

-- 2.6 guest add insert: enforce frozen admission_mode split at RLS layer
drop policy if exists match_participants_insert_guest_confirmed_if_invite on public.match_participants;
create policy match_participants_insert_guest_confirmed_if_invite
on public.match_participants for insert
to authenticated
with check (
  public.can_add_guests(match_participants.match_id, auth.uid())
  and match_participants.join_method = 'guest_add'
  and match_participants.created_by = auth.uid()
  and match_participants.guest_id is not null
  and match_participants.user_id is null
  and match_participants.status = 'confirmed'
  and exists (
    select 1 from public.matches m
    where m.id = match_participants.match_id
      and m.admission_mode = 'invite'
  )
);

drop policy if exists match_participants_insert_guest_pending_if_request on public.match_participants;
create policy match_participants_insert_guest_pending_if_request
on public.match_participants for insert
to authenticated
with check (
  public.can_add_guests(match_participants.match_id, auth.uid())
  and match_participants.join_method = 'guest_add'
  and match_participants.created_by = auth.uid()
  and match_participants.guest_id is not null
  and match_participants.user_id is null
  and match_participants.status = 'pending'
  and exists (
    select 1 from public.matches m
    where m.id = match_participants.match_id
      and m.admission_mode = 'request'
  )
);

-- ----------------------------------------------------------------------------
-- 3) RPCs
-- ----------------------------------------------------------------------------

-- 3.1 Group: accept invite (pending -> active) for self
create or replace function public.rpc_group_accept_invite(p_group_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.group_members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.group_members gm
  set status = 'active',
      accepted_at = coalesce(gm.accepted_at, now())
  where gm.group_id = p_group_id
    and gm.user_id = auth.uid()
    and gm.status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'no_pending_invite';
  end if;

  return v_row;
end;
$$;

-- 3.2 Match: request join (Pull) — creates pending requested participant for self
create or replace function public.rpc_match_request_join(p_match_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.match_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_user_in_match_scope(p_match_id, auth.uid()) then
    raise exception 'not_eligible_for_request';
  end if;

  insert into public.match_participants (
    match_id, status, join_method, user_id, created_by
  ) values (
    p_match_id, 'pending', 'requested', auth.uid(), auth.uid()
  )
  returning * into v_row;

  return v_row;

exception
  when unique_violation then
    raise exception 'already_participant';
end;
$$;

-- 3.3 Match: invite user (Push) — ORG or allowed confirmed participant can invite
create or replace function public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.match_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot_invite_self';
  end if;

  if not public.can_invite_users(p_match_id, auth.uid()) then
    raise exception 'not_allowed_to_invite';
  end if;

  insert into public.match_participants (
    match_id, status, join_method, user_id, created_by
  ) values (
    p_match_id, 'pending', 'invited', p_user_id, auth.uid()
  )
  returning * into v_row;

  return v_row;

exception
  when unique_violation then
    raise exception 'already_participant';
end;
$$;

-- 3.4 Match: accept invite — pending(invited) -> confirmed
create or replace function public.rpc_match_accept_invite(p_match_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.match_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.match_participants mp
  set status = 'confirmed',
      confirmed_at = coalesce(mp.confirmed_at, now())
  where mp.match_id = p_match_id
    and mp.user_id = auth.uid()
    and mp.join_method = 'invited'
    and mp.status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'no_pending_invite';
  end if;

  return v_row;
end;
$$;

-- 3.5 Match: decline invite — pending(invited) -> removed
create or replace function public.rpc_match_decline_invite(p_match_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.match_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.match_participants mp
  set status = 'removed',
      removed_at = coalesce(mp.removed_at, now())
  where mp.match_id = p_match_id
    and mp.user_id = auth.uid()
    and mp.join_method = 'invited'
    and mp.status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'no_pending_invite';
  end if;

  return v_row;
end;
$$;

-- 3.6 Match: organizer confirm participant — pending -> confirmed
create or replace function public.rpc_match_confirm_participant(p_match_participant_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.match_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.match_participants mp
  set status = 'confirmed',
      confirmed_at = coalesce(mp.confirmed_at, now())
  where mp.id = p_match_participant_id
    and mp.status = 'pending'
    and public.is_match_organizer(mp.match_id, auth.uid())
  returning * into v_row;

  if not found then
    raise exception 'not_found_or_not_allowed';
  end if;

  return v_row;
end;
$$;

-- 3.7 Match: add guest — status depends ONLY on match.admission_mode (FROZEN)
create or replace function public.rpc_match_add_guest(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text default null
)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_guest public.guests;
  v_row public.match_participants;
  v_initial_status public.match_participant_status;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_guest_display_name is null or length(trim(p_guest_display_name)) = 0 then
    raise exception 'guest_name_required';
  end if;

  select * into v_match from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found';
  end if;

  if not public.can_add_guests(p_match_id, auth.uid()) then
    raise exception 'not_allowed_to_add_guests';
  end if;

  if v_match.admission_mode = 'invite' then
    v_initial_status := 'confirmed';
  else
    v_initial_status := 'pending';
  end if;

  insert into public.guests(display_name, notes, created_by)
  values (trim(p_guest_display_name), p_guest_notes, auth.uid())
  returning * into v_guest;

  insert into public.match_participants(
    match_id, status, join_method, guest_id, created_by, confirmed_at
  ) values (
    p_match_id,
    v_initial_status,
    'guest_add',
    v_guest.id,
    auth.uid(),
    case when v_initial_status = 'confirmed' then now() else null end
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- 3.8 Match: self leave — pending/confirmed -> removed
create or replace function public.rpc_match_leave(p_match_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.match_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.match_participants mp
  set status = 'removed',
      removed_at = coalesce(mp.removed_at, now())
  where mp.match_id = p_match_id
    and mp.user_id = auth.uid()
    and mp.status in ('pending','confirmed')
  returning * into v_row;

  if not found then
    raise exception 'not_a_participant';
  end if;

  return v_row;
end;
$$;

-- 3.9 Match: remove participant — pending/confirmed -> removed (ORG or allowed manager)
create or replace function public.rpc_match_remove_participant(p_match_participant_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.match_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.match_participants mp
  set status = 'removed',
      removed_at = coalesce(mp.removed_at, now())
  where mp.id = p_match_participant_id
    and mp.status in ('pending','confirmed')
    and public.can_manage_participants(mp.match_id, auth.uid())
  returning * into v_row;

  if not found then
    raise exception 'not_found_or_not_allowed';
  end if;

  return v_row;
end;
$$;

commit;
