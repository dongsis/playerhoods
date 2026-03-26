-- 20260305180000_guest_nominate_model_v2.sql
-- v1.7: Guest / Contact Player NOMINATE model

-- ============================================================================
-- A) Reconcile: unified confirmed invariant for user + guest
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp          record;
  v_accepted_at timestamptz;
BEGIN
  SELECT
    id,
    status,
    user_id,
    guest_id,
    participant_accepted_at,
    org_approved_at,
    removed_at,
    confirmed_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- 1) Removed: canonical removal path (user + guest 一致)
  IF v_mp.removed_at IS NOT NULL
     OR v_mp.status = 'removed'::public.match_participant_status
  THEN
    UPDATE public.match_participants
    SET status       = 'removed'::public.match_participant_status,
        confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (
        status    <> 'removed'::public.match_participant_status
        OR confirmed_at IS NOT NULL
        OR removed_at   IS NULL
      );
    RETURN;
  END IF;

  -- 2) Confirmed ⇔ participant_accepted_at AND org_approved_at
  v_accepted_at := v_mp.participant_accepted_at;

  IF v_accepted_at IS NOT NULL
     AND v_mp.org_approved_at IS NOT NULL
  THEN
    UPDATE public.match_participants
    SET status       = 'confirmed'::public.match_participant_status,
        confirmed_at = COALESCE(
          confirmed_at,
          GREATEST(v_accepted_at, v_mp.org_approved_at)
        )
    WHERE id = p_mp_id
      AND (
        status <> 'confirmed'::public.match_participant_status
        OR confirmed_at IS NULL
      );
    RETURN;
  END IF;

  -- 3) Pending fallback（只要还没 removed 且不满足 confirmed，就一律 pending）
  UPDATE public.match_participants
  SET status       = 'pending'::public.match_participant_status,
      confirmed_at = NULL
  WHERE id = p_mp_id
    AND (
      status <> 'pending'::public.match_participant_status
      OR confirmed_at IS NOT NULL
    );

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(p_mp_id uuid) IS
'v1.7: Unified confirmation invariant for users and guests. removed_at ⇒ status=removed; confirmed ⇔ participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL; else status=pending. confirmed_at is derived from timestamps, never written directly by callers.';


-- ============================================================================
-- B1) rpc_match_nominate_guest(p_match_id, p_guest_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_guest(p_match_id uuid, p_guest_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_uid      uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp       public.match_participants%rowtype;
BEGIN
  -- Auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Match must exist and be active
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active (status=%)', v_match.status;
  END IF;

  -- Caller: organizer OR active participant
  IF NOT (
    public.is_match_organizer(p_match_id, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not_authorized_to_nominate_guest';
  END IF;

  -- Guest must be in caller''s personal roster
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id      = p_guest_id
  ) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  -- Guest must exist and be active
  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = p_guest_id
      AND g.status = 'active'
  ) THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  -- Prevent duplicate active (match, guest) row
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND guest_id = p_guest_id
    AND removed_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'guest_already_active';
  END IF;

  -- Insert nominated guest participant
  INSERT INTO public.match_participants (
    match_id,
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

  -- Action log
  INSERT INTO public.match_participant_actions (
    match_id,
    match_participant_id,
    action_type,
    note,
    created_by
  ) VALUES (
    p_match_id,
    v_mp.id,
    'nominate_guest',
    NULL,
    v_uid
  );

  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_guest(p_match_id uuid, p_guest_id uuid) IS
'v1.7: Nominate a Contact Player (guest) into a match. Organizer OR any active participant may call. Requires guest to be in caller''s roster and active in guests table. Inserts join_method=nominated, leaves participant_accepted_at NULL. Organizer callers write org_approved_at immediately; others leave it NULL. Reconcile derives status from timestamps.';


-- ============================================================================
-- B2) rpc_match_delegate_confirm_guest(p_match_participant_id)
-- ============================================================================

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
  -- Auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Load participant (must be guest, not removed)
  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF v_mp.guest_id IS NULL THEN
    RAISE EXCEPTION 'not_guest_participant';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'cannot_confirm_removed_participant';
  END IF;

  -- Caller must be active participant in this match (user-side)
  IF NOT public.is_user_match_associated(v_mp.match_id, v_uid) THEN
    RAISE EXCEPTION 'caller_not_match_associated';
  END IF;

  -- Idempotent: if already accepted, just reconcile and return
  IF v_mp.participant_accepted_at IS NOT NULL THEN
    PERFORM public.match_participant_reconcile_status(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
    RETURN v_mp;
  END IF;

  -- Write participant-side confirmation ONLY
  UPDATE public.match_participants
  SET
    participant_accepted_at  = COALESCE(participant_accepted_at, now()),
    participant_accepted_via = 'delegate_manual'
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

  INSERT INTO public.match_participant_actions (
    match_id,
    match_participant_id,
    action_type,
    note,
    created_by
  ) VALUES (
    v_mp.match_id,
    v_mp.id,
    'delegate_confirm_guest',
    NULL,
    v_uid
  );

  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_guest(p_match_participant_id uuid) IS
'v1.7: Any active participant (including organizer) confirms a guest can come. Only touches participant_accepted_at/participant_accepted_via; never writes org_approved_at. Works with rpc_match_org_approve_participant to enforce confirmed ⇔ participant_accepted_at AND org_approved_at.';


-- ============================================================================
-- C) Deprecate legacy guest RPCs (封口，不再走旧流程)
-- ============================================================================

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
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model';
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
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model';
END;
$$;

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
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model';
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
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model';
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
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model';
END;
$$;

