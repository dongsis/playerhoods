-- Event processor: process invitation.email_invitation_created
-- Creates notification_delivery + email_invitation_events audit

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

    INSERT INTO public.notification_deliveries (
      email_invitation_id, channel, provider, destination, delivery_status, payload
    ) VALUES (
      v_inv.id, 'email', 'resend', v_inv.target_email, 'queued',
      jsonb_build_object(
        'invitation_id', v_inv.id,
        'inviter_display_name', v_payload->>'inviter_display_name',
        'target_email', v_inv.target_email,
        'related_type', v_inv.related_type,
        'related_id', v_inv.related_id,
        'match_summary', (SELECT jsonb_build_object('game_type', m.game_type, 'match_date', m.match_date, 'club_name', c.name)
          FROM public.matches m LEFT JOIN public.clubs c ON c.id = m.club_id WHERE m.id = v_inv.related_id)
      )
    );
  END IF;
END;
$$;

-- Get queued deliveries for worker (with row lock)
CREATE OR REPLACE FUNCTION public.rpc_get_queued_deliveries(p_limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  destination text,
  payload jsonb,
  attempt_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_deliveries d
  SET delivery_status = 'sending', attempt_count = d.attempt_count + 1, last_attempt_at = now()
  WHERE d.id IN (
    SELECT nd.id FROM public.notification_deliveries nd
    WHERE nd.delivery_status = 'queued'
    ORDER BY nd.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.id, d.destination, d.payload, d.attempt_count;
END;
$$;

-- Update delivery result after send
CREATE OR REPLACE FUNCTION public.rpc_update_delivery_result(
  p_delivery_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv_id uuid;
BEGIN
  SELECT email_invitation_id INTO v_inv_id FROM public.notification_deliveries WHERE id = p_delivery_id;

  UPDATE public.notification_deliveries
  SET delivery_status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      error_message = p_error_message
  WHERE id = p_delivery_id;

  IF v_inv_id IS NOT NULL THEN
    IF p_status = 'sent' THEN
      INSERT INTO public.email_invitation_events (invitation_id, event_type, metadata)
      VALUES (v_inv_id, 'email_sent', jsonb_build_object('delivery_id', p_delivery_id));
    ELSIF p_status = 'failed' THEN
      INSERT INTO public.email_invitation_events (invitation_id, event_type, metadata)
      VALUES (v_inv_id, 'email_failed', jsonb_build_object('delivery_id', p_delivery_id, 'error', p_error_message));
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_process_domain_event(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_queued_deliveries(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_delivery_result(uuid, text, text, text) TO authenticated, service_role;
