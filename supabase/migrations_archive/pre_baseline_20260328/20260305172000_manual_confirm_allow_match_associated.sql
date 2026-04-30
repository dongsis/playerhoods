-- Manual confirm: 1) Allow for re-confirm (request-joined then match modified); 2) Relax scope to match-associated.
-- rpc_match_manual_confirm is called with an existing participant_id — they are already in the match (match-associated).
-- So require only: organizer, non-removed, user participant. Drop scope-group check.

CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm(p_match_participant_id uuid, p_note text DEFAULT NULL)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp       match_participants;
  v_match_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  v_match_id := v_mp.match_id;

  IF NOT public.is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can manually confirm participants';
  END IF;

  IF v_mp.user_id IS NULL THEN
    RAISE EXCEPTION 'Use rpc_match_org_approve_participant for guest participants';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot manually confirm a removed participant';
  END IF;

  -- Participant is already in this match (match-associated); no scope-group check needed.
  -- Covers: invited/nominated not yet accepted, and request-joined needing re-confirm after match edit.
  UPDATE public.match_participants
  SET
    participant_accepted_at  = COALESCE(participant_accepted_at, now()),
    participant_accepted_via = COALESCE(participant_accepted_via, 'manual'),
    manual_confirmed_by      = auth.uid(),
    org_approved_at          = COALESCE(org_approved_at, now()),
    org_approved_by          = auth.uid()
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions (
    match_id, match_participant_id, action_type, note, created_by
  ) VALUES (
    v_match_id, p_match_participant_id, 'manual_confirm', p_note, auth.uid()
  );

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_manual_confirm(p_match_participant_id uuid, p_note text) IS
'v1.6.3: ORG manually confirms an existing pending participant. No scope check — participant is already match-associated. Covers invited/nominated and request-joined re-confirm after match edit.';
