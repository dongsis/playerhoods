CREATE OR REPLACE FUNCTION public.rpc_match_nominate_guest(
  p_match_id uuid,
  p_guest_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_uid      uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp       public.match_participants%rowtype;
  v_is_org   boolean;
  v_guest_email text;
  v_guest_name text;
  v_nominator_name text;
  v_evt_id   uuid;
  v_inv      public.email_invitations%rowtype;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'match_not_active (status=%)', v_match.status; END IF;

  v_is_org := (v_match.organizer_id = v_uid);
  IF NOT v_is_org THEN
    IF NOT v_match.can_participants_invite_users THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;

    IF NOT (
      public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      OR public.is_user_match_associated(p_match_id, v_uid)
    ) THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;
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

  SELECT
    NULLIF(trim(g.email), ''),
    NULLIF(trim(g.display_name), '')
  INTO v_guest_email, v_guest_name
  FROM public.guests g
  WHERE g.id = p_guest_id;

  IF v_guest_email IS NOT NULL THEN
    SELECT p.display_name INTO v_nominator_name FROM public.profiles p WHERE p.id = v_uid;

    INSERT INTO public.email_invitations (
      inviter_user_id, target_email, target_name, related_type, related_id, expires_at, match_participant_id
    ) VALUES (
      v_uid,
      trim(lower(v_guest_email)),
      v_guest_name,
      'match',
      p_match_id,
      NULL,
      v_mp.id
    )
    RETURNING * INTO v_inv;

    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'invitation.email_invitation_created',
      'email_invitation',
      v_inv.id,
      v_uid,
      jsonb_build_object(
        'invitation_id', v_inv.id,
        'related_type', v_inv.related_type,
        'related_id', v_inv.related_id,
        'target_email', v_inv.target_email,
        'target_name', v_inv.target_name,
        'inviter_user_id', v_inv.inviter_user_id,
        'inviter_display_name', COALESCE(v_nominator_name, 'Someone'),
        'match_participant_id', v_inv.match_participant_id
      )
    )
    RETURNING id INTO v_evt_id;

    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;

  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_guest(uuid, uuid) IS
  'v1.8.1: Nominate Contact Player. If the contact has an email, create an anchored email invitation so the recipient can accept/decline via invitation link without creating an account. Organizer always allowed. Non-organizer uses match.can_participants_invite_users + (InScope OR MatchAssociated). Organizer auto-sets org_approved_at; guest stays pending until participant-side confirmation is recorded.';
