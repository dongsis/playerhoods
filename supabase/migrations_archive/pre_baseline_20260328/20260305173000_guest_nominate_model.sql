-- v1.7: Unified guest / Contact Player model using NOMINATE flow.
-- A) rpc_match_nominate_guest(p_match_id, p_guest_id)
-- B) rpc_match_delegate_confirm_guest(p_match_participant_id)
-- C) Deprecate old add_guest RPCs (rpc_match_add_guest_org/participant, rpc_match_invite_guest_from_roster)

-- A) Nominate guest (Contact Player) into a match.
CREATE OR REPLACE FUNCTION public.rpc_match_nominate_guest(p_match_id uuid, p_guest_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match     public.matches%rowtype;
  v_uid       uuid := auth.uid();
  v_existing  public.match_participants%rowtype;
  v_mp        public.match_participants%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  -- Caller gate: organizer or active participant in this match.
  IF NOT (
    public.is_match_organizer(p_match_id, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to nominate a contact player for this match';
  END IF;

  -- Caller must have this guest in their personal roster.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id      = p_guest_id
  ) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  -- Guest must exist and be active.
  IF NOT EXISTS (
    SELECT 1 FROM public.guests g
    WHERE g.id = p_guest_id AND g.status = 'active'
  ) THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  -- Prevent duplicate active row for same (match, guest).
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND guest_id = p_guest_id
    AND removed_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'guest_already_active';
  END IF;

  INSERT INTO public.match_participants (
    match_id,
    status,
    join_method,
    guest_id,
    created_by,
    created_at,
    nominated_by,
    participant_accepted_at,
    participant_accepted_via,
    org_approved_at,
    org_approved_by
  ) VALUES (
    p_match_id,
    'pending',
    'nominated',
    p_guest_id,
    v_uid,
    now(),
    v_uid,
    NULL,
    NULL,
    CASE WHEN v_match.organizer_id = v_uid THEN now() ELSE NULL END,
    CASE WHEN v_match.organizer_id = v_uid THEN v_uid ELSE NULL END
  )
  RETURNING * INTO v_mp;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_guest(p_match_id uuid, p_guest_id uuid) IS
'v1.7: Nominate Contact Player into match. join_method=nominated, status=pending. Organizer caller writes org_approved_at immediately; others leave org_approved_at NULL. participant_accepted_at always NULL at insert (delegate confirm sets it).';


-- B) Delegate-confirm guest can come (any active participant, including organizer).
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_guest(p_match_participant_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mp  public.match_participants%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF v_mp.guest_id IS NULL THEN
    RAISE EXCEPTION 'not_guest_participant';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot confirm a removed participant';
  END IF;

  -- Caller must be an active participant in this match (user-side only).
  IF NOT public.is_user_match_associated(v_mp.match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Idempotent: if already accepted, just return current row.
  IF v_mp.participant_accepted_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  UPDATE public.match_participants
  SET
    participant_accepted_at  = now(),
    participant_accepted_via = 'delegate_manual'
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES
    (v_mp.match_id, v_mp.id, 'delegate_manual_confirm', NULL, v_uid);

  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_guest(p_match_participant_id uuid) IS
'v1.7: Any active participant (including organizer) confirms a guest can come. Writes participant_accepted_at + via=delegate_manual only. ORG approval flows via rpc_match_org_approve_participant. Reconcile enforces confirmed ⇔ participant_accepted_at AND org_approved_at.';


-- C) Deprecate legacy add_guest RPCs to avoid parallel guest flows.

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_org(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_rpc_match_nominate_guest';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_org(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_rpc_match_nominate_guest';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_participant(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_rpc_match_nominate_guest';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_participant(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_rpc_match_nominate_guest';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_invite_guest_from_roster(
  p_match_id uuid,
  p_guest_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_rpc_match_nominate_guest';
END;
$$;

