CREATE OR REPLACE FUNCTION public.test_runner_public_join_sms_cutover()
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
  v_system uuid := '91000000-0000-0000-0000-000000000076'::uuid;
  v_host uuid := '91000000-0000-0000-0000-000000000001'::uuid;
  v_registered_player uuid := '91000000-0000-0000-0000-000000000008'::uuid;
  v_venue uuid := '91000000-0000-0000-0000-000000000002'::uuid;
  v_match uuid := '91000000-0000-0000-0000-000000000003'::uuid;
  v_match_decline uuid := '91000000-0000-0000-0000-000000000004'::uuid;
  v_match_expired uuid := '91000000-0000-0000-0000-000000000005'::uuid;
  v_match_yes uuid := '91000000-0000-0000-0000-000000000006'::uuid;
  v_match_registered uuid := '91000000-0000-0000-0000-000000000007'::uuid;
  v_phone text := '4165550199';
  v_decline_phone text := '4165550200';
  v_expired_phone text := '4165550201';
  v_yes_phone text := '4165550202';
  v_link record;
  v_decline_link record;
  v_expired_link record;
  v_yes_link record;
  v_registered_link record;
  v_start record;
  v_start_repeat record;
  v_confirm record;
  v_confirm_repeat record;
  v_decline_start record;
  v_decline_result record;
  v_expired_start record;
  v_expired_result record;
  v_yes_start record;
  v_yes_reply text;
  v_registered_mp public.match_participants%rowtype;
  v_participant_count integer;
  v_metadata record;
  v_delivery_count integer;
  v_magic_path text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _public_join_sms_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _public_join_sms_results;

  DELETE FROM public.notification_deliveries
  WHERE destination IN (v_phone, v_decline_phone, v_expired_phone, v_yes_phone)
     OR payload->>'match_id' IN (
       v_match::text,
       v_match_decline::text,
       v_match_expired::text,
       v_match_yes::text,
       v_match_registered::text
     );
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE phone_e164 IN (v_phone, v_decline_phone, v_expired_phone, v_yes_phone);
  DELETE FROM public.public_match_signup_sms_intents
  WHERE match_id IN (v_match, v_match_decline, v_match_expired, v_match_yes, v_match_registered)
     OR phone_normalized IN (v_phone, v_decline_phone, v_expired_phone, v_yes_phone);
  DELETE FROM public.public_match_signups
  WHERE match_id IN (v_match, v_match_decline, v_match_expired, v_match_yes, v_match_registered);
  DELETE FROM public.public_match_signup_links
  WHERE match_id IN (v_match, v_match_decline, v_match_expired, v_match_yes, v_match_registered);
  DELETE FROM public.public_match_signup_config;
  DELETE FROM public.match_participant_actions
  WHERE match_id IN (v_match, v_match_decline, v_match_expired, v_match_yes, v_match_registered);
  DELETE FROM public.match_participants
  WHERE match_id IN (v_match, v_match_decline, v_match_expired, v_match_yes, v_match_registered);
  DELETE FROM public.matches
  WHERE id IN (v_match, v_match_decline, v_match_expired, v_match_yes, v_match_registered);
  DELETE FROM public.guests
  WHERE phone IN (v_phone, v_decline_phone, v_expired_phone, v_yes_phone);
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.profiles WHERE id IN (v_host, v_registered_player, v_system);
  DELETE FROM auth.users WHERE id IN (v_host, v_registered_player, v_system);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_system, 'sms-system@example.test', now()),
    (v_host, 'sms-host@example.test', now()),
    (v_registered_player, 'sms-registered@example.test', now());

  INSERT INTO public.profiles (id, display_name)
  VALUES
    (v_system, 'SMS System Actor'),
    (v_host, 'Nancy Host'),
    (v_registered_player, 'Registered Player');

  INSERT INTO public.public_match_signup_config(singleton_key, system_actor_user_id)
  VALUES (true, v_system);

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue, 'SMS Cutover Courts', 'America/Toronto');

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
    duration_minutes
  ) VALUES
    (v_match, v_host, 'active', v_venue, 1, 'sms_cutover', 2, current_date + 7, '18:00'::time, 90),
    (v_match_decline, v_host, 'active', v_venue, 1, 'sms_cutover_decline', 2, current_date + 8, '19:00'::time, 90),
    (v_match_expired, v_host, 'active', v_venue, 1, 'sms_cutover_expired', 2, current_date + 9, '20:00'::time, 90),
    (v_match_yes, v_host, 'active', v_venue, 1, 'sms_cutover_yes', 2, current_date + 10, '21:00'::time, 90),
    (v_match_registered, v_host, 'active', v_venue, 1, 'sms_cutover_registered', 2, current_date + 11, '22:00'::time, 90);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_host::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_link FROM public.rpc_public_match_signup_link_get_or_create(v_match) LIMIT 1;
  SELECT * INTO v_decline_link FROM public.rpc_public_match_signup_link_get_or_create(v_match_decline) LIMIT 1;
  SELECT * INTO v_expired_link FROM public.rpc_public_match_signup_link_get_or_create(v_match_expired) LIMIT 1;
  SELECT * INTO v_yes_link FROM public.rpc_public_match_signup_link_get_or_create(v_match_yes) LIMIT 1;
  SELECT * INTO v_registered_link FROM public.rpc_public_match_signup_link_get_or_create(v_match_registered) LIMIT 1;

  SELECT * INTO v_start
  FROM public.rpc_public_match_signup_start_sms(v_link.public_token, 'Annie Chen', '+1 (416) 555-0199')
  LIMIT 1;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match;

  INSERT INTO _public_join_sms_results VALUES (
    'start_sms creates pending intent only',
    v_start.sms_intent_id IS NOT NULL
      AND v_start.status = 'sms_queued'
      AND v_start.sms_send_required = true
      AND v_start.sms_token IS NOT NULL
      AND v_participant_count = 0,
    'status=' || coalesce(v_start.status, 'null') || ', participants=' || v_participant_count::text
  );

  SELECT * INTO v_start_repeat
  FROM public.rpc_public_match_signup_start_sms(v_link.public_token, 'Annie Chen', v_phone)
  LIMIT 1;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match;

  INSERT INTO _public_join_sms_results VALUES (
    'duplicate start_sms reuses active pending intent without participant',
    v_start_repeat.sms_intent_id = v_start.sms_intent_id
      AND v_start_repeat.status = 'sms_recently_sent'
      AND v_start_repeat.sms_send_required = false
      AND v_participant_count = 0,
    'repeat_status=' || coalesce(v_start_repeat.status, 'null') || ', participants=' || v_participant_count::text
  );

  SELECT * INTO v_confirm
  FROM public.rpc_public_match_signup_confirm_sms(v_start.sms_token)
  LIMIT 1;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants mp
  WHERE mp.match_id = v_match
    AND mp.guest_id IS NOT NULL
    AND mp.join_method = 'requested'
    AND mp.participant_accepted_at IS NOT NULL
    AND mp.org_approved_at IS NULL
    AND mp.removed_at IS NULL;

  INSERT INTO _public_join_sms_results VALUES (
    'confirm_sms creates phone-confirmed requested participant',
    v_confirm.status = 'request_created'
      AND v_confirm.match_participant_id IS NOT NULL
      AND v_participant_count = 1,
    'confirm_status=' || coalesce(v_confirm.status, 'null') || ', participants=' || v_participant_count::text
  );

  SELECT * INTO v_confirm_repeat
  FROM public.rpc_public_match_signup_confirm_sms(v_start.sms_token)
  LIMIT 1;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match
    AND removed_at IS NULL;

  INSERT INTO _public_join_sms_results VALUES (
    'confirm_sms is idempotent',
    v_confirm_repeat.match_participant_id = v_confirm.match_participant_id
      AND v_participant_count = 1,
    'repeat_participant=' || coalesce(v_confirm_repeat.match_participant_id::text, 'null') || ', participants=' || v_participant_count::text
  );

  SELECT * INTO v_metadata
  FROM public.rpc_public_match_signup_participant_metadata(v_match)
  LIMIT 1;

  INSERT INTO _public_join_sms_results VALUES (
    'host metadata shows phone confirmed public share source',
    v_metadata.match_participant_id = v_confirm.match_participant_id
      AND v_metadata.source = 'public_match_signup'
      AND v_metadata.phone_confirmed = true
      AND v_metadata.contact_state = 'phone_confirmed',
    'contact_state=' || coalesce(v_metadata.contact_state, 'null')
  );

  PERFORM public.rpc_match_org_approve_participant(v_confirm.match_participant_id);

  SELECT count(*)::integer, max(payload->>'magic_link_path')
  INTO v_delivery_count, v_magic_path
  FROM public.notification_deliveries
  WHERE destination = v_phone
    AND payload->>'template_type' = 'host_managed_confirmation'
    AND payload->>'match_participant_id' = v_confirm.match_participant_id::text;

  INSERT INTO _public_join_sms_results VALUES (
    'host add to lineup queues SMS with invitation magic link anchor',
    v_delivery_count = 1
      AND v_magic_path LIKE '/i/%',
    'deliveries=' || v_delivery_count::text || ', magic_link_path=' || coalesce(v_magic_path, 'null')
  );

  SELECT * INTO v_decline_start
  FROM public.rpc_public_match_signup_start_sms(v_decline_link.public_token, 'Not Today', v_decline_phone)
  LIMIT 1;

  SELECT * INTO v_decline_result
  FROM public.rpc_public_match_signup_decline_sms(v_decline_start.sms_token)
  LIMIT 1;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match_decline;

  INSERT INTO _public_join_sms_results VALUES (
    'decline_sms closes intent without participant',
    v_decline_result.status = 'declined_by_guest'
      AND v_participant_count = 0,
    'decline_status=' || coalesce(v_decline_result.status, 'null') || ', participants=' || v_participant_count::text
  );

  SELECT * INTO v_expired_start
  FROM public.rpc_public_match_signup_start_sms(v_expired_link.public_token, 'Expired Guest', v_expired_phone)
  LIMIT 1;

  UPDATE public.public_match_signup_sms_intents
  SET expires_at = now() - interval '1 minute'
  WHERE id = v_expired_start.sms_intent_id;

  SELECT * INTO v_expired_result
  FROM public.rpc_public_match_signup_confirm_sms(v_expired_start.sms_token)
  LIMIT 1;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match_expired;

  INSERT INTO _public_join_sms_results VALUES (
    'expired token cannot create participant',
    v_expired_result.status = 'expired'
      AND v_participant_count = 0,
    'expired_status=' || coalesce(v_expired_result.status, 'null') || ', participants=' || v_participant_count::text
  );

  SELECT * INTO v_yes_start
  FROM public.rpc_public_match_signup_start_sms(v_yes_link.public_token, 'Yes Should Not Join', v_yes_phone)
  LIMIT 1;

  v_yes_reply := public.rpc_sms_reply_handle(v_yes_phone, 'YES');

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match_yes;

  INSERT INTO _public_join_sms_results VALUES (
    'public join requires JOIN and does not treat YES as public request',
    v_participant_count = 0
      AND v_yes_reply LIKE '%active invite%',
    'reply=' || coalesce(v_yes_reply, 'null') || ', participants=' || v_participant_count::text
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_registered_player::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_registered_mp
  FROM public.rpc_public_match_registered_request_join(v_registered_link.public_token);

  INSERT INTO _public_join_sms_results VALUES (
    'registered public join path remains unchanged',
    v_registered_mp.match_id = v_match_registered
      AND v_registered_mp.user_id = v_registered_player
      AND v_registered_mp.join_method = 'requested',
    'registered_participant=' || coalesce(v_registered_mp.id::text, 'null')
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _public_join_sms_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_public_join_sms_cutover();
