-- v1.7: When organizer nominates a Contact Player, auto org_approve (org_approved_at) only.
-- Guest stays pending until "Confirm can come" (delegate_confirm_guest) sets participant_accepted_at.
-- Non-org nominates: org_approved_at NULL → pending until delegate_confirm_guest + org Approve.

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active (status=%)', v_match.status;
  END IF;

  v_is_org := (v_match.organizer_id = v_uid);

  IF NOT (
    v_is_org
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not_authorized_to_nominate_guest';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id      = p_guest_id
  ) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = p_guest_id
      AND g.status = 'active'
  ) THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND guest_id = p_guest_id
    AND removed_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'guest_already_active';
  END IF;

  -- Organizer: org_approved_at only (auto org confirm). participant_accepted_at NULL → guest pending until "Confirm can come".
  -- Non-org: both NULL → pending until delegate_confirm_guest + org Approve.
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
    CASE WHEN v_is_org THEN now() ELSE NULL END,
    CASE WHEN v_is_org THEN v_uid ELSE NULL END
  )
  RETURNING * INTO v_mp;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

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
'v1.7: Nominate Contact Player. Organizer: auto org_approved_at only; guest stays pending until delegate_confirm_guest. Non-org: org_approved_at NULL.';
