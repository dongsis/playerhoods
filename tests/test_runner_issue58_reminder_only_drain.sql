CREATE OR REPLACE FUNCTION public.test_runner_issue58_reminder_only_drain()
RETURNS TABLE (
  test_name text,
  ok boolean,
  details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id uuid := gen_random_uuid();
  v_reminder_id uuid := gen_random_uuid();
  v_critical_id uuid := gen_random_uuid();
  v_preview_before jsonb;
  v_preview_after jsonb;
  v_claimed_count integer;
  v_non_reminder_mutated_count integer;
  v_reminder_status text;
  v_skipped_before integer;
  v_skipped_after integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue58_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _issue58_results;

  DELETE FROM public.notification_deliveries
  WHERE destination LIKE 'issue58-%@example.test';

  INSERT INTO public.notification_deliveries (
    id,
    channel,
    provider,
    destination,
    delivery_status,
    attempt_count,
    payload
  ) VALUES
    (
      v_invite_id,
      'email',
      'resend',
      'issue58-invite@example.test',
      'queued',
      0,
      jsonb_build_object('template_type', 'invitation', 'invitation_id', gen_random_uuid())
    ),
    (
      v_reminder_id,
      'email',
      'resend',
      'issue58-reminder@example.test',
      'queued',
      0,
      jsonb_build_object('template_type', 'match_reminder', 'match_id', gen_random_uuid(), 'match_participant_id', gen_random_uuid())
    ),
    (
      v_critical_id,
      'sms',
      'twilio',
      'issue58-critical@example.test',
      'queued',
      0,
      jsonb_build_object('template_type', 'critical_update', 'match_id', gen_random_uuid(), 'match_participant_id', gen_random_uuid())
    );

  SELECT public.notification_reminder_drain_preview(10)
  INTO v_preview_before;

  v_skipped_before := (v_preview_before #>> '{skippedNonReminderQueuedDeliveries,total}')::integer;

  INSERT INTO _issue58_results(test_name, ok, details)
  SELECT
    'dry-run reports one queued reminder',
    (v_preview_before #>> '{queuedReminderDeliveries,total}')::integer = 1
      AND (v_preview_before #>> '{wouldProcess,total}')::integer = 1,
    v_preview_before::text;

  INSERT INTO _issue58_results(test_name, ok, details)
  SELECT
    'dry-run reports disposable skipped non-reminders',
    EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_preview_before #> '{skippedNonReminderQueuedDeliveries,byNotificationType}')
        AS skipped("notificationType" text, channel text, count integer)
      WHERE skipped."notificationType" = 'invitation'
        AND skipped.channel = 'email'
        AND skipped.count >= 1
    )
      AND EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(v_preview_before #> '{skippedNonReminderQueuedDeliveries,byNotificationType}')
          AS skipped("notificationType" text, channel text, count integer)
        WHERE skipped."notificationType" = 'critical_update'
          AND skipped.channel = 'sms'
          AND skipped.count >= 1
      ),
    v_preview_before::text;

  INSERT INTO _issue58_results(test_name, ok, details)
  SELECT
    'dry-run does not mutate delivery rows',
    count(*) = 3,
    'unchanged_rows=' || count(*)::text
  FROM public.notification_deliveries
  WHERE id IN (v_invite_id, v_reminder_id, v_critical_id)
    AND delivery_status = 'queued'
    AND attempt_count = 0
    AND last_attempt_at IS NULL;

  SELECT count(*)::integer
  INTO v_claimed_count
  FROM public.rpc_get_queued_reminder_deliveries(10);

  INSERT INTO _issue58_results(test_name, ok, details)
  VALUES (
    'reminder-only claimant claims one reminder',
    v_claimed_count = 1,
    'claimed=' || v_claimed_count::text
  );

  SELECT count(*)::integer
  INTO v_non_reminder_mutated_count
  FROM public.notification_deliveries
  WHERE id IN (v_invite_id, v_critical_id)
    AND (delivery_status <> 'queued' OR attempt_count <> 0 OR last_attempt_at IS NOT NULL);

  INSERT INTO _issue58_results(test_name, ok, details)
  VALUES (
    'reminder-only claimant leaves non-reminders queued',
    v_non_reminder_mutated_count = 0,
    'mutated_non_reminders=' || v_non_reminder_mutated_count::text
  );

  SELECT delivery_status
  INTO v_reminder_status
  FROM public.notification_deliveries
  WHERE id = v_reminder_id;

  INSERT INTO _issue58_results(test_name, ok, details)
  VALUES (
    'reminder-only claimant marks reminder sending',
    v_reminder_status = 'sending',
    'status=' || coalesce(v_reminder_status, 'null')
  );

  SELECT public.notification_reminder_drain_preview(10)
  INTO v_preview_after;

  v_skipped_after := (v_preview_after #>> '{skippedNonReminderQueuedDeliveries,total}')::integer;

  INSERT INTO _issue58_results(test_name, ok, details)
  SELECT
    'post-claim preview keeps skipped non-reminder count stable',
    v_skipped_after = v_skipped_before,
    v_preview_after::text;

  DELETE FROM public.notification_deliveries
  WHERE id IN (v_invite_id, v_reminder_id, v_critical_id);

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue58_results r
  ORDER BY r.test_name;
END;
$$;
