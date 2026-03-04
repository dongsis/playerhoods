-- v1.5.1: Fix rpc_match_request_join re-entry status
-- When a previously removed user requests to join again, ensure their
-- match_participants.status is moved out of 'removed' so that
-- match_participant_reconcile_status can derive a fresh pending/confirmed
-- state based on timestamps.

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

  IF v_match.organizer_id = auth.uid() THEN
    RAISE EXCEPTION 'Organizer cannot request to join their own match';
  END IF;
  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match is not open for join requests (no scope groups configured)';
  END IF;
  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, auth.uid()) THEN
    RAISE EXCEPTION 'You are not eligible to request to join this match (not in scope groups)';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF FOUND THEN
    IF v_existing.removed_at IS NULL THEN
      RAISE EXCEPTION 'You are already a participant in this match';
    END IF;

    -- Re-entry: clear removal and move status out of 'removed' so reconcile
    -- can derive a fresh pending/confirmed state based on timestamps.
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

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',      NULL, auth.uid()),
      (p_match_id, v_existing.id, 'request_join', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh request
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, auth.uid(), 'requested',
    now(), 'in_app', NULL, NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'request_join', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_request_join(p_match_id uuid) IS
'v1.5.1: User requests to join. Scope required: requester must be in invitation_scope_group_ids. Empty scope → rejected. Removed users can re-request (clears removed fields, sets status=pending, fresh request). Re-entry: created_by preserved; writes action_type=reenter log. Sets participant_accepted_at=now + via=in_app. ORG approval needed to confirm.';

