CREATE OR REPLACE FUNCTION public.test_runner_scoped_confirmed_lineup_drain()
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
  v_org uuid := '6d100000-0000-0000-0000-000000000001'::uuid;
  v_player uuid := '6d100000-0000-0000-0000-000000000002'::uuid;
  v_other_player uuid := '6d100000-0000-0000-0000-000000000003'::uuid;
  v_venue_id uuid := '6d100000-0000-0000-0000-000000000004'::uuid;
  v_match_id uuid := '6d100000-0000-0000-0000-000000000005'::uuid;
  v_other_match_id uuid := '6d100000-0000-0000-0000-000000000006'::uuid;
  v_org_participant_id uuid := '6d100000-0000-0000-0000-000000000007'::uuid;
  v_player_participant_id uuid := '6d100000-0000-0000-0000-000000000008'::uuid;
  v_other_participant_id uuid := '6d100000-0000-0000-0000-000000000009'::uuid;
  v_other_lineup_delivery_id uuid := '6d100000-0000-0000-0000-000000000010'::uuid;
  v_critical_delivery_id uuid := '6d100000-0000-0000-0000-000000000011'::uuid;
  v_payload_only_delivery_id uuid := '6d100000-0000-0000-0000-000000000012'::uuid;
  v_lineup_delivery_id uuid;
  v_queued_count integer;
  v_claimed_count integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _scoped_lineup_drain_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _scoped_lineup_drain_results;

  DELETE FROM public.match_participant_notification_events
  WHERE participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR delivery_id IN (v_other_lineup_delivery_id, v_critical_delivery_id, v_payload_only_delivery_id);
  DELETE FROM public.notification_deliveries
  WHERE id IN (v_other_lineup_delivery_id, v_critical_delivery_id, v_payload_only_delivery_id)
     OR payload->>'match_id' IN (v_match_id::text, v_other_match_id::text)
     OR payload->>'match_participant_id' IN (
       v_org_participant_id::text,
       v_player_participant_id::text,
       v_other_participant_id::text
     );
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id);
  DELETE FROM public.email_invitations
  WHERE match_participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR related_id IN (v_match_id, v_other_match_id);
  DELETE FROM public.match_participant_actions
  WHERE match_participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR match_id IN (v_match_id, v_other_match_id);
  DELETE FROM public.match_participants
  WHERE id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR match_id IN (v_match_id, v_other_match_id);
  DELETE FROM public.matches WHERE id IN (v_match_id, v_other_match_id);
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id IN (v_org, v_player, v_other_player);
  DELETE FROM auth.users WHERE id IN (v_org, v_player, v_other_player);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_org, 'scoped-lineup-organizer@example.test', now()),
    (v_player, 'scoped-lineup-player@example.test', now()),
    (v_other_player, 'scoped-lineup-other@example.test', now());

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites
  ) VALUES
    (v_org, '', '', 'Scoped Lineup Organizer', 'available', 'recommended', true),
    (v_player, '', '', 'Scoped Lineup Player', 'available', 'recommended', true),
    (v_other_player, '', '', 'Scoped Lineup Other', 'available', 'recommended', true);

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue_id, 'Scoped Lineup Courts', 'America/Toronto');

  INSERT INTO public.matches (
    id,
    organizer_id,
    status,
    venue_id,
    court_ids,
    match_date,
    start_time,
    duration_minutes,
    game_type,
    required_count,
    invitation_scope_group_ids,
    can_participants_invite_users,
    can_participants_add_guests,
    can_participants_manage_participants,
    formed_at,
    created_at
  ) VALUES
    (
      v_match_id,
      v_org,
      'active',
      v_venue_id,
      '{}'::uuid[],
      (now() at time zone 'America/Toronto')::date + 1,
      '18:30'::time,
      90,
      'tennis',
      2,
      '{}'::uuid[],
      true,
      true,
      true,
      null,
      now()
    ),
    (
      v_other_match_id,
      v_org,
      'active',
      v_venue_id,
      '{}'::uuid[],
      (now() at time zone 'America/Toronto')::date + 1,
      '20:00'::time,
      90,
      'tennis',
      2,
      '{}'::uuid[],
      true,
      true,
      true,
      now(),
      now()
    );

  INSERT INTO public.match_participants (
    id,
    match_id,
    join_method,
    user_id,
    created_by,
    nominated_by,
    status,
    confirmed_at,
    participant_accepted_at,
    participant_accepted_via,
    org_approved_at,
    org_approved_by
  ) VALUES
    (
      v_org_participant_id,
      v_match_id,
      'invited',
      v_org,
      v_org,
      v_org,
      'confirmed',
      now(),
      now(),
      'in_app',
      now(),
      v_org
    ),
    (
      v_player_participant_id,
      v_match_id,
      'invited',
      v_player,
      v_org,
      v_org,
      'confirmed',
      now(),
      now(),
      'in_app',
      now(),
      v_org
    ),
    (
      v_other_participant_id,
      v_other_match_id,
      'invited',
      v_other_player,
      v_org,
      v_org,
      'confirmed',
      now(),
      now(),
      'in_app',
      now(),
      v_org
    );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_org::text, 'role', 'authenticated')::text,
    true
  );

  v_queued_count := public.rpc_match_confirm_and_notify(v_match_id);

  SELECT nd.id
  INTO v_lineup_delivery_id
  FROM public.notification_deliveries nd
  JOIN public.match_participant_notification_events e ON e.delivery_id = nd.id
  WHERE e.match_id = v_match_id
    AND e.participant_id = v_player_participant_id
    AND e.notification_type = 'confirmed_lineup'
    AND nd.delivery_status = 'queued'
    AND nd.payload->>'template_type' = 'confirmed_lineup'
  LIMIT 1;

  INSERT INTO _scoped_lineup_drain_results(test_name, ok, details)
  SELECT
    'Form Match queues current match confirmed_lineup delivery',
    v_lineup_delivery_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matches
        WHERE id = v_match_id
          AND formed_at IS NOT NULL
      ),
    'queued=' || coalesce(v_queued_count::text, 'null')
      || ', delivery=' || coalesce(v_lineup_delivery_id::text, 'null');

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
      v_other_lineup_delivery_id,
      'email',
      'resend',
      'scoped-lineup-other@example.test',
      'queued',
      0,
      jsonb_build_object(
        'template_type', 'confirmed_lineup',
        'match_id', v_other_match_id,
        'match_participant_id', v_other_participant_id
      )
    ),
    (
      v_critical_delivery_id,
      'email',
      'resend',
      'scoped-lineup-critical@example.test',
      'queued',
      0,
      jsonb_build_object(
        'template_type', 'critical_update',
        'match_id', v_match_id,
        'match_participant_id', v_player_participant_id
      )
    ),
    (
      v_payload_only_delivery_id,
      'email',
      'resend',
      'scoped-lineup-payload-only@example.test',
      'queued',
      0,
      jsonb_build_object(
        'template_type', 'confirmed_lineup',
        'match_id', v_match_id,
        'match_participant_id', v_player_participant_id
      )
    );

  INSERT INTO public.match_participant_notification_events (
    match_id,
    participant_id,
    notification_type,
    dedupe_key,
    channel,
    destination,
    delivery_id,
    sent_at
  ) VALUES
    (
      v_other_match_id,
      v_other_participant_id,
      'confirmed_lineup',
      'confirmed_lineup:' || v_other_match_id::text,
      'email',
      'scoped-lineup-other@example.test',
      v_other_lineup_delivery_id,
      now()
    ),
    (
      v_match_id,
      v_player_participant_id,
      'critical_update',
      'critical_update:' || v_match_id::text,
      'email',
      'scoped-lineup-critical@example.test',
      v_critical_delivery_id,
      now()
    );

  INSERT INTO _scoped_lineup_drain_results(test_name, ok, details)
  SELECT
    'scoped claimant function is service-role only',
    has_function_privilege('anon'::regrole, 'public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid,integer)', 'EXECUTE') = false
      AND has_function_privilege('authenticated'::regrole, 'public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid,integer)', 'EXECUTE') = false
      AND has_function_privilege('service_role'::regrole, 'public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid,integer)', 'EXECUTE') = true,
    'anon=' || has_function_privilege('anon'::regrole, 'public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid,integer)', 'EXECUTE')::text
      || ', authenticated=' || has_function_privilege('authenticated'::regrole, 'public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid,integer)', 'EXECUTE')::text
      || ', service_role=' || has_function_privilege('service_role'::regrole, 'public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid,integer)', 'EXECUTE')::text;

  SELECT count(*)::integer
  INTO v_claimed_count
  FROM public.rpc_get_queued_confirmed_lineup_deliveries_for_match(v_match_id, 10);

  INSERT INTO _scoped_lineup_drain_results(test_name, ok, details)
  SELECT
    'scoped claimant claims only current match confirmed_lineup event',
    v_claimed_count = 1
      AND EXISTS (
        SELECT 1
        FROM public.notification_deliveries
        WHERE id = v_lineup_delivery_id
          AND delivery_status = 'sending'
          AND attempt_count = 1
          AND last_attempt_at IS NOT NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.notification_deliveries
        WHERE id = v_other_lineup_delivery_id
          AND delivery_status = 'queued'
          AND attempt_count = 0
          AND last_attempt_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.notification_deliveries
        WHERE id = v_critical_delivery_id
          AND delivery_status = 'queued'
          AND attempt_count = 0
          AND last_attempt_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.notification_deliveries
        WHERE id = v_payload_only_delivery_id
          AND delivery_status = 'queued'
          AND attempt_count = 0
          AND last_attempt_at IS NULL
      ),
    'claimed=' || v_claimed_count::text;

  PERFORM set_config('request.jwt.claims', '{}'::text, true);

  DELETE FROM public.match_participant_notification_events
  WHERE participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR delivery_id IN (
       v_lineup_delivery_id,
       v_other_lineup_delivery_id,
       v_critical_delivery_id,
       v_payload_only_delivery_id
     );
  DELETE FROM public.notification_deliveries
  WHERE id IN (
       v_lineup_delivery_id,
       v_other_lineup_delivery_id,
       v_critical_delivery_id,
       v_payload_only_delivery_id
     )
     OR payload->>'match_id' IN (v_match_id::text, v_other_match_id::text)
     OR payload->>'match_participant_id' IN (
       v_org_participant_id::text,
       v_player_participant_id::text,
       v_other_participant_id::text
     );
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id);
  DELETE FROM public.email_invitations
  WHERE match_participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR related_id IN (v_match_id, v_other_match_id);
  DELETE FROM public.match_participant_actions
  WHERE match_participant_id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR match_id IN (v_match_id, v_other_match_id);
  DELETE FROM public.match_participants
  WHERE id IN (v_org_participant_id, v_player_participant_id, v_other_participant_id)
     OR match_id IN (v_match_id, v_other_match_id);
  DELETE FROM public.matches WHERE id IN (v_match_id, v_other_match_id);
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id IN (v_org, v_player, v_other_player);
  DELETE FROM auth.users WHERE id IN (v_org, v_player, v_other_player);

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _scoped_lineup_drain_results r
  ORDER BY r.test_name;
END;
$$;
