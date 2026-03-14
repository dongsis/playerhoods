-- Emit domain events from guest-related RPCs; call processor after emit

-- 1) rpc_match_nominate_guest: emit match.guest_nominated
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
  v_is_org   boolean;
  v_guest_email text;
  v_nominator_name text;
  v_evt_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'match_not_active (status=%)', v_match.status; END IF;

  v_is_org := (v_match.organizer_id = v_uid);
  IF NOT (v_is_org OR public.is_user_match_associated(p_match_id, v_uid)) THEN
    RAISE EXCEPTION 'not_authorized_to_nominate_guest';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roster_guests urg WHERE urg.owner_user_id = v_uid AND urg.guest_id = p_guest_id) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.guests g WHERE g.id = p_guest_id AND g.status = 'active') THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  SELECT * INTO v_existing FROM public.match_participants
  WHERE match_id = p_match_id AND guest_id = p_guest_id AND removed_at IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'guest_already_active'; END IF;

  INSERT INTO public.match_participants (
    match_id, join_method, guest_id, created_by, created_at, nominated_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) VALUES (
    p_match_id, 'nominated', p_guest_id, v_uid, now(), v_uid,
    NULL, NULL,
    CASE WHEN v_is_org THEN now() ELSE NULL END,
    CASE WHEN v_is_org THEN v_uid ELSE NULL END
  )
  RETURNING * INTO v_mp;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_mp.id, 'nominate_guest', NULL, v_uid);

  SELECT NULLIF(trim(g.email), '') INTO v_guest_email FROM public.guests g WHERE g.id = p_guest_id;
  SELECT p.display_name INTO v_nominator_name FROM public.profiles p WHERE p.id = v_uid;
  IF v_guest_email IS NOT NULL THEN
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'match.guest_nominated', 'match_participant', v_mp.id, v_uid,
      jsonb_build_object(
        'match_participant_id', v_mp.id, 'match_id', p_match_id, 'guest_id', p_guest_id,
        'target_email', v_guest_email, 'nominator_user_id', v_uid,
        'nominator_display_name', COALESCE(v_nominator_name, 'Someone'),
        'game_type', v_match.game_type, 'match_date', v_match.match_date,
        'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = v_match.club_id)
      )
    )
    RETURNING id INTO v_evt_id;
    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;

  RETURN v_mp;
END;
$$;

-- 2) rpc_match_org_approve_participant: emit match.guest_org_approved when guest
CREATE OR REPLACE FUNCTION public.rpc_match_org_approve_participant(p_match_participant_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp       public.match_participants%rowtype;
  v_match    public.matches%rowtype;
  v_match_id uuid;
  v_guest_email text;
  v_evt_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found'; END IF;
  v_match_id := v_mp.match_id;

  IF NOT public.is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can approve participants';
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot approve a removed participant. Re-invite them first.';
  END IF;
  IF v_mp.confirmed_at IS NOT NULL THEN RETURN v_mp; END IF;

  UPDATE public.match_participants
  SET org_approved_at = COALESCE(org_approved_at, now()), org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (v_match_id, p_match_participant_id, 'approve', NULL, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;

  IF v_mp.guest_id IS NOT NULL THEN
    v_guest_email := public.rpc_match_participant_email(p_match_participant_id);
    IF v_guest_email IS NOT NULL THEN
      SELECT * INTO v_match FROM public.matches WHERE id = v_match_id;
      INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
      VALUES (
        'match.guest_org_approved', 'match_participant', v_mp.id, auth.uid(),
        jsonb_build_object(
          'match_participant_id', v_mp.id, 'match_id', v_match_id, 'target_email', v_guest_email,
          'game_type', v_match.game_type, 'match_date', v_match.match_date,
          'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = v_match.club_id)
        )
      )
      RETURNING id INTO v_evt_id;
      PERFORM public.rpc_process_domain_event(v_evt_id);
    END IF;
  END IF;

  RETURN v_mp;
END;
$$;

-- 3) rpc_match_delegate_confirm_guest: emit match.guest_delegate_confirmed
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_guest(p_match_participant_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mp  public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_guest_email text;
  v_evt_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found'; END IF;
  IF v_mp.guest_id IS NULL THEN RAISE EXCEPTION 'not_guest_participant'; END IF;
  IF v_mp.removed_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot confirm a removed participant'; END IF;
  IF NOT public.is_user_match_associated(v_mp.match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;
  IF v_mp.participant_accepted_at IS NOT NULL THEN RETURN v_mp; END IF;

  UPDATE public.match_participants
  SET participant_accepted_at = now(), participant_accepted_via = 'delegate_manual'
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (v_mp.match_id, v_mp.id, 'delegate_manual_confirm', NULL, v_uid);

  v_guest_email := public.rpc_match_participant_email(v_mp.id);
  IF v_guest_email IS NOT NULL THEN
    SELECT * INTO v_match FROM public.matches WHERE id = v_mp.match_id;
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'match.guest_delegate_confirmed', 'match_participant', v_mp.id, v_uid,
      jsonb_build_object(
        'match_participant_id', v_mp.id, 'match_id', v_mp.match_id, 'target_email', v_guest_email,
        'game_type', v_match.game_type, 'match_date', v_match.match_date,
        'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = v_match.club_id)
      )
    )
    RETURNING id INTO v_evt_id;
    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;

  RETURN v_mp;
END;
$$;
