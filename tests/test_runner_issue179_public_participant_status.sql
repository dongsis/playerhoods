CREATE OR REPLACE FUNCTION public.test_runner_issue179_public_participant_status()
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
  v_system uuid := '17900000-0000-0000-0000-000000000000'::uuid;
  v_host uuid := '17900000-0000-0000-0000-000000000001'::uuid;
  v_player uuid := '17900000-0000-0000-0000-000000000002'::uuid;
  v_other_player uuid := '17900000-0000-0000-0000-000000000003'::uuid;
  v_pending_player uuid := '17900000-0000-0000-0000-000000000004'::uuid;
  v_waiting_player uuid := '17900000-0000-0000-0000-000000000005'::uuid;
  v_removed_player uuid := '17900000-0000-0000-0000-000000000006'::uuid;
  v_not_this_time_player uuid := '17900000-0000-0000-0000-000000000007'::uuid;
  v_stranger uuid := '17900000-0000-0000-0000-000000000008'::uuid;
  v_venue uuid := '17900000-0000-0000-0000-000000000009'::uuid;
  v_match uuid := '17900000-0000-0000-0000-000000000010'::uuid;
  v_guest uuid := '17900000-0000-0000-0000-000000000011'::uuid;
  v_player_mp uuid := '17900000-0000-0000-0000-000000000101'::uuid;
  v_other_mp uuid := '17900000-0000-0000-0000-000000000102'::uuid;
  v_pending_mp uuid := '17900000-0000-0000-0000-000000000103'::uuid;
  v_waiting_mp uuid := '17900000-0000-0000-0000-000000000104'::uuid;
  v_removed_mp uuid := '17900000-0000-0000-0000-000000000105'::uuid;
  v_not_this_time_mp uuid := '17900000-0000-0000-0000-000000000106'::uuid;
  v_guest_mp uuid := '17900000-0000-0000-0000-000000000107'::uuid;
  v_public_token uuid := '17900000-0000-0000-0000-000000000201'::uuid;
  v_formed_at timestamptz := now() - interval '5 minutes';
  v_issue record;
  v_not_this_time_issue record;
  v_status record;
  v_not_this_time_status record;
  v_self_status record;
  v_out_first record;
  v_out_second record;
  v_count integer;
  v_allowed boolean;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue179_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue179_results;

  DELETE FROM public.public_participant_status_tokens
  WHERE match_participant_id IN (
    v_player_mp, v_other_mp, v_pending_mp, v_waiting_mp, v_removed_mp, v_not_this_time_mp, v_guest_mp
  );
  DELETE FROM public.public_match_signup_links WHERE match_id = v_match;
  DELETE FROM public.public_match_signup_config;
  DELETE FROM public.match_participant_actions WHERE match_id = v_match;
  DELETE FROM public.match_participants WHERE match_id = v_match;
  DELETE FROM public.matches WHERE id = v_match;
  DELETE FROM public.guests WHERE id = v_guest;
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.profiles
  WHERE id IN (v_system, v_host, v_player, v_other_player, v_pending_player, v_waiting_player, v_removed_player, v_not_this_time_player, v_stranger);
  DELETE FROM auth.users
  WHERE id IN (v_system, v_host, v_player, v_other_player, v_pending_player, v_waiting_player, v_removed_player, v_not_this_time_player, v_stranger);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_system, 'issue179-system@example.test', now()),
    (v_host, 'issue179-host@example.test', now()),
    (v_player, 'issue179-player@example.test', now()),
    (v_other_player, 'issue179-other@example.test', now()),
    (v_pending_player, 'issue179-pending@example.test', now()),
    (v_waiting_player, 'issue179-waiting@example.test', now()),
    (v_removed_player, 'issue179-removed@example.test', now()),
    (v_not_this_time_player, 'issue179-not-this-time@example.test', now()),
    (v_stranger, 'issue179-stranger@example.test', now());

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES
    (v_system, 'Issue 179 System', null),
    (v_host, 'Issue 179 Host', null),
    (v_player, 'Issue 179 Player', 'https://example.test/player.png'),
    (v_other_player, 'Issue 179 Other Confirmed', null),
    (v_pending_player, 'Issue 179 Pending', null),
    (v_waiting_player, 'Issue 179 Waiting', null),
    (v_removed_player, 'Issue 179 Removed', null),
    (v_not_this_time_player, 'Issue 179 Not This Time', null),
    (v_stranger, 'Issue 179 Stranger', null);

  INSERT INTO public.public_match_signup_config(singleton_key, system_actor_user_id)
  VALUES (true, v_system);

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue, 'Issue 179 Courts', 'America/Toronto');

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
    duration_minutes,
    formed_at
  ) VALUES (
    v_match,
    v_host,
    'active',
    v_venue,
    1,
    'issue179_doubles',
    4,
    current_date + 7,
    '18:00'::time,
    90,
    v_formed_at
  );

  INSERT INTO public.guests (id, display_name, email, phone, status, created_by)
  VALUES (v_guest, 'Issue 179 Guest Confirmed', 'safe-list-guest@example.test', '4165551790', 'active', v_host);

  INSERT INTO public.match_participants (
    id,
    match_id,
    user_id,
    status,
    join_method,
    created_by,
    confirmed_at,
    org_approved_at,
    org_approved_by,
    participant_accepted_at,
    participant_accepted_via,
    confirmation_source
  ) VALUES
    (v_player_mp, v_match, v_player, 'confirmed', 'requested', v_host, now(), now(), v_host, now(), 'in_app', 'player_response'),
    (v_other_mp, v_match, v_other_player, 'confirmed', 'invited', v_host, now(), now(), v_host, now(), 'in_app', 'player_response');

  INSERT INTO public.match_participants (
    id,
    match_id,
    guest_id,
    status,
    join_method,
    created_by,
    confirmed_at,
    org_approved_at,
    org_approved_by,
    participant_accepted_at,
    participant_accepted_via,
    confirmation_source
  ) VALUES (
    v_guest_mp,
    v_match,
    v_guest,
    'confirmed',
    'guest_add',
    v_host,
    now(),
    now(),
    v_host,
    now(),
    'manual',
    'host_managed_offline'
  );

  INSERT INTO public.match_participants (
    id,
    match_id,
    user_id,
    status,
    join_method,
    created_by
  ) VALUES
    (v_pending_mp, v_match, v_pending_player, 'pending', 'requested', v_host),
    (v_waiting_mp, v_match, v_waiting_player, 'waiting_list', 'requested', v_host),
    (v_not_this_time_mp, v_match, v_not_this_time_player, 'pending', 'requested', v_host);

  INSERT INTO public.match_participants (
    id,
    match_id,
    user_id,
    status,
    join_method,
    created_by,
    removed_at,
    removed_by,
    removal_note
  ) VALUES (
    v_removed_mp,
    v_match,
    v_removed_player,
    'removed',
    'requested',
    v_host,
    now(),
    v_removed_player,
    'User withdrew'
  );

  PERFORM public.apply_participant_exit(v_not_this_time_mp, v_host, 'remove', 'Court is full');

  INSERT INTO public.public_match_signup_links(match_id, public_token, created_by)
  VALUES (v_match, v_public_token, v_host);

  SELECT has_table_privilege('anon', 'public.public_participant_status_tokens', 'select')
  INTO v_allowed;
  INSERT INTO _issue179_results VALUES (
    'status token table is not directly selectable by anon',
    v_allowed = false,
    'anon_select=' || coalesce(v_allowed::text, 'null')
  );

  SELECT has_function_privilege('anon', 'public.rpc_public_participant_status_token_issue(uuid,text,uuid)', 'execute')
  INTO v_allowed;
  INSERT INTO _issue179_results VALUES (
    'anon cannot issue participant status tokens',
    v_allowed = false,
    'anon_issue_execute=' || coalesce(v_allowed::text, 'null')
  );

  SELECT * INTO v_issue
  FROM public.rpc_public_participant_status_token_issue(v_player_mp, 'system', v_system)
  LIMIT 1;

  SELECT * INTO v_not_this_time_issue
  FROM public.rpc_public_participant_status_token_issue(v_not_this_time_mp, 'system', v_system)
  LIMIT 1;

  INSERT INTO _issue179_results VALUES (
    'issued token is raw-once and only hash is stored',
    v_issue.status_token IS NOT NULL
      AND length(v_issue.status_token) = 64
      AND EXISTS (
        SELECT 1
        FROM public.public_participant_status_tokens t
        WHERE t.id = v_issue.token_id
          AND t.match_participant_id = v_player_mp
          AND t.token_hash = encode(extensions.digest(v_issue.status_token, 'sha256'), 'hex')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.public_participant_status_tokens t
        WHERE t.id = v_issue.token_id
          AND t.token_hash = v_issue.status_token
      ),
    'token_id=' || coalesce(v_issue.token_id::text, 'null')
  );

  SELECT count(*)::integer INTO v_count
  FROM public.rpc_public_participant_status(v_public_token::text);

  INSERT INTO _issue179_results VALUES (
    'ordinary share link cannot view personal status',
    v_count = 0,
    'status_rows=' || coalesce(v_count::text, 'null')
  );

  SELECT count(*)::integer INTO v_count
  FROM public.rpc_public_participant_out(v_public_token::text);

  INSERT INTO _issue179_results VALUES (
    'ordinary share link cannot OUT anyone',
    v_count = 0
      AND EXISTS (
        SELECT 1
        FROM public.match_participants
        WHERE id = v_player_mp
          AND removed_at IS NULL
      ),
    'out_rows=' || coalesce(v_count::text, 'null')
  );

  SELECT * INTO v_status
  FROM public.rpc_public_participant_status(v_issue.status_token)
  LIMIT 1;

  INSERT INTO _issue179_results VALUES (
    'participant-bound token returns own status and formed match details',
    v_status.match_participant_id = v_player_mp
      AND v_status.match_id = v_match
      AND v_status.participant_status = 'confirmed'
      AND v_status.game_type = 'issue179_doubles'
      AND v_status.is_formed = true
      AND v_status.formed_at = v_formed_at
      AND v_status.player_visible_note IS NULL,
    'participant=' || coalesce(v_status.match_participant_id::text, 'null')
      || ', status=' || coalesce(v_status.participant_status, 'null')
      || ', game_type=' || coalesce(v_status.game_type, 'null')
      || ', is_formed=' || coalesce(v_status.is_formed::text, 'null')
  );

  INSERT INTO _issue179_results VALUES (
    'safe confirmed players include active confirmed only',
    jsonb_array_length(v_status.confirmed_players) = 3
      AND v_status.confirmed_players::text LIKE '%Issue 179 Player%'
      AND v_status.confirmed_players::text LIKE '%Issue 179 Other Confirmed%'
      AND v_status.confirmed_players::text LIKE '%Issue 179 Guest Confirmed%'
      AND v_status.confirmed_players::text NOT LIKE '%Issue 179 Pending%'
      AND v_status.confirmed_players::text NOT LIKE '%Issue 179 Waiting%'
      AND v_status.confirmed_players::text NOT LIKE '%Issue 179 Removed%'
      AND v_status.confirmed_players::text NOT LIKE '%Issue 179 Not This Time%'
      AND v_status.confirmed_players::text NOT LIKE '%4165551790%'
      AND v_status.confirmed_players::text NOT LIKE '%safe-list-guest@example.test%',
    v_status.confirmed_players::text
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_player::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_self_status
  FROM public.rpc_match_self_participant_status(v_match)
  LIMIT 1;

  INSERT INTO _issue179_results VALUES (
    'authenticated self status returns only caller participant',
    v_self_status.match_participant_id = v_player_mp
      AND v_self_status.participant_display_name = 'Issue 179 Player',
    'self_participant=' || coalesce(v_self_status.match_participant_id::text, 'null')
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*)::integer INTO v_count
  FROM public.rpc_match_self_participant_status(v_match);

  INSERT INTO _issue179_results VALUES (
    'authenticated stranger cannot view another participant through self status',
    v_count = 0,
    'self_rows=' || coalesce(v_count::text, 'null')
  );

  PERFORM set_config('request.jwt.claims', '{}'::text, true);

  SELECT * INTO v_not_this_time_status
  FROM public.rpc_public_participant_status(v_not_this_time_issue.status_token)
  LIMIT 1;

  INSERT INTO _issue179_results VALUES (
    'Host Not This Time note is visible only to bound participant status',
    v_not_this_time_status.match_participant_id = v_not_this_time_mp
      AND v_not_this_time_status.participant_status = 'removed'
      AND v_not_this_time_status.player_visible_note = 'Court is full'
      AND v_not_this_time_status.confirmed_players::text NOT LIKE '%Court is full%',
    'note=' || coalesce(v_not_this_time_status.player_visible_note, 'null')
  );

  SELECT * INTO v_out_first
  FROM public.rpc_public_participant_out(v_issue.status_token)
  LIMIT 1;

  SELECT * INTO v_out_second
  FROM public.rpc_public_participant_out(v_issue.status_token)
  LIMIT 1;

  SELECT count(*)::integer INTO v_count
  FROM public.match_participant_actions
  WHERE match_participant_id = v_player_mp
    AND action_type = 'withdraw';

  INSERT INTO _issue179_results VALUES (
    'public OUT via status token is scoped and idempotent',
    v_out_first.match_participant_id = v_player_mp
      AND v_out_first.participant_status = 'removed'
      AND v_out_second.match_participant_id = v_player_mp
      AND v_out_second.participant_status = 'removed'
      AND v_count = 1
      AND NOT (v_out_second.confirmed_players::text LIKE '%Issue 179 Player%'),
    'first_status=' || coalesce(v_out_first.participant_status, 'null')
      || ', second_status=' || coalesce(v_out_second.participant_status, 'null')
      || ', withdraw_actions=' || coalesce(v_count::text, 'null')
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue179_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_issue179_public_participant_status();
