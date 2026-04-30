ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS invitation_scope_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.matches.invitation_scope_user_ids
IS 'Direct user-level request scope. Users listed here can see the match and request to join without requiring scope-group membership.';

CREATE OR REPLACE FUNCTION public.is_user_in_match_scope(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND (
        p_user_id = ANY(COALESCE(m.invitation_scope_user_ids, '{}'::uuid[]))
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(m.invitation_scope_group_ids, '{}'::uuid[])) AS gid
          WHERE public.is_group_active_member(gid, p_user_id)
        )
      )
  );
END;
$$;

ALTER FUNCTION public.is_user_in_match_scope(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.is_user_in_match_scope(uuid, uuid)
IS 'Returns true when the user is directly listed in invitation_scope_user_ids or is an active member of any invitation_scope_group_ids.';

CREATE OR REPLACE FUNCTION public.rpc_match_create(
  p_required_count integer DEFAULT 4,
  p_game_type text DEFAULT 'doubles'::text,
  p_match_date date DEFAULT NULL::date,
  p_start_time time without time zone DEFAULT NULL::time without time zone,
  p_duration_minutes integer DEFAULT NULL::integer,
  p_venue_id uuid DEFAULT NULL::uuid,
  p_court_ids uuid[] DEFAULT NULL::uuid[],
  p_invitation_scope_group_ids uuid[] DEFAULT NULL::uuid[],
  p_invitation_scope_user_ids uuid[] DEFAULT NULL::uuid[],
  p_can_participants_invite_users boolean DEFAULT true,
  p_can_participants_add_guests boolean DEFAULT false,
  p_can_participants_manage_participants boolean DEFAULT false
) RETURNS public.matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match   matches;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.matches (
    organizer_id,
    required_count,
    game_type,
    match_date,
    start_time,
    duration_minutes,
    venue_id,
    court_ids,
    invitation_scope_group_ids,
    invitation_scope_user_ids,
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
    p_venue_id,
    COALESCE(p_court_ids, '{}'),
    COALESCE(p_invitation_scope_group_ids, '{}'),
    COALESCE(p_invitation_scope_user_ids, '{}'),
    COALESCE(p_can_participants_invite_users, true),
    COALESCE(p_can_participants_add_guests, false),
    COALESCE(p_can_participants_manage_participants, false)
  )
  RETURNING * INTO v_match;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, created_by
  ) VALUES (
    v_match.id, v_user_id, 'invited',
    now(), 'in_app',
    now(), v_user_id, v_user_id
  );

  RETURN v_match;
END;
$$;

ALTER FUNCTION public.rpc_match_create(integer, text, date, time without time zone, integer, uuid, uuid[], uuid[], uuid[], boolean, boolean, boolean) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_create(integer, text, date, time without time zone, integer, uuid, uuid[], uuid[], uuid[], boolean, boolean, boolean)
IS 'Creates a match and auto-adds the organizer as confirmed participant. Supports both group-level and direct-user request scope.';

GRANT ALL ON FUNCTION public.rpc_match_create(integer, text, date, time without time zone, integer, uuid, uuid[], uuid[], uuid[], boolean, boolean, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_create(integer, text, date, time without time zone, integer, uuid, uuid[], uuid[], uuid[], boolean, boolean, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_match_request_join(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_existing public.match_participants%rowtype;
  v_uid      uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.organizer_id = v_uid THEN
    RAISE EXCEPTION 'Organizer cannot request to join their own match';
  END IF;

  IF (
    array_length(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), 1) IS NULL
    AND array_length(COALESCE(v_match.invitation_scope_user_ids, '{}'::uuid[]), 1) IS NULL
  ) THEN
    RAISE EXCEPTION 'This match is not open for join requests (no scope configured)';
  END IF;

  IF NOT public.is_user_in_match_scope(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not eligible to request to join this match (not in request scope)';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = v_uid;

  IF FOUND AND v_existing.removed_at IS NULL THEN
    RAISE EXCEPTION 'You are already a participant in this match';
  END IF;

  RETURN public.apply_participant_admission(p_match_id, v_uid, v_uid, 'requested');
END;
$$;

ALTER FUNCTION public.rpc_match_request_join(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_request_join(uuid)
IS 'User requests to join. Eligible when directly scoped via invitation_scope_user_ids or when in any configured scope group. Removed users can re-request.';
