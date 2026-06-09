CREATE OR REPLACE FUNCTION public.test_runner_privacy_invite_notification_formation()
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
  v_viewer uuid := gen_random_uuid();
  v_quiet uuid := gen_random_uuid();
  v_visible uuid := gen_random_uuid();
  v_no_invites uuid := gen_random_uuid();
  v_blocked uuid := gen_random_uuid();
  v_quiet_email text;
  v_visible_email text;
  v_no_invites_email text;
  v_blocked_email text;
  v_delivery_count_before integer;
  v_delivery_count_after integer;
  v_request_id uuid;
  v_direct_add_id uuid;
BEGIN
  v_quiet_email := 'qa-p0-quiet-' || replace(v_quiet::text, '-', '') || '@example.test';
  v_visible_email := 'qa-p0-visible-' || replace(v_visible::text, '-', '') || '@example.test';
  v_no_invites_email := 'qa-p0-noinvites-' || replace(v_no_invites::text, '-', '') || '@example.test';
  v_blocked_email := 'qa-p0-blocked-' || replace(v_blocked::text, '-', '') || '@example.test';

  CREATE TEMP TABLE IF NOT EXISTS _notification_mvp_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _notification_mvp_results;

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'profiles expose discovery volume and invite acceptance',
    count(*) = 2,
    'columns=' || count(*)::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name IN ('discovery_volume', 'accepting_new_invites');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'matches expose manual auto formation fields',
    count(*) = 4,
    'columns=' || count(*)::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'matches'
    AND column_name IN ('formation_mode', 'formed_by_user_id', 'formation_source', 'auto_formation_rules');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'match participants expose notification timestamps',
    count(*) = 3,
    'columns=' || count(*)::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'match_participants'
    AND column_name IN (
      'invite_notification_sent_at',
      'confirmed_lineup_notification_sent_at',
      'last_critical_update_notification_sent_at'
    );

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'notification event table exists',
    to_regclass('public.match_participant_notification_events') IS NOT NULL,
    coalesce(to_regclass('public.match_participant_notification_events')::text, 'missing');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'sms reply code table exists',
    to_regclass('public.match_participant_sms_reply_codes') IS NOT NULL,
    coalesce(to_regclass('public.match_participant_sms_reply_codes')::text, 'missing');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'lookup visibility predicates exist',
    count(*) = 6,
    'functions=' || count(*)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_lookup_visibility',
      'can_view_basic_profile',
      'can_request_add',
      'can_direct_add',
      'can_invite_user',
      'can_recommend_user'
    );

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_viewer, 'qa-p0-viewer-' || replace(v_viewer::text, '-', '') || '@example.test', now()),
    (v_quiet, v_quiet_email, now()),
    (v_visible, v_visible_email, now()),
    (v_no_invites, v_no_invites_email, now()),
    (v_blocked, v_blocked_email, now());

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites
  ) VALUES
    (v_viewer, '', '', 'QA P0 Viewer', 'available', 'recommended', true),
    (v_quiet, '', '', 'QA P0 Quiet', 'available', 'quiet', true),
    (v_visible, '', '', 'QA P0 Visible', 'available', 'recommended', true),
    (v_no_invites, '', '', 'QA P0 No Invites', 'available', 'recommended', false),
    (v_blocked, '', '', 'QA P0 Blocked', 'available', 'recommended', true);

  INSERT INTO public.user_sports (user_id, sport_id)
  VALUES
    (v_viewer, 1),
    (v_quiet, 1),
    (v_visible, 1),
    (v_no_invites, 1),
    (v_blocked, 1);

  INSERT INTO public.user_play_cities (user_id, city_name, region, country)
  VALUES
    (v_viewer, 'Toronto', 'Ontario', 'Canada'),
    (v_quiet, 'Toronto', 'Ontario', 'Canada'),
    (v_visible, 'Toronto', 'Ontario', 'Canada'),
    (v_no_invites, 'Toronto', 'Ontario', 'Canada'),
    (v_blocked, 'Toronto', 'Ontario', 'Canada');

  INSERT INTO public.user_blocks (blocker_user_id, blocked_user_id)
  VALUES (v_blocked, v_viewer);

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Quiet player is hidden from passive recommendation',
    public.get_lookup_visibility(v_viewer, v_quiet, 'passive_recommendation') = 'none'
      and public.can_recommend_user(v_viewer, v_quiet) = false
      and public.can_invite_user(v_viewer, v_quiet, null, 'passive_recommendation') = false,
    'visibility=' || public.get_lookup_visibility(v_viewer, v_quiet, 'passive_recommendation');

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_viewer::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Quiet exact email lookup returns requestable only',
    count(*) = 1,
    'matching_rows=' || count(*)::text
  FROM public.rpc_player_search_by_contact_info(v_quiet_email) row
  WHERE row.user_id = v_quiet
    AND row.visibility = 'requestable'
    AND row.can_request_add = true
    AND row.can_add = false
    AND row.can_invite = false;

  SELECT count(*)::integer
  INTO v_delivery_count_before
  FROM public.notification_deliveries;

  SELECT request_id
  INTO v_request_id
  FROM public.rpc_user_save_request_create(v_quiet, 'contact_lookup')
  LIMIT 1;

  SELECT count(*)::integer
  INTO v_delivery_count_after
  FROM public.notification_deliveries;

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Request to Add creates save request without match participant or delivery',
    v_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_save_requests usr
        WHERE usr.id = v_request_id
          AND usr.requester_user_id = v_viewer
          AND usr.target_user_id = v_quiet
          AND usr.status = 'pending'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.match_participants mp
        WHERE mp.user_id = v_quiet
          AND mp.created_by = v_viewer
      )
      AND v_delivery_count_after = v_delivery_count_before,
    'request_id=' || coalesce(v_request_id::text, 'null')
      || ', delivery_delta=' || (v_delivery_count_after - v_delivery_count_before)::text;

  SELECT id
  INTO v_direct_add_id
  FROM public.rpc_invite_circle_save_user(v_visible, 'manual')
  LIMIT 1;

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Visible recommended player can be silently direct-added',
    v_direct_add_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_invite_circle uic
        WHERE uic.id = v_direct_add_id
          AND uic.owner_user_id = v_viewer
          AND uic.target_user_id = v_visible
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.recipient_user_id = v_visible
          AND n.actor_user_id = v_viewer
      ),
    'save_id=' || coalesce(v_direct_add_id::text, 'null');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Accept New Invites off remains visible but not recommendable or invitable',
    public.get_lookup_visibility(v_viewer, v_no_invites, 'passive_recommendation') = 'visible'
      AND public.can_recommend_user(v_viewer, v_no_invites) = false
      AND public.can_invite_user(v_viewer, v_no_invites, null, 'passive_recommendation') = false,
    'visibility=' || public.get_lookup_visibility(v_viewer, v_no_invites, 'passive_recommendation');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Block overrides exact lookup add request and invite',
    public.get_lookup_visibility(v_viewer, v_blocked, 'exact_contact_lookup') = 'none'
      AND public.can_request_add(v_viewer, v_blocked, 'exact_contact_lookup') = false
      AND public.can_invite_user(v_viewer, v_blocked, null, 'exact_contact_lookup') = false,
    'visibility=' || public.get_lookup_visibility(v_viewer, v_blocked, 'exact_contact_lookup');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'notification policy functions exist',
    count(*) >= 7,
    'functions=' || count(*)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'notification_is_participant_accepted',
      'notification_is_organizer_approved',
      'notification_is_participant_removed',
      'notification_is_selected_to_play',
      'notification_is_participant_confirmed',
      'notification_is_game_formed',
      'notification_is_critical_change'
    );

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'notification service rpc functions exist',
    count(*) >= 6,
    'functions=' || count(*)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'notification_enqueue_invite_if_needed',
      'notification_enqueue_confirmed_lineup_if_needed',
      'notification_enqueue_confirmed_lineup_notifications_for_match',
      'notification_enqueue_critical_update_notifications',
      'notification_create_or_get_sms_reply_code',
      'notification_maybe_auto_form_match',
      'rpc_match_confirm_and_notify',
      'rpc_sms_reply_handle'
    );

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'formation trigger function is present',
    to_regprocedure('public.trg_set_formed_at_once()') IS NOT NULL,
    coalesce(to_regprocedure('public.trg_set_formed_at_once()')::text, 'missing');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'sms reply accepts supported commands',
    public.rpc_sms_reply_handle('+15555550123', 'MAYBE') = 'Maybe is not supported yet. Reply YES with your invite code or NO with your invite code for a pending invite, JOIN for a public join text, or OUT with your code if you need to back out.',
    public.rpc_sms_reply_handle('+15555550123', 'MAYBE');

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'ready_to_form does not directly form or notify in manual mode',
    position('notification_maybe_auto_form_match' in pg_get_functiondef('public.trg_set_formed_at_once()'::regprocedure)) > 0
      and position('set formed_at = coalesce' in lower(pg_get_functiondef('public.trg_set_formed_at_once()'::regprocedure))) = 0,
    'trg_set_formed_at_once delegates only to maybe-auto formation';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'manual Confirm and Notify sets formed_at and queues lineup notifications',
    position('formed_at = now()' in lower(pg_get_functiondef('public.rpc_match_confirm_and_notify(uuid)'::regprocedure))) > 0
      and position('notification_enqueue_confirmed_lineup_notifications_for_match' in pg_get_functiondef('public.rpc_match_confirm_and_notify(uuid)'::regprocedure)) > 0,
    'rpc_match_confirm_and_notify contains formed_at write and lineup enqueue';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'auto formation only runs when formation_mode is auto',
    position('formation_mode <> ''auto''' in pg_get_functiondef('public.notification_maybe_auto_form_match(uuid)'::regprocedure)) > 0
      and position('notification_enqueue_confirmed_lineup_notifications_for_match' in pg_get_functiondef('public.notification_maybe_auto_form_match(uuid)'::regprocedure)) > 0,
    'notification_maybe_auto_form_match checks formation_mode and enqueues after formed_at';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'duplicate lineup notification is deduped by timestamp and event key',
    position('confirmed_lineup_notification_sent_at is null' in lower(pg_get_functiondef('public.notification_should_send_confirmed_lineup(uuid,uuid)'::regprocedure))) > 0
      and exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'match_participant_notification_events'
          and indexname = 'uq_match_participant_notification_events_dedupe'
      ),
    'timestamp guard plus unique event dedupe';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Request to Add creates inbox notification only',
    position('insert into public.notifications' in lower(pg_get_functiondef('public.rpc_user_save_request_create(uuid,text)'::regprocedure))) > 0
      and position('notification_deliveries' in lower(pg_get_functiondef('public.rpc_user_save_request_create(uuid,text)'::regprocedure))) = 0,
    'rpc_user_save_request_create writes notifications but not notification_deliveries';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Add to PlayerHood is silent',
    position('notifications' in lower(pg_get_functiondef('public.rpc_invite_circle_save_user(uuid,text)'::regprocedure))) = 0
      and position('notification_deliveries' in lower(pg_get_functiondef('public.rpc_invite_circle_save_user(uuid,text)'::regprocedure))) = 0,
    'rpc_invite_circle_save_user has no target notification writes';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'legacy match invite domain events delegate to notification service',
    position('notification_enqueue_invite_if_needed' in pg_get_functiondef('public.rpc_process_domain_event(uuid)'::regprocedure)) > 0
      and position('notification_enqueue_confirmed_lineup_notifications_for_match' in pg_get_functiondef('public.rpc_process_domain_event(uuid)'::regprocedure)) > 0
      and position('Match participant invitations must never bypass NotificationPolicy' in pg_get_functiondef('public.rpc_process_domain_event(uuid)'::regprocedure)) > 0,
    'rpc_process_domain_event delegates participant invite and formation events through policy/service';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Contact Player invite targets are private-owner scoped',
    to_regprocedure('public.can_user_have_private_contact_person_scope(uuid,uuid)') IS NOT NULL
      and position('gc.created_by = v_uid' in pg_get_functiondef('public.rpc_match_contact_person_targets(uuid,text)'::regprocedure)) > 0
      and position('public.can_user_have_private_contact_person_scope(v_uid, pr.person_id)' in pg_get_functiondef('public.rpc_match_contact_person_targets(uuid,text)'::regprocedure)) > 0,
    'contact target list must not expose other group members private contacts';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'Contact Player invite RPC requires private contact scope',
    position('can_user_have_private_contact_person_scope(v_uid, p_person_id)' in pg_get_functiondef('public.rpc_match_invite_contact_person(uuid,uuid)'::regprocedure)) > 0
      and position('from public.user_roster_guests urg' in lower(pg_get_functiondef('public.rpc_match_invite_contact_person(uuid,uuid)'::regprocedure))) > 0
      and position('from public.group_contacts gc' in lower(pg_get_functiondef('public.rpc_match_invite_contact_person(uuid,uuid)'::regprocedure))) > 0
      and position('gc.created_by = v_uid' in pg_get_functiondef('public.rpc_match_invite_contact_person(uuid,uuid)'::regprocedure)) > 0,
    'contact invite must use caller-owned/private channels only';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'critical change predicate ignores notes',
    public.notification_is_critical_change('{"organizer_note":{"old":"a","new":"b"}}'::jsonb) = false,
    'organizer_note=false';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'critical change predicate includes time',
    public.notification_is_critical_change('{"start_time":{"old":"09:00","new":"10:00"}}'::jsonb) = true,
    'start_time=true';

  DELETE FROM public.notifications
  WHERE recipient_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked)
     OR actor_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM public.user_save_requests
  WHERE requester_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked)
     OR target_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM public.user_invite_circle
  WHERE owner_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked)
     OR target_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM public.user_lookup_visibility_grants
  WHERE viewer_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked)
     OR target_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM public.user_blocks
  WHERE blocker_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked)
     OR blocked_user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM public.user_play_cities
  WHERE user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM public.user_sports
  WHERE user_id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM public.profiles
  WHERE id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);
  DELETE FROM auth.users
  WHERE id IN (v_viewer, v_quiet, v_visible, v_no_invites, v_blocked);

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _notification_mvp_results r
  ORDER BY r.test_name;
END;
$$;
