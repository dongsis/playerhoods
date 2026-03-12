CREATE OR REPLACE FUNCTION public.test_runner_v161()
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
  -- Fixed identities from your dataset
  ORG_UID  uuid := '1bb09aac-908c-4746-b904-81c5ff302872'; -- OldChai
  P_UID    uuid := '37c9e087-5b62-43e8-add6-893dec015efd'; -- U3
  REAL_UID uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44'; -- Real

  -- Use orc2 as scope
  SCOPE_GID uuid := '17ed4074-6afa-47c7-b9c1-5e110db5859f'; -- orc2

  -- Real club_id
  CLUB_ID uuid := '3802862a-db80-40e5-bed0-c76e8a631fa8'; -- Whiteoak Tennis Club

  v_mid uuid;
  v_mp  public.match_participants%rowtype;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _v161_results(
    test_name text,
    ok boolean,
    details text,
    match_id uuid
  ) ON COMMIT DROP;

  -- ===========================================================================
  -- T00: sanity check ShareGroup helper (should be true for (U3, Real))
  -- ===========================================================================
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    IF public.do_users_share_group(P_UID, REAL_UID) IS TRUE THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T00 ShareGroup(U3, Real) == true', true, 'ok', NULL);
    ELSE
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T00 ShareGroup(U3, Real) == true', false, 'do_users_share_group returned false', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T00 ShareGroup(U3, Real) == true', false, 'exception: ' || SQLERRM, NULL);
  END;

  -- ===========================================================================
  -- T01: NOMINATE should create pending nominated row
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
      CLUB_ID, '{}'::uuid[],
      current_date, '10:00'::time, 90,
      'v161_test_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- simulate caller = U3
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT mp.* INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T01 Nominate creates pending nominated', false, 'no match_participants row created', v_mid);
    ELSE
      IF v_mp.status::text = 'pending'
         AND v_mp.join_method::text = 'nominated'
         AND v_mp.nominated_by = P_UID
         AND v_mp.org_approved_at IS NULL
         AND v_mp.participant_accepted_at IS NULL
      THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES ('T01 Nominate creates pending nominated', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T01 Nominate creates pending nominated',
          false,
          'got status='||coalesce(v_mp.status::text,'NULL')
          ||', join_method='||coalesce(v_mp.join_method::text,'NULL')
          ||', nominated_by='||coalesce(v_mp.nominated_by::text,'NULL')
          ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL')
          ||', participant_accepted_at='||coalesce(v_mp.participant_accepted_at::text,'NULL'),
          v_mid
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T01 Nominate creates pending nominated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- ===========================================================================
  -- T02: ORG MANUAL CONFIRM should set both timestamps and reconcile to confirmed
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
      CLUB_ID, '{}'::uuid[],
      current_date, '11:00'::time, 90,
      'v161_test_org_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- simulate caller = organizer
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    -- Composed: admit_user (via invite_user) + delegate_confirm (replaces deprecated manual_confirm_user)
    SELECT * INTO v_mp FROM public.rpc_match_invite_user(v_mid, REAL_UID);
    PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

    SELECT mp.* INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T02 Org add+confirm via composed flow', false, 'no match_participants row created', v_mid);
    ELSE
      IF v_mp.org_approved_at IS NOT NULL
         AND v_mp.participant_accepted_at IS NOT NULL
         AND v_mp.participant_accepted_via::text = 'delegate_manual'
      THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T02 Org add+confirm via composed flow',
          true,
          'status='||coalesce(v_mp.status::text,'NULL')||', ok',
          v_mid
        );
      ELSE
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T02 Org add+confirm via composed flow',
          false,
          'got status='||coalesce(v_mp.status::text,'NULL')
          ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL')
          ||', participant_accepted_at='||coalesce(v_mp.participant_accepted_at::text,'NULL')
          ||', participant_accepted_via='||coalesce(v_mp.participant_accepted_via::text,'NULL'),
          v_mid
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T02 Org add+confirm via composed flow', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- ===========================================================================
  -- T03: Delegated manual confirm keeps pending (no org_approved_at)
  -- Flow: nominate user, then delegate-confirm via rpc_match_delegate_confirm_participant
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
      CLUB_ID, '{}'::uuid[],
      current_date, '12:00'::time, 90,
      'v161_test_delegate_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- U3 nominates Real
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    -- U3 delegate-confirms the nominated participant
    SELECT mp.* INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T03 Delegate confirm keeps pending', false, 'no match_participants row after nominate', v_mid);
    ELSE
      PERFORM public.rpc_match_delegate_confirm_participant(v_mp.id);

      SELECT mp.* INTO v_mp
      FROM public.match_participants mp
      WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
      ORDER BY mp.created_at DESC
      LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES ('T03 Delegate confirm keeps pending', false, 'no match_participants row after delegate confirm', v_mid);
      ELSIF v_mp.participant_accepted_at IS NOT NULL
           AND v_mp.participant_accepted_via::text = 'delegate_manual'
           AND v_mp.org_approved_at IS NULL
           AND v_mp.status::text = 'pending'
      THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES ('T03 Delegate confirm keeps pending', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T03 Delegate confirm keeps pending',
          false,
          'got status='||coalesce(v_mp.status::text,'NULL')
          ||', participant_accepted_at='||coalesce(v_mp.participant_accepted_at::text,'NULL')
          ||', participant_accepted_via='||coalesce(v_mp.participant_accepted_via::text,'NULL')
          ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL'),
          v_mid
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T03 Delegate confirm keeps pending', false, 'sqlstate='||SQLSTATE||' err='||SQLERRM, v_mid);
  END;

  -- ===========================================================================
  -- T04: Confirmed integrity: confirmed requires BOTH org_approved_at + participant_accepted_at
  -- ===========================================================================
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp ON mp.match_id = m.id
      WHERE m.game_type LIKE 'v161_test_%'
        AND m.match_date = current_date
        AND mp.status::text = 'confirmed'
        AND (mp.org_approved_at IS NULL OR mp.participant_accepted_at IS NULL)
    ) THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T04 Confirmed requires both timestamps', false, 'found confirmed row with missing timestamps', NULL);
    ELSE
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T04 Confirmed requires both timestamps', true, 'ok', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T04 Confirmed requires both timestamps', false, 'exception: '||SQLERRM, NULL);
  END;

  -- ===========================================================================
  -- T05: MatchAssociated(any row) includes removed
  -- - create a match, insert a REMOVED row for REAL, verify helper returns true
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
      CLUB_ID, '{}'::uuid[],
      current_date, '13:00'::time, 90,
      'v161_test_match_associated_any_row', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- insert a removed participant row for REAL (status-only world)
    INSERT INTO public.match_participants(
      match_id, user_id, status,
      join_method,
      removed_at, removed_by,
      created_by
    ) VALUES (
      v_mid, REAL_UID, 'removed',
      'invited',
      now(), ORG_UID,
      ORG_UID
    );

    IF public.is_user_match_associated(v_mid, REAL_UID) IS TRUE THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T05 MatchAssociated(any row) includes removed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T05 MatchAssociated(any row) includes removed', false, 'is_user_match_associated returned false for removed row', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T05 MatchAssociated(any row) includes removed', false, 'exception: '||SQLERRM, v_mid);
  END;

  RETURN QUERY
    SELECT r.test_name, r.ok, r.details, r.match_id
    FROM _v161_results r
    ORDER BY r.test_name;

END;
$$;