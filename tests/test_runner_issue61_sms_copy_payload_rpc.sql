CREATE OR REPLACE FUNCTION public.test_runner_issue61_sms_copy_payload_rpc()
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
  v_org uuid := '61000000-0000-0000-0000-000000000001'::uuid;
  v_user uuid := '61000000-0000-0000-0000-000000000002'::uuid;
  v_venue_id uuid := '61000000-0000-0000-0000-000000000003'::uuid;
  v_match_id uuid := '61000000-0000-0000-0000-000000000004'::uuid;
  v_guest_id uuid := '61000000-0000-0000-0000-000000000005'::uuid;
  v_participant_id uuid := '61000000-0000-0000-0000-000000000006'::uuid;
  v_user_participant_id uuid := '61000000-0000-0000-0000-000000000007'::uuid;
  v_guest_multi_1 uuid := '61000000-0000-0000-0000-000000000008'::uuid;
  v_guest_multi_2 uuid := '61000000-0000-0000-0000-000000000009'::uuid;
  v_participant_multi_1 uuid := '61000000-0000-0000-0000-000000000010'::uuid;
  v_participant_multi_2 uuid := '61000000-0000-0000-0000-000000000011'::uuid;
  v_match_multi_1 uuid := '61000000-0000-0000-0000-000000000012'::uuid;
  v_match_multi_2 uuid := '61000000-0000-0000-0000-000000000013'::uuid;
  v_phone text := '+15555556161';
  v_multi_phone text := '+15555556162';
  v_code text;
  v_code_multi_1 text;
  v_code_multi_2 text;
  v_payload jsonb;
  v_reply text;
  v_reply_2 text;
  v_removed_at timestamptz;
  v_accepted_at timestamptz;
  v_active_code_count integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue61_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue61_results;

  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' IN (v_match_id::text, v_match_multi_1::text, v_match_multi_2::text)
     OR payload->>'match_participant_id' IN (
       v_participant_id::text,
       v_user_participant_id::text,
       v_participant_multi_1::text,
       v_participant_multi_2::text
     );
  DELETE FROM public.match_participant_notification_events
  WHERE participant_id IN (v_participant_id, v_user_participant_id, v_participant_multi_1, v_participant_multi_2);
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE participant_id IN (v_participant_id, v_user_participant_id, v_participant_multi_1, v_participant_multi_2);
  DELETE FROM public.email_invitations
  WHERE match_participant_id IN (v_participant_id, v_user_participant_id, v_participant_multi_1, v_participant_multi_2)
     OR related_id IN (v_match_id, v_match_multi_1, v_match_multi_2);
  DELETE FROM public.match_participant_actions
  WHERE match_participant_id IN (v_participant_id, v_user_participant_id, v_participant_multi_1, v_participant_multi_2)
     OR match_id IN (v_match_id, v_match_multi_1, v_match_multi_2);
  DELETE FROM public.match_participants
  WHERE id IN (v_participant_id, v_user_participant_id, v_participant_multi_1, v_participant_multi_2)
     OR match_id IN (v_match_id, v_match_multi_1, v_match_multi_2);
  DELETE FROM public.matches WHERE id IN (v_match_id, v_match_multi_1, v_match_multi_2);
  DELETE FROM public.guests WHERE id IN (v_guest_id, v_guest_multi_1, v_guest_multi_2);
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id IN (v_org, v_user);
  DELETE FROM auth.users WHERE id IN (v_org, v_user);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_org, 'issue61-organizer@example.test', now()),
    (v_user, 'issue61-player@example.test', now());

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites
  ) VALUES
    (v_org, '', '', 'Issue 61 Organizer', 'available', 'recommended', true),
    (v_user, '', '', 'Issue 61 Registered', 'available', 'recommended', true);

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue_id, 'Issue 61 Courts', 'America/Vancouver');

  INSERT INTO public.guests (id, display_name, created_by, email, phone, status)
  VALUES
    (v_guest_id, 'Issue 61 Guest', v_org, 'issue61-guest@example.test', v_phone, 'active'),
    (v_guest_multi_1, 'Issue 61 Multi One', v_org, 'issue61-multi-one@example.test', v_multi_phone, 'active'),
    (v_guest_multi_2, 'Issue 61 Multi Two', v_org, 'issue61-multi-two@example.test', v_multi_phone, 'active');

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
    created_at
  ) VALUES
    (v_match_id, v_org, 'active', v_venue_id, '{}'::uuid[], current_date + 7, '18:30'::time, 90, 'tennis', 4, '{}'::uuid[], true, true, true, now()),
    (v_match_multi_1, v_org, 'active', v_venue_id, '{}'::uuid[], current_date + 8, '09:00'::time, 90, 'tennis', 4, '{}'::uuid[], true, true, true, now()),
    (v_match_multi_2, v_org, 'active', v_venue_id, '{}'::uuid[], current_date + 9, '19:15'::time, 90, 'tennis', 4, '{}'::uuid[], true, true, true, now());

  INSERT INTO public.match_participants (
    id,
    match_id,
    join_method,
    guest_id,
    created_by,
    nominated_by
  ) VALUES
    (v_participant_id, v_match_id, 'nominated', v_guest_id, v_org, v_org),
    (v_participant_multi_1, v_match_multi_1, 'nominated', v_guest_multi_1, v_org, v_org),
    (v_participant_multi_2, v_match_multi_2, 'nominated', v_guest_multi_2, v_org, v_org);

  INSERT INTO public.match_participants (
    id,
    match_id,
    join_method,
    user_id,
    created_by,
    nominated_by,
    org_approved_at,
    org_approved_by
  ) VALUES (
    v_user_participant_id,
    v_match_id,
    'invited',
    v_user,
    v_org,
    v_org,
    now(),
    v_org
  );

  SELECT public.notification_match_payload(v_participant_id, 'invite', '{}'::jsonb)
  INTO v_payload;

  INSERT INTO _issue61_results VALUES (
    'notification_match_payload includes guest recipient_name and venue_timezone',
    v_payload->>'recipient_name' = 'Issue 61 Guest'
      AND v_payload->>'venue_timezone' = 'America/Vancouver',
    v_payload::text
  );

  SELECT public.notification_match_payload(v_user_participant_id, 'confirmed_lineup', '{}'::jsonb)
  INTO v_payload;

  INSERT INTO _issue61_results VALUES (
    'notification_match_payload includes registered recipient_name',
    v_payload->>'recipient_name' = 'Issue 61 Registered'
      AND v_payload->>'venue_timezone' = 'America/Vancouver',
    v_payload::text
  );

  SELECT public.notification_host_offline_confirmation_payload(v_participant_id, v_org)
  INTO v_payload;

  INSERT INTO _issue61_results VALUES (
    'host managed confirmation payload includes recipient_name and venue_timezone',
    v_payload->>'recipient_name' = 'Issue 61 Guest'
      AND v_payload->>'venue_timezone' = 'America/Vancouver'
      AND v_payload->>'organizer_display_name' = 'Issue 61 Organizer',
    v_payload::text
  );

  v_code := public.notification_create_or_get_sms_reply_code(v_participant_id, 'invite');
  v_reply := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_code);

  SELECT participant_accepted_at INTO v_accepted_at
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue61_results VALUES (
    'pending organizer approval YES copy mentions OUT and preserves active code',
    v_reply = 'You''re marked as interested. Reply OUT ' || v_code || ' if you need to back out. We''ll let you know if you''re confirmed to play.'
      AND v_accepted_at IS NOT NULL
      AND v_active_code_count = 1,
    'reply=' || coalesce(v_reply, 'NULL') || ' active_codes=' || v_active_code_count::text
  );

  v_reply_2 := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_code);

  INSERT INTO _issue61_results VALUES (
    'repeated YES copy mentions OUT',
    v_reply_2 = 'You''re already marked as in. Reply OUT ' || v_code || ' if you need to back out.',
    'reply=' || coalesce(v_reply_2, 'NULL')
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'NO ' || v_code);

  SELECT removed_at INTO v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue61_results VALUES (
    'NO after accepted copy mentions OUT and does not remove or consume',
    v_reply = 'You''re already marked as in. Reply OUT ' || v_code || ' if you need to back out.'
      AND v_removed_at IS NULL
      AND v_active_code_count = 1,
    'reply=' || coalesce(v_reply, 'NULL') || ' removed_at=' || coalesce(v_removed_at::text, 'NULL') || ' active_codes=' || v_active_code_count::text
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'DETAILS ' || v_code);

  INSERT INTO _issue61_results VALUES (
    'DETAILS returns match link',
    v_reply like 'View match details here: %',
    'reply=' || coalesce(v_reply, 'NULL')
  );

  v_code_multi_1 := public.notification_create_or_get_sms_reply_code(v_participant_multi_1, 'invite');
  v_code_multi_2 := public.notification_create_or_get_sms_reply_code(v_participant_multi_2, 'invite');
  v_reply := public.rpc_sms_reply_handle(v_multi_phone, 'YES');

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participants
  WHERE id IN (v_participant_multi_1, v_participant_multi_2)
    AND participant_accepted_at IS NULL
    AND removed_at IS NULL;

  INSERT INTO _issue61_results VALUES (
    'multiple invite disambiguation uses short codes and local match time without mutation',
    v_reply like 'You have multiple invites. Reply YES %'
      AND position(v_code_multi_1 in v_reply) > 0
      AND position(v_code_multi_2 in v_reply) > 0
      AND v_reply like '%9:00 AM%'
      AND v_reply like '%7:15 PM%'
      AND v_active_code_count = 2,
    'reply=' || coalesce(v_reply, 'NULL') || ' untouched_candidates=' || v_active_code_count::text
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'HELP');

  INSERT INTO _issue61_results VALUES (
    'HELP copy includes YES NO OUT and DETAILS',
    position('YES {code}' in v_reply) > 0
      AND position('NO {code}' in v_reply) > 0
      AND position('OUT {code}' in v_reply) > 0
      AND position('DETAILS {code}' in v_reply) > 0,
    'reply=' || coalesce(v_reply, 'NULL')
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'WHAT');

  INSERT INTO _issue61_results VALUES (
    'unknown command copy includes YES NO OUT and DETAILS',
    position('YES {code}' in v_reply) > 0
      AND position('NO {code}' in v_reply) > 0
      AND position('OUT {code}' in v_reply) > 0
      AND position('DETAILS {code}' in v_reply) > 0,
    'reply=' || coalesce(v_reply, 'NULL')
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue61_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_issue61_sms_copy_payload_rpc();
