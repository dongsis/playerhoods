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
  v_other_user uuid := '48000000-0000-0000-0000-000000000006'::uuid;
  v_guest_id_2 uuid := '48000000-0000-0000-0000-000000000007'::uuid;
  v_participant_id_2 uuid := '48000000-0000-0000-0000-000000000008'::uuid;
  v_guest_id_3 uuid := '48000000-0000-0000-0000-000000000009'::uuid;
  v_participant_id_3 uuid := '48000000-0000-0000-0000-000000000010'::uuid;
  v_phone text := '+15555554848';
  v_phone_3 text := '+15555554849';
  v_invite_code text;
  v_confirmed_code text;
  v_reminder_code text;
  v_cold_reminder_code text;
  v_cold_reminder_purpose text;
  v_cold_reminder_requested_purpose text;
  v_payload jsonb;
  v_delivery_1 uuid;
  v_delivery_2 uuid;
  v_pending_anchor_count integer;
  v_active_code_count integer;
  v_event_count integer;
  v_delivery_count integer;
  v_reply text;
  v_reply_2 text;
  v_accepted_at timestamptz;
  v_accepted_at_after_repeat timestamptz;
  v_removed_at timestamptz;
  v_consumed_count integer;
  v_total_anchor_count integer;
  v_unique_guard_ok boolean := false;
  v_pending_anchor_unique_guard_ok boolean := false;
  v_compat_signature_exists boolean := false;
  v_compat_not_org_guard_ok boolean := false;
  v_compat_pending_anchor_reuse_ok boolean := false;
  v_not_org_guard_ok boolean := false;
  v_inactive_match_guard_ok boolean := false;
  v_ambiguous_anchor_guard_ok boolean := false;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue48_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue48_results;

  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' = v_match_id::text
     OR payload->>'match_participant_id' IN (v_participant_id::text, v_participant_id_3::text);
  DELETE FROM public.match_participant_notification_events WHERE participant_id IN (v_participant_id, v_participant_id_3);
  DELETE FROM public.match_participant_sms_reply_codes WHERE participant_id IN (v_participant_id, v_participant_id_3);
  DELETE FROM public.email_invitations WHERE match_participant_id IN (v_participant_id, v_participant_id_3) OR related_id = v_match_id;
  DELETE FROM public.match_participant_actions WHERE match_participant_id IN (v_participant_id, v_participant_id_2, v_participant_id_3) OR match_id = v_match_id;
  DELETE FROM public.match_participants WHERE id IN (v_participant_id, v_participant_id_2, v_participant_id_3) OR match_id = v_match_id;
  DELETE FROM public.matches WHERE id = v_match_id;
  DELETE FROM public.guests WHERE id IN (v_guest_id, v_guest_id_2, v_guest_id_3);
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id IN (v_org, v_other_user);
  DELETE FROM auth.users WHERE id IN (v_org, v_other_user);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_org, 'issue48-organizer@example.test', now()),
    (v_other_user, 'issue48-other@example.test', now());

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

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites
  ) VALUES (
    v_other_user,
    '',
    '',
    'Issue 48 Other User',
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

  BEGIN
    INSERT INTO public.email_invitations (
      inviter_user_id,
      target_email,
      target_name,
      related_type,
      related_id,
      status,
      expires_at,
      match_participant_id
    ) VALUES (
      v_org,
      'issue48-contact-duplicate@example.test',
      'Issue 48 Contact Duplicate',
      'match',
      v_match_id,
      'pending',
      now() + interval '30 days',
      v_participant_id
    );
  EXCEPTION WHEN unique_violation THEN
    v_pending_anchor_unique_guard_ok := true;
  END;

  INSERT INTO _issue48_results VALUES (
    'unique index prevents duplicate pending email invitation anchor for one participant',
    v_pending_anchor_unique_guard_ok,
    'unique_guard=' || v_pending_anchor_unique_guard_ok::text
  );

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_email_invitation_create'
      AND pg_get_function_identity_arguments(p.oid) = 'p_target_email text, p_target_name text, p_related_type text, p_related_id uuid, p_expires_at timestamp with time zone'
  )
  INTO v_compat_signature_exists;

  INSERT INTO _issue48_results VALUES (
    'legacy 5-arg rpc_email_invitation_create signature remains available',
    v_compat_signature_exists,
    'exists=' || v_compat_signature_exists::text
  );

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_user::text, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.rpc_email_invitation_create('issue48-contact@example.test'::text, 'Issue 48 Contact'::text, 'match'::text, v_match_id, null::timestamptz);
  EXCEPTION WHEN OTHERS THEN
    v_compat_not_org_guard_ok := SQLERRM = 'not_match_organizer';
  END;

  INSERT INTO _issue48_results VALUES (
    'legacy 5-arg rpc_email_invitation_create rejects non-organizer callers',
    v_compat_not_org_guard_ok,
    'guard=' || v_compat_not_org_guard_ok::text
  );

  BEGIN
    PERFORM public.rpc_email_invitation_create('issue48-contact@example.test', 'Issue 48 Contact', 'match', v_match_id, null, v_phone);
  EXCEPTION WHEN OTHERS THEN
    v_not_org_guard_ok := SQLERRM = 'not_match_organizer';
  END;

  INSERT INTO _issue48_results VALUES (
    'rpc_email_invitation_create rejects non-organizer callers',
    v_not_org_guard_ok,
    'guard=' || v_not_org_guard_ok::text
  );

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_org::text, 'role', 'authenticated')::text, true);

  PERFORM public.rpc_email_invitation_create('issue48-contact@example.test'::text, 'Issue 48 Contact'::text, 'match'::text, v_match_id, null::timestamptz);

  SELECT count(*) = 1 INTO v_compat_pending_anchor_reuse_ok
  FROM public.email_invitations
  WHERE match_participant_id = v_participant_id
    AND status = 'pending';

  INSERT INTO _issue48_results VALUES (
    'legacy 5-arg rpc_email_invitation_create reuses pending participant anchor',
    v_compat_pending_anchor_reuse_ok,
    'reuse=' || v_compat_pending_anchor_reuse_ok::text
  );

  UPDATE public.matches
  SET status = 'cancelled'
  WHERE id = v_match_id;

  BEGIN
    PERFORM public.rpc_email_invitation_create('issue48-contact@example.test', 'Issue 48 Contact', 'match', v_match_id, null, v_phone);
  EXCEPTION WHEN OTHERS THEN
    v_inactive_match_guard_ok := SQLERRM = 'match_not_active';
  END;

  UPDATE public.matches
  SET status = 'active'
  WHERE id = v_match_id;

  INSERT INTO _issue48_results VALUES (
    'rpc_email_invitation_create rejects inactive matches',
    v_inactive_match_guard_ok,
    'guard=' || v_inactive_match_guard_ok::text
  );

  INSERT INTO public.guests (id, display_name, created_by, email, phone, status)
  VALUES (v_guest_id_2, 'Issue 48 Contact Duplicate Person', v_org, 'issue48-contact@example.test', v_phone, 'active');

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
    v_participant_id_2,
    v_match_id,
    'nominated',
    v_guest_id_2,
    v_org,
    v_org,
    now(),
    v_org
  );

  BEGIN
    PERFORM public.rpc_email_invitation_create('issue48-contact@example.test', 'Issue 48 Contact', 'match', v_match_id, null, v_phone);
  EXCEPTION WHEN OTHERS THEN
    v_ambiguous_anchor_guard_ok := SQLERRM = 'anchor_ambiguous_guest_participant';
  END;

  INSERT INTO _issue48_results VALUES (
    'rpc_email_invitation_create rejects ambiguous contact anchors',
    v_ambiguous_anchor_guard_ok,
    'guard=' || v_ambiguous_anchor_guard_ok::text
  );

  DELETE FROM public.match_participants WHERE id = v_participant_id_2;
  DELETE FROM public.guests WHERE id = v_guest_id_2;

  INSERT INTO public.guests (id, display_name, created_by, email, phone, status)
  VALUES (v_guest_id_3, 'Issue 48 Cold Reminder', v_org, 'issue48-reminder@example.test', v_phone_3, 'active');

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
    v_participant_id_3,
    v_match_id,
    'nominated',
    v_guest_id_3,
    v_org,
    v_org,
    now(),
    v_org
  );

  SELECT public.notification_match_payload(v_participant_id_3, 'match_reminder', '{}'::jsonb)
  INTO v_payload;

  SELECT v_payload->>'reply_code'
  INTO v_cold_reminder_code;

  SELECT purpose, metadata->>'last_requested_purpose'
  INTO v_cold_reminder_purpose, v_cold_reminder_requested_purpose
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id_3
    AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id_3
    AND consumed_at IS NULL;

  INSERT INTO _issue48_results VALUES (
    'cold match_reminder payload creates one active SMS code without violating purpose constraint',
    v_active_code_count = 1
      AND v_cold_reminder_code IS NOT NULL
      AND v_cold_reminder_purpose = 'critical_update'
      AND v_cold_reminder_requested_purpose = 'match_reminder',
    'active_codes=' || v_active_code_count::text
      || ' code=' || coalesce(v_cold_reminder_code, 'NULL')
      || ' stored_purpose=' || coalesce(v_cold_reminder_purpose, 'NULL')
      || ' requested_purpose=' || coalesce(v_cold_reminder_requested_purpose, 'NULL')
  );

  UPDATE public.email_invitations
  SET status = 'accepted'
  WHERE match_participant_id = v_participant_id
    AND status = 'pending';

  SELECT public.notification_match_payload(v_participant_id, 'confirmed_lineup', '{}'::jsonb)
  INTO v_payload;

  SELECT count(*) INTO v_pending_anchor_count
  FROM public.email_invitations
  WHERE match_participant_id = v_participant_id
    AND status = 'pending';

  SELECT count(*) INTO v_total_anchor_count
  FROM public.email_invitations
  WHERE match_participant_id = v_participant_id
    AND status <> 'canceled';

  INSERT INTO _issue48_results VALUES (
    'notification_match_payload reuses accepted anchor without creating pending regression',
    v_pending_anchor_count = 0
      AND v_total_anchor_count = 1,
    'pending_anchors=' || v_pending_anchor_count::text
      || ' total_non_canceled=' || v_total_anchor_count::text
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

  UPDATE public.matches
  SET status = 'cancelled'
  WHERE id = v_match_id;

  v_reply := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_invite_code);
  v_reply_2 := public.rpc_sms_reply_handle(v_phone, 'NO ' || v_invite_code);
  PERFORM public.rpc_sms_reply_handle(v_phone, 'OUT ' || v_invite_code);

  SELECT participant_accepted_at, removed_at
  INTO v_accepted_at, v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue48_results VALUES (
    'explicit SMS code replies on non-active matches do not mutate or consume',
    v_accepted_at IS NULL
      AND v_removed_at IS NULL
      AND v_active_code_count = 1
      AND v_reply = 'This invite is no longer active.'
      AND v_reply_2 = 'This invite is no longer active.',
    'yes_reply=' || coalesce(v_reply, 'NULL')
      || ' no_reply=' || coalesce(v_reply_2, 'NULL')
      || ' accepted_at=' || coalesce(v_accepted_at::text, 'NULL')
      || ' removed_at=' || coalesce(v_removed_at::text, 'NULL')
      || ' active_codes=' || v_active_code_count::text
  );

  UPDATE public.matches
  SET status = 'active'
  WHERE id = v_match_id;

  v_reply := public.rpc_sms_reply_handle(v_phone, 'NO ' || v_invite_code);

  SELECT removed_at INTO v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_consumed_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND code = v_invite_code
    AND consumed_at IS NOT NULL;

  INSERT INTO _issue48_results VALUES (
    'pending invite NO declines/removes and consumes the active code',
    v_removed_at IS NOT NULL
      AND v_consumed_count = 1,
    'reply=' || coalesce(v_reply, 'NULL')
      || ' removed_at=' || coalesce(v_removed_at::text, 'NULL')
      || ' consumed=' || v_consumed_count::text
  );

  UPDATE public.match_participants
  SET removed_at = NULL,
      removed_by = NULL,
      removal_note = NULL
  WHERE id = v_participant_id;
  PERFORM public.match_participant_reconcile_status(v_participant_id);

  UPDATE public.match_participant_sms_reply_codes
  SET consumed_at = NULL
  WHERE participant_id = v_participant_id
    AND code = v_invite_code;

  v_reply := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_invite_code);

  SELECT participant_accepted_at INTO v_accepted_at
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue48_results VALUES (
    'pending invite YES accepts and keeps participant RSVP code active for later Game On',
    v_active_code_count = 1
      AND v_accepted_at IS NOT NULL
      AND public.notification_create_or_get_sms_reply_code(v_participant_id, 'confirmed_lineup') = v_invite_code,
    'reply=' || coalesce(v_reply, 'NULL')
      || ' accepted_at=' || coalesce(v_accepted_at::text, 'NULL')
      || ' active_codes=' || v_active_code_count::text
  );

  BEGIN
    v_reply_2 := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_invite_code);
  EXCEPTION WHEN OTHERS THEN
    v_reply_2 := 'ERROR ' || SQLSTATE || ': ' || SQLERRM;
  END;

  SELECT participant_accepted_at INTO v_accepted_at_after_repeat
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue48_results VALUES (
    'repeated YES after confirmation is idempotent and non-destructive',
    v_accepted_at_after_repeat = v_accepted_at
      AND v_active_code_count = 1
      AND v_reply_2 not like 'ERROR %',
    'reply=' || coalesce(v_reply_2, 'NULL')
      || ' first_accepted_at=' || coalesce(v_accepted_at::text, 'NULL')
      || ' repeated_accepted_at=' || coalesce(v_accepted_at_after_repeat::text, 'NULL')
      || ' active_codes=' || v_active_code_count::text
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'NO ' || v_invite_code);

  SELECT removed_at INTO v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_active_code_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND consumed_at IS NULL;

  INSERT INTO _issue48_results VALUES (
    'confirmed participant NO does not decline/remove or consume the shared RSVP code',
    v_removed_at IS NULL
      AND v_active_code_count = 1,
    'reply=' || coalesce(v_reply, 'NULL')
      || ' removed_at=' || coalesce(v_removed_at::text, 'NULL')
      || ' active_codes=' || v_active_code_count::text
  );

  UPDATE public.match_participants
  SET removed_at = NULL,
      removed_by = NULL,
      removal_note = NULL,
      participant_accepted_at = v_accepted_at,
      participant_accepted_via = 'sms_invitation'
  WHERE id = v_participant_id;
  PERFORM public.match_participant_reconcile_status(v_participant_id);

  UPDATE public.match_participant_sms_reply_codes
  SET consumed_at = NULL
  WHERE participant_id = v_participant_id
    AND code = v_invite_code;

  DELETE FROM public.match_participant_actions
  WHERE match_participant_id = v_participant_id
    AND action_type = 'withdraw';

  v_reply := public.rpc_sms_reply_handle(v_phone, 'OUT ' || v_invite_code);

  SELECT removed_at INTO v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_id;

  SELECT count(*) INTO v_consumed_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_id
    AND code = v_invite_code
    AND consumed_at IS NOT NULL;

  INSERT INTO _issue48_results VALUES (
    'confirmed participant OUT withdraws/removes and consumes the active code',
    v_removed_at IS NOT NULL
      AND v_consumed_count = 1,
    'reply=' || coalesce(v_reply, 'NULL')
      || ' removed_at=' || coalesce(v_removed_at::text, 'NULL')
      || ' consumed=' || v_consumed_count::text
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'YES ' || v_invite_code);

  INSERT INTO _issue48_results VALUES (
    'old consumed/superseded code is rejected after participant removal',
    v_reply like 'We could not find that invite code%'
      OR v_reply = 'This invite is no longer active.',
    'reply=' || coalesce(v_reply, 'NULL')
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue48_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_issue48_sms_rsvp_hotfix();
