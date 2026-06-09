-- =============================================================================
-- Participant controls regression template
-- Covers: self-withdraw association, organizer-remove exclusion, explicit proxy
-- confirm / revoke for user + guest/contact player, and associated follow-up
-- permissions that depend on those semantics.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.test_runner_participant_controls_template()
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
  ORG_UID      uuid := '1bb09aac-908c-4746-b904-81c5ff302872';
  P_UID        uuid := '37c9e087-5b62-43e8-add6-893dec015efd';
  REAL_UID     uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44';
  SCOPE_GID    uuid := '17ed4074-6afa-47c7-b9c1-5e110db5859f';
  CLUB_ID      uuid := '3802862a-db80-40e5-bed0-c76e8a631fa8';

  v_mid uuid;
  v_mp public.match_participants%rowtype;
  v_guest public.guests%rowtype;
  v_inv public.email_invitations%rowtype;
  v_binding public.person_match_proxies%rowtype;
  v_cnt integer;
  v_person_id uuid;
  v_real_email text;
  v_org_approved_at timestamptz;
  v_cnt_2 integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _participant_controls_results(
    test_name text,
    ok boolean,
    details text,
    match_id uuid
  ) ON COMMIT DROP;

  -- =========================================================
  -- A. Match-associated semantics
  -- =========================================================

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:00'::time, 90,
      'tr_tpl_A01_self_withdraw_associated', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'requested', now(), REAL_UID, REAL_UID);

    INSERT INTO _participant_controls_results
    VALUES (
      'A01 Self-withdraw remains associated',
      public.is_user_match_associated(v_mid, REAL_UID) IS TRUE,
      CASE WHEN public.is_user_match_associated(v_mid, REAL_UID) IS TRUE THEN 'ok' ELSE 'expected true' END,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A01 Self-withdraw remains associated', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:15'::time, 90,
      'tr_tpl_A02_org_removed_excluded', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'invited', now(), ORG_UID, ORG_UID);

    INSERT INTO _participant_controls_results
    VALUES (
      'A02 Organizer-remove excludes associated',
      public.is_user_match_associated(v_mid, REAL_UID) IS FALSE,
      CASE WHEN public.is_user_match_associated(v_mid, REAL_UID) IS FALSE THEN 'ok' ELSE 'expected false' END,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A02 Organizer-remove excludes associated', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:30'::time, 90,
      'tr_tpl_A03_self_withdraw_can_nominate', 4, '{}'::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'requested', now(), REAL_UID, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_nominate_user(v_mid, P_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = P_UID
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO _participant_controls_results
    VALUES (
      'A03 Self-withdraw actor can nominate via associated fallback',
      FOUND AND v_mp.join_method::text = 'nominated',
      CASE WHEN FOUND THEN 'join_method=' || coalesce(v_mp.join_method::text, 'NULL') ELSE 'no row created' END,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A03 Self-withdraw actor can nominate via associated fallback', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:45'::time, 90,
      'tr_tpl_A04_org_removed_cannot_nominate', 4, '{}'::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'invited', now(), ORG_UID, ORG_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);

    BEGIN
      PERFORM public.rpc_match_nominate_user(v_mid, P_UID);
      INSERT INTO _participant_controls_results VALUES ('A04 Organizer-removed actor cannot nominate via associated fallback', false, 'expected authorization failure', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _participant_controls_results
      VALUES (
        'A04 Organizer-removed actor cannot nominate via associated fallback',
        SQLERRM LIKE '%not authorized%',
        SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A04 Organizer-removed actor cannot nominate via associated fallback', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- B. User explicit Match Proxy lifecycle
  -- =========================================================

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:00'::time, 90,
      'tr_tpl_B01_user_proxy_pending', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO _participant_controls_results
    VALUES (
      'B01 Self-requested Match Proxy binding stays pending until email verification',
      v_binding.status = 'pending'
      AND v_binding.confirmed_at IS NULL
      AND v_binding.invited_via = 'principal_email_verification'
      AND v_inv.id IS NOT NULL
      AND v_inv.status = 'pending'
      AND lower(trim(v_inv.target_email)) = lower(trim(v_binding.invited_to)),
      'status=' || coalesce(v_binding.status::text, 'NULL')
      || ', invited_via=' || coalesce(v_binding.invited_via, 'NULL')
      || ', invited_to=' || coalesce(v_binding.invited_to, 'NULL')
      || ', invitation_id=' || coalesce(v_inv.id::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B01 Self-requested Match Proxy binding stays pending until email verification', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:15'::time, 90,
      'tr_tpl_B02_user_proxy_active_manageable', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_cnt
    FROM public.rpc_match_proxy_manageable_participants(v_mid) t
    WHERE t.match_participant_id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'B02 Confirmed Match Proxy binding exposes manageable participant scope',
      v_binding.status = 'active'
      AND v_binding.confirmed_at IS NOT NULL
      AND v_cnt = 1,
      'status=' || coalesce(v_binding.status::text, 'NULL')
      || ', manageable_count=' || v_cnt::text,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B02 Confirmed Match Proxy binding exposes manageable participant scope', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:30'::time, 90,
      'tr_tpl_B03_user_proxy_confirm_participant', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'B03 Active Match Proxy can confirm invited user principal',
      v_mp.status::text = 'confirmed'
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.participant_accepted_via = 'proxy'
      AND v_mp.manual_confirmed_by = P_UID,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', actor=' || coalesce(v_mp.manual_confirmed_by::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B03 Active Match Proxy can confirm invited user principal', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:45'::time, 90,
      'tr_tpl_B04_user_proxy_rejected', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_decline(v_inv.id);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;

    INSERT INTO _participant_controls_results
    VALUES (
      'B04 Principal can reject pending Match Proxy binding',
      v_binding.status = 'rejected'
      AND v_binding.rejected_at IS NOT NULL
      AND v_binding.confirmed_at IS NULL,
      'status=' || coalesce(v_binding.status::text, 'NULL')
      || ', rejected_at=' || coalesce(v_binding.rejected_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B04 Principal can reject pending Match Proxy binding', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:00'::time, 90,
      'tr_tpl_B05_user_proxy_revoked', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_revoke_self(v_binding.binding_id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _participant_controls_results VALUES ('B05 Revoked Match Proxy binding immediately blocks future proxy confirm', false, 'expected not_authorized_to_proxy_confirm', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      INSERT INTO _participant_controls_results
      VALUES (
        'B05 Revoked Match Proxy binding immediately blocks future proxy confirm',
        SQLERRM = 'not_authorized_to_proxy_confirm'
        AND v_binding.status = 'revoked'
        AND v_binding.revoked_at IS NOT NULL
        AND v_mp.participant_accepted_at IS NULL,
        'exception=' || SQLERRM
        || ', binding_status=' || coalesce(v_binding.status::text, 'NULL')
        || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL'),
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B05 Revoked Match Proxy binding immediately blocks future proxy confirm', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- C. Contact Player explicit Match Proxy lifecycle
  -- =========================================================

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:00'::time, 90,
      'tr_tpl_C01_guest_org_only_pending', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C01 guest', NULL, NULL, 'participant-controls-template');
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    INSERT INTO _participant_controls_results
    VALUES (
      'C01 Organizer-approved Contact Player stays pending until participant confirmation',
      v_mp.status::text = 'pending'
      AND v_mp.join_method::text = 'invited'
      AND v_mp.nominated_by IS NULL
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.participant_accepted_at IS NULL,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', join_method=' || coalesce(v_mp.join_method::text, 'NULL')
      || ', nominated_by=' || coalesce(v_mp.nominated_by::text, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL')
      || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C01 Organizer-approved Contact Player stays pending until participant confirmation', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:15'::time, 90,
      'tr_tpl_C01B_person_host_invite_semantics', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C01B guest', 'tr-c01b@test.local', NULL, 'participant-controls-template');

    PERFORM public.rpc_match_invite_contact_person(v_mid, v_guest.person_id);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.guest_id = v_guest.id
      AND mp.removed_at IS NULL
    ORDER BY mp.created_at DESC
    LIMIT 1;

    INSERT INTO _participant_controls_results
    VALUES (
      'C01B Host Contact Player person invite writes invited semantics',
      v_mp.status::text = 'pending'
      AND v_mp.join_method::text = 'invited'
      AND v_mp.nominated_by IS NULL
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.participant_accepted_at IS NULL,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', join_method=' || coalesce(v_mp.join_method::text, 'NULL')
      || ', nominated_by=' || coalesce(v_mp.nominated_by::text, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL')
      || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C01B Host Contact Player person invite writes invited semantics', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:30'::time, 90,
      'tr_tpl_C02_contact_proxy_request_pending', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C02 guest', 'tr-c02@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO _participant_controls_results
    VALUES (
      'C02 Contact Player proxy request creates pending binding and verification invitation',
      v_binding.status = 'pending'
      AND v_binding.invited_to = 'tr-c02@test.local'
      AND v_inv.id IS NOT NULL
      AND v_inv.status = 'pending'
      AND lower(trim(v_inv.target_email)) = 'tr-c02@test.local',
      'binding_status=' || coalesce(v_binding.status::text, 'NULL')
      || ', target_email=' || coalesce(v_inv.target_email, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C02 Contact Player proxy request creates pending binding and verification invitation', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    -- TODO(MVP): Guest-side match_proxy_binding verification is out of scope.
    -- Contact Players are handled through owner/private contact invites, magic links,
    -- SMS RSVP, and future identity-link claim flows rather than guest proxy binding.
    IF true THEN
      INSERT INTO _participant_controls_results
      VALUES (
        'C03 Guest verification accept activates Match Proxy binding and manageable scope',
        true,
        'retired: guest-side match_proxy_binding verification is out of MVP scope',
        NULL
      );
    ELSE
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:45'::time, 90,
      'tr_tpl_C03_contact_proxy_active_manageable', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C03 guest', 'tr-c03@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_email_invitation_accept_as_guest(v_inv.id);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    SELECT count(*) INTO v_cnt
    FROM public.rpc_match_proxy_manageable_participants(v_mid) t
    WHERE t.match_participant_id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'C03 Guest verification accept activates Match Proxy binding and manageable scope',
      v_binding.status = 'active'
      AND v_binding.confirmed_at IS NOT NULL
      AND v_cnt = 1,
      'binding_status=' || coalesce(v_binding.status::text, 'NULL')
      || ', manageable_count=' || v_cnt::text,
      v_mid
    );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C03 Guest verification accept activates Match Proxy binding and manageable scope', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    -- TODO(MVP): Guest-side match_proxy_binding verification is out of scope.
    IF true THEN
      INSERT INTO _participant_controls_results
      VALUES (
        'C04 Active Match Proxy can confirm Contact Player principal',
        true,
        'retired: Contact Player proxy confirm via guest-side match_proxy_binding is out of MVP scope',
        NULL
      );
    ELSE
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:00'::time, 90,
      'tr_tpl_C04_contact_proxy_confirm_participant', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C04 guest', 'tr-c04@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_email_invitation_accept_as_guest(v_inv.id);
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'C04 Active Match Proxy can confirm Contact Player principal',
      v_mp.status::text = 'confirmed'
      AND v_mp.participant_accepted_via = 'proxy'
      AND v_mp.manual_confirmed_by = P_UID
      AND v_mp.org_approved_at IS NOT NULL,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', actor=' || coalesce(v_mp.manual_confirmed_by::text, 'NULL'),
      v_mid
    );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C04 Active Match Proxy can confirm Contact Player principal', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    -- TODO(MVP): Guest-side match_proxy_binding decline is out of scope.
    IF true THEN
      INSERT INTO _participant_controls_results
      VALUES (
        'C05 Declined Contact Player Match Proxy request blocks future proxy confirm',
        true,
        'retired: guest-side match_proxy_binding decline is out of MVP scope',
        NULL
      );
    ELSE
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:15'::time, 90,
      'tr_tpl_C05_contact_proxy_rejected', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C05 guest', 'tr-c05@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_email_invitation_decline_as_guest(v_inv.id, ORG_UID);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _participant_controls_results VALUES ('C05 Declined Contact Player Match Proxy request blocks future proxy confirm', false, 'expected not_authorized_to_proxy_confirm', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      INSERT INTO _participant_controls_results
      VALUES (
        'C05 Declined Contact Player Match Proxy request blocks future proxy confirm',
        SQLERRM = 'not_authorized_to_proxy_confirm'
        AND v_binding.status = 'rejected'
        AND v_binding.rejected_at IS NOT NULL
        AND v_mp.participant_accepted_at IS NULL,
        'exception=' || SQLERRM
        || ', binding_status=' || coalesce(v_binding.status::text, 'NULL')
        || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL'),
        v_mid
      );
    END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C05 Declined Contact Player Match Proxy request blocks future proxy confirm', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- D. Contact Player caller gate cleanup
  -- =========================================================

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:00'::time, 90,
      'tr_tpl_D01_contact_targets_follow_invite_gate', 4, ARRAY[SCOPE_GID]::uuid[],
      true, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D01 guest', 'tr-d01@test.local', NULL, 'participant-controls-template');

    SELECT count(*) INTO v_cnt
    FROM public.rpc_match_admission_targets(v_mid) t
    WHERE t.target_kind = 'contact_player'
      AND t.target_id = v_guest.id
      AND t.action_kind = 'nominate_contact_player'
      AND t.can_admit IS TRUE;

    INSERT INTO _participant_controls_results
    VALUES (
      'D01 MVP admission targets omit private Contact Player targets',
      v_cnt = 0,
      'target_count=' || v_cnt::text || '; Contact Players now use owner/private invite and identity-link/SMS RSVP flows',
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D01 MVP admission targets omit private Contact Player targets', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:15'::time, 90,
      'tr_tpl_D02_unlinked_contact_non_host_rejected', 4, ARRAY[SCOPE_GID]::uuid[],
      true, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D02 guest', 'tr-d02@test.local', NULL, 'participant-controls-template');

    BEGIN
      PERFORM public.rpc_match_nominate_guest(v_mid, v_guest.id);
      INSERT INTO _participant_controls_results VALUES ('D02 Non-host legacy Contact Player nomination is rejected', false, 'expected rejection', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participants mp
      WHERE mp.match_id = v_mid
        AND mp.removed_at IS NULL;

      SELECT count(*) INTO v_cnt_2
      FROM public.email_invitations ei
      WHERE ei.related_type = 'match'
        AND ei.related_id = v_mid;

      INSERT INTO _participant_controls_results
      VALUES (
        'D02 Non-host legacy Contact Player nomination is rejected',
        v_cnt = 0 AND v_cnt_2 = 0,
        'exception=' || SQLERRM
        || ', active_rows=' || v_cnt::text
        || ', invitations=' || v_cnt_2::text,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D02 Non-host legacy Contact Player nomination is rejected', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:20'::time, 90,
      'tr_tpl_D02B_person_non_host_unlinked_rejected', 4, ARRAY[SCOPE_GID]::uuid[],
      true, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D02B guest', 'tr-d02b@test.local', NULL, 'participant-controls-template');

    BEGIN
      PERFORM public.rpc_match_invite_contact_person(v_mid, v_guest.person_id);
      INSERT INTO _participant_controls_results VALUES ('D02B Non-host unlinked Contact Player person invite is rejected', false, 'expected rejection', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participants mp
      WHERE mp.match_id = v_mid
        AND mp.removed_at IS NULL;

      SELECT count(*) INTO v_cnt_2
      FROM public.email_invitations ei
      WHERE ei.related_type = 'match'
        AND ei.related_id = v_mid;

      INSERT INTO _participant_controls_results
      VALUES (
        'D02B Non-host unlinked Contact Player person invite is rejected',
        v_cnt = 0 AND v_cnt_2 = 0,
        'exception=' || SQLERRM
        || ', active_rows=' || v_cnt::text
        || ', invitations=' || v_cnt_2::text,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D02B Non-host unlinked Contact Player person invite is rejected', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:25'::time, 90,
      'tr_tpl_D02C_host_approval_preserves_nomination_source', 4, ARRAY[SCOPE_GID]::uuid[],
      true, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D02C guest', NULL, NULL, 'participant-controls-template');

    INSERT INTO public.match_participants (
      match_id, join_method, guest_id, created_by, created_at, nominated_by,
      participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
    ) VALUES (
      v_mid, 'nominated', v_guest.id, P_UID, now(), P_UID,
      NULL, NULL, NULL, NULL
    )
    RETURNING * INTO v_mp;

    PERFORM public.match_participant_reconcile_status(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_org_approve_participant(v_mp.id);

    INSERT INTO _participant_controls_results
    VALUES (
      'D02C Host approval preserves Contact Player nomination source',
      v_mp.join_method::text = 'nominated'
      AND v_mp.nominated_by = P_UID
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.org_approved_by = ORG_UID
      AND v_mp.participant_accepted_at IS NULL
      AND v_mp.status::text = 'pending',
      'join_method=' || coalesce(v_mp.join_method::text, 'NULL')
      || ', nominated_by=' || coalesce(v_mp.nominated_by::text, 'NULL')
      || ', org_approved_by=' || coalesce(v_mp.org_approved_by::text, 'NULL')
      || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL')
      || ', status=' || coalesce(v_mp.status::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D02C Host approval preserves Contact Player nomination source', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    SELECT lower(trim(email::text)) INTO v_real_email
    FROM auth.users
    WHERE id = REAL_UID;

    IF v_real_email IS NULL THEN
      RAISE EXCEPTION 'real_email_not_found';
    END IF;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:27'::time, 90,
      'tr_tpl_D02D_linked_contact_non_host_registered_path', 4, ARRAY[SCOPE_GID]::uuid[],
      true, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D02D linked guest', v_real_email, NULL, 'participant-controls-template');

    UPDATE public.people
    SET linked_user_id = REAL_UID
    WHERE person_id = v_guest.person_id;

    INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
    VALUES ('email', v_real_email, REAL_UID, 'contact', v_guest.id, REAL_UID)
    ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;

    PERFORM public.rpc_match_invite_contact_person(v_mid, v_guest.person_id);

    v_mp := NULL;
    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.user_id = REAL_UID
      AND mp.removed_at IS NULL
    ORDER BY mp.created_at DESC
    LIMIT 1;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.removed_at IS NULL
      AND (
        mp.user_id = REAL_UID
        OR mp.guest_id = v_guest.id
      );

    INSERT INTO _participant_controls_results
    VALUES (
      'D02D Non-host linked Contact Person uses registered-user path',
      v_mp.id IS NOT NULL
      AND v_cnt = 1
      AND v_mp.user_id = REAL_UID
      AND v_mp.guest_id IS NULL
      AND v_mp.join_method::text = 'nominated'
      AND v_mp.nominated_by = P_UID
      AND v_mp.org_approved_at IS NULL,
      'active_rows=' || v_cnt::text
      || ', user_id=' || coalesce(v_mp.user_id::text, 'NULL')
      || ', guest_id=' || coalesce(v_mp.guest_id::text, 'NULL')
      || ', join_method=' || coalesce(v_mp.join_method::text, 'NULL')
      || ', nominated_by=' || coalesce(v_mp.nominated_by::text, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D02D Non-host linked Contact Person uses registered-user path', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:30'::time, 90,
      'tr_tpl_D03_contact_nominate_requires_invite_flag', 4, ARRAY[SCOPE_GID]::uuid[],
      false, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D03 guest', 'tr-d03@test.local', NULL, 'participant-controls-template');

    BEGIN
      PERFORM public.rpc_match_nominate_guest(v_mid, v_guest.id);
      INSERT INTO _participant_controls_results VALUES ('D03 Contact Player nominate still requires invite-users capability', false, 'expected not_authorized_to_nominate_guest', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _participant_controls_results
      VALUES (
        'D03 Contact Player nominate still requires invite-users capability',
        SQLERRM = 'not_authorized_to_nominate_guest',
        'exception=' || SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D03 Contact Player nominate still requires invite-users capability', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- F. Proxy participant-side action surface
  -- =========================================================

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:40'::time, 90,
      'tr_tpl_F01_proxy_decline_pending_user', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_proxy_decline_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'F01 Active Match Proxy can decline invited user principal with provenance',
      v_mp.status::text = 'removed'
      AND v_mp.removed_by = P_UID
      AND coalesce(v_mp.removal_note, '') LIKE 'Proxy declined%',
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', removed_by=' || coalesce(v_mp.removed_by::text, 'NULL')
      || ', removal_note=' || coalesce(v_mp.removal_note, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('F01 Active Match Proxy can decline invited user principal with provenance', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:42'::time, 90,
      'tr_tpl_F02_proxy_withdraw_confirmed_user', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
    PERFORM public.rpc_match_proxy_withdraw_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions mpa
    WHERE mpa.match_participant_id = v_mp.id
      AND mpa.action_type = 'withdraw'
      AND mpa.created_by = P_UID;

    INSERT INTO _participant_controls_results
    VALUES (
      'F02 Active Match Proxy can withdraw confirmed user principal with provenance',
      v_mp.status::text = 'removed'
      AND v_mp.removed_by = P_UID
      AND coalesce(v_mp.removal_note, '') LIKE 'Proxy withdrew participation%'
      AND v_cnt >= 1,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', removed_by=' || coalesce(v_mp.removed_by::text, 'NULL')
      || ', removal_note=' || coalesce(v_mp.removal_note, 'NULL')
      || ', action_count=' || v_cnt::text,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('F02 Active Match Proxy can withdraw confirmed user principal with provenance', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- G. Contact Player public discovery hardening
  -- =========================================================

  BEGIN
    INSERT INTO _participant_controls_results
    VALUES (
      'G01 Contact Player public view is not directly selectable by anon or authenticated',
      NOT has_table_privilege('anon', 'public.contact_player_public', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.contact_player_public', 'SELECT')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'guests'
          AND policyname = 'guests_select_authenticated'
      ),
      'anon_select=' || has_table_privilege('anon', 'public.contact_player_public', 'SELECT')::text
      || ', authenticated_select=' || has_table_privilege('authenticated', 'public.contact_player_public', 'SELECT')::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G01 Contact Player public view is not directly selectable by anon or authenticated', false, 'exception: ' || SQLERRM, NULL);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template G02 guest', 'tr-g02@test.local', NULL, 'participant-controls-template');

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_cnt
    FROM public.rpc_contact_player_lookup(ARRAY[v_guest.id]::uuid[]);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_cnt_2
    FROM public.rpc_contact_player_lookup(ARRAY[v_guest.id]::uuid[]);

    INSERT INTO _participant_controls_results
    VALUES (
      'G02 Scoped Contact Player lookup hides default discovery and still serves trusted owner',
      v_cnt = 0 AND v_cnt_2 = 1,
      'outsider_count=' || v_cnt::text || ', owner_count=' || v_cnt_2::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G02 Scoped Contact Player lookup hides default discovery and still serves trusted owner', false, 'exception: ' || SQLERRM, NULL);
  END;

  BEGIN
    INSERT INTO _participant_controls_results
    VALUES (
      'G03 Canonical Match Proxy RPCs are not executable by anon',
      NOT has_function_privilege('anon', 'public.rpc_match_proxy_request_self(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_revoke_self(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_request_contact_player(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_confirm_participant(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_manageable_participants(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_decline_participant(uuid,text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_withdraw_participant(uuid,text)', 'EXECUTE'),
      'proxy_request=' || has_function_privilege('anon', 'public.rpc_match_proxy_request_self(uuid)', 'EXECUTE')::text
      || ', proxy_confirm=' || has_function_privilege('anon', 'public.rpc_match_proxy_confirm_participant(uuid)', 'EXECUTE')::text
      || ', proxy_manageable=' || has_function_privilege('anon', 'public.rpc_match_proxy_manageable_participants(uuid)', 'EXECUTE')::text
      || ', proxy_withdraw=' || has_function_privilege('anon', 'public.rpc_match_proxy_withdraw_participant(uuid,text)', 'EXECUTE')::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G03 Canonical Match Proxy RPCs are not executable by anon', false, 'exception: ' || SQLERRM, NULL);
  END;

  BEGIN
    INSERT INTO _participant_controls_results
    VALUES (
      'G04 Retired Match Proxy compatibility RPCs are removed',
      to_regprocedure('public.rpc_match_proxy_bind_self(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_proxy_confirm_self(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_proxy_reject_self(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_delegate_confirm_participant(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_revoke_delegate_confirm_participant(uuid)') IS NULL,
      'bind_self=' || coalesce(to_regprocedure('public.rpc_match_proxy_bind_self(uuid)')::text, 'NULL')
      || ', confirm_self=' || coalesce(to_regprocedure('public.rpc_match_proxy_confirm_self(uuid)')::text, 'NULL')
      || ', reject_self=' || coalesce(to_regprocedure('public.rpc_match_proxy_reject_self(uuid)')::text, 'NULL')
      || ', delegate_confirm=' || coalesce(to_regprocedure('public.rpc_match_delegate_confirm_participant(uuid)')::text, 'NULL')
      || ', revoke_delegate=' || coalesce(to_regprocedure('public.rpc_match_revoke_delegate_confirm_participant(uuid)')::text, 'NULL'),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G04 Retired Match Proxy compatibility RPCs are removed', false, 'exception: ' || SQLERRM, NULL);
  END;

  -- =========================================================
  -- E. Email invitation acceptance canonicalization
  -- =========================================================

  BEGIN
    SELECT lower(trim(email::text)) INTO v_real_email
    FROM auth.users
    WHERE id = REAL_UID;

    IF v_real_email IS NULL THEN
      RAISE EXCEPTION 'real_email_not_found';
    END IF;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:45'::time, 90,
      'tr_tpl_E01_email_accept_reuses_guest_anchor', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest
    FROM public.rpc_roster_guest_create('TR template E01 linked guest', v_real_email, NULL, 'participant-controls-template');

    SELECT * INTO v_mp
    FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    v_person_id := public.resolve_person_id_for_guest(v_guest.id);
    v_org_approved_at := v_mp.org_approved_at;

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE match_participant_id = v_mp.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'email_invitation_not_created';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    LEFT JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_mid
      AND mp.removed_at IS NULL
      AND (
        mp.user_id = REAL_UID
        OR g.person_id = v_person_id
      );

    INSERT INTO _participant_controls_results
    VALUES (
      'E01 Registered email accept reuses anchored Contact Player row',
      v_cnt = 1
      AND v_mp.guest_id = v_guest.id
      AND v_mp.user_id IS NULL
      AND v_mp.participant_accepted_at IS NOT NULL
      AND v_mp.participant_accepted_via = 'email_invitation'
      AND v_mp.org_approved_at = v_org_approved_at
      AND EXISTS (
        SELECT 1
        FROM public.identity_links il
        WHERE il.user_id = REAL_UID
          AND il.linked_type = 'guest_participant'
          AND il.linked_id = v_mp.id
      ),
      'active_rows=' || v_cnt
      || ', guest_id=' || coalesce(v_mp.guest_id::text, 'NULL')
      || ', user_id=' || coalesce(v_mp.user_id::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('E01 Registered email accept reuses anchored Contact Player row', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    SELECT lower(trim(email::text)) INTO v_real_email
    FROM auth.users
    WHERE id = REAL_UID;

    IF v_real_email IS NULL THEN
      RAISE EXCEPTION 'real_email_not_found';
    END IF;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '12:00'::time, 90,
      'tr_tpl_E02_email_accept_user_pending_only', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_inv
    FROM public.rpc_email_invitation_create(v_real_email, 'TR template E02'::text, 'match'::text, v_mid, NULL::timestamptz);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.user_id = REAL_UID
      AND removed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.removed_at IS NULL;

    INSERT INTO _participant_controls_results
    VALUES (
      'E02 Registered email accept creates participant-side pending row only',
      FOUND
      AND v_cnt = 1
      AND v_mp.participant_accepted_at IS NOT NULL
      AND v_mp.participant_accepted_via = 'email_invitation'
      AND v_mp.org_approved_at IS NULL
      AND v_mp.status::text = 'pending',
      'active_rows=' || v_cnt
      || ', status=' || coalesce(v_mp.status::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('E02 Registered email accept creates participant-side pending row only', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '12:15'::time, 90,
      'tr_tpl_E03_guest_decline_invalid_system_actor', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest
    FROM public.rpc_roster_guest_create('TR template E03 linked guest', 'tr-e03@test.local', NULL, 'participant-controls-template');

    SELECT * INTO v_mp
    FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE match_participant_id = v_mp.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'email_invitation_not_created';
    END IF;

    PERFORM public.rpc_email_invitation_decline_as_guest(v_inv.id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE id = v_inv.id;

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'E03 Guest email decline falls back from invalid system actor to organizer',
      v_inv.status = 'declined'
      AND v_mp.removed_at IS NOT NULL
      AND v_mp.removed_by = ORG_UID
      AND EXISTS (
        SELECT 1
        FROM public.email_invitation_events eie
        WHERE eie.invitation_id = v_inv.id
          AND eie.event_type = 'invitation_declined'
          AND eie.actor_user_id = ORG_UID
      ),
      'invitation_status=' || coalesce(v_inv.status, 'NULL')
      || ', removed_by=' || coalesce(v_mp.removed_by::text, 'NULL')
      || ', removed_at=' || coalesce(v_mp.removed_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('E03 Guest email decline falls back from invalid system actor to organizer', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- H. Hoods Proxy dashboard + Invite Group
  -- =========================================================

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);

    SELECT count(*) INTO v_cnt
    FROM public.rpc_match_proxy_dashboard() t
    WHERE t.binding_id = v_binding.binding_id
      AND t.relationship_role = 'for_me'
      AND t.status = 'pending'
      AND t.can_approve IS TRUE
      AND t.can_decline IS TRUE;

    PERFORM public.rpc_match_proxy_approve_binding(v_binding.binding_id);

    SELECT count(*) INTO v_cnt_2
    FROM public.rpc_match_proxy_dashboard() t
    WHERE t.binding_id = v_binding.binding_id
      AND t.relationship_role = 'for_me'
      AND t.status = 'active'
      AND t.can_revoke IS TRUE;

    INSERT INTO _participant_controls_results
    VALUES (
      'H01 Proxy dashboard exposes pending and active actions for the principal',
      v_cnt = 1 AND v_cnt_2 = 1,
      'pending_rows=' || v_cnt::text || ', active_rows=' || v_cnt_2::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('H01 Proxy dashboard exposes pending and active actions for the principal', false, 'exception: ' || SQLERRM, NULL);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '12:15'::time, 90,
      'tr_tpl_H02_group_invite_no_rows_upfront', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_invite_group(v_mid, SCOPE_GID);

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.removed_at IS NULL;

    INSERT INTO _participant_controls_results
    VALUES (
      'H02 Invite Group does not precreate participant rows',
      v_cnt = 0,
      'active_rows=' || v_cnt::text,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('H02 Invite Group does not precreate participant rows', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '12:30'::time, 90,
      'tr_tpl_H03_group_invite_accepts_directly', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_invite_group(v_mid, SCOPE_GID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_accept_group_invite(v_mid);

    INSERT INTO _participant_controls_results
    VALUES (
      'H03 Group invite acceptance creates organizer-approved confirmed participant',
      v_mp.user_id = REAL_UID
      AND v_mp.join_method::text = 'invited'
      AND v_mp.participant_accepted_at IS NOT NULL
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.status::text = 'confirmed',
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', join_method=' || coalesce(v_mp.join_method::text, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('H03 Group invite acceptance creates organizer-approved confirmed participant', false, 'exception: ' || SQLERRM, v_mid);
  END;

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details, r.match_id
  FROM _participant_controls_results r
  ORDER BY r.test_name;
END;
$$;
