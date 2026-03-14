--
-- PostgreSQL database dump
--

\restrict UkxPBUwPWEWs45obTieJ30gEci3mAcimFFpVHjGqHDb87jIvvUXr9hqrOrSkdWW

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.8 (Debian 17.8-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: group_member_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.group_member_status AS ENUM (
    'pending',
    'active',
    'removed'
);


--
-- Name: match_admission_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_admission_mode AS ENUM (
    'invite',
    'request'
);


--
-- Name: match_join_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_join_method AS ENUM (
    'invited',
    'requested',
    'guest_add'
);


--
-- Name: match_participant_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_participant_status AS ENUM (
    'pending',
    'confirmed',
    'removed'
);


--
-- Name: match_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_status AS ENUM (
    'active',
    'cancelled',
    'archived'
);


--
-- Name: can_add_guests(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_add_guests(p_match_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_add_guests = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;


--
-- Name: can_invite_users(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_invite_users(p_match_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_invite_users = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;


--
-- Name: can_manage_participants(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_participants(p_match_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_manage_participants = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;


--
-- Name: group_boundary_keeper_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_boundary_keeper_id(p_group_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select g.boundary_keeper_id
  from public.groups g
  where g.id = p_group_id
$$;


--
-- Name: is_group_active_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_active_member(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;


--
-- Name: is_group_active_member_any(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_active_member_any(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;


--
-- Name: is_group_member_any(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_member_any(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status in ('pending','active')
  );
$$;


--
-- Name: is_match_organizer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_match_organizer(p_match_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.organizer_id = p_user_id
  );
$$;


--
-- Name: is_match_participant_active(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_match_participant_active(p_match_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
      and mp.status in ('pending','confirmed')
  );
$$;


--
-- Name: is_match_participant_confirmed(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_match_participant_confirmed(p_match_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
      and mp.status = 'confirmed'
  );
$$;


--
-- Name: is_user_in_match_scope(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_in_match_scope(p_match_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: match_participant_reconcile_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mp record;
BEGIN
  -- Fetch participant record
  SELECT
    id,
    status,
    user_id,
    guest_id,
    user_accepted_at,
    org_approved_at
  INTO v_mp
  FROM match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- Terminal state: do nothing if removed
  IF v_mp.status = 'removed' THEN
    RETURN;
  END IF;

  -- Guest participant: only needs org_approved_at
  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      -- Guest is effectively confirmed
      UPDATE match_participants
      SET status = 'confirmed'
      WHERE id = p_mp_id
        AND status != 'confirmed';  -- Only update if not already confirmed
    ELSE
      -- Guest is pending org approval
      UPDATE match_participants
      SET status = 'pending'
      WHERE id = p_mp_id
        AND status != 'pending';
    END IF;
    RETURN;
  END IF;

  -- User participant: needs both user_accepted_at AND org_approved_at
  IF v_mp.user_id IS NOT NULL THEN
    IF v_mp.user_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      -- User is effectively confirmed (both sides confirmed)
      UPDATE match_participants
      SET status = 'confirmed',
          confirmed_at = COALESCE(confirmed_at, now())  -- Set confirmed_at once
      WHERE id = p_mp_id
        AND status != 'confirmed';
    ELSE
      -- User is pending (waiting for one or both sides)
      UPDATE match_participants
      SET status = 'pending'
      WHERE id = p_mp_id
        AND status != 'pending';
    END IF;
    RETURN;
  END IF;

  -- Should never reach here (participant must have user_id or guest_id)
  RAISE EXCEPTION 'Invalid participant state: neither user_id nor guest_id set for participant %', p_mp_id;
END;
$$;


--
-- Name: FUNCTION match_participant_reconcile_status(p_mp_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.match_participant_reconcile_status(p_mp_id uuid) IS 'v1.3: Synchronizes match_participants.status based on dual confirmation fields (user_accepted_at, org_approved_at). Must be called by any RPC that modifies these fields. Idempotent.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status public.group_member_status DEFAULT 'pending'::public.group_member_status NOT NULL,
    join_method text DEFAULT 'invited'::text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    removed_at timestamp with time zone,
    removed_by uuid
);


--
-- Name: rpc_group_accept_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_group_accept_invite(p_group_id uuid) RETURNS public.group_members
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    boundary_keeper_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_group_create(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_group_create(p_name text, p_description text DEFAULT NULL::text) RETURNS public.groups
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_row public.groups;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Create the group
  insert into public.groups (name, description, created_by, boundary_keeper_id)
  values (p_name, p_description, v_user_id, v_user_id)
  returning * into v_row;

  -- Add creator as active member (required by RLS to read the group)
  insert into public.group_members (group_id, user_id, status, join_method, accepted_at)
  values (v_row.id, v_user_id, 'active', 'created', now());

  return v_row;
end;
$$;


--
-- Name: rpc_group_invite_user(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_group_invite_user(p_group_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing public.group_members%rowtype;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Only boundary keeper can invite
  IF v_group.boundary_keeper_id != v_caller_id THEN
    RAISE EXCEPTION 'Only boundary keeper can invite users';
  END IF;

  -- Cannot invite self
  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Check for existing membership
  SELECT * INTO v_existing
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Already active or pending
    IF v_existing.status IN ('active', 'pending') THEN
      RAISE EXCEPTION 'User is already a member or has a pending invite';
    END IF;

    -- Re-invite: removed → pending (clear removal audit, reset acceptance)
    UPDATE group_members
    SET status = 'pending',
        invited_by = v_caller_id,
        removed_at = NULL,
        removed_by = NULL,
        accepted_at = NULL
    WHERE id = v_existing.id;
  ELSE
    -- Fresh invite
    INSERT INTO group_members (group_id, user_id, status, join_method, invited_by)
    VALUES (p_group_id, p_user_id, 'pending', 'invited', v_caller_id);
  END IF;
END;
$$;


--
-- Name: FUNCTION rpc_group_invite_user(p_group_id uuid, p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_group_invite_user(p_group_id uuid, p_user_id uuid) IS 'Boundary keeper invites user to group. Handles re-invite of removed members.';


--
-- Name: rpc_group_leave(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_group_leave(p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group groups;
  v_membership group_members;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Boundary keeper cannot leave
  IF v_group.boundary_keeper_id = v_user_id THEN
    RAISE EXCEPTION 'Boundary keeper cannot leave the group';
  END IF;

  -- Get membership
  SELECT * INTO v_membership
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  IF v_membership.status = 'removed' THEN
    -- Already removed, idempotent
    RETURN;
  END IF;

  -- Remove member
  UPDATE group_members
  SET status = 'removed', removed_at = now()
  WHERE id = v_membership.id;
END;
$$;


--
-- Name: FUNCTION rpc_group_leave(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_group_leave(p_group_id uuid) IS 'User leaves a group. Sets status to removed. Boundary keeper cannot leave.';


--
-- Name: match_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    status public.match_participant_status DEFAULT 'pending'::public.match_participant_status NOT NULL,
    join_method public.match_join_method NOT NULL,
    user_id uuid,
    guest_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    removed_at timestamp with time zone,
    user_accepted_at timestamp with time zone,
    org_approved_at timestamp with time zone,
    org_approved_by uuid,
    nominated_by uuid,
    removed_by uuid,
    removal_note text,
    CONSTRAINT match_participants_exactly_one_identity CHECK ((((user_id IS NOT NULL) AND (guest_id IS NULL)) OR ((user_id IS NULL) AND (guest_id IS NOT NULL))))
);


--
-- Name: COLUMN match_participants.user_accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.match_participants.user_accepted_at IS 'v1.3: Timestamp when user confirmed availability/acceptance. NULL = not yet accepted. Required for user participants to become confirmed.';


--
-- Name: COLUMN match_participants.org_approved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.match_participants.org_approved_at IS 'v1.3: Timestamp when organizer approved this participant. NULL = not yet approved. Required for all participants to become confirmed.';


--
-- Name: COLUMN match_participants.org_approved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.match_participants.org_approved_by IS 'v1.3: User ID of the organizer who approved this participant. NULL if not yet approved.';


--
-- Name: COLUMN match_participants.nominated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.match_participants.nominated_by IS 'v1.3: User ID of the participant who nominated this user (for join_method=requested with nomination). NULL if not nominated or if direct request/invite.';


--
-- Name: COLUMN match_participants.removed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.match_participants.removed_by IS 'v1.3 CRITICAL: User ID who removed this participant. Must be set when status=removed. Used to distinguish user-withdrawal vs org-removal for reactivation logic.';


--
-- Name: COLUMN match_participants.removal_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.match_participants.removal_note IS 'v1.3: Optional note explaining why participant was removed (e.g., "declined", "rejected", "capacity reached").';


--
-- Name: rpc_match_accept_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_accept_invite(p_match_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mp match_participants;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp
  FROM match_participants
  WHERE match_id = p_match_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Check status
  IF v_mp.status = 'removed' THEN
    RAISE EXCEPTION 'Cannot accept: You were removed from this match. Wait for organizer reactivation.';
  END IF;

  IF v_mp.status = 'confirmed' THEN
    -- Already confirmed, idempotent
    RETURN v_mp;
  END IF;

  -- v1.3: Allow invited users AND nominated users (requested + nominated_by set)
  -- Block self-requested users (they already have user_accepted_at from the request RPC)
  IF v_mp.join_method = 'requested' AND v_mp.nominated_by IS NULL THEN
    RAISE EXCEPTION 'Self-requested participants already have acceptance recorded. Wait for organizer approval.';
  END IF;

  IF v_mp.join_method NOT IN ('invited', 'requested') THEN
    RAISE EXCEPTION 'This action is not available for your join method.';
  END IF;

  -- v1.3: Set user_accepted_at (idempotent with COALESCE)
  UPDATE match_participants
  SET user_accepted_at = COALESCE(user_accepted_at, now())
  WHERE id = v_mp.id;

  -- v1.3: Call reconcile (may transition to confirmed if org_approved_at exists)
  PERFORM match_participant_reconcile_status(v_mp.id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_accept_invite(p_match_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_accept_invite(p_match_id uuid) IS 'v1.3: User accepts invitation or nomination. Sets user_accepted_at. Allowed for invited and nominated (requested+nominated_by) participants. Becomes confirmed if ORG already approved.';


--
-- Name: rpc_match_add_guest_org(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_add_guest_org(p_match_id uuid, p_guest_display_name text, p_guest_notes text DEFAULT NULL::text) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_guest_id uuid;
  v_new_mp match_participants;
BEGIN
  -- Check permission: ORG only
  IF NOT is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can add guests directly';
  END IF;

  -- Create guest record
  INSERT INTO guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  -- Insert participant (ORG-added guest = immediately confirmed)
  INSERT INTO match_participants (
    match_id,
    guest_id,
    join_method,
    status,
    org_approved_at,   -- v1.3: ORG-added guest = auto-approved
    org_approved_by,
    created_by
  ) VALUES (
    p_match_id,
    v_new_guest_id,
    'guest_add',
    'confirmed',       -- v1.3: ORG-added = immediately confirmed
    now(),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  -- v1.3: Call reconcile (will stay confirmed for guest with org_approved_at)
  PERFORM match_participant_reconcile_status(v_new_mp.id);

  -- Return updated record
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_add_guest_org(p_match_id uuid, p_guest_display_name text, p_guest_notes text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_add_guest_org(p_match_id uuid, p_guest_display_name text, p_guest_notes text) IS 'v1.3: ORG adds guest. Guest is immediately confirmed (no approval needed).';


--
-- Name: rpc_match_add_guest_participant(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_add_guest_participant(p_match_id uuid, p_guest_display_name text, p_guest_notes text DEFAULT NULL::text) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_match record;
  v_new_guest_id uuid;
  v_new_mp match_participants;
BEGIN
  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Check permission: confirmed participant with can_participants_add_guests
  IF NOT (
    is_match_participant_confirmed(p_match_id, auth.uid())
    AND v_match.can_participants_add_guests
  ) THEN
    RAISE EXCEPTION 'You do not have permission to add guests';
  END IF;

  -- Create guest record
  INSERT INTO guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  -- Insert participant (Participant-added guest = pending, needs ORG approval)
  INSERT INTO match_participants (
    match_id,
    guest_id,
    join_method,
    status,
    org_approved_at,   -- v1.3: NULL (waiting for ORG approval)
    created_by
  ) VALUES (
    p_match_id,
    v_new_guest_id,
    'guest_add',
    'pending',         -- v1.3: Participant-added = pending approval
    NULL,              -- Waiting for ORG
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  -- v1.3: Call reconcile (will stay pending until ORG approves)
  PERFORM match_participant_reconcile_status(v_new_mp.id);

  -- Return updated record
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_add_guest_participant(p_match_id uuid, p_guest_display_name text, p_guest_notes text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_add_guest_participant(p_match_id uuid, p_guest_display_name text, p_guest_notes text) IS 'v1.3: Participant adds guest. Guest is pending (requires ORG approval to become confirmed).';


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    status public.match_status DEFAULT 'active'::public.match_status NOT NULL,
    admission_mode public.match_admission_mode DEFAULT 'invite'::public.match_admission_mode NOT NULL,
    club_id uuid,
    court_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    match_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date NOT NULL,
    start_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    duration_minutes integer DEFAULT 90 NOT NULL,
    game_type text DEFAULT 'doubles'::text NOT NULL,
    required_count integer DEFAULT 4 NOT NULL,
    invitation_scope_group_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    can_participants_invite_users boolean DEFAULT false NOT NULL,
    can_participants_add_guests boolean DEFAULT false NOT NULL,
    can_participants_manage_participants boolean DEFAULT false NOT NULL,
    formed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_match_create(integer, text, date, time without time zone, integer, uuid, uuid[], uuid[], boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_create(p_required_count integer DEFAULT 4, p_game_type text DEFAULT 'doubles'::text, p_match_date date DEFAULT NULL::date, p_start_time time without time zone DEFAULT NULL::time without time zone, p_duration_minutes integer DEFAULT NULL::integer, p_club_id uuid DEFAULT NULL::uuid, p_court_ids uuid[] DEFAULT NULL::uuid[], p_invitation_scope_group_ids uuid[] DEFAULT NULL::uuid[], p_can_participants_invite_users boolean DEFAULT false, p_can_participants_add_guests boolean DEFAULT false, p_can_participants_manage_participants boolean DEFAULT false) RETURNS public.matches
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match matches;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- 1. Create match (omit NULLs to use column defaults)
  INSERT INTO matches (
    organizer_id,
    required_count,
    game_type,
    match_date,
    start_time,
    duration_minutes,
    club_id,
    court_ids,
    invitation_scope_group_ids,
    can_participants_invite_users,
    can_participants_add_guests,
    can_participants_manage_participants
  ) VALUES (
    v_user_id,
    COALESCE(p_required_count, 4),
    COALESCE(p_game_type, 'doubles'),
    COALESCE(p_match_date, (now() AT TIME ZONE 'utc')::date),
    COALESCE(p_start_time, time '09:00'),
    COALESCE(p_duration_minutes, 90),
    p_club_id,
    COALESCE(p_court_ids, '{}'),
    COALESCE(p_invitation_scope_group_ids, '{}'),
    COALESCE(p_can_participants_invite_users, false),
    COALESCE(p_can_participants_add_guests, false),
    COALESCE(p_can_participants_manage_participants, false)
  )
  RETURNING * INTO v_match;

  -- 2. Auto-add organizer as confirmed participant
  --    Organizer = "creation-time dual confirmation" (both sides satisfied)
  --    Direct-write confirmed + reconcile for system-wide consistency
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, org_approved_by, created_by
  ) VALUES (
    v_match.id, v_user_id, 'invited', 'confirmed',
    now(), now(), v_user_id, v_user_id
  );

  -- Reconcile (idempotent: both fields set → stays confirmed)
  PERFORM match_participant_reconcile_status(
    (SELECT id FROM match_participants WHERE match_id = v_match.id AND user_id = v_user_id)
  );

  RETURN v_match;
END;
$$;


--
-- Name: FUNCTION rpc_match_create(p_required_count integer, p_game_type text, p_match_date date, p_start_time time without time zone, p_duration_minutes integer, p_club_id uuid, p_court_ids uuid[], p_invitation_scope_group_ids uuid[], p_can_participants_invite_users boolean, p_can_participants_add_guests boolean, p_can_participants_manage_participants boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_create(p_required_count integer, p_game_type text, p_match_date date, p_start_time time without time zone, p_duration_minutes integer, p_club_id uuid, p_court_ids uuid[], p_invitation_scope_group_ids uuid[], p_can_participants_invite_users boolean, p_can_participants_add_guests boolean, p_can_participants_manage_participants boolean) IS 'Creates a match and auto-adds organizer as confirmed participant. SECURITY DEFINER bypasses RLS.';


--
-- Name: rpc_match_invite_user(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_match record;
  v_existing match_participants;
  v_new_mp match_participants;
BEGIN
  -- SECURITY DEFINER baseline
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- v1.3: ORG-only (participant invite → use rpc_match_nominate_user)
  IF NOT is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can invite users';
  END IF;

  -- Cannot invite self
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Check for existing participant record
  SELECT * INTO v_existing
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Already pending or confirmed
    IF v_existing.status IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'User is already a participant in this match';
    END IF;

    -- Removed: re-invite
    IF v_existing.status = 'removed' THEN
      UPDATE match_participants
      SET
        status = 'pending',
        join_method = 'invited',
        user_accepted_at = NULL,
        org_approved_at = now(),
        org_approved_by = auth.uid(),
        nominated_by = NULL,
        removed_at = NULL,
        removed_by = NULL,
        removal_note = NULL,
        confirmed_at = NULL
      WHERE id = v_existing.id;

      PERFORM match_participant_reconcile_status(v_existing.id);
      SELECT * INTO v_new_mp FROM match_participants WHERE id = v_existing.id;
      RETURN v_new_mp;
    END IF;

    -- Defensive
    RAISE EXCEPTION 'Invalid participant state';
  END IF;

  -- Fresh invite
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, org_approved_by, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'invited', 'pending',
    NULL, now(), auth.uid(), NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_invite_user(p_match_id uuid, p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid) IS 'v1.3: ORG-only invite. Re-invite allowed for any removed user. Clears removed_* on restart.';


--
-- Name: rpc_match_nominate_user(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_match record;
  v_existing match_participants;
  v_new_mp match_participants;
BEGIN
  -- SECURITY DEFINER baseline
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Check permission: ORG or confirmed participant with can_participants_invite_users
  IF NOT (
    is_match_organizer(p_match_id, auth.uid())
    OR (
      is_match_participant_confirmed(p_match_id, auth.uid())
      AND v_match.can_participants_invite_users
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to nominate users';
  END IF;

  -- Cannot nominate self
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot nominate yourself (use request join instead)';
  END IF;

  -- Check for existing participant record
  SELECT * INTO v_existing
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Already pending or confirmed
    IF v_existing.status IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'User is already a participant';
    END IF;

    -- Removed: re-nominate
    IF v_existing.status = 'removed' THEN
      UPDATE match_participants
      SET
        status = 'pending',
        join_method = 'requested',
        nominated_by = auth.uid(),
        user_accepted_at = NULL,
        org_approved_at = NULL,
        org_approved_by = NULL,
        removed_at = NULL,
        removed_by = NULL,
        removal_note = NULL,
        confirmed_at = NULL
      WHERE id = v_existing.id;

      PERFORM match_participant_reconcile_status(v_existing.id);
      SELECT * INTO v_new_mp FROM match_participants WHERE id = v_existing.id;
      RETURN v_new_mp;
    END IF;

    -- Defensive
    RAISE EXCEPTION 'Invalid participant state';
  END IF;

  -- Fresh nomination
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'requested', 'pending',
    NULL, NULL, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_nominate_user(p_match_id uuid, p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid) IS 'v1.3: Nominate user. Re-nomination allowed for any removed user. join_method=requested, nominated_by=caller. Requires user accept + ORG approve. Clears removed_* on restart.';


--
-- Name: rpc_match_org_approve_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_org_approve_participant(p_match_participant_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mp match_participants;
  v_match_id uuid;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_match_participant_id;
  END IF;

  v_match_id := v_mp.match_id;

  -- v1.3: ORG ONLY (no MP approve)
  IF NOT is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can approve participants';
  END IF;

  -- Only pending participants can be approved
  IF v_mp.status != 'pending' THEN
    RAISE EXCEPTION 'Participant is not pending approval';
  END IF;

  -- v1.3: Set org_approved_at (idempotent with COALESCE)
  UPDATE match_participants
  SET
    org_approved_at = COALESCE(org_approved_at, now()),
    org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  -- v1.3: Call reconcile (may transition to confirmed if user_accepted_at exists)
  PERFORM match_participant_reconcile_status(p_match_participant_id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_org_approve_participant(p_match_participant_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_org_approve_participant(p_match_participant_id uuid) IS 'v1.3: ORG approves participant. ORG ONLY. Only pending participants can be approved.';


--
-- Name: rpc_match_reactivate_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_reactivate_participant(p_match_participant_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mp match_participants;
  v_match_id uuid;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_match_participant_id;
  END IF;

  v_match_id := v_mp.match_id;

  -- v1.3: ORG ONLY
  IF NOT is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can reactivate participants';
  END IF;

  -- Check status
  IF v_mp.status != 'removed' THEN
    -- Not removed, idempotent (already active)
    RETURN v_mp;
  END IF;

  -- v1.3 KEY: Only change status to pending
  -- DO NOT modify user_accepted_at or org_approved_at
  -- Preserve historical confirmation facts
  UPDATE match_participants
  SET status = 'pending'
  WHERE id = p_match_participant_id;

  -- v1.3: Call reconcile
  -- If both user_accepted_at and org_approved_at exist, will immediately go to confirmed
  -- If one is missing, will stay pending until that side confirms
  PERFORM match_participant_reconcile_status(p_match_participant_id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_reactivate_participant(p_match_participant_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_reactivate_participant(p_match_participant_id uuid) IS 'v1.3 CRITICAL: ORG reactivates removed participant. Only changes status to pending. Does NOT modify confirmation fields. Reconcile determines final status based on existing fields.';


--
-- Name: rpc_match_remove_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_remove_participant(p_match_participant_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mp match_participants;
  v_match_id uuid;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_match_participant_id;
  END IF;

  v_match_id := v_mp.match_id;

  -- Check permission: ORG always, or confirmed MP with can_participants_manage_participants
  IF NOT (
    is_match_organizer(v_match_id, auth.uid())
    OR (
      is_match_participant_confirmed(v_match_id, auth.uid())
      AND (SELECT can_participants_manage_participants FROM matches WHERE id = v_match_id)
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to remove participants';
  END IF;

  -- Check status
  IF v_mp.status = 'removed' THEN
    -- Already removed, idempotent
    RETURN v_mp;
  END IF;

  IF v_mp.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Cannot remove participant with status: %', v_mp.status;
  END IF;

  -- v1.3: Set status to removed + record who removed
  UPDATE match_participants
  SET
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid(),  -- v1.3 KEY: Record ORG/manager removal
    removal_note = CASE
      WHEN v_mp.status = 'pending' AND v_mp.join_method = 'requested' THEN 'Request rejected by organizer'
      WHEN v_mp.status = 'pending' AND v_mp.join_method = 'invited' THEN 'Invitation revoked by organizer'
      WHEN v_mp.status = 'confirmed' THEN 'Removed by organizer'
      ELSE 'Removed'
    END
  WHERE id = p_match_participant_id;

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_remove_participant(p_match_participant_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_remove_participant(p_match_participant_id uuid) IS 'v1.3: ORG/manager removes participant. Sets status=removed and removed_by=remover_id. Can be reactivated by ORG.';


--
-- Name: rpc_match_request_join(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_request_join(p_match_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_match record;
  v_existing match_participants;
  v_new_mp match_participants;
BEGIN
  -- SECURITY DEFINER baseline
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Check for existing participant record
  SELECT * INTO v_existing
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF FOUND THEN
    -- Already pending or confirmed
    IF v_existing.status IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'You are already a participant in this match';
    END IF;

    -- Removed: re-request (scope NOT required — had prior relationship)
    IF v_existing.status = 'removed' THEN
      UPDATE match_participants
      SET
        status = 'pending',
        join_method = 'requested',
        user_accepted_at = now(),
        org_approved_at = NULL,
        org_approved_by = NULL,
        nominated_by = NULL,
        removed_at = NULL,
        removed_by = NULL,
        removal_note = NULL,
        confirmed_at = NULL
      WHERE id = v_existing.id;

      PERFORM match_participant_reconcile_status(v_existing.id);
      SELECT * INTO v_new_mp FROM match_participants WHERE id = v_existing.id;
      RETURN v_new_mp;
    END IF;

    -- Defensive
    RAISE EXCEPTION 'Invalid participant state';
  END IF;

  -- First entry: scope required
  IF NOT is_user_in_match_scope(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not eligible to request join this match (not in scope groups)';
  END IF;

  -- Fresh request
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, auth.uid(), 'requested', 'pending',
    now(), NULL, NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_request_join(p_match_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_request_join(p_match_id uuid) IS 'v1.3: User requests to join. Re-request allowed for any removed user (no scope check). First entry requires scope. Clears removed_* on restart.';


--
-- Name: rpc_match_user_withdraw(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_match_user_withdraw(p_match_id uuid) RETURNS public.match_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mp match_participants;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp
  FROM match_participants
  WHERE match_id = p_match_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Check status
  IF v_mp.status = 'removed' THEN
    -- Already removed, idempotent
    RETURN v_mp;
  END IF;

  IF v_mp.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Cannot withdraw from status: %', v_mp.status;
  END IF;

  -- v1.3: Set status to removed + record who removed
  UPDATE match_participants
  SET
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid(),  -- v1.3 KEY: Record user self-withdrawal
    removal_note = CASE
      WHEN v_mp.join_method = 'invited' AND v_mp.status = 'pending' THEN 'User declined invitation'
      WHEN v_mp.status = 'confirmed' THEN 'User left match'
      ELSE 'User withdrew'
    END
  WHERE id = v_mp.id;

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;


--
-- Name: FUNCTION rpc_match_user_withdraw(p_match_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_match_user_withdraw(p_match_id uuid) IS 'v1.3: User withdraws from match (decline invite or leave). Sets status=removed and removed_by=user_id. Can be reactivated by ORG.';


--
-- Name: trg_set_formed_at_once(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_set_formed_at_once() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_required int;
  v_confirmed int;
  v_is_formed boolean;
begin
  -- Recompute for the match affected by participant change
  select m.required_count into v_required
  from public.matches m
  where m.id = new.match_id;

  select count(*)::int into v_confirmed
  from public.match_participants mp
  where mp.match_id = new.match_id
    and mp.status = 'confirmed';

  v_is_formed := (v_confirmed >= v_required);

  -- Write formed_at only once: from NULL -> now() when first formed
  if v_is_formed then
    update public.matches m
    set formed_at = coalesce(m.formed_at, now())
    where m.id = new.match_id;
  end if;

  return new;
end;
$$;


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clubs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location_text text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: courts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    court_code text NOT NULL,
    surface text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: match_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.match_counts AS
 SELECT m.id AS match_id,
    m.required_count,
    (count(*) FILTER (WHERE (mp.status = 'confirmed'::public.match_participant_status)))::integer AS confirmed_count
   FROM (public.matches m
     LEFT JOIN public.match_participants mp ON ((mp.match_id = m.id)))
  GROUP BY m.id, m.required_count;


--
-- Name: match_formed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.match_formed AS
 SELECT match_id,
    required_count,
    confirmed_count,
    (confirmed_count >= required_count) AS is_formed
   FROM public.match_counts mc;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    middle_name text,
    last_name text DEFAULT ''::text NOT NULL,
    display_name text,
    avatar_url text,
    gender text DEFAULT 'unspecified'::text,
    level text,
    availability_note text,
    plays_singles boolean DEFAULT true NOT NULL,
    plays_doubles boolean DEFAULT true NOT NULL,
    primary_club_id uuid,
    secondary_club_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: courts courts_club_id_court_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_club_id_court_code_key UNIQUE (club_id, court_code);


--
-- Name: courts courts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: guests guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_pkey PRIMARY KEY (id);


--
-- Name: match_participants match_participants_match_id_guest_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_match_id_guest_id_key UNIQUE (match_id, guest_id);


--
-- Name: match_participants match_participants_match_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_match_id_user_id_key UNIQUE (match_id, user_id);


--
-- Name: match_participants match_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: match_participants set_formed_at_once_on_mp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_formed_at_once_on_mp AFTER INSERT OR UPDATE OF status ON public.match_participants FOR EACH ROW EXECUTE FUNCTION public.trg_set_formed_at_once();


--
-- Name: courts courts_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: group_members group_members_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: groups groups_boundary_keeper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_boundary_keeper_id_fkey FOREIGN KEY (boundary_keeper_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: guests guests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: match_participants match_participants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: match_participants match_participants_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE CASCADE;


--
-- Name: match_participants match_participants_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_participants match_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: matches matches_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;


--
-- Name: matches matches_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_primary_club_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_primary_club_fk FOREIGN KEY (primary_club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;


--
-- Name: clubs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

--
-- Name: clubs clubs_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clubs_select_auth ON public.clubs FOR SELECT TO authenticated USING (true);


--
-- Name: courts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;

--
-- Name: courts courts_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courts_select_auth ON public.courts FOR SELECT TO authenticated USING (true);


--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members group_members_insert_bk; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_insert_bk ON public.group_members FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid())))) AND (invited_by = auth.uid())));


--
-- Name: group_members group_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_select ON public.group_members FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid())))) OR ((status = 'active'::public.group_member_status) AND public.is_group_active_member(group_id, auth.uid())) OR (user_id = auth.uid())));


--
-- Name: group_members group_members_select_active_roster_for_active_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_select_active_roster_for_active_members ON public.group_members FOR SELECT TO authenticated USING (((status = 'active'::public.group_member_status) AND public.is_group_active_member_any(group_id, auth.uid())));


--
-- Name: group_members group_members_select_bk; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_select_bk ON public.group_members FOR SELECT TO authenticated USING ((public.group_boundary_keeper_id(group_id) = auth.uid()));


--
-- Name: group_members group_members_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_select_self ON public.group_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: group_members group_members_update_bk; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_update_bk ON public.group_members FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid())))));


--
-- Name: group_members group_members_update_self_accept; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_update_self_accept ON public.group_members FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (status = 'pending'::public.group_member_status))) WITH CHECK (((user_id = auth.uid()) AND (status = 'active'::public.group_member_status)));


--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_insert_self ON public.groups FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND (boundary_keeper_id = auth.uid())));


--
-- Name: groups groups_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_select_member ON public.groups FOR SELECT TO authenticated USING (public.is_group_member_any(id, auth.uid()));


--
-- Name: groups groups_update_bk; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_update_bk ON public.groups FOR UPDATE TO authenticated USING ((boundary_keeper_id = auth.uid())) WITH CHECK ((boundary_keeper_id = auth.uid()));


--
-- Name: guests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

--
-- Name: guests guests_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guests_insert_auth ON public.guests FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));


--
-- Name: guests guests_select_for_match_people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guests_select_for_match_people ON public.guests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.match_participants mp
     JOIN public.matches m ON ((m.id = mp.match_id)))
  WHERE ((mp.guest_id = guests.id) AND ((m.organizer_id = auth.uid()) OR public.is_match_participant_active(m.id, auth.uid()))))));


--
-- Name: match_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: match_participants match_participants_insert_guest_by_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_insert_guest_by_org ON public.match_participants FOR INSERT TO authenticated WITH CHECK ((public.is_match_organizer(match_id, auth.uid()) AND (join_method = 'guest_add'::public.match_join_method) AND (created_by = auth.uid()) AND (guest_id IS NOT NULL)));


--
-- Name: match_participants match_participants_insert_guest_confirmed_if_invite; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_insert_guest_confirmed_if_invite ON public.match_participants FOR INSERT TO authenticated WITH CHECK ((public.can_add_guests(match_id, auth.uid()) AND (join_method = 'guest_add'::public.match_join_method) AND (created_by = auth.uid()) AND (guest_id IS NOT NULL) AND (user_id IS NULL) AND (status = 'confirmed'::public.match_participant_status) AND (EXISTS ( SELECT 1
   FROM public.matches m
  WHERE ((m.id = match_participants.match_id) AND (m.admission_mode = 'invite'::public.match_admission_mode))))));


--
-- Name: match_participants match_participants_insert_guest_pending_if_request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_insert_guest_pending_if_request ON public.match_participants FOR INSERT TO authenticated WITH CHECK ((public.can_add_guests(match_id, auth.uid()) AND (join_method = 'guest_add'::public.match_join_method) AND (created_by = auth.uid()) AND (guest_id IS NOT NULL) AND (user_id IS NULL) AND (status = 'pending'::public.match_participant_status) AND (EXISTS ( SELECT 1
   FROM public.matches m
  WHERE ((m.id = match_participants.match_id) AND (m.admission_mode = 'request'::public.match_admission_mode))))));


--
-- Name: match_participants match_participants_insert_invite_by_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_insert_invite_by_org ON public.match_participants FOR INSERT TO authenticated WITH CHECK ((public.can_invite_users(match_id, auth.uid()) AND (join_method = 'invited'::public.match_join_method) AND (status = 'pending'::public.match_participant_status) AND (created_by = auth.uid()) AND (user_id IS NOT NULL) AND (guest_id IS NULL)));


--
-- Name: match_participants match_participants_insert_request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_insert_request ON public.match_participants FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (join_method = 'requested'::public.match_join_method) AND (status = 'pending'::public.match_participant_status) AND (created_by = auth.uid()) AND public.is_user_in_match_scope(match_id, auth.uid())));


--
-- Name: match_participants match_participants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_select ON public.match_participants FOR SELECT TO authenticated USING ((public.is_match_organizer(match_id, auth.uid()) OR (user_id = auth.uid()) OR (public.is_match_participant_active(match_id, auth.uid()) AND (status <> 'removed'::public.match_participant_status))));


--
-- Name: POLICY match_participants_select ON match_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY match_participants_select ON public.match_participants IS 'v1.3: Organizer sees all. User always sees own record (including removed). Active participants see other active.';


--
-- Name: match_participants match_participants_update_org_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_update_org_only ON public.match_participants FOR UPDATE TO authenticated USING (public.is_match_organizer(match_id, auth.uid())) WITH CHECK (public.is_match_organizer(match_id, auth.uid()));


--
-- Name: match_participants match_participants_update_self_invite; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_update_self_invite ON public.match_participants FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (join_method = 'invited'::public.match_join_method) AND (status = 'pending'::public.match_participant_status))) WITH CHECK (((user_id = auth.uid()) AND (join_method = 'invited'::public.match_join_method) AND (status = ANY (ARRAY['confirmed'::public.match_participant_status, 'removed'::public.match_participant_status]))));


--
-- Name: match_participants match_participants_update_self_leave; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_update_self_leave ON public.match_participants FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (status = ANY (ARRAY['pending'::public.match_participant_status, 'confirmed'::public.match_participant_status])))) WITH CHECK (((user_id = auth.uid()) AND (status = 'removed'::public.match_participant_status)));


--
-- Name: matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

--
-- Name: matches matches_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matches_insert_self ON public.matches FOR INSERT TO authenticated WITH CHECK ((organizer_id = auth.uid()));


--
-- Name: matches matches_select_visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matches_select_visibility ON public.matches FOR SELECT TO authenticated USING (((organizer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.match_participants mp
  WHERE ((mp.match_id = matches.id) AND (mp.user_id = auth.uid())))) OR public.is_user_in_match_scope(id, auth.uid())));


--
-- Name: matches matches_update_organizer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matches_update_organizer ON public.matches FOR UPDATE TO authenticated USING ((organizer_id = auth.uid())) WITH CHECK ((organizer_id = auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: profiles profiles_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: profiles profiles_upsert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_upsert_self ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict UkxPBUwPWEWs45obTieJ30gEci3mAcimFFpVHjGqHDb87jIvvUXr9hqrOrSkdWW

