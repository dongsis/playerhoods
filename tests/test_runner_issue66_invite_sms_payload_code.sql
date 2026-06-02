CREATE OR REPLACE FUNCTION public.test_runner_issue66_invite_sms_payload_code()
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
  v_org uuid := '66000000-0000-0000-0000-000000000001'::uuid;
  v_venue_id uuid := '66000000-0000-0000-0000-000000000002'::uuid;
  v_match_id uuid := '66000000-0000-0000-0000-000000000003'::uuid;
  v_guest_id uuid := '66000000-0000-0000-0000-000000000004'::uuid;
  v_participant_id uuid := '66000000-0000-0000-0000-000000000005'::uuid;
  v_guest_old_id uuid := '66000000-0000-0000-0000-000000000006'::uuid;
  v_participant_old_id uuid := '66000000-0000-0000-0000-000000000007'::uuid;
  v_guest_no_id uuid := '66000000-0000-0000-0000-000000000008'::uuid;
  v_participant_no_id uuid := '66000000-0000-0000-0000-000000000009'::uuid;
  v_phone text := '+15555556601';
  v_old_phone text := '+15555556602';
  v_no_phone text := '+15555556603';
  v_code text;
  v_reused_code text;
  v_reply text;
  v_payload jsonb;
  v_removed_at timestamptz;
  v_consumed_count integer;
  v_active_code_count integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue66_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue66_results;

  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' = v_match_id::text
     OR payload->>'match_participant_id' IN (v_participant_id::text, v_participant_old_id::text, v_participant_no_id::text);
  DELETE FROM public.match_participant_notification_events
  WHERE participant_id IN (v_participant_id, v_participant_old_id, v_participant_no_id);
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE participant_id IN (v_participant_id, v_participant_old_id, v_participant_no_id);
  DELETE FROM public.email_invitations
  WHERE match_participant_id IN (v_participant_id, v_participant_old_id, v_participant_no_id)
     OR related_id = v_match_id;
  DELETE FROM public.match_participant_actions
  WHERE match_participant_id IN (v_participant_id, v_participant_old_id, v_participant_no_id)
     OR match_id = v_match_id;
  DELETE FROM public.match_participants
  WHERE id IN (v_participant_id, v_participant_old_id, v_participant_no_id)
     OR match_id = v_match_id;
  DELETE FROM public.matches WHERE id = v_match_id;
  DELETE FROM public.guests WHERE id IN (v_guest_id, v_guest_old_id, v_guest_no_id);
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id = v_org;
  DELETE FROM auth.users WHERE id = v_org;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_org, 'issue66-organizer@example.test', now());

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites
  ) VALUES (
    v_org,
    '',
    '',
    'Issue 66 Organizer',
    'available',
    'recommended',
    true
  );

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue_id, 'Issue 66 Courts', 'America/Toronto');

  INSERT INTO public.sports (id, code, display_name, is_active)
  VALUES (1, 'tennis', 'tennis', true)
  ON CONFLICT (id) DO UPDATE
  SET code = excluded.code,
      display_name = excluded.display_name,
      is_active = excluded.is_active;

  INSERT INTO public.guests (id, display_name, created_by, email, phone, status)
  VALUES
    (v_guest_id, 'Issue 66 Player', v_org, 'issue66-player@example.test', v_phone, 'active'),
    (v_guest_old_id, 'Issue 66 Old Code', v_org, 'issue66-old@example.test', v_old_phone, 'active'),
    (v_guest_no_id, 'Issue 66 No Code', v_org, 'issue66-no@example.test', v_no_phone, 'active');

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
  ) VALUES (
    v_match_id,
    v_org,
    'active',
    v_venue_id,
    '{}'::uuid[],
    current_date + 7,
    '13:15'::time,
    90,
    'doubles',
    4,
    '{}'::uuid[],
    true,
    true,
    true,
    now()
  );

  INSERT INTO public.match_participants (
    id,
    match_id,
    join_method,
    guest_id,
    created_by,
    nominated_by,
    org_approved_at,
    org_approved_by
  ) VALUES
    (v_participant_id, v_match_id, 'nominated', v_guest_id, v_org, v_org, now(), v_org),
    (v_participant_old_id, v_match_id, 'nominated', v_guest_old_id, v_org, v_org, now(), v_org),
    (v_participant_no_id, v_match_id, 'nominated', v_guest_no_id, v_org, v_org, now(), v_org);

  v_code := public.notification_create_or_get_sms_reply_code(v_participant_id, 'invite');
  v_reused_code := public.notification_create_or_get_sms_reply_code(v_participant_id, 'confirmed_lineup');
  v_payload := public.notification_match_payload(v_participant_id, 'invite', '{}'::jsonb);

  INSERT INTO _issue66_results VALUES (
    'new generated RSVP code is two safe characters',
    v_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{2}$',
    'code=' || coalesce(v_code, 'NULL')
  );

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue66_results VALUES (
    'YES and NO paths reuse the same active participant code',
    v_code = v_reused_code
      AND v_active_code_count = 1,
    'invite=' || coalesce(v_code, 'NULL')
      || ' confirmed=' || coalesce(v_reused_code, 'NULL')
      || ' active_codes=' || v_active_code_count::text
  );

  INSERT INTO _issue66_results VALUES (
    'match_invite payload includes recipient name and sport name',
    v_payload->>'template_type' = 'match_invite'
      AND v_payload->>'recipient_name' = 'Issue 66 Player'
      AND v_payload->>'sport_name' = 'tennis'
      AND v_payload->>'game_type' = 'doubles',
    'payload=' || coalesce(v_payload::text, 'NULL')
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_code);

  INSERT INTO _issue66_results VALUES (
    'two-character code parses for YES reply',
    v_reply = 'You''re marked as in. Reply OUT ' || v_code || ' if you need to back out.',
    'reply=' || coalesce(v_reply, 'NULL')
  );

  INSERT INTO public.match_participant_sms_reply_codes (
    match_id,
    participant_id,
    phone_e164,
    code,
    purpose,
    expires_at
  ) VALUES (
    v_match_id,
    v_participant_old_id,
    public.normalize_discovery_phone(v_old_phone),
    'OLD66',
    'invite',
    now() + interval '30 days'
  );

  v_reply := public.rpc_sms_reply_handle(v_old_phone, 'YES OLD66');

  INSERT INTO _issue66_results VALUES (
    'existing longer active codes remain parseable',
    v_reply = 'You''re marked as in. Reply OUT OLD66 if you need to back out.',
    'reply=' || coalesce(v_reply, 'NULL')
  );

  PERFORM public.notification_create_or_get_sms_reply_code(v_participant_no_id, 'invite');
  v_reply := public.rpc_sms_reply_handle(v_no_phone, 'NO');

  SELECT removed_at INTO v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_no_id;

  SELECT count(*) INTO v_consumed_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_no_id
    AND consumed_at IS NOT NULL;

  INSERT INTO _issue66_results VALUES (
    'NO command without code is not mistaken for a two-character code',
    v_removed_at IS NOT NULL
      AND v_consumed_count = 1,
    'reply=' || coalesce(v_reply, 'NULL')
      || ' removed_at=' || coalesce(v_removed_at::text, 'NULL')
      || ' consumed=' || v_consumed_count::text
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue66_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_issue66_invite_sms_payload_code();
