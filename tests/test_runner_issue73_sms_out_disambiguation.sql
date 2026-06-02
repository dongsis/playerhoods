CREATE OR REPLACE FUNCTION public.test_runner_issue73_sms_out_disambiguation()
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
  v_org uuid := '73000000-0000-0000-0000-000000000001'::uuid;
  v_venue_id uuid := '73000000-0000-0000-0000-000000000002'::uuid;
  v_match_pending_1 uuid := '73000000-0000-0000-0000-000000000003'::uuid;
  v_match_pending_2 uuid := '73000000-0000-0000-0000-000000000004'::uuid;
  v_match_confirmed_1 uuid := '73000000-0000-0000-0000-000000000005'::uuid;
  v_match_confirmed_2 uuid := '73000000-0000-0000-0000-000000000006'::uuid;
  v_guest_pending_1 uuid := '73000000-0000-0000-0000-000000000007'::uuid;
  v_guest_pending_2 uuid := '73000000-0000-0000-0000-000000000008'::uuid;
  v_guest_confirmed_1 uuid := '73000000-0000-0000-0000-000000000009'::uuid;
  v_guest_confirmed_2 uuid := '73000000-0000-0000-0000-000000000010'::uuid;
  v_participant_pending_1 uuid := '73000000-0000-0000-0000-000000000011'::uuid;
  v_participant_pending_2 uuid := '73000000-0000-0000-0000-000000000012'::uuid;
  v_participant_confirmed_1 uuid := '73000000-0000-0000-0000-000000000013'::uuid;
  v_participant_confirmed_2 uuid := '73000000-0000-0000-0000-000000000014'::uuid;
  v_phone text := '+15555557373';
  v_reply text;
  v_removed_at timestamptz;
  v_consumed_count integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue73_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue73_results;

  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' IN (
    v_match_pending_1::text,
    v_match_pending_2::text,
    v_match_confirmed_1::text,
    v_match_confirmed_2::text
  );
  DELETE FROM public.match_participant_notification_events
  WHERE participant_id IN (
    v_participant_pending_1,
    v_participant_pending_2,
    v_participant_confirmed_1,
    v_participant_confirmed_2
  );
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE participant_id IN (
    v_participant_pending_1,
    v_participant_pending_2,
    v_participant_confirmed_1,
    v_participant_confirmed_2
  )
     OR phone_e164 = public.normalize_discovery_phone(v_phone);
  DELETE FROM public.email_invitations
  WHERE match_participant_id IN (
    v_participant_pending_1,
    v_participant_pending_2,
    v_participant_confirmed_1,
    v_participant_confirmed_2
  )
     OR related_id IN (
       v_match_pending_1,
       v_match_pending_2,
       v_match_confirmed_1,
       v_match_confirmed_2
     );
  DELETE FROM public.match_participant_actions
  WHERE match_participant_id IN (
    v_participant_pending_1,
    v_participant_pending_2,
    v_participant_confirmed_1,
    v_participant_confirmed_2
  )
     OR match_id IN (
       v_match_pending_1,
       v_match_pending_2,
       v_match_confirmed_1,
       v_match_confirmed_2
     );
  DELETE FROM public.match_participants
  WHERE id IN (
    v_participant_pending_1,
    v_participant_pending_2,
    v_participant_confirmed_1,
    v_participant_confirmed_2
  )
     OR match_id IN (
       v_match_pending_1,
       v_match_pending_2,
       v_match_confirmed_1,
       v_match_confirmed_2
     );
  DELETE FROM public.matches
  WHERE id IN (
    v_match_pending_1,
    v_match_pending_2,
    v_match_confirmed_1,
    v_match_confirmed_2
  );
  DELETE FROM public.guests
  WHERE id IN (
    v_guest_pending_1,
    v_guest_pending_2,
    v_guest_confirmed_1,
    v_guest_confirmed_2
  );
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id = v_org;
  DELETE FROM auth.users WHERE id = v_org;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_org, 'issue73-organizer@example.test', now());

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
    'Issue 73 Organizer',
    'available',
    'recommended',
    true
  );

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue_id, 'Issue 73 Courts', 'America/Toronto');

  INSERT INTO public.guests (id, display_name, created_by, email, phone, status)
  VALUES
    (v_guest_pending_1, 'Issue 73 Pending BC', v_org, 'issue73-pending-bc@example.test', v_phone, 'active'),
    (v_guest_pending_2, 'Issue 73 Pending ND', v_org, 'issue73-pending-nd@example.test', v_phone, 'active'),
    (v_guest_confirmed_1, 'Issue 73 Confirmed SW', v_org, 'issue73-confirmed-sw@example.test', v_phone, 'active'),
    (v_guest_confirmed_2, 'Issue 73 Confirmed Old', v_org, 'issue73-confirmed-old@example.test', v_phone, 'active');

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
    (v_match_pending_1, v_org, 'active', v_venue_id, '{}'::uuid[], current_date + 1, '10:30'::time, 90, 'doubles', 4, '{}'::uuid[], true, true, true, now()),
    (v_match_pending_2, v_org, 'active', v_venue_id, '{}'::uuid[], current_date + 2, '19:30'::time, 90, 'doubles', 4, '{}'::uuid[], true, true, true, now()),
    (v_match_confirmed_1, v_org, 'active', v_venue_id, '{}'::uuid[], current_date + 3, '10:15'::time, 90, 'doubles', 4, '{}'::uuid[], true, true, true, now()),
    (v_match_confirmed_2, v_org, 'active', v_venue_id, '{}'::uuid[], current_date + 4, '19:00'::time, 90, 'doubles', 4, '{}'::uuid[], true, true, true, now());

  INSERT INTO public.match_participants (
    id,
    match_id,
    join_method,
    guest_id,
    created_by,
    nominated_by,
    org_approved_at,
    org_approved_by,
    participant_accepted_at,
    participant_accepted_via
  ) VALUES
    (v_participant_pending_1, v_match_pending_1, 'nominated', v_guest_pending_1, v_org, v_org, now(), v_org, null, null),
    (v_participant_pending_2, v_match_pending_2, 'nominated', v_guest_pending_2, v_org, v_org, now(), v_org, null, null),
    (v_participant_confirmed_1, v_match_confirmed_1, 'nominated', v_guest_confirmed_1, v_org, v_org, now(), v_org, now(), 'sms_invitation'),
    (v_participant_confirmed_2, v_match_confirmed_2, 'nominated', v_guest_confirmed_2, v_org, v_org, now(), v_org, now(), 'sms_invitation');

  INSERT INTO public.match_participant_sms_reply_codes (
    match_id,
    participant_id,
    phone_e164,
    code,
    purpose,
    expires_at
  ) VALUES
    (v_match_pending_1, v_participant_pending_1, public.normalize_discovery_phone(v_phone), 'BC', 'invite', now() + interval '30 days'),
    (v_match_pending_2, v_participant_pending_2, public.normalize_discovery_phone(v_phone), 'ND', 'invite', now() + interval '30 days'),
    (v_match_confirmed_1, v_participant_confirmed_1, public.normalize_discovery_phone(v_phone), 'SW', 'confirmed_lineup', now() + interval '30 days'),
    (v_match_confirmed_2, v_participant_confirmed_2, public.normalize_discovery_phone(v_phone), 'OLD73', 'confirmed_lineup', now() + interval '30 days');

  v_reply := public.rpc_sms_reply_handle(v_phone, 'OUT');

  INSERT INTO _issue73_results VALUES (
    'bare OUT lists withdraw-eligible two-character and longer codes only',
    v_reply like 'You have multiple matches. Reply OUT %'
      AND position('OUT SW' in v_reply) > 0
      AND position('OUT OLD73' in v_reply) > 0
      AND position('BC' in v_reply) = 0
      AND position('ND' in v_reply) = 0
      AND position('invites' in lower(v_reply)) = 0,
    'reply=' || coalesce(v_reply, 'NULL')
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'YES');

  INSERT INTO _issue73_results VALUES (
    'bare YES still lists pending invite candidates only',
    v_reply like 'You have multiple invites. Reply YES %'
      AND position('YES BC' in v_reply) > 0
      AND position('YES ND' in v_reply) > 0
      AND position('SW' in v_reply) = 0
      AND position('OLD73' in v_reply) = 0,
    'reply=' || coalesce(v_reply, 'NULL')
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'NO');

  INSERT INTO _issue73_results VALUES (
    'bare NO still lists pending invite candidates only',
    v_reply like 'You have multiple invites. Reply NO %'
      AND position('NO BC' in v_reply) > 0
      AND position('NO ND' in v_reply) > 0
      AND position('SW' in v_reply) = 0
      AND position('OLD73' in v_reply) = 0,
    'reply=' || coalesce(v_reply, 'NULL')
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'OUT BC');

  SELECT removed_at INTO v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_pending_1;

  SELECT count(*) INTO v_consumed_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_pending_1
    AND code = 'BC'
    AND consumed_at IS NOT NULL;

  INSERT INTO _issue73_results VALUES (
    'coded OUT on pending invite returns YES or NO guidance without mutation',
    v_reply = 'Reply NO BC to decline this invite, or YES BC to accept.'
      AND v_removed_at IS NULL
      AND v_consumed_count = 0,
    'reply=' || coalesce(v_reply, 'NULL')
      || ' removed_at=' || coalesce(v_removed_at::text, 'NULL')
      || ' consumed=' || v_consumed_count::text
  );

  v_reply := public.rpc_sms_reply_handle(v_phone, 'OUT SW');

  SELECT removed_at INTO v_removed_at
  FROM public.match_participants
  WHERE id = v_participant_confirmed_1;

  SELECT count(*) INTO v_consumed_count
  FROM public.match_participant_sms_reply_codes
  WHERE participant_id = v_participant_confirmed_1
    AND code = 'SW'
    AND consumed_at IS NOT NULL;

  INSERT INTO _issue73_results VALUES (
    'coded OUT on confirmed two-character code withdraws successfully',
    v_reply = 'You are no longer marked as playing. The organizer has been notified.'
      AND v_removed_at IS NOT NULL
      AND v_consumed_count = 1,
    'reply=' || coalesce(v_reply, 'NULL')
      || ' removed_at=' || coalesce(v_removed_at::text, 'NULL')
      || ' consumed=' || v_consumed_count::text
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue73_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_issue73_sms_out_disambiguation();
