-- Remove all references to match_participants.user_accepted_at (column dropped in v1.6.3).
-- Fixes: column "user_accepted_at" of relation "match_participants" does not exist

-- 1) match_participant_reconcile_status: stop selecting and using user_accepted_at
CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp record;
  v_accepted_at timestamptz;
BEGIN
  SELECT
    id, status, user_id, guest_id,
    participant_accepted_at,
    org_approved_at, removed_at, confirmed_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  IF v_mp.status = 'removed'::public.match_participant_status THEN
    UPDATE public.match_participants
    SET confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (confirmed_at IS NOT NULL OR removed_at IS NULL);
    RETURN;
  END IF;

  v_accepted_at := v_mp.participant_accepted_at;

  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  IF v_mp.user_id IS NOT NULL THEN
    IF v_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(p_mp_id uuid) IS
'v1.6.3: Derives status from participant_accepted_at and org_approved_at. Writes confirmed_at and status.';

-- 2) fn_match_detail_change_reconfirm: do not set user_accepted_at
CREATE OR REPLACE FUNCTION public.fn_match_detail_change_reconfirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF (
    OLD.match_date          IS DISTINCT FROM NEW.match_date
    OR OLD.start_time       IS DISTINCT FROM NEW.start_time
    OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
  ) THEN
    UPDATE public.match_participants
    SET
      status               = 'pending',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      manual_confirmed_by      = NULL,
      confirmed_at             = NULL
    WHERE
      match_id   = NEW.id
      AND removed_at IS NULL
      AND user_id IS NOT NULL
      AND user_id IS DISTINCT FROM NEW.organizer_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) rpc_match_accept_invite: do not set user_accepted_at
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

  UPDATE public.match_participants
  SET
    participant_accepted_at  = now(),
    participant_accepted_via = 'in_app'
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);

  INSERT INTO public.match_participant_actions (
    match_id, match_participant_id, action_type, note, created_by
  ) VALUES (
    p_match_id, v_mp.id, 'accept', NULL, auth.uid()
  );

  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_accept_invite(p_match_id uuid) IS
'v1.6.3: User accepts invite/nomination or re-confirms. Sets participant_accepted_at only.';

-- 4) rpc_match_delegate_confirm_user: remove user_accepted_at from UPDATE and INSERT
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match      public.matches%rowtype;
  v_uid        uuid := auth.uid();
  v_existing   match_participants;
  v_new_mp     match_participants;
  v_constraint text;
  v_scope_ids  uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match';
  END IF;

  IF p_user_id = v_uid THEN RAISE EXCEPTION 'Cannot delegate-confirm yourself'; END IF;

  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN
    RAISE EXCEPTION 'Target user is not in your shared groups';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'nominated',
      participant_accepted_at  = now(),
      participant_accepted_via = 'delegate_manual',
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = v_uid,
      manual_confirmed_by      = v_uid
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',                 NULL, v_uid),
      (p_match_id, v_existing.id, 'delegate_manual_confirm', NULL, v_uid);

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by,
      nominated_by, manual_confirmed_by,
      created_by
    ) VALUES (
      p_match_id, p_user_id, 'nominated',
      now(), 'delegate_manual',
      NULL, NULL,
      v_uid, v_uid,
      v_uid
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uq_match_participants_active_user' THEN
        RAISE EXCEPTION 'User is already a participant in this match';
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'delegate_manual_confirm', NULL, v_uid);

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

