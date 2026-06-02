CREATE OR REPLACE FUNCTION public.test_runner_issue55_daily_reminder_cron()
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
  v_org uuid := '55000000-0000-0000-0000-000000000001'::uuid;
  v_confirmed_user uuid := '55000000-0000-0000-0000-000000000002'::uuid;
  v_pending_user uuid := '55000000-0000-0000-0000-000000000003'::uuid;
  v_venue_id uuid := '55000000-0000-0000-0000-000000000004'::uuid;
  v_tomorrow_match uuid := '55000000-0000-0000-0000-000000000005'::uuid;
  v_today_match uuid := '55000000-0000-0000-0000-000000000006'::uuid;
  v_past_match uuid := '55000000-0000-0000-0000-000000000007'::uuid;
  v_unformed_match uuid := '55000000-0000-0000-0000-000000000008'::uuid;
  v_confirmed_participant uuid := '55000000-0000-0000-0000-000000000009'::uuid;
  v_pending_participant uuid := '55000000-0000-0000-0000-000000000010'::uuid;
  v_today_participant uuid := '55000000-0000-0000-0000-000000000011'::uuid;
  v_past_participant uuid := '55000000-0000-0000-0000-000000000012'::uuid;
  v_unformed_participant uuid := '55000000-0000-0000-0000-000000000013'::uuid;
  v_invite_delivery uuid := '55000000-0000-0000-0000-000000000014'::uuid;
  v_today_delivery uuid := '55000000-0000-0000-0000-000000000015'::uuid;
  v_tomorrow_delivery uuid := '55000000-0000-0000-0000-000000000016'::uuid;
  v_preview jsonb;
  v_claimed integer;
  v_enqueued integer;
  v_duplicate_delivery uuid;
  v_local_today date;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue55_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _issue55_results;

  v_local_today := (now() at time zone 'America/Toronto')::date;

  DELETE FROM public.notification_deliveries
  WHERE id IN (v_invite_delivery, v_today_delivery, v_tomorrow_delivery)
     OR payload->>'match_id' IN (v_tomorrow_match::text, v_today_match::text, v_past_match::text, v_unformed_match::text)
     OR payload->>'match_participant_id' IN (
       v_confirmed_participant::text,
       v_pending_participant::text,
       v_today_participant::text,
       v_past_participant::text,
       v_unformed_participant::text
     );
  DELETE FROM public.match_participant_notification_events
  WHERE participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  );
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  );
  DELETE FROM public.email_invitations
  WHERE match_participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  )
     OR related_id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.match_participant_actions
  WHERE match_participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  )
     OR match_id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.match_participants
  WHERE id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  )
     OR match_id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.matches WHERE id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id IN (v_org, v_confirmed_user, v_pending_user);
  DELETE FROM auth.users WHERE id IN (v_org, v_confirmed_user, v_pending_user);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_org, 'issue55-organizer@example.test', now()),
    (v_confirmed_user, 'issue55-confirmed@example.test', now()),
    (v_pending_user, 'issue55-pending@example.test', now());

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites
  ) VALUES
    (v_org, '', '', 'Issue 55 Organizer', 'available', 'recommended', true),
    (v_confirmed_user, '', '', 'Issue 55 Confirmed', 'available', 'recommended', true),
    (v_pending_user, '', '', 'Issue 55 Pending', 'available', 'recommended', true);

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue_id, 'Issue 55 Courts', 'America/Toronto');

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
    player_reminder_minutes,
    created_at
  ) VALUES
    (v_tomorrow_match, v_org, 'active', v_venue_id, '{}'::uuid[], v_local_today + 1, '18:30'::time, 90, 'tennis', 4, '{}'::uuid[], true, true, true, now() - interval '1 day', 1440, now()),
    (v_today_match, v_org, 'active', v_venue_id, '{}'::uuid[], v_local_today, '18:30'::time, 90, 'tennis', 4, '{}'::uuid[], true, true, true, now() - interval '1 day', 1440, now()),
    (v_past_match, v_org, 'active', v_venue_id, '{}'::uuid[], v_local_today - 1, '18:30'::time, 90, 'tennis', 4, '{}'::uuid[], true, true, true, now() - interval '2 days', 1440, now()),
    (v_unformed_match, v_org, 'active', v_venue_id, '{}'::uuid[], v_local_today + 1, '18:30'::time, 90, 'tennis', 4, '{}'::uuid[], true, true, true, null, 1440, now());

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
    (v_confirmed_participant, v_tomorrow_match, 'invited', v_confirmed_user, v_org, v_org, 'confirmed', now(), now(), 'in_app', now(), v_org),
    (v_today_participant, v_today_match, 'invited', v_confirmed_user, v_org, v_org, 'confirmed', now(), now(), 'in_app', now(), v_org),
    (v_past_participant, v_past_match, 'invited', v_confirmed_user, v_org, v_org, 'confirmed', now(), now(), 'in_app', now(), v_org),
    (v_unformed_participant, v_unformed_match, 'invited', v_confirmed_user, v_org, v_org, 'confirmed', now(), now(), 'in_app', now(), v_org);

  INSERT INTO public.match_participants (
    id,
    match_id,
    join_method,
    user_id,
    created_by,
    nominated_by
  ) VALUES (
    v_pending_participant,
    v_tomorrow_match,
    'invited',
    v_pending_user,
    v_org,
    v_org
  );

  INSERT INTO _issue55_results VALUES (
    'tomorrow confirmed participant is eligible',
    public.notification_should_send_match_reminder(v_tomorrow_match, v_confirmed_participant),
    'tomorrow_match=' || v_tomorrow_match::text
  );

  INSERT INTO _issue55_results VALUES (
    'today match is skipped',
    not public.notification_should_send_match_reminder(v_today_match, v_today_participant),
    'today_match=' || v_today_match::text
  );

  INSERT INTO _issue55_results VALUES (
    'past match is skipped',
    not public.notification_should_send_match_reminder(v_past_match, v_past_participant),
    'past_match=' || v_past_match::text
  );

  INSERT INTO _issue55_results VALUES (
    'unformed match is skipped',
    not public.notification_should_send_match_reminder(v_unformed_match, v_unformed_participant),
    'unformed_match=' || v_unformed_match::text
  );

  INSERT INTO _issue55_results VALUES (
    'pending participant is skipped',
    not public.notification_should_send_match_reminder(v_tomorrow_match, v_pending_participant),
    'pending_participant=' || v_pending_participant::text
  );

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
      v_invite_delivery,
      'email',
      'resend',
      'issue55-invite@example.test',
      'queued',
      0,
      jsonb_build_object('template_type', 'match_invite', 'match_id', v_tomorrow_match, 'match_participant_id', v_confirmed_participant)
    ),
    (
      v_today_delivery,
      'sms',
      'twilio',
      '+15555555555',
      'queued',
      0,
      jsonb_build_object('template_type', 'match_reminder', 'match_id', v_today_match, 'match_participant_id', v_today_participant)
    ),
    (
      v_tomorrow_delivery,
      'sms',
      'twilio',
      '+15555555556',
      'queued',
      0,
      jsonb_build_object('template_type', 'match_reminder', 'match_id', v_tomorrow_match, 'match_participant_id', v_confirmed_participant)
    );

  SELECT public.notification_reminder_drain_preview(10)
  INTO v_preview;

  INSERT INTO _issue55_results VALUES (
    'dry-run counts only tomorrow reminder as processable',
    (v_preview #>> '{queuedReminderDeliveries,total}')::integer = 1
      AND (v_preview #>> '{wouldProcess,total}')::integer = 1
      AND (v_preview #>> '{skippedNonReminderQueuedDeliveries,total}')::integer >= 1,
    v_preview::text
  );

  SELECT count(*)::integer
  INTO v_claimed
  FROM public.rpc_get_queued_reminder_deliveries(10);

  INSERT INTO _issue55_results VALUES (
    'reminder claimant claims only tomorrow reminder',
    v_claimed = 1
      AND EXISTS (
        SELECT 1
        FROM public.notification_deliveries
        WHERE id = v_tomorrow_delivery
          AND delivery_status = 'sending'
          AND attempt_count = 1
          AND last_attempt_at IS NOT NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.notification_deliveries
        WHERE id = v_today_delivery
          AND delivery_status = 'queued'
          AND attempt_count = 0
          AND last_attempt_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.notification_deliveries
        WHERE id = v_invite_delivery
          AND delivery_status = 'queued'
          AND attempt_count = 0
          AND last_attempt_at IS NULL
      ),
    'claimed=' || v_claimed::text
  );

  v_enqueued := public.notification_enqueue_due_match_reminders(10);

  INSERT INTO _issue55_results VALUES (
    'enqueue due reminders dedupes existing participant match date',
    v_enqueued = 1
      AND (
        SELECT count(*)
        FROM public.match_participant_notification_events
        WHERE participant_id = v_confirmed_participant
          AND notification_type = 'match_reminder'
          AND dedupe_key = 'match_reminder:' || v_tomorrow_match::text || ':' || (v_local_today + 1)::text
      ) = 1,
    'enqueued=' || v_enqueued::text
  );

  v_duplicate_delivery := public.notification_enqueue_match_reminder_if_needed(v_confirmed_participant);

  INSERT INTO _issue55_results VALUES (
    'duplicate reminder for same participant match date is prevented',
    v_duplicate_delivery IS NULL
      AND (
        SELECT count(*)
        FROM public.match_participant_notification_events
        WHERE participant_id = v_confirmed_participant
          AND notification_type = 'match_reminder'
          AND dedupe_key = 'match_reminder:' || v_tomorrow_match::text || ':' || (v_local_today + 1)::text
      ) = 1,
    'duplicate_delivery=' || coalesce(v_duplicate_delivery::text, 'NULL')
  );

  DELETE FROM public.notification_deliveries
  WHERE id IN (v_invite_delivery, v_today_delivery, v_tomorrow_delivery)
     OR payload->>'match_id' IN (v_tomorrow_match::text, v_today_match::text, v_past_match::text, v_unformed_match::text)
     OR payload->>'match_participant_id' IN (
       v_confirmed_participant::text,
       v_pending_participant::text,
       v_today_participant::text,
       v_past_participant::text,
       v_unformed_participant::text
     );
  DELETE FROM public.match_participant_notification_events
  WHERE participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  );
  DELETE FROM public.match_participant_sms_reply_codes
  WHERE participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  );
  DELETE FROM public.email_invitations
  WHERE match_participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  )
     OR related_id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.match_participant_actions
  WHERE match_participant_id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  )
     OR match_id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.match_participants
  WHERE id IN (
    v_confirmed_participant,
    v_pending_participant,
    v_today_participant,
    v_past_participant,
    v_unformed_participant
  )
     OR match_id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.matches WHERE id IN (v_tomorrow_match, v_today_match, v_past_match, v_unformed_match);
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.profiles WHERE id IN (v_org, v_confirmed_user, v_pending_user);
  DELETE FROM auth.users WHERE id IN (v_org, v_confirmed_user, v_pending_user);

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue55_results r
  ORDER BY r.test_name;
END;
$$;
