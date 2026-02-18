-- RPC: rpc_match_create
-- Creates a match and auto-adds organizer as confirmed participant.
-- All writes go through this SECURITY DEFINER function (bypasses RLS).

CREATE OR REPLACE FUNCTION public.rpc_match_create(
  p_required_count int DEFAULT 4,
  p_game_type text DEFAULT 'doubles',
  p_match_date date DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_duration_minutes int DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_court_ids uuid[] DEFAULT NULL,
  p_invitation_scope_group_ids uuid[] DEFAULT NULL,
  p_can_participants_invite_users boolean DEFAULT false,
  p_can_participants_add_guests boolean DEFAULT false,
  p_can_participants_manage_participants boolean DEFAULT false
)
RETURNS matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION rpc_match_create IS
  'Creates a match and auto-adds organizer as confirmed participant. SECURITY DEFINER bypasses RLS.';

GRANT EXECUTE ON FUNCTION rpc_match_create TO authenticated;
