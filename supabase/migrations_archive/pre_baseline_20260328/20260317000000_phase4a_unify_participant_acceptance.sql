-- =============================================================================
-- Phase 4A: Unify existing-participant confirmation write logic
-- Internal helper apply_participant_acceptance centralizes:
--   - participant_accepted_at, participant_accepted_via, manual_confirmed_by
--   - reconcile, action log
-- Public RPCs keep their gates; delegate_confirm_guest keeps guest event emission.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Internal helper: apply_participant_acceptance
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_participant_acceptance(
  p_mp_id      uuid,
  p_actor_id   uuid,
  p_is_self    boolean,
  p_action_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.match_participants
  SET
    participant_accepted_at  = now(),
    participant_accepted_via = CASE WHEN p_is_self THEN 'in_app' ELSE 'delegate_manual' END,
    manual_confirmed_by     = CASE WHEN p_is_self THEN NULL ELSE p_actor_id END
  WHERE id = p_mp_id;

  PERFORM public.match_participant_reconcile_status(p_mp_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  SELECT mp.match_id, p_mp_id, p_action_type, NULL, p_actor_id
  FROM public.match_participants mp
  WHERE mp.id = p_mp_id;
END;
$$;

COMMENT ON FUNCTION public.apply_participant_acceptance(uuid, uuid, boolean, text) IS
'Phase 4A: Internal write core for participant-side acceptance. Self: in_app, manual_confirmed_by=NULL. Delegate: delegate_manual, manual_confirmed_by=actor.';


-- -----------------------------------------------------------------------------
-- 2) rpc_match_accept_invite — use helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_accept_invite(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp            match_participants;
  v_was_unaccepted boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'You are not a participant in this match'; END IF;
  IF v_mp.removed_at IS NOT NULL THEN RAISE EXCEPTION 'You have been removed from this match'; END IF;

  IF (SELECT status FROM public.matches WHERE id = p_match_id) <> 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  v_was_unaccepted := (v_mp.participant_accepted_at IS NULL);

  IF NOT v_was_unaccepted THEN
    PERFORM public.match_participant_reconcile_status(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
    RETURN v_mp;
  END IF;

  PERFORM public.apply_participant_acceptance(v_mp.id, auth.uid(), true, 'accept');

  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_accept_invite(p_match_id uuid) IS
'v1.6.3: User accepts invite/nomination or re-confirms. Sets participant_accepted_at only.';


-- -----------------------------------------------------------------------------
-- 3) rpc_match_delegate_confirm_participant — use helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_participant(p_match_participant_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp    public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_mp.match_id;

  IF v_mp.user_id IS NULL THEN
    RAISE EXCEPTION 'use_rpc_match_delegate_confirm_guest_for_guests';
  END IF;

  IF v_mp.status <> 'pending' THEN
    RAISE EXCEPTION 'participant_not_pending_or_already_confirmed';
  END IF;
  IF v_mp.join_method NOT IN ('invited', 'nominated') THEN
    RAISE EXCEPTION 'participant_not_invited_or_nominated';
  END IF;
  IF v_mp.participant_accepted_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF public.is_match_organizer(v_mp.match_id, v_uid) THEN
    RAISE EXCEPTION 'organizer_use_manual_confirm_or_approve';
  END IF;
  IF NOT (
    public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_uid)
    OR public.is_user_match_associated(v_mp.match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not_authorized_to_delegate_confirm';
  END IF;

  IF NOT public.do_users_share_group(v_mp.user_id, v_uid) THEN
    RAISE EXCEPTION 'target_not_in_shared_groups';
  END IF;

  PERFORM public.apply_participant_acceptance(p_match_participant_id, v_uid, false, 'delegate_manual_confirm');

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_participant(uuid) IS
'v1.7: Non-org delegate-confirms an invited or nominated user participant. Sets participant_accepted_at. Caller must share group with participant and be in scope or match-associated.';


-- -----------------------------------------------------------------------------
-- 4) rpc_match_delegate_confirm_guest — use helper, keep guest event emission
-- -----------------------------------------------------------------------------
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

  PERFORM public.apply_participant_acceptance(p_match_participant_id, v_uid, false, 'delegate_manual_confirm');

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;

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

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_guest(p_match_participant_id uuid) IS
'v1.7: Any active participant (including organizer) confirms a guest can come. Only touches participant_accepted_at/participant_accepted_via; never writes org_approved_at. Works with rpc_match_org_approve_participant to enforce confirmed ⇔ participant_accepted_at AND org_approved_at.';
