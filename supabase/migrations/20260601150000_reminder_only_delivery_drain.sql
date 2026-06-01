CREATE OR REPLACE FUNCTION public.notification_reminder_drain_preview(
  p_limit integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_limit integer := greatest(1, p_limit);
  v_due_candidates jsonb;
  v_queued_reminders jsonb;
  v_would_process jsonb;
  v_skipped_non_reminders jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byChannel', coalesce(
      jsonb_agg(
        jsonb_build_object('channel', channel, 'count', count)
        ORDER BY channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_due_candidates
  FROM (
    SELECT r.channel, count(*)::integer AS count
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id
    LEFT JOIN LATERAL public.notification_recipient_for_participant(mp.id) r ON true
    WHERE m.status = 'active'
      AND m.formed_at IS NOT NULL
      AND m.player_reminder_minutes IS NOT NULL
      AND public.notification_should_send_match_reminder(m.id, mp.id)
      AND nullif(btrim(r.destination), '') IS NOT NULL
    GROUP BY r.channel
  ) grouped;

  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byChannel', coalesce(
      jsonb_agg(
        jsonb_build_object('channel', channel, 'count', count)
        ORDER BY channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_queued_reminders
  FROM (
    SELECT nd.channel, count(*)::integer AS count
    FROM public.notification_deliveries nd
    WHERE nd.delivery_status IN ('queued', 'sending')
      AND nd.payload->>'template_type' = 'match_reminder'
    GROUP BY nd.channel
  ) grouped;

  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byNotificationType', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'notificationType', notification_type,
          'channel', channel,
          'count', count
        )
        ORDER BY notification_type, channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_would_process
  FROM (
    SELECT 'match_reminder'::text AS notification_type, claimable.channel, count(*)::integer AS count
    FROM (
      SELECT nd.id, nd.channel
      FROM public.notification_deliveries nd
      WHERE nd.delivery_status = 'queued'
        AND nd.payload->>'template_type' = 'match_reminder'
      ORDER BY nd.created_at ASC
      LIMIT v_limit
    ) claimable
    GROUP BY claimable.channel
  ) grouped;

  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byNotificationType', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'notificationType', notification_type,
          'channel', channel,
          'count', count
        )
        ORDER BY notification_type, channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_skipped_non_reminders
  FROM (
    SELECT
      coalesce(e.notification_type, nd.payload->>'template_type', nd.payload->>'notification_type', 'unknown') AS notification_type,
      nd.channel,
      count(*)::integer AS count
    FROM public.notification_deliveries nd
    LEFT JOIN public.match_participant_notification_events e ON e.delivery_id = nd.id
    WHERE nd.delivery_status IN ('queued', 'sending')
      AND nd.payload->>'template_type' IS DISTINCT FROM 'match_reminder'
    GROUP BY coalesce(e.notification_type, nd.payload->>'template_type', nd.payload->>'notification_type', 'unknown'), nd.channel
  ) grouped;

  RETURN jsonb_build_object(
    'dueReminderCandidates', coalesce(v_due_candidates, jsonb_build_object('total', 0, 'byChannel', '[]'::jsonb)),
    'queuedReminderDeliveries', coalesce(v_queued_reminders, jsonb_build_object('total', 0, 'byChannel', '[]'::jsonb)),
    'wouldProcess', coalesce(v_would_process, jsonb_build_object('total', 0, 'byNotificationType', '[]'::jsonb)),
    'skippedNonReminderQueuedDeliveries', coalesce(v_skipped_non_reminders, jsonb_build_object('total', 0, 'byNotificationType', '[]'::jsonb))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_queued_reminder_deliveries(
  p_limit integer DEFAULT 10
) RETURNS TABLE(
  id uuid,
  channel text,
  provider text,
  destination text,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_deliveries d
  SET delivery_status = 'sending',
      attempt_count = d.attempt_count + 1,
      last_attempt_at = now()
  WHERE d.id IN (
    SELECT nd.id
    FROM public.notification_deliveries nd
    WHERE nd.delivery_status = 'queued'
      AND nd.payload->>'template_type' = 'match_reminder'
    ORDER BY nd.created_at ASC
    LIMIT greatest(1, p_limit)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.id, d.channel, d.provider, d.destination, d.payload, d.attempt_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notification_reminder_drain_preview(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_queued_reminder_deliveries(integer) TO anon, authenticated, service_role;
