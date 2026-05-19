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
BEGIN
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
    public.rpc_sms_reply_handle('+15555550123', 'MAYBE') = 'Maybe is not supported yet. Reply YES to accept or NO to decline.',
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
    'critical change predicate ignores notes',
    public.notification_is_critical_change('{"organizer_note":{"old":"a","new":"b"}}'::jsonb) = false,
    'organizer_note=false';

  INSERT INTO _notification_mvp_results(test_name, ok, details)
  SELECT
    'critical change predicate includes time',
    public.notification_is_critical_change('{"start_time":{"old":"09:00","new":"10:00"}}'::jsonb) = true,
    'start_time=true';

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _notification_mvp_results r
  ORDER BY r.test_name;
END;
$$;