-- 5) rpc_match_manual_confirm_user: remove user_accepted_at from re-entry UPDATE and INSERT
CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match      public.matches%rowtype;
  v_existing   match_participants;
  v_new_mp     match_participants;
  v_constraint text;
  v_scope_ids  uuid[] := '{}'::uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'Match is not active (status: %)', v_match.status; END IF;
  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  IF p_user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'Organizer cannot be manually confirmed into their own match';
  END IF;

  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, p_user_id)
    OR public.do_users_share_group(p_user_id, v_match.organizer_id)
  ) THEN
    RAISE EXCEPTION 'Target user is not in scope or shared group';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'manual',
      participant_accepted_at  = now(),
      participant_accepted_via = 'manual',
      org_approved_at          = now(),
      org_approved_by          = auth.uid(),
      nominated_by             = NULL,
      manual_confirmed_by      = auth.uid()
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',        NULL, auth.uid()),
      (p_match_id, v_existing.id, 'manual_confirm', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by,
      manual_confirmed_by, created_by
    ) VALUES (
      p_match_id, p_user_id, 'manual',
      now(), 'manual',
      now(), auth.uid(),
      auth.uid(), auth.uid()
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uq_match_participants_active_user' THEN
        RAISE EXCEPTION 'User is already a participant in this match';
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'manual_confirm', NULL, auth.uid());

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

-- 6) rpc_match_nominate_user: remove user_accepted_at from UPDATE
CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match     public.matches%rowtype;
  v_uid       uuid := auth.uid();
  v_existing  match_participants;
  v_new_mp    match_participants;
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'Match is not active (status: %)', v_match.status; END IF;
  IF public.is_match_organizer(p_match_id, v_uid) THEN RAISE EXCEPTION 'You are not authorized to nominate for this match'; END IF;
  IF NOT v_match.can_participants_invite_users THEN RAISE EXCEPTION 'You are not authorized to nominate for this match'; END IF;
  IF NOT ( public.is_user_in_scope_groups(v_scope_ids, v_uid) OR public.is_user_match_associated(p_match_id, v_uid) ) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;
  IF p_user_id = v_uid THEN RAISE EXCEPTION 'Cannot nominate yourself'; END IF;
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN RAISE EXCEPTION 'User is already a participant in this match'; END IF;
  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN RAISE EXCEPTION 'Target user is not in your shared groups'; END IF;

  SELECT mp.* INTO v_existing
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id AND mp.user_id = p_user_id AND mp.status = 'removed'
  ORDER BY mp.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.match_participants mp
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'nominated',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = v_uid,
      manual_confirmed_by      = NULL
    WHERE mp.id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
    VALUES (p_match_id, v_existing.id, 'reenter', NULL, v_uid), (p_match_id, v_existing.id, 'nominate', NULL, v_uid);

    SELECT mp.* INTO v_new_mp FROM public.match_participants mp WHERE mp.id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'nominated',
    NULL, NULL,
    NULL, v_uid, v_uid
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'nominate', NULL, v_uid);

  SELECT mp.* INTO v_new_mp FROM public.match_participants mp WHERE mp.id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

-- 7) rpc_match_request_join: remove user_accepted_at from UPDATE (re-entry branch)
CREATE OR REPLACE FUNCTION public.rpc_match_request_join(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match    record;
  v_existing match_participants;
  v_new_mp   match_participants;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_match.organizer_id = auth.uid() THEN RAISE EXCEPTION 'Organizer cannot request to join their own match'; END IF;
  IF v_match.invitation_scope_group_ids IS NULL OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match is not open for join requests (no scope groups configured)';
  END IF;
  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, auth.uid()) THEN
    RAISE EXCEPTION 'You are not eligible to request to join this match (not in scope groups)';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF FOUND THEN
    IF v_existing.removed_at IS NULL THEN RAISE EXCEPTION 'You are already a participant in this match'; END IF;

    UPDATE public.match_participants
    SET
      status = 'pending',
      removed_at = NULL,
      removed_by = NULL,
      removal_note = NULL,
      confirmed_at = NULL,
      join_method = 'requested',
      participant_accepted_at = now(),
      participant_accepted_via = 'in_app',
      org_approved_at = NULL,
      org_approved_by = NULL,
      nominated_by = NULL,
      manual_confirmed_by = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
    VALUES (p_match_id, v_existing.id, 'reenter', NULL, auth.uid()), (p_match_id, v_existing.id, 'request_join', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (p_match_id, auth.uid(), 'requested', now(), 'in_app', NULL, NULL, auth.uid())
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'request_join', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_request_join(p_match_id uuid) IS
'v1.6.3: User requests to join. Removed users can re-request (status=pending). Sets participant_accepted_at. ORG approval needed to confirm.';
