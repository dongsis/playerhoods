CREATE OR REPLACE FUNCTION public.test_runner_public_join_not_this_time_sms()
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
  v_system uuid := '92000000-0000-0000-0000-000000000076'::uuid;
  v_host uuid := '92000000-0000-0000-0000-000000000001'::uuid;
  v_venue uuid := '92000000-0000-0000-0000-000000000002'::uuid;
  v_match uuid := '92000000-0000-0000-0000-000000000003'::uuid;
  v_match_non_public uuid := '92000000-0000-0000-0000-000000000004'::uuid;
  v_match_invited uuid := '92000000-0000-0000-0000-000000000005'::uuid;
  v_match_confirmed uuid := '92000000-0000-0000-0000-000000000006'::uuid;
  v_match_optout uuid := '92000000-0000-0000-0000-000000000007'::uuid;
  v_phone text := '4165550301';
  v_non_public_phone text := '4165550302';
  v_invited_phone text := '4165550303';
  v_confirmed_phone text := '4165550304';
  v_optout_phone text := '4165550305';
  v_link record;
  v_confirmed_link record;
  v_optout_link record;
  v_start record;
  v_confirm record;
  v_confirmed_start record;
  v_confirmed_confirm record;
  v_optout_start record;
  v_optout_confirm record;
  v_non_public_guest_id uuid;
  v_invited_guest_id uuid;
  v_non_public_mp_id uuid;
  v_invited_mp_id uuid;
  v_status text;
  v_status_repeat text;
  v_count integer;
  v_template text;
  v_destination text;
  v_host_name text;
  v_level_label text;
  v_summary_sms text;
  v_magic_link_path text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _public_join_not_this_time_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _public_join_not_this_time_results;

  DELETE FROM public.notification_deliveries
  WHERE destination IN (v_phone, v_non_public_phone, v_invited_phone, v_confirmed_phone, v_optout_phone)
     OR payload->>'match_id' IN (
       v_match::text,
       v_match_non_public::text,
       v_match_invited::text,
       v_match_confirmed::text,
       v_match_optout::text
     );
  DELETE FROM public.match_participant_notification_events
  WHERE match_id IN (v_match, v_match_non_public, v_match_invited, v_match_confirmed, v_match_optout);
  DELETE FROM public.contact_communication_opt_outs
  WHERE channel = 'sms'
    AND destination_normalized IN (v_phone, v_non_public_phone, v_invited_phone, v_confirmed_phone, v_optout_phone);
  DELETE FROM public.public_match_signup_sms_intents
  WHERE match_id IN (v_match, v_match_non_public, v_match_invited, v_match_confirmed, v_match_optout)
     OR phone_normalized IN (v_phone, v_non_public_phone, v_invited_phone, v_confirmed_phone, v_optout_phone);
  DELETE FROM public.public_match_signups
  WHERE match_id IN (v_match, v_match_non_public, v_match_invited, v_match_confirmed, v_match_optout);
  DELETE FROM public.public_match_signup_links
  WHERE match_id IN (v_match, v_match_non_public, v_match_invited, v_match_confirmed, v_match_optout);
  DELETE FROM public.public_match_signup_config;
  DELETE FROM public.match_participant_actions
  WHERE match_id IN (v_match, v_match_non_public, v_match_invited, v_match_confirmed, v_match_optout);
  DELETE FROM public.match_participants
  WHERE match_id IN (v_match, v_match_non_public, v_match_invited, v_match_confirmed, v_match_optout);
  DELETE FROM public.matches
  WHERE id IN (v_match, v_match_non_public, v_match_invited, v_match_confirmed, v_match_optout);
  DELETE FROM public.guests
  WHERE phone IN (v_phone, v_non_public_phone, v_invited_phone, v_confirmed_phone, v_optout_phone);
  DELETE FROM public.people
  WHERE display_name IN ('Public Join SMS', 'Confirmed Public Join', 'Opted Out Public Join');
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.profiles WHERE id IN (v_host, v_system);
  DELETE FROM auth.users WHERE id IN (v_host, v_system);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_system, 'not-this-time-system@example.test', now()),
    (v_host, 'not-this-time-host@example.test', now());

  INSERT INTO public.profiles (id, display_name)
  VALUES
    (v_system, 'SMS System Actor'),
    (v_host, 'Nancy Host');

  INSERT INTO public.public_match_signup_config(singleton_key, system_actor_user_id)
  VALUES (true, v_system);

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue, 'Not This Time Courts', 'America/Toronto');

  INSERT INTO public.matches (
    id,
    organizer_id,
    status,
    venue_id,
    sport_id,
    game_type,
    level,
    required_count,
    match_date,
    start_time,
    duration_minutes
  ) VALUES
    (v_match, v_host, 'active', v_venue, 1, 'not_this_time', '3.0-3.5', 2, current_date + 7, '18:00'::time, 90),
    (v_match_non_public, v_host, 'active', v_venue, 1, 'not_this_time_non_public', null, 2, current_date + 8, '19:00'::time, 90),
    (v_match_invited, v_host, 'active', v_venue, 1, 'not_this_time_invited', null, 2, current_date + 9, '20:00'::time, 90),
    (v_match_confirmed, v_host, 'active', v_venue, 1, 'not_this_time_confirmed', null, 2, current_date + 10, '21:00'::time, 90),
    (v_match_optout, v_host, 'active', v_venue, 1, 'not_this_time_optout', null, 2, current_date + 11, '22:00'::time, 90);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_host::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_link FROM public.rpc_public_match_signup_link_get_or_create(v_match) LIMIT 1;
  SELECT * INTO v_confirmed_link FROM public.rpc_public_match_signup_link_get_or_create(v_match_confirmed) LIMIT 1;
  SELECT * INTO v_optout_link FROM public.rpc_public_match_signup_link_get_or_create(v_match_optout) LIMIT 1;

  SELECT * INTO v_start
  FROM public.rpc_public_match_signup_start_sms(v_link.public_token, 'Public Join SMS', v_phone)
  LIMIT 1;

  SELECT * INTO v_confirm
  FROM public.rpc_public_match_signup_confirm_sms(v_start.sms_token)
  LIMIT 1;

  PERFORM public.rpc_match_remove_participant(v_confirm.match_participant_id, 'not this time');

  v_status := public.notification_enqueue_public_join_not_this_time_if_needed(v_confirm.match_participant_id, v_host);

  SELECT
    count(*)::integer,
    max(payload->>'template_type'),
    max(destination),
    max(payload->>'organizer_display_name'),
    max(payload->>'level_label'),
    max(payload->>'match_summary_sms'),
    max(payload->>'magic_link_path')
  INTO v_count, v_template, v_destination, v_host_name, v_level_label, v_summary_sms, v_magic_link_path
  FROM public.notification_deliveries
  WHERE payload->>'template_type' = 'public_join_not_this_time'
    AND payload->>'match_participant_id' = v_confirm.match_participant_id::text;

  INSERT INTO _public_join_not_this_time_results VALUES (
    'phone-confirmed public join Not This Time queues one SMS',
    v_status = 'queued'
      AND v_count = 1
      AND v_template = 'public_join_not_this_time'
      AND v_destination = v_phone
      AND v_host_name = 'Nancy Host'
      AND v_level_label = '3.0-3.5'
      AND v_summary_sms = '2 players needed.'
      AND v_magic_link_path LIKE '/i/%',
    'status=' || coalesce(v_status, 'null')
      || ', deliveries=' || coalesce(v_count::text, 'null')
      || ', level=' || coalesce(v_level_label, 'null')
      || ', summary=' || coalesce(v_summary_sms, 'null')
      || ', magic=' || coalesce(v_magic_link_path, 'null')
  );

  v_status_repeat := public.notification_enqueue_public_join_not_this_time_if_needed(v_confirm.match_participant_id, v_host);

  SELECT count(*)::integer
  INTO v_count
  FROM public.notification_deliveries
  WHERE payload->>'template_type' = 'public_join_not_this_time'
    AND payload->>'match_participant_id' = v_confirm.match_participant_id::text;

  INSERT INTO _public_join_not_this_time_results VALUES (
    'public join Not This Time enqueue is idempotent',
    v_status_repeat = 'already_queued'
      AND v_count = 1,
    'repeat_status=' || coalesce(v_status_repeat, 'null') || ', deliveries=' || coalesce(v_count::text, 'null')
  );

  INSERT INTO public.guests(display_name, email, phone, status, created_by)
  VALUES ('Non Public Request', null, v_non_public_phone, 'active', v_host)
  RETURNING id INTO v_non_public_guest_id;

  INSERT INTO public.match_participants(match_id, status, join_method, guest_id, created_by, participant_accepted_at, participant_accepted_via)
  VALUES (v_match_non_public, 'pending', 'requested', v_non_public_guest_id, v_host, now(), 'manual')
  RETURNING id INTO v_non_public_mp_id;

  PERFORM public.rpc_match_remove_participant(v_non_public_mp_id, 'not this time');
  v_status := public.notification_enqueue_public_join_not_this_time_if_needed(v_non_public_mp_id, v_host);

  INSERT INTO _public_join_not_this_time_results VALUES (
    'non-public requested participant does not enqueue public join Not This Time SMS',
    v_status = 'skipped_not_public_join'
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_deliveries d
        WHERE d.payload->>'template_type' = 'public_join_not_this_time'
          AND d.payload->>'match_participant_id' = v_non_public_mp_id::text
      ),
    'status=' || coalesce(v_status, 'null')
  );

  INSERT INTO public.guests(display_name, email, phone, status, created_by)
  VALUES ('Direct Invite Guest', null, v_invited_phone, 'active', v_host)
  RETURNING id INTO v_invited_guest_id;

  INSERT INTO public.match_participants(match_id, status, join_method, guest_id, created_by)
  VALUES (v_match_invited, 'pending', 'invited', v_invited_guest_id, v_host)
  RETURNING id INTO v_invited_mp_id;

  PERFORM public.rpc_match_remove_participant(v_invited_mp_id, 'cancel invite');
  v_status := public.notification_enqueue_public_join_not_this_time_if_needed(v_invited_mp_id, v_host);

  INSERT INTO _public_join_not_this_time_results VALUES (
    'direct invitation participant does not enqueue public join Not This Time SMS',
    v_status = 'skipped_not_public_join'
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_deliveries d
        WHERE d.payload->>'template_type' = 'public_join_not_this_time'
          AND d.payload->>'match_participant_id' = v_invited_mp_id::text
      ),
    'status=' || coalesce(v_status, 'null')
  );

  SELECT * INTO v_confirmed_start
  FROM public.rpc_public_match_signup_start_sms(v_confirmed_link.public_token, 'Confirmed Public Join', v_confirmed_phone)
  LIMIT 1;

  SELECT * INTO v_confirmed_confirm
  FROM public.rpc_public_match_signup_confirm_sms(v_confirmed_start.sms_token)
  LIMIT 1;

  UPDATE public.match_participants
  SET org_approved_at = now(),
      org_approved_by = v_host
  WHERE id = v_confirmed_confirm.match_participant_id;
  PERFORM public.match_participant_reconcile_status(v_confirmed_confirm.match_participant_id);
  PERFORM public.rpc_match_remove_participant(v_confirmed_confirm.match_participant_id, 'remove from lineup');
  v_status := public.notification_enqueue_public_join_not_this_time_if_needed(v_confirmed_confirm.match_participant_id, v_host);

  INSERT INTO _public_join_not_this_time_results VALUES (
    'confirmed lineup removal is not public join Not This Time',
    v_status = 'skipped_not_public_join'
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_deliveries d
        WHERE d.payload->>'template_type' = 'public_join_not_this_time'
          AND d.payload->>'match_participant_id' = v_confirmed_confirm.match_participant_id::text
      ),
    'status=' || coalesce(v_status, 'null')
  );

  SELECT * INTO v_optout_start
  FROM public.rpc_public_match_signup_start_sms(v_optout_link.public_token, 'Opted Out Public Join', v_optout_phone)
  LIMIT 1;

  SELECT * INTO v_optout_confirm
  FROM public.rpc_public_match_signup_confirm_sms(v_optout_start.sms_token)
  LIMIT 1;

  INSERT INTO public.contact_communication_opt_outs(channel, destination, destination_normalized, scope, reason, unsubscribed_at)
  VALUES ('sms', v_optout_phone, v_optout_phone, 'match_invites', 'test_opt_out', now())
  ON CONFLICT (channel, destination_normalized, scope)
  DO UPDATE SET unsubscribed_at = excluded.unsubscribed_at,
                reason = excluded.reason;

  PERFORM public.rpc_match_remove_participant(v_optout_confirm.match_participant_id, 'not this time');
  v_status := public.notification_enqueue_public_join_not_this_time_if_needed(v_optout_confirm.match_participant_id, v_host);

  INSERT INTO _public_join_not_this_time_results VALUES (
    'SMS opt-out skips public join Not This Time SMS',
    v_status = 'skipped_opted_out'
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_deliveries d
        WHERE d.payload->>'template_type' = 'public_join_not_this_time'
          AND d.payload->>'match_participant_id' = v_optout_confirm.match_participant_id::text
      ),
    'status=' || coalesce(v_status, 'null')
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _public_join_not_this_time_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_public_join_not_this_time_sms();
