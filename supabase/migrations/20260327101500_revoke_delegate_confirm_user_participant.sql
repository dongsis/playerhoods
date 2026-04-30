ALTER TABLE public.match_participant_actions
  DROP CONSTRAINT IF EXISTS match_participant_actions_action_type_chk;

ALTER TABLE public.match_participant_actions
  ADD CONSTRAINT match_participant_actions_action_type_chk
  CHECK (
    action_type = ANY (
      ARRAY[
        'invite'::text,
        'nominate'::text,
        'nominate_guest'::text,
        'delegate_confirm_guest'::text,
        'request_join'::text,
        'reenter'::text,
        'accept'::text,
        'approve'::text,
        'withdraw'::text,
        'decline'::text,
        'reject_request'::text,
        'revoke_invite'::text,
        'reject_nomination'::text,
        'remove_confirmed'::text,
        'remove'::text,
        'add_guest_org'::text,
        'add_guest_participant'::text,
        'manual_confirm'::text,
        'invited'::text,
        'nominated'::text,
        'requested'::text,
        'accepted'::text,
        'approved'::text,
        'withdrawn'::text,
        'removed'::text,
        'guest_added'::text,
        'declined'::text,
        'delegate_manual_confirm'::text,
        'revoke_delegate_confirm'::text
      ]
    )
  );

CREATE OR REPLACE FUNCTION public.rpc_match_revoke_delegate_confirm_participant(
  p_match_participant_id uuid
) RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp public.match_participants%rowtype;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF v_mp.user_id IS NULL THEN
    RAISE EXCEPTION 'revoke_delegate_confirm_supported_for_user_participants_only';
  END IF;

  IF v_mp.manual_confirmed_by IS NULL OR v_mp.manual_confirmed_by <> v_uid THEN
    RAISE EXCEPTION 'only_delegate_confirmer_can_revoke';
  END IF;

  IF v_mp.participant_accepted_at IS NULL OR v_mp.participant_accepted_via <> 'delegate_manual' THEN
    RAISE EXCEPTION 'participant_not_delegate_confirmed';
  END IF;

  UPDATE public.match_participants
  SET
    participant_accepted_at = NULL,
    participant_accepted_via = NULL,
    manual_confirmed_by = NULL,
    confirmed_at = NULL
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions (
    match_id,
    match_participant_id,
    action_type,
    note,
    created_by
  )
  VALUES (
    v_mp.match_id,
    p_match_participant_id,
    'revoke_delegate_confirm',
    NULL,
    v_uid
  );

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_revoke_delegate_confirm_participant(uuid) IS
'v1.7: Revoke a previously recorded delegate confirmation for a user participant. Only the actor in manual_confirmed_by may revoke. Clears participant_accepted_* + manual_confirmed_by, then reconcile derives pending/confirmed from remaining organizer approval.';

GRANT ALL ON FUNCTION public.rpc_match_revoke_delegate_confirm_participant(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_revoke_delegate_confirm_participant(uuid) TO service_role;
