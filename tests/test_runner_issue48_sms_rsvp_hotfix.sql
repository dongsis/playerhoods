CREATE OR REPLACE FUNCTION public.test_runner_issue48_sms_rsvp_hotfix()
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
  v_org uuid := '48000000-0000-0000-0000-000000000001'::uuid;
  v_guest_id uuid := '48000000-0000-0000-0000-000000000002'::uuid;
  v_venue_id uuid := '48000000-0000-0000-0000-000000000003'::uuid;
  v_match_id uuid := '48000000-0000-0000-0000-000000000004'::uuid;
  v_participant_id uuid := '48000000-0000-0000-0000-000000000005'::uuid;
  v_phone text := '+15555554848';
  v_invite_code text;
  v_confirmed_code text;
  v_reminder_code text;
  v_payload jsonb;
  v_delivery_1 uuid;
  v_delivery_2 uuid;
  v_pending_anchor_count integer;
  v_active_code_count integer;
  v_event_count integer;
  v_delivery_count integer;
  v_reply text;
  v_unique_guard_ok boolean := false;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue48_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue48_results;

  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' = v_match_id::text
     OR payload->>'match_participant_id' = v_participant_id::text;
  DELETE FROM public.match_participant_notification_events WHERE participant_id = v_participant_id;
  DELETE FROM public.match_participant_sms_reply_codes WHERE participant_id = v_participant_id;
  DELETE FROM public.email_invitations WHERE match_participant_id = v_participant_id OR related_id = v_match_id;
  DELETE FROM public.match_participant_actions WHERE match_participant_id = v_participant_id OR match_id = v_match_id;
  DELETE FROM public.match_participants WHERE id = v_participant_id OR match_id = v_match_id;
  DELETE FROM public.matches WHERE id = v_match_id;
  DELETE FROM public.guests WHERE id = v_guest_id;
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id = v_org;
  DELETE FROM auth.users WHERE id = v_org;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_org, 'issue48-organizer@example.test', now());

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
    'Issue 48 Organizer',
    'available',
    'recommended',
    true
  );

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue_id, 'Issue 48 Courts', 'America/Toronto');

  INSERT INTO public.guests (id, display_name, created_by, email, phone, status)
  VALUES (v_guest_id, 'Issue 48 Contact', v_org, 'issue48-contact@example.test', v_phone, 'active');

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
    '09:00'::time,
    90,
    'issue48',
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
  ) VALUES (
    v_participant_id,
    v_match_id,
    'nominated',
    v_guest_id,
    v_org,
    v_org,
    now(),
    v_org
  );

  SELECT public.notification_match_payload(v_participant_id, 'invite', '{}'::jsonb)
  INTO v_payload;

  SELECT count(*) INTO v_pending_anchor_count
  FROM public.email_invitations
  WHERE match_participant_id = v_participant_id
    AND status = 'pending';

  INSERT INTO _issue48_results VALUES (
    'one contact participant has one pending invitation anchor after payload creation',
    v_pending_anchor_count = 1,
    'pending_anchors=' || v_pending_anchor_count::text
  );

  v_invite_code := public.notification_create_or_get_sms_reply_code(v_participant_id, 'invite');
  v_confirmed_code := public.notification_create_or_get_sms_reply_code(v_participant_id, 'confirmed_lineup');
  v_reminder_code := public.notification_create_or_get_sms_reply_code(v_participant_id, 'match_reminder');

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue48_results VALUES (
    'invite confirmed_lineup and reminder reuse one active SMS code',
    v_active_code_count = 1
      AND v_invite_code = v_confirmed_code
      AND v_confirmed_code = v_reminder_code,
    'active_codes=' || v_active_code_count::text
      || ' invite=' || coalesce(v_invite_code, 'NULL')
      || ' confirmed=' || coalesce(v_confirmed_code, 'NULL')
      || ' reminder=' || coalesce(v_reminder_code, 'NULL')
  );

  BEGIN
    INSERT INTO public.match_participant_sms_reply_codes (
      match_id,
      participant_id,
      phone_e164,
      code,
      purpose,
      expires_at
    ) VALUES (
      v_match_id,
      v_participant_id,
      v_phone,
      'DUP48',
      'confirmed_lineup',
      now() + interval '30 days'
    );
  EXCEPTION WHEN unique_violation THEN
    v_unique_guard_ok := true;
  END;

  INSERT INTO _issue48_results VALUES (
    'unique index prevents duplicate active SMS code for one participant',
    v_unique_guard_ok,
    'unique_guard=' || v_unique_guard_ok::text
  );

  v_delivery_1 := public.notification_enqueue_for_participant(v_participant_id, 'invite', 'invite');
  v_delivery_2 := public.notification_enqueue_for_participant(v_participant_id, 'invite', 'invite');

  SELECT count(*) INTO v_event_count
  FROM public.match_participant_notification_events
  WHERE participant_id = v_participant_id
    AND notification_type = 'invite'
    AND dedupe_key = 'invite';

  SELECT count(*) INTO v_delivery_count
  FROM public.notification_deliveries
  WHERE payload->>'match_participant_id' = v_participant_id::text
    AND payload->>'template_type' = 'match_invite';

  INSERT INTO _issue48_results VALUES (
    'repeated invite enqueue before worker creates one invite event and delivery',
    v_delivery_1 IS NOT NULL
      AND v_delivery_2 IS NULL
      AND v_event_count = 1
      AND v_delivery_count = 1,
    'delivery1=' || coalesce(v_delivery_1::text, 'NULL')
      || ' delivery2=' || coalesce(v_delivery_2::text, 'NULL')
      || ' events=' || v_event_count::text
      || ' deliveries=' || v_delivery_count::text
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_invite_code);

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue48_results VALUES (
    'YES does not consume participant RSVP code so later Game On uses same code',
    v_active_code_count = 1
      AND public.notification_create_or_get_sms_reply_code(v_participant_id, 'confirmed_lineup') = v_invite_code,
    'reply=' || coalesce(v_reply, 'NULL') || ' active_codes=' || v_active_code_count::text
  );

  UPDATE public.match_participant_sms_reply_codes
  SET consumed_at = now()
  WHERE participant_id = v_participant_id
    AND code = v_invite_code;

  v_reply := public.rpc_sms_reply_handle(v_phone, 'NO ' || v_invite_code);

  INSERT INTO _issue48_results VALUES (
    'old consumed duplicate code cannot drive decline or removal action',
    v_reply like 'We could not find that invite code%',
    'reply=' || coalesce(v_reply, 'NULL')
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue48_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_issue48_sms_rsvp_hotfix();
