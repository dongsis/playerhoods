ALTER TABLE public.matches
  ALTER COLUMN can_participants_invite_users SET DEFAULT true;

UPDATE public.matches
SET can_participants_invite_users = true
WHERE can_participants_invite_users = false;

CREATE OR REPLACE FUNCTION public.rpc_match_create(
  p_required_count integer DEFAULT 4,
  p_game_type text DEFAULT 'doubles'::text,
  p_match_date date DEFAULT NULL::date,
  p_start_time time without time zone DEFAULT NULL::time without time zone,
  p_duration_minutes integer DEFAULT NULL::integer,
  p_venue_id uuid DEFAULT NULL::uuid,
  p_court_ids uuid[] DEFAULT NULL::uuid[],
  p_invitation_scope_group_ids uuid[] DEFAULT NULL::uuid[],
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
  v_mp_id   uuid;
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
  )
  RETURNING id INTO v_mp_id;

  PERFORM public.match_participant_reconcile_status(v_mp_id);

  RETURN v_match;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_create(integer, text, date, time without time zone, integer, uuid, uuid[], uuid[], boolean, boolean, boolean) IS
  'v1.8.2: Match creation keeps participant nomination enabled by default. can_participants_invite_users is always-on for canonical product flow; manage/remove remains separately configurable.';
