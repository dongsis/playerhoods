-- Extend event processor for match.guest_nominated, match.guest_org_approved, match.guest_delegate_confirmed, match.formed

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

  -- invitation.email_invitation_created (existing)
  IF v_evt.event_type = 'invitation.email_invitation_created' THEN
    v_payload := v_evt.payload;
    SELECT * INTO v_inv FROM public.email_invitations WHERE id = (v_payload->>'invitation_id')::uuid;
    IF NOT FOUND THEN
      RETURN;
    END IF;

    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id, metadata)
    VALUES (v_inv.id, 'email_delivery_requested', v_evt.actor_user_id, jsonb_build_object('domain_event_id', p_event_id));

    INSERT INTO public.notification_deliveries (
      email_invitation_id, channel, provider, destination, delivery_status, payload
    ) VALUES (
      v_inv.id, 'email', 'resend', v_inv.target_email, 'queued',
      jsonb_build_object(
        'template_type', 'invitation',
        'invitation_id', v_inv.id,
        'inviter_display_name', v_payload->>'inviter_display_name',
        'target_email', v_inv.target_email,
        'related_type', v_inv.related_type,
        'related_id', v_inv.related_id,
        'match_summary', (SELECT jsonb_build_object('game_type', m.game_type, 'match_date', m.match_date, 'club_name', c.name)
          FROM public.matches m LEFT JOIN public.clubs c ON c.id = m.club_id WHERE m.id = v_inv.related_id)
      )
    );
    RETURN;
  END IF;

  -- match.guest_nominated
  IF v_evt.event_type = 'match.guest_nominated' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NULL OR trim(v_dest) = '' THEN RETURN; END IF;

    INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
    VALUES (
      'email', 'resend', v_dest, 'queued',
      jsonb_build_object(
        'template_type', 'guest_nominated',
        'target_email', v_dest,
        'nominator_display_name', v_payload->>'nominator_display_name',
        'match_id', v_payload->>'match_id',
        'game_type', v_payload->>'game_type',
        'match_date', v_payload->>'match_date',
        'club_name', v_payload->>'club_name'
      )
    );
    RETURN;
  END IF;

  -- match.guest_org_approved
  IF v_evt.event_type = 'match.guest_org_approved' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NULL OR trim(v_dest) = '' THEN RETURN; END IF;

    INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
    VALUES (
      'email', 'resend', v_dest, 'queued',
      jsonb_build_object(
        'template_type', 'guest_org_approved',
        'target_email', v_dest,
        'match_id', v_payload->>'match_id',
        'game_type', v_payload->>'game_type',
        'match_date', v_payload->>'match_date',
        'club_name', v_payload->>'club_name'
      )
    );
    RETURN;
  END IF;

  -- match.guest_delegate_confirmed
  IF v_evt.event_type = 'match.guest_delegate_confirmed' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NULL OR trim(v_dest) = '' THEN RETURN; END IF;

    INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
    VALUES (
      'email', 'resend', v_dest, 'queued',
      jsonb_build_object(
        'template_type', 'guest_delegate_confirmed',
        'target_email', v_dest,
        'match_id', v_payload->>'match_id',
        'game_type', v_payload->>'game_type',
        'match_date', v_payload->>'match_date',
        'club_name', v_payload->>'club_name'
      )
    );
    RETURN;
  END IF;

  -- match.formed: one delivery per confirmed participant (user + guest) with email
  IF v_evt.event_type = 'match.formed' THEN
    v_payload := v_evt.payload;
    v_match_id := (v_payload->>'match_id')::uuid;

    FOR v_rec IN
      SELECT participant_id, email, contact_channel
      FROM public.rpc_match_confirmed_participant_emails(v_match_id)
      WHERE email IS NOT NULL AND trim(email) <> '' AND contact_channel = 'email'
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
    RETURN;
  END IF;
END;
$$;
