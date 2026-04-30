CREATE OR REPLACE FUNCTION public.rpc_match_org_approve_participant(p_match_participant_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_match_id uuid;
  v_guest_email text;
  v_guest_phone text;
  v_nominator_name text;
  v_evt_id uuid;
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
    RAISE EXCEPTION 'Only the organizer can approve participants';
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot approve a removed participant. Re-invite them first.';
  END IF;
  IF v_mp.confirmed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  UPDATE public.match_participants
  SET org_approved_at = COALESCE(org_approved_at, now()),
      org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (v_match_id, p_match_participant_id, 'approve', NULL, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;

  IF v_mp.guest_id IS NOT NULL THEN
    v_guest_email := public.rpc_match_participant_email(p_match_participant_id);

    SELECT
      NULLIF(trim(g.phone), ''),
      COALESCE(NULLIF(trim(p.display_name), ''), 'Someone')
    INTO v_guest_phone, v_nominator_name
    FROM public.guests g
    LEFT JOIN public.profiles p
      ON p.id = COALESCE(v_mp.nominated_by, v_mp.created_by, auth.uid())
    WHERE g.id = v_mp.guest_id;

    IF v_guest_email IS NOT NULL OR v_guest_phone IS NOT NULL THEN
      SELECT * INTO v_match FROM public.matches WHERE id = v_match_id;

      INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
      VALUES (
        'match.guest_org_approved',
        'match_participant',
        v_mp.id,
        auth.uid(),
        jsonb_build_object(
          'match_participant_id', v_mp.id,
          'match_id', v_match_id,
          'target_email', v_guest_email,
          'target_phone', v_guest_phone,
          'nominator_display_name', COALESCE(v_nominator_name, 'Someone'),
          'game_type', v_match.game_type,
          'match_date', v_match.match_date,
          'club_name', (SELECT v.name FROM public.venues v WHERE v.id = v_match.venue_id)
        )
      )
      RETURNING id INTO v_evt_id;

      PERFORM public.rpc_process_domain_event(v_evt_id);
    END IF;
  END IF;

  RETURN v_mp;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_process_domain_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_evt public.domain_events%rowtype;
  v_inv public.email_invitations%rowtype;
  v_payload jsonb;
  v_dest text;
  v_match_id uuid;
  v_rec record;
BEGIN
  SELECT * INTO v_evt FROM public.domain_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_evt.event_type = 'invitation.email_invitation_created' THEN
    v_payload := v_evt.payload;
    SELECT * INTO v_inv FROM public.email_invitations WHERE id = (v_payload->>'invitation_id')::uuid;
    IF NOT FOUND THEN
      RETURN;
    END IF;

    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id, metadata)
    VALUES (v_inv.id, 'email_delivery_requested', v_evt.actor_user_id, jsonb_build_object('domain_event_id', p_event_id));

    IF v_inv.target_email IS NOT NULL AND trim(v_inv.target_email) <> '' THEN
      INSERT INTO public.notification_deliveries (
        email_invitation_id, channel, provider, destination, delivery_status, payload
      ) VALUES (
        v_inv.id, 'email', 'resend', v_inv.target_email, 'queued',
        jsonb_build_object(
          'template_type', 'invitation',
          'invitation_id', v_inv.id,
          'inviter_display_name', v_payload->>'inviter_display_name',
          'target_email', v_inv.target_email,
          'target_phone', v_inv.target_phone,
          'related_type', v_inv.related_type,
          'related_id', v_inv.related_id,
          'match_summary', (
            SELECT jsonb_build_object('game_type', m.game_type, 'match_date', m.match_date, 'club_name', c.name)
            FROM public.matches m
            LEFT JOIN public.venues c ON c.id = m.venue_id
            WHERE m.id = v_inv.related_id
          )
        )
      );
    END IF;

    IF v_inv.target_phone IS NOT NULL AND trim(v_inv.target_phone) <> '' THEN
      INSERT INTO public.notification_deliveries (
        email_invitation_id, channel, provider, destination, delivery_status, payload
      ) VALUES (
        v_inv.id, 'sms', 'twilio', v_inv.target_phone, 'queued',
        jsonb_build_object(
          'template_type', 'invitation',
          'invitation_id', v_inv.id,
          'inviter_display_name', v_payload->>'inviter_display_name',
          'target_email', v_inv.target_email,
          'target_phone', v_inv.target_phone,
          'related_type', v_inv.related_type,
          'related_id', v_inv.related_id,
          'match_summary', (
            SELECT jsonb_build_object('game_type', m.game_type, 'match_date', m.match_date, 'club_name', c.name)
            FROM public.matches m
            LEFT JOIN public.venues c ON c.id = m.venue_id
            WHERE m.id = v_inv.related_id
          )
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.guest_nominated' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_nominated',
          'target_email', v_dest,
          'target_phone', v_payload->>'target_phone',
          'nominator_display_name', v_payload->>'nominator_display_name',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;

    v_dest := v_payload->>'target_phone';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'sms', 'twilio', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_nominated',
          'target_email', v_payload->>'target_email',
          'target_phone', v_dest,
          'nominator_display_name', v_payload->>'nominator_display_name',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.guest_org_approved' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_org_approved',
          'target_email', v_dest,
          'target_phone', v_payload->>'target_phone',
          'nominator_display_name', v_payload->>'nominator_display_name',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;

    v_dest := v_payload->>'target_phone';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'sms', 'twilio', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_org_approved',
          'target_email', v_payload->>'target_email',
          'target_phone', v_dest,
          'nominator_display_name', v_payload->>'nominator_display_name',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.guest_delegate_confirmed' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_delegate_confirmed',
          'target_email', v_dest,
          'target_phone', v_payload->>'target_phone',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;

    v_dest := v_payload->>'target_phone';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'sms', 'twilio', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_delegate_confirmed',
          'target_email', v_payload->>'target_email',
          'target_phone', v_dest,
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.formed' THEN
    v_payload := v_evt.payload;
    v_match_id := (v_payload->>'match_id')::uuid;

    FOR v_rec IN
      SELECT participant_id, email, contact_channel
      FROM public.rpc_match_confirmed_participant_emails(v_match_id)
      WHERE (
        (email IS NOT NULL AND trim(email) <> '' AND contact_channel = 'email')
        OR (email IS NOT NULL AND trim(email) <> '' AND contact_channel = 'both')
      )
    LOOP
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_rec.email, 'queued',
        jsonb_build_object(
          'template_type', 'match_formed',
          'match_id', v_match_id,
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END LOOP;

    FOR v_rec IN
      SELECT participant_id, phone, contact_channel
      FROM public.rpc_match_confirmed_participant_sms_targets(v_match_id)
      WHERE phone IS NOT NULL
        AND trim(phone) <> ''
        AND (contact_channel = 'sms' OR contact_channel = 'both')
    LOOP
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'sms', 'twilio', v_rec.phone, 'queued',
        jsonb_build_object(
          'template_type', 'match_formed',
          'match_id', v_match_id,
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END LOOP;
    RETURN;
  END IF;
END;
$$;
