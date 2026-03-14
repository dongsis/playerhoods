-- =============================================================================
-- Match regression test runner v2
-- Covers: admission / nominate / delegate / approve / remove / withdraw /
--         deprecated (or dropped) RPCs / integrity / permission negative
-- Uses fixed dataset: ORG_UID, P_UID, REAL_UID, SCOPE_GID, CLUB_ID
-- Does NOT modify or remove test_runner_v161.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.test_runner_match_regression_v2()
RETURNS TABLE (
  test_name text,
  ok boolean,
  details text,
  match_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Fixed identities from dataset
  ORG_UID      uuid := '1bb09aac-908c-4746-b904-81c5ff302872'; -- OldChai
  P_UID        uuid := '37c9e087-5b62-43e8-add6-893dec015efd'; -- U3
  REAL_UID     uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44'; -- Real
  OUTSIDER_UID uuid := 'b0000000-0000-0000-0000-000000000001'; -- Outsider (not in orc2)

  -- Scope / club
  SCOPE_GID uuid := '17ed4074-6afa-47c7-b9c1-5e110db5859f'; -- orc2
  CLUB_ID   uuid := '3802862a-db80-40e5-bed0-c76e8a631fa8'; -- Whiteoak Tennis Club

  v_mid uuid;
  v_mp  public.match_participants%rowtype;
  v_cnt integer;
  v_ok  boolean;
  v_msg text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _v2_results(
    test_name text,
    ok boolean,
    details text,
    match_id uuid
  ) ON COMMIT DROP;

  -- =========================================================
  -- A. Helper / invariant tests
  -- =========================================================

  -- A01 ShareGroup positive
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    IF public.do_users_share_group(P_UID, REAL_UID) IS TRUE THEN
      INSERT INTO _v2_results VALUES ('A01 ShareGroup(U3, Real) positive', true, 'ok', NULL);
    ELSE
      INSERT INTO _v2_results VALUES ('A01 ShareGroup(U3, Real) positive', false, 'expected true', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('A01 ShareGroup(U3, Real) positive', false, 'exception: '||SQLERRM, NULL);
  END;

  -- A02 MatchAssociated excludes removed (per 20260305150000: removed NOT match-associated)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '08:00'::time, 90,
      'tr_v2_A02_match_associated_removed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(
      match_id, user_id, status, join_method,
      removed_at, removed_by, created_by
    ) VALUES (
      v_mid, REAL_UID, 'removed', 'invited',
      now(), ORG_UID, ORG_UID
    );

    IF public.is_user_match_associated(v_mid, REAL_UID) IS FALSE THEN
      INSERT INTO _v2_results VALUES ('A02 MatchAssociated excludes removed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('A02 MatchAssociated excludes removed', false, 'expected false (removed not match-associated)', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('A02 MatchAssociated excludes removed', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- B. Admission / nominate / request
  -- =========================================================

  -- B01 Nominate creates pending nominated
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '09:00'::time, 90,
      'tr_v2_B01_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v2_results VALUES ('B01 Nominate creates pending nominated', false, 'no row', v_mid);
    ELSIF v_mp.status::text = 'pending'
       AND v_mp.join_method::text = 'nominated'
       AND v_mp.nominated_by = P_UID
       AND v_mp.org_approved_at IS NULL
       AND v_mp.participant_accepted_at IS NULL
    THEN
      INSERT INTO _v2_results VALUES ('B01 Nominate creates pending nominated', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'B01 Nominate creates pending nominated',
        false,
        'unexpected: status='||coalesce(v_mp.status::text,'NULL')
        ||', join_method='||coalesce(v_mp.join_method::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('B01 Nominate creates pending nominated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- B02 Admit user (organizer) creates invited row with org_approved_at
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '09:30'::time, 90,
      'tr_v2_B02_admit_user', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp
    FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    IF v_mp.id IS NULL THEN
      INSERT INTO _v2_results VALUES ('B02 Admit user creates row', false, 'no row returned', v_mid);
    ELSIF v_mp.org_approved_at IS NOT NULL AND v_mp.join_method::text = 'invited' THEN
      INSERT INTO _v2_results VALUES (
        'B02 Admit user creates row',
        true,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', org_approved_at set',
        v_mid
      );
    ELSE
      INSERT INTO _v2_results VALUES (
        'B02 Admit user creates row',
        false,
        'org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL')
        ||', join_method='||coalesce(v_mp.join_method::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('B02 Admit user creates row', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- B03 Request join creates pending requested
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '09:45'::time, 90,
      'tr_v2_B03_request_join', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp
    FROM public.rpc_match_request_join(v_mid);

    IF v_mp.id IS NULL THEN
      INSERT INTO _v2_results VALUES ('B03 Request join creates pending requested', false, 'no row returned', v_mid);
    ELSIF v_mp.status::text = 'pending'
       AND v_mp.join_method::text = 'requested'
       AND v_mp.participant_accepted_at IS NOT NULL
    THEN
      INSERT INTO _v2_results VALUES ('B03 Request join creates pending requested', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'B03 Request join creates pending requested',
        false,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', join_method='||coalesce(v_mp.join_method::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('B03 Request join creates pending requested', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- C. Delegate / approve / composed confirm
  -- =========================================================

  -- C01 Organizer delegate existing admitted participant
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '10:00'::time, 90,
      'tr_v2_C01_org_delegate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp
    FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    IF v_mp.participant_accepted_at IS NOT NULL THEN
      INSERT INTO _v2_results VALUES (
        'C01 Organizer delegate existing admitted participant',
        true,
        'participant_accepted_via='||coalesce(v_mp.participant_accepted_via::text,'NULL')
        ||', status='||coalesce(v_mp.status::text,'NULL'),
        v_mid
      );
    ELSE
      INSERT INTO _v2_results VALUES ('C01 Organizer delegate existing admitted participant', false, 'participant_accepted_at is NULL', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C01 Organizer delegate existing admitted participant', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C02 Non-organizer delegate nominated participant (stays pending)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '10:30'::time, 90,
      'tr_v2_C02_non_org_delegate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    IF v_mp.participant_accepted_at IS NOT NULL
       AND v_mp.org_approved_at IS NULL
       AND v_mp.status::text = 'pending'
    THEN
      INSERT INTO _v2_results VALUES ('C02 Non-organizer delegate keeps pending', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'C02 Non-organizer delegate keeps pending',
        false,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C02 Non-organizer delegate keeps pending', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C03 Organizer approve completes confirmed state
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:00'::time, 90,
      'tr_v2_C03_org_approve', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    IF v_mp.org_approved_at IS NOT NULL
       AND v_mp.participant_accepted_at IS NOT NULL
       AND v_mp.status::text = 'confirmed'
    THEN
      INSERT INTO _v2_results VALUES ('C03 Organizer approve completes confirmed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'C03 Organizer approve completes confirmed',
        false,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C03 Organizer approve completes confirmed', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C04 Composed add+confirm (admit + delegate_confirm)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:15'::time, 90,
      'tr_v2_C04_composed_add_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp
    FROM public.rpc_match_admit_user(v_mid, REAL_UID);
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    IF v_mp.org_approved_at IS NOT NULL
       AND v_mp.participant_accepted_at IS NOT NULL
       AND v_mp.status::text = 'confirmed'
    THEN
      INSERT INTO _v2_results VALUES ('C04 Composed add+confirm (admit+delegate)', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'C04 Composed add+confirm (admit+delegate)',
        false,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C04 Composed add+confirm (admit+delegate)', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C05 Composed manual confirm existing (delegate + org_approve)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:30'::time, 90,
      'tr_v2_C05_composed_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    IF v_mp.org_approved_at IS NOT NULL
       AND v_mp.participant_accepted_at IS NOT NULL
       AND v_mp.status::text = 'confirmed'
    THEN
      INSERT INTO _v2_results VALUES ('C05 Composed manual confirm (delegate+approve)', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'C05 Composed manual confirm (delegate+approve)',
        false,
        'status='||coalesce(v_mp.status::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C05 Composed manual confirm (delegate+approve)', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- D. Participant exit: remove / withdraw
  -- =========================================================

  -- D01 Remove pending nominated logs reject_nomination
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:45'::time, 90,
      'tr_v2_D01_remove_pending_nominated', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    IF v_mp.removed_at IS NOT NULL THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participant_actions a
      WHERE a.match_participant_id = v_mp.id
        AND a.action_type::text = 'reject_nomination';

      IF v_cnt >= 1 THEN
        INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', false, 'missing action log', v_mid);
      END IF;
    ELSE
      INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', false, 'removed_at is NULL', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- D02 Remove pending requested logs reject_request
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:00'::time, 90,
      'tr_v2_D02_remove_pending_requested', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    IF v_mp.removed_at IS NOT NULL THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participant_actions a
      WHERE a.match_participant_id = v_mp.id
        AND a.action_type::text = 'reject_request';

      IF v_cnt >= 1 THEN
        INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', false, 'missing action log', v_mid);
      END IF;
    ELSE
      INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', false, 'removed_at is NULL', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- D03 Withdraw confirmed logs withdraw
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:15'::time, 90,
      'tr_v2_D03_withdraw_confirmed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_user_withdraw(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id
      AND a.action_type::text = 'withdraw';

    IF v_mp.removed_at IS NOT NULL AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('D03 Withdraw confirmed logs withdraw', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('D03 Withdraw confirmed logs withdraw', false, 'missing removed_at or action log', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('D03 Withdraw confirmed logs withdraw', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- E. Deprecated / dropped RPCs (must not succeed)
  -- Accepts: deprecated stub error OR function does not exist (dropped)
  -- =========================================================

  -- E01 manual_confirm deprecated or dropped
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:30'::time, 90,
      'tr_v2_E01_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    BEGIN
      PERFORM public.rpc_match_manual_confirm(v_mp.id, NULL);
      INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      IF position('deprecated' in SQLERRM) > 0
         OR position('does not exist' in SQLERRM) > 0
         OR position('could not find' in SQLERRM) > 0
      THEN
        INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', true, 'ok (stub or dropped)', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', false, 'unexpected: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- E02 manual_confirm_user deprecated or dropped
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:45'::time, 90,
      'tr_v2_E02_manual_confirm_user', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_manual_confirm_user(v_mid, REAL_UID);
      INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      IF position('deprecated' in SQLERRM) > 0
         OR position('does not exist' in SQLERRM) > 0
         OR position('could not find' in SQLERRM) > 0
      THEN
        INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', true, 'ok (stub or dropped)', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', false, 'unexpected: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- F. Integrity checks
  -- =========================================================

  -- F01 Confirmed requires both timestamps
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp ON mp.match_id = m.id
      WHERE m.game_type LIKE 'tr_v2_%'
        AND m.match_date = current_date
        AND mp.status::text = 'confirmed'
        AND (mp.org_approved_at IS NULL OR mp.participant_accepted_at IS NULL)
    ) THEN
      INSERT INTO _v2_results VALUES ('F01 Confirmed requires both timestamps', false, 'found confirmed row missing required timestamps', NULL);
    ELSE
      INSERT INTO _v2_results VALUES ('F01 Confirmed requires both timestamps', true, 'ok', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('F01 Confirmed requires both timestamps', false, 'exception: '||SQLERRM, NULL);
  END;

  -- =========================================================
  -- G. Permission negative
  -- =========================================================

  -- G01 Non-organizer cannot org_approve
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '13:00'::time, 90,
      'tr_v2_G01_non_org_approve', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    BEGIN
      PERFORM public.rpc_match_org_approve_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('G01 Non-organizer cannot org_approve', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES ('G01 Non-organizer cannot org_approve', true, 'ok', v_mid);
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('G01 Non-organizer cannot org_approve', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- G02 User not in scope cannot request_join
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '13:15'::time, 90,
      'tr_v2_G02_empty_scope', 4,
      '{}'::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_request_join(v_mid);
      INSERT INTO _v2_results VALUES ('G02 User not in scope cannot request_join', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES ('G02 User not in scope cannot request_join', true, 'ok', v_mid);
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('G02 User not in scope cannot request_join', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- H. Idempotency & repeat calls
  -- =========================================================

  -- H01 Duplicate request_join: second fails or idempotent, no new active row, no duplicate action log
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:00'::time, 90,
      'tr_v2_H01_dup_request_join', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    BEGIN
      PERFORM public.rpc_match_request_join(v_mid);
      v_msg := 'second succeeded (idempotent)';
    EXCEPTION WHEN OTHERS THEN
      v_msg := 'second failed: '||SQLERRM;
    END;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID AND mp.removed_at IS NULL;

    IF v_cnt = 1 AND (SELECT count(*) FROM public.match_participant_actions a WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'request_join') <= 1 THEN
      INSERT INTO _v2_results VALUES ('H01 Duplicate request_join idempotent', true, v_msg, v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H01 Duplicate request_join idempotent', false, 'active_rows='||v_cnt||' or duplicate action log', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H01 Duplicate request_join idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H02 Duplicate nominate: no two parallel active nominated rows
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:15'::time, 90,
      'tr_v2_H02_dup_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    BEGIN
      PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);
      v_msg := 'second succeeded (idempotent)';
    EXCEPTION WHEN OTHERS THEN
      v_msg := 'second failed: '||SQLERRM;
    END;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID AND mp.removed_at IS NULL;

    IF v_cnt = 1 THEN
      INSERT INTO _v2_results VALUES ('H02 Duplicate nominate idempotent', true, v_msg, v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H02 Duplicate nominate idempotent', false, 'active nominated rows='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H02 Duplicate nominate idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H03 Duplicate delegate_confirm: no duplicate participant acceptance action log
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:30'::time, 90,
      'tr_v2_H03_dup_delegate_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'delegate_manual_confirm';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_cnt = 1 AND v_mp.participant_accepted_at IS NOT NULL THEN
      INSERT INTO _v2_results VALUES ('H03 Duplicate delegate_confirm idempotent', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H03 Duplicate delegate_confirm idempotent', false, 'delegate_manual_confirm count='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H03 Duplicate delegate_confirm idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H04 Duplicate org_approve: org_approved_at stable, no duplicate approval action log
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:45'::time, 90,
      'tr_v2_H04_dup_org_approve', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'approve';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_cnt = 1 AND v_mp.org_approved_at IS NOT NULL AND v_mp.status::text = 'confirmed' THEN
      INSERT INTO _v2_results VALUES ('H04 Duplicate org_approve idempotent', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H04 Duplicate org_approve idempotent', false, 'approve count='||v_cnt||' status='||coalesce(v_mp.status::text,'NULL'), v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H04 Duplicate org_approve idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H05 Remove idempotent: second remove does not add action log, removed_at stable
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:00'::time, 90,
      'tr_v2_H05_dup_remove', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id;

    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    IF v_cnt = (SELECT count(*) FROM public.match_participant_actions a WHERE a.match_participant_id = v_mp.id) AND v_mp.removed_at IS NOT NULL THEN
      INSERT INTO _v2_results VALUES ('H05 Remove idempotent', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H05 Remove idempotent', false, 'action_count changed or removed_at null', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H05 Remove idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- I. Permission negatives
  -- =========================================================

  -- I01 Non-organizer / non-manager remove others fails
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:15'::time, 90,
      'tr_v2_I01_non_org_remove', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, false,
      now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_admit_user(v_mid, P_UID);
    PERFORM public.rpc_match_delegate_confirm_participant((SELECT mp.id FROM public.match_participants mp WHERE mp.match_id = v_mid AND mp.user_id = P_UID ORDER BY mp.created_at DESC LIMIT 1));
    PERFORM public.rpc_match_org_approve_participant((SELECT mp.id FROM public.match_participants mp WHERE mp.match_id = v_mid AND mp.user_id = P_UID ORDER BY mp.created_at DESC LIMIT 1));

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_remove_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      SELECT count(*) INTO v_cnt
      FROM public.match_participant_actions a
      WHERE a.match_participant_id = v_mp.id AND a.action_type::text IN ('remove_confirmed','revoke_invite','reject_nomination','reject_request');
      IF v_mp.removed_at IS NULL AND v_cnt = 0 THEN
        INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', false, 'removed_at or action written', v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I02 Non-organizer delegate_confirm no-share-group target fails
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:30'::time, 90,
      'tr_v2_I02_no_share_delegate', 4,
      ARRAY[SCOPE_GID, 'c0000000-0000-0000-0000-000000000001'::uuid]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, OUTSIDER_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('I02 Non-org delegate no-share-group fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      IF v_mp.participant_accepted_at IS NULL AND (position('target_not_in_shared_groups' in SQLERRM) > 0 OR position('not_authorized' in SQLERRM) > 0) THEN
        INSERT INTO _v2_results VALUES ('I02 Non-org delegate no-share-group fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I02 Non-org delegate no-share-group fails', false, 'accepted_at set or wrong error: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I02 Non-org delegate no-share-group fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I03 Non-organizer delegate_confirm requested participant fails (requested needs org path)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:45'::time, 90,
      'tr_v2_I03_non_org_delegate_requested', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    INSERT INTO public.match_participants (
      match_id, user_id, join_method, status,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      v_mid, REAL_UID, 'requested', 'pending',
      NULL, NULL,
      NULL, NULL, REAL_UID
    )
    RETURNING * INTO v_mp;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('I03 Non-org delegate requested fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      IF position('participant_not_invited_or_nominated' in SQLERRM) > 0 THEN
        INSERT INTO _v2_results VALUES ('I03 Non-org delegate requested fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I03 Non-org delegate requested fails', false, 'wrong error: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I03 Non-org delegate requested fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I04 Outsider nominate fails (not in scope, not match-associated)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:00'::time, 90,
      'tr_v2_I04_outsider_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', OUTSIDER_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);
      INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participants mp
      WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID;
      IF v_cnt = 0 THEN
        INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', false, 'participant row created', v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I05 Non-participant cannot withdraw (rpc_match_user_withdraw: no user participant row)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:15'::time, 90,
      'tr_v2_I05_non_participant_withdraw', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', OUTSIDER_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_user_withdraw(v_mid);
      INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      IF position('not a participant' in SQLERRM) > 0 OR position('You are not' in SQLERRM) > 0 THEN
        INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', false, 'wrong error: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- J. Participant-exit matrix
  -- =========================================================

  -- J01 Remove pending invited => revoke_invite
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:30'::time, 90,
      'tr_v2_J01_remove_invited', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'revoke_invite';

    IF v_mp.removed_at IS NOT NULL AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J01 Remove pending invited => revoke_invite', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J01 Remove pending invited => revoke_invite', false, 'action_type or removed_at', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J01 Remove pending invited => revoke_invite', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- J02 Remove confirmed => remove_confirmed
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:45'::time, 90,
      'tr_v2_J02_remove_confirmed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'remove_confirmed';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_mp.removed_at IS NOT NULL AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J02 Remove confirmed => remove_confirmed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J02 Remove confirmed => remove_confirmed', false, 'removed_at='||coalesce(v_mp.removed_at::text,'NULL')||' remove_confirmed_cnt='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J02 Remove confirmed => remove_confirmed', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- J03 Withdraw pending nominated => decline
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '17:00'::time, 90,
      'tr_v2_J03_withdraw_nominated', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_user_withdraw(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'decline';

    IF v_mp.removed_at IS NOT NULL AND v_mp.removed_by = REAL_UID AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J03 Withdraw pending nominated => decline', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J03 Withdraw pending nominated => decline', false, 'action or removed_by', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J03 Withdraw pending nominated => decline', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- J04 Withdraw confirmed => withdraw (stronger)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '17:15'::time, 90,
      'tr_v2_J04_withdraw_confirmed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_user_withdraw(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'withdraw';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_mp.removed_at IS NOT NULL AND v_mp.removed_by = REAL_UID AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J04 Withdraw confirmed => withdraw', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J04 Withdraw confirmed => withdraw', false, 'removed_at='||coalesce(v_mp.removed_at::text,'NULL')||' withdraw_cnt='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J04 Withdraw confirmed => withdraw', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- K. Re-entry / removed then re-enter
  -- =========================================================

  -- K01 Removed user re-admit via admit_user (re-entry: admit after remove)
  -- NOTE: Re-entry may require specific state; skip if fails with expected semantics
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT id INTO v_mid FROM public.rpc_match_create(
      4, 'tr_v2_K01_readmit', current_date, '17:30'::time, 90,
      CLUB_ID, '{}'::uuid[], ARRAY[SCOPE_GID]::uuid[],
      true, true, true
    );

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF v_mp.removed_at IS NULL AND v_mp.status::text IN ('pending','confirmed') THEN
      INSERT INTO _v2_results VALUES ('K01 Removed user re-admit', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('K01 Removed user re-admit', false, 'status='||coalesce(v_mp.status::text,'NULL')||' removed_at='||coalesce(v_mp.removed_at::text,'NULL'), v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('K01 Removed user re-admit', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- K02 Removed user re-request_join
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT id INTO v_mid FROM public.rpc_match_create(
      4, 'tr_v2_K02_rerequest', current_date, '17:45'::time, 90,
      CLUB_ID, '{}'::uuid[], ARRAY[SCOPE_GID]::uuid[],
      true, true, true
    );

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID AND mp.removed_at IS NULL;

    IF v_cnt = 1 AND v_mp.removed_at IS NULL THEN
      INSERT INTO _v2_results VALUES ('K02 Removed user re-request_join', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('K02 Removed user re-request_join', false, 'active_rows='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('K02 Removed user re-request_join', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- K03 Re-entry then delegate_confirm works
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT id INTO v_mid FROM public.rpc_match_create(
      4, 'tr_v2_K03_reentry_delegate', current_date, '18:00'::time, 90,
      CLUB_ID, '{}'::uuid[], ARRAY[SCOPE_GID]::uuid[],
      true, true, true
    );

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_remove_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_mp.participant_accepted_at IS NOT NULL AND v_mp.removed_at IS NULL THEN
      INSERT INTO _v2_results VALUES ('K03 Re-entry delegate_confirm works', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('K03 Re-entry delegate_confirm works', false, 'accepted_at or removed_at', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('K03 Re-entry delegate_confirm works', false, 'exception: '||SQLERRM, v_mid);
  END;

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details, r.match_id
  FROM _v2_results r
  ORDER BY r.test_name;
END;
$$;
