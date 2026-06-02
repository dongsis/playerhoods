CREATE OR REPLACE FUNCTION public.test_runner_issue72_host_exit_visibility()
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
  v_host uuid := gen_random_uuid();
  v_player uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_match_id uuid;
  v_mp_id uuid;
  v_guest_id uuid;
  v_formed_at timestamptz := now() - interval '30 minutes';
  v_before integer;
  v_after integer;
  v_delegate_count integer;
  v_host_legacy_count integer;
  v_display_name text;
  v_status public.match_status;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue72_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _issue72_results;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_host, 'issue72-host-' || replace(v_host::text, '-', '') || '@example.test', now()),
    (v_player, 'issue72-player-' || replace(v_player::text, '-', '') || '@example.test', now()),
    (v_other, 'issue72-other-' || replace(v_other::text, '-', '') || '@example.test', now());

  INSERT INTO public.profiles (id, display_name)
  VALUES
    (v_host, 'Issue 72 Host'),
    (v_player, 'Issue 72 Player'),
    (v_other, 'Issue 72 Other');

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_host::text, 'role', 'authenticated')::text,
    true
  );

  -- Active, formed, canonically confirmed participant exit: notify host once
  -- with the distinct host kind while preserving non-host delegator semantics.
  INSERT INTO public.matches (
    organizer_id, status, match_date, start_time, duration_minutes,
    game_type, required_count, formed_at, created_at
  ) VALUES (
    v_host, 'active', current_date, '09:00'::time, 90,
    'issue72_active_once', 2, v_formed_at, now()
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants (
    match_id, user_id, status, join_method, created_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by,
    manual_confirmed_by
  ) VALUES (
    v_match_id, v_player, 'confirmed', 'invited', v_host,
    v_formed_at - interval '10 minutes', 'delegate_manual', v_formed_at - interval '10 minutes', v_host,
    v_other
  )
  RETURNING id INTO v_mp_id;

  SELECT count(*)::integer INTO v_before
  FROM public.notifications
  WHERE recipient_user_id = v_host
    AND kind = 'host_lineup_short_after_formed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  UPDATE public.match_participants
  SET removed_at = v_formed_at + interval '10 minutes',
      removed_by = v_player,
      removal_note = 'out_after_formed'
  WHERE id = v_mp_id;

  UPDATE public.match_participants
  SET removal_note = 'out_after_formed_updated'
  WHERE id = v_mp_id;

  SELECT count(*)::integer INTO v_after
  FROM public.notifications
  WHERE recipient_user_id = v_host
    AND kind = 'host_lineup_short_after_formed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  SELECT count(*)::integer INTO v_delegate_count
  FROM public.notifications
  WHERE recipient_user_id = v_other
    AND kind = 'delegate_target_removed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  SELECT count(*)::integer INTO v_host_legacy_count
  FROM public.notifications
  WHERE recipient_user_id = v_host
    AND kind = 'delegate_target_removed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  INSERT INTO _issue72_results
  VALUES (
    'host notification fires once for active formed canonical confirmed exit',
    v_after - v_before = 1,
    'delta=' || (v_after - v_before)::text
  );

  INSERT INTO _issue72_results
  VALUES (
    'non-host delegator keeps legacy delegate removed notification',
    v_delegate_count = 1,
    'delegate_count=' || v_delegate_count::text
  );

  INSERT INTO _issue72_results
  VALUES (
    'host formed-exit notification does not reuse legacy delegate kind',
    v_host_legacy_count = 0,
    'host_legacy_count=' || v_host_legacy_count::text
  );

  -- Status alone is not canonical confirmation and must not notify the host.
  INSERT INTO public.matches (
    organizer_id, status, match_date, start_time, duration_minutes,
    game_type, required_count, formed_at, created_at
  ) VALUES (
    v_host, 'active', current_date, '10:00'::time, 90,
    'issue72_pending_status_confirmed_only', 2, v_formed_at, now()
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants (
    match_id, user_id, status, join_method, created_by
  ) VALUES (
    v_match_id, v_player, 'confirmed', 'requested', v_player
  )
  RETURNING id INTO v_mp_id;

  SELECT count(*)::integer INTO v_before
  FROM public.notifications
  WHERE recipient_user_id = v_host
    AND kind = 'host_lineup_short_after_formed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  UPDATE public.match_participants
  SET removed_at = v_formed_at + interval '15 minutes',
      removed_by = v_player,
      removal_note = 'pending_removed'
  WHERE id = v_mp_id;

  SELECT count(*)::integer INTO v_after
  FROM public.notifications
  WHERE recipient_user_id = v_host
    AND kind = 'host_lineup_short_after_formed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  INSERT INTO _issue72_results
  VALUES (
    'non-canonical pending removal does not fire host lineup-short notification',
    v_after = v_before,
    'delta=' || (v_after - v_before)::text
  );

  -- Removal before formed_at must not produce the post-Game-On warning notification.
  INSERT INTO public.matches (
    organizer_id, status, match_date, start_time, duration_minutes,
    game_type, required_count, formed_at, created_at
  ) VALUES (
    v_host, 'active', current_date, '11:00'::time, 90,
    'issue72_pre_formation', 2, v_formed_at, now()
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants (
    match_id, user_id, status, join_method, created_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) VALUES (
    v_match_id, v_player, 'confirmed', 'invited', v_host,
    v_formed_at - interval '20 minutes', 'in_app', v_formed_at - interval '20 minutes', v_host
  )
  RETURNING id INTO v_mp_id;

  SELECT count(*)::integer INTO v_before
  FROM public.notifications
  WHERE recipient_user_id = v_host
    AND kind = 'host_lineup_short_after_formed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  UPDATE public.match_participants
  SET removed_at = v_formed_at - interval '5 minutes',
      removed_by = v_player,
      removal_note = 'pre_formation'
  WHERE id = v_mp_id;

  SELECT count(*)::integer INTO v_after
  FROM public.notifications
  WHERE recipient_user_id = v_host
    AND kind = 'host_lineup_short_after_formed'
    AND match_id = v_match_id
    AND match_participant_id = v_mp_id;

  INSERT INTO _issue72_results
  VALUES (
    'pre-formation removal does not fire host lineup-short notification',
    v_after = v_before,
    'delta=' || (v_after - v_before)::text
  );

  -- Cancelled and archived matches suppress the host post-formation exit notification.
  FOREACH v_status IN ARRAY ARRAY['cancelled'::public.match_status, 'archived'::public.match_status]
  LOOP
    INSERT INTO public.matches (
      organizer_id, status, match_date, start_time, duration_minutes,
      game_type, required_count, formed_at, created_at
    ) VALUES (
      v_host, v_status, current_date, '12:00'::time, 90,
      'issue72_non_active_' || v_status::text, 2, v_formed_at, now()
    )
    RETURNING id INTO v_match_id;

    INSERT INTO public.match_participants (
      match_id, user_id, status, join_method, created_by,
      participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
    ) VALUES (
      v_match_id, v_player, 'confirmed', 'invited', v_host,
      v_formed_at - interval '20 minutes', 'in_app', v_formed_at - interval '20 minutes', v_host
    )
    RETURNING id INTO v_mp_id;

    SELECT count(*)::integer INTO v_before
    FROM public.notifications
    WHERE recipient_user_id = v_host
      AND kind = 'host_lineup_short_after_formed'
      AND match_id = v_match_id
      AND match_participant_id = v_mp_id;

    UPDATE public.match_participants
    SET removed_at = v_formed_at + interval '20 minutes',
        removed_by = v_player,
        removal_note = 'non_active'
    WHERE id = v_mp_id;

    SELECT count(*)::integer INTO v_after
    FROM public.notifications
    WHERE recipient_user_id = v_host
      AND kind = 'host_lineup_short_after_formed'
      AND match_id = v_match_id
      AND match_participant_id = v_mp_id;

    INSERT INTO _issue72_results
    VALUES (
      'non-active match suppresses host lineup-short notification: ' || v_status::text,
      v_after = v_before,
      'delta=' || (v_after - v_before)::text
    );
  END LOOP;

  -- Feasible Contact Player display-name coverage: host can resolve a guest participant name.
  INSERT INTO public.matches (
    organizer_id, status, match_date, start_time, duration_minutes,
    game_type, required_count, formed_at, created_at
  ) VALUES (
    v_host, 'active', current_date, '13:00'::time, 90,
    'issue72_guest_display_name', 2, v_formed_at, now()
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.guests (display_name, created_by, email)
  VALUES ('Issue 72 Contact Player', v_host, 'issue72-contact@example.test')
  RETURNING id INTO v_guest_id;

  INSERT INTO public.match_participants (
    match_id, guest_id, status, join_method, created_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) VALUES (
    v_match_id, v_guest_id, 'confirmed', 'guest_add', v_host,
    v_formed_at - interval '20 minutes', 'delegate_manual', v_formed_at - interval '20 minutes', v_host
  )
  RETURNING id INTO v_mp_id;

  SELECT display_name INTO v_display_name
  FROM public.rpc_match_participant_display_names(v_match_id, ARRAY[v_mp_id])
  LIMIT 1;

  INSERT INTO _issue72_results
  VALUES (
    'guest/contact display name resolves for Inbox copy',
    v_display_name = 'Issue 72 Contact Player',
    'display_name=' || coalesce(v_display_name, 'null')
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue72_results r
  ORDER BY r.test_name;
END;
$$;
