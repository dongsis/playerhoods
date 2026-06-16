CREATE OR REPLACE FUNCTION public.test_runner_issue210_game_on_promoted_waiting_player()
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
  v_host uuid := '21000000-0000-0000-0000-000000000001'::uuid;
  v_venue uuid := '21000000-0000-0000-0000-000000000002'::uuid;

  v_formed_match uuid := '21000000-0000-0000-0000-000000000010'::uuid;
  v_formed_exit_user uuid := '21000000-0000-0000-0000-000000000011'::uuid;
  v_formed_stay_user uuid := '21000000-0000-0000-0000-000000000012'::uuid;
  v_formed_waiting_user uuid := '21000000-0000-0000-0000-000000000013'::uuid;
  v_formed_exit_mp uuid := '21000000-0000-0000-0000-000000000014'::uuid;
  v_formed_stay_mp uuid := '21000000-0000-0000-0000-000000000015'::uuid;
  v_formed_waiting_mp uuid := '21000000-0000-0000-0000-000000000016'::uuid;

  v_unformed_match uuid := '21000000-0000-0000-0000-000000000020'::uuid;
  v_unformed_exit_user uuid := '21000000-0000-0000-0000-000000000021'::uuid;
  v_unformed_stay_user uuid := '21000000-0000-0000-0000-000000000022'::uuid;
  v_unformed_waiting_user uuid := '21000000-0000-0000-0000-000000000023'::uuid;
  v_unformed_exit_mp uuid := '21000000-0000-0000-0000-000000000024'::uuid;
  v_unformed_stay_mp uuid := '21000000-0000-0000-0000-000000000025'::uuid;
  v_unformed_waiting_mp uuid := '21000000-0000-0000-0000-000000000026'::uuid;

  v_sent_match uuid := '21000000-0000-0000-0000-000000000030'::uuid;
  v_sent_exit_user uuid := '21000000-0000-0000-0000-000000000031'::uuid;
  v_sent_stay_user uuid := '21000000-0000-0000-0000-000000000032'::uuid;
  v_sent_waiting_user uuid := '21000000-0000-0000-0000-000000000033'::uuid;
  v_sent_exit_mp uuid := '21000000-0000-0000-0000-000000000034'::uuid;
  v_sent_stay_mp uuid := '21000000-0000-0000-0000-000000000035'::uuid;
  v_sent_waiting_mp uuid := '21000000-0000-0000-0000-000000000036'::uuid;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue210_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _issue210_results;

  DELETE FROM public.match_participant_notification_events
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' IN (v_formed_match::text, v_unformed_match::text, v_sent_match::text)
     OR payload->>'match_participant_id' IN (
       v_formed_exit_mp::text, v_formed_stay_mp::text, v_formed_waiting_mp::text,
       v_unformed_exit_mp::text, v_unformed_stay_mp::text, v_unformed_waiting_mp::text,
       v_sent_exit_mp::text, v_sent_stay_mp::text, v_sent_waiting_mp::text
     )
     OR destination LIKE 'issue210-%@example.test';
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.notifications
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR match_participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.match_participant_actions
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR match_participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.match_participants
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.matches WHERE id IN (v_formed_match, v_unformed_match, v_sent_match);
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.profiles
  WHERE id IN (
    v_host,
    v_formed_exit_user, v_formed_stay_user, v_formed_waiting_user,
    v_unformed_exit_user, v_unformed_stay_user, v_unformed_waiting_user,
    v_sent_exit_user, v_sent_stay_user, v_sent_waiting_user
  );
  DELETE FROM auth.users
  WHERE id IN (
    v_host,
    v_formed_exit_user, v_formed_stay_user, v_formed_waiting_user,
    v_unformed_exit_user, v_unformed_stay_user, v_unformed_waiting_user,
    v_sent_exit_user, v_sent_stay_user, v_sent_waiting_user
  );

  INSERT INTO _issue210_results(test_name, ok, details)
  SELECT
    'roster rebalance delegates promoted player Game On to notification helper',
    position('notification_enqueue_confirmed_lineup_if_needed(v_candidate.id)' in pg_get_functiondef('public.perform_match_roster_rebalance(uuid)'::regprocedure)) > 0,
    'perform_match_roster_rebalance should call notification_enqueue_confirmed_lineup_if_needed after promotion';

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_host, 'issue210-host@example.test', now()),
    (v_formed_exit_user, 'issue210-formed-exit@example.test', now()),
    (v_formed_stay_user, 'issue210-formed-stay@example.test', now()),
    (v_formed_waiting_user, 'issue210-formed-waiting@example.test', now()),
    (v_unformed_exit_user, 'issue210-unformed-exit@example.test', now()),
    (v_unformed_stay_user, 'issue210-unformed-stay@example.test', now()),
    (v_unformed_waiting_user, 'issue210-unformed-waiting@example.test', now()),
    (v_sent_exit_user, 'issue210-sent-exit@example.test', now()),
    (v_sent_stay_user, 'issue210-sent-stay@example.test', now()),
    (v_sent_waiting_user, 'issue210-sent-waiting@example.test', now());

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites,
    contact_channel,
    contact_email
  ) VALUES
    (v_host, '', '', 'Issue 210 Host', 'available', 'recommended', true, 'email', 'issue210-host@example.test'),
    (v_formed_exit_user, '', '', 'Issue 210 Formed Exit', 'available', 'recommended', true, 'email', 'issue210-formed-exit@example.test'),
    (v_formed_stay_user, '', '', 'Issue 210 Formed Stay', 'available', 'recommended', true, 'email', 'issue210-formed-stay@example.test'),
    (v_formed_waiting_user, '', '', 'Issue 210 Formed Waiting', 'available', 'recommended', true, 'email', 'issue210-formed-waiting@example.test'),
    (v_unformed_exit_user, '', '', 'Issue 210 Unformed Exit', 'available', 'recommended', true, 'email', 'issue210-unformed-exit@example.test'),
    (v_unformed_stay_user, '', '', 'Issue 210 Unformed Stay', 'available', 'recommended', true, 'email', 'issue210-unformed-stay@example.test'),
    (v_unformed_waiting_user, '', '', 'Issue 210 Unformed Waiting', 'available', 'recommended', true, 'email', 'issue210-unformed-waiting@example.test'),
    (v_sent_exit_user, '', '', 'Issue 210 Sent Exit', 'available', 'recommended', true, 'email', 'issue210-sent-exit@example.test'),
    (v_sent_stay_user, '', '', 'Issue 210 Sent Stay', 'available', 'recommended', true, 'email', 'issue210-sent-stay@example.test'),
    (v_sent_waiting_user, '', '', 'Issue 210 Sent Waiting', 'available', 'recommended', true, 'email', 'issue210-sent-waiting@example.test');

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue, 'Issue 210 Courts', 'America/Toronto');

  INSERT INTO public.matches (
    id,
    organizer_id,
    status,
    venue_id,
    sport_id,
    game_type,
    required_count,
    match_date,
    start_time,
    duration_minutes,
    formed_at
  ) VALUES
    (v_formed_match, v_host, 'active', v_venue, 1, 'doubles', 2, current_date + 7, '18:00'::time, 90, now() - interval '30 minutes'),
    (v_unformed_match, v_host, 'active', v_venue, 1, 'doubles', 2, current_date + 8, '18:00'::time, 90, null),
    (v_sent_match, v_host, 'active', v_venue, 1, 'doubles', 2, current_date + 9, '18:00'::time, 90, now() - interval '30 minutes');

  INSERT INTO public.match_participants (
    id,
    match_id,
    user_id,
    status,
    join_method,
    created_by,
    confirmed_at,
    org_approved_at,
    org_approved_by,
    participant_accepted_at,
    participant_accepted_via
  ) VALUES
    (v_formed_exit_mp, v_formed_match, v_formed_exit_user, 'confirmed', 'requested', v_host, now() - interval '20 minutes', now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_formed_stay_mp, v_formed_match, v_formed_stay_user, 'confirmed', 'requested', v_host, now() - interval '19 minutes', now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_formed_waiting_mp, v_formed_match, v_formed_waiting_user, 'waiting_list', 'requested', v_host, null, now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_unformed_exit_mp, v_unformed_match, v_unformed_exit_user, 'confirmed', 'requested', v_host, now() - interval '20 minutes', now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_unformed_stay_mp, v_unformed_match, v_unformed_stay_user, 'confirmed', 'requested', v_host, now() - interval '19 minutes', now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_unformed_waiting_mp, v_unformed_match, v_unformed_waiting_user, 'waiting_list', 'requested', v_host, null, now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_sent_exit_mp, v_sent_match, v_sent_exit_user, 'confirmed', 'requested', v_host, now() - interval '20 minutes', now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_sent_stay_mp, v_sent_match, v_sent_stay_user, 'confirmed', 'requested', v_host, now() - interval '19 minutes', now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app'),
    (v_sent_waiting_mp, v_sent_match, v_sent_waiting_user, 'waiting_list', 'requested', v_host, null, now() - interval '25 minutes', v_host, now() - interval '25 minutes', 'in_app');

  UPDATE public.match_participants
  SET confirmed_lineup_notification_sent_at = now() - interval '10 minutes'
  WHERE id = v_sent_waiting_mp;

  INSERT INTO public.match_participant_notification_events (
    match_id,
    participant_id,
    notification_type,
    dedupe_key,
    channel,
    destination,
    sent_at
  ) VALUES (
    v_sent_match,
    v_sent_waiting_mp,
    'confirmed_lineup',
    'confirmed_lineup',
    'email',
    'issue210-sent-waiting@example.test',
    now() - interval '10 minutes'
  );

  PERFORM public.apply_participant_exit(v_formed_exit_mp, v_host, 'withdraw', 'issue210 formed promotion');

  INSERT INTO _issue210_results(test_name, ok, details)
  SELECT
    'formed waiting-list promotion queues confirmed_lineup exactly once',
    (
      SELECT count(*) = 1
      FROM public.notification_deliveries nd
      JOIN public.match_participant_notification_events e ON e.delivery_id = nd.id
      WHERE e.participant_id = v_formed_waiting_mp
        AND e.notification_type = 'confirmed_lineup'
        AND e.dedupe_key = 'confirmed_lineup'
        AND nd.delivery_status = 'queued'
        AND nd.payload->>'template_type' = 'confirmed_lineup'
        AND nd.payload->>'match_participant_id' = v_formed_waiting_mp::text
    )
    AND EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.id = v_formed_waiting_mp
        AND mp.status::text = 'confirmed'
        AND mp.waiting_list_at IS NULL
        AND mp.confirmed_lineup_notification_sent_at IS NOT NULL
    ),
    'deliveries=' || (
      SELECT count(*)::text
      FROM public.notification_deliveries nd
      JOIN public.match_participant_notification_events e ON e.delivery_id = nd.id
      WHERE e.participant_id = v_formed_waiting_mp
        AND e.notification_type = 'confirmed_lineup'
    );

  PERFORM public.apply_participant_exit(v_unformed_exit_mp, v_host, 'withdraw', 'issue210 unformed promotion');

  INSERT INTO _issue210_results(test_name, ok, details)
  SELECT
    'unformed waiting-list promotion does not queue confirmed_lineup',
    EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.id = v_unformed_waiting_mp
        AND mp.status::text = 'confirmed'
        AND mp.waiting_list_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.match_participant_notification_events e
      WHERE e.participant_id = v_unformed_waiting_mp
        AND e.notification_type = 'confirmed_lineup'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries nd
      WHERE nd.payload->>'match_participant_id' = v_unformed_waiting_mp::text
        AND nd.payload->>'template_type' = 'confirmed_lineup'
    )
    AND EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.id = v_unformed_waiting_mp
        AND mp.confirmed_lineup_notification_sent_at IS NULL
    ),
    'events=' || (
      SELECT count(*)::text
      FROM public.match_participant_notification_events e
      WHERE e.participant_id = v_unformed_waiting_mp
        AND e.notification_type = 'confirmed_lineup'
    );

  PERFORM public.apply_participant_exit(v_sent_exit_mp, v_host, 'withdraw', 'issue210 already sent promotion');

  INSERT INTO _issue210_results(test_name, ok, details)
  SELECT
    'already-sent waiting-list promotion does not duplicate confirmed_lineup',
    EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.id = v_sent_waiting_mp
        AND mp.status::text = 'confirmed'
        AND mp.waiting_list_at IS NULL
        AND mp.confirmed_lineup_notification_sent_at IS NOT NULL
    )
    AND (
      SELECT count(*) = 1
      FROM public.match_participant_notification_events e
      WHERE e.participant_id = v_sent_waiting_mp
        AND e.notification_type = 'confirmed_lineup'
        AND e.dedupe_key = 'confirmed_lineup'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries nd
      WHERE nd.payload->>'match_participant_id' = v_sent_waiting_mp::text
        AND nd.payload->>'template_type' = 'confirmed_lineup'
    ),
    'events=' || (
      SELECT count(*)::text
      FROM public.match_participant_notification_events e
      WHERE e.participant_id = v_sent_waiting_mp
        AND e.notification_type = 'confirmed_lineup'
    )
    || ', deliveries=' || (
      SELECT count(*)::text
      FROM public.notification_deliveries nd
      WHERE nd.payload->>'match_participant_id' = v_sent_waiting_mp::text
        AND nd.payload->>'template_type' = 'confirmed_lineup'
    );

  DELETE FROM public.match_participant_notification_events
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' IN (v_formed_match::text, v_unformed_match::text, v_sent_match::text)
     OR payload->>'match_participant_id' IN (
       v_formed_exit_mp::text, v_formed_stay_mp::text, v_formed_waiting_mp::text,
       v_unformed_exit_mp::text, v_unformed_stay_mp::text, v_unformed_waiting_mp::text,
       v_sent_exit_mp::text, v_sent_stay_mp::text, v_sent_waiting_mp::text
     )
     OR destination LIKE 'issue210-%@example.test';
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.notifications
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR match_participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.match_participant_actions
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR match_participant_id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.match_participants
  WHERE match_id IN (v_formed_match, v_unformed_match, v_sent_match)
     OR id IN (
       v_formed_exit_mp, v_formed_stay_mp, v_formed_waiting_mp,
       v_unformed_exit_mp, v_unformed_stay_mp, v_unformed_waiting_mp,
       v_sent_exit_mp, v_sent_stay_mp, v_sent_waiting_mp
     );
  DELETE FROM public.matches WHERE id IN (v_formed_match, v_unformed_match, v_sent_match);
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.profiles
  WHERE id IN (
    v_host,
    v_formed_exit_user, v_formed_stay_user, v_formed_waiting_user,
    v_unformed_exit_user, v_unformed_stay_user, v_unformed_waiting_user,
    v_sent_exit_user, v_sent_stay_user, v_sent_waiting_user
  );
  DELETE FROM auth.users
  WHERE id IN (
    v_host,
    v_formed_exit_user, v_formed_stay_user, v_formed_waiting_user,
    v_unformed_exit_user, v_unformed_stay_user, v_unformed_waiting_user,
    v_sent_exit_user, v_sent_stay_user, v_sent_waiting_user
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue210_results r
  ORDER BY r.test_name;
END;
$$;
