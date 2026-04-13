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

  IF v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET status = 'removed'::public.match_participant_status,
        confirmed_at = NULL,
        removed_at = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (
        status <> 'removed'::public.match_participant_status
        OR confirmed_at IS NOT NULL
        OR removed_at IS NULL
      );
    RETURN;
  END IF;

  v_accepted_at := v_mp.participant_accepted_at;

  IF v_accepted_at IS NOT NULL
     AND v_mp.org_approved_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET status = 'confirmed'::public.match_participant_status,
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

  UPDATE public.match_participants
  SET status = 'pending'::public.match_participant_status,
      confirmed_at = NULL
  WHERE id = p_mp_id
    AND (
      status <> 'pending'::public.match_participant_status
      OR confirmed_at IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(p_mp_id uuid) IS
'v1.7: removed_at is canonical for removed; status=removed alone is not. confirmed ⇔ participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL for both user and guest participants.';

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

  IF v_mp.user_id IS NULL AND v_mp.guest_id IS NULL THEN
    RAISE EXCEPTION 'participant_identity_missing';
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
'v1.7: Revoke a previously recorded delegate confirmation for a user or guest participant. Only the actor in manual_confirmed_by may revoke. Clears participant_accepted_* + manual_confirmed_by, then reconcile derives pending/confirmed from remaining organizer approval.';

GRANT ALL ON FUNCTION public.rpc_match_revoke_delegate_confirm_participant(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_revoke_delegate_confirm_participant(uuid) TO service_role;
