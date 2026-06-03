CREATE OR REPLACE FUNCTION public.test_runner_issue76_public_match_signup()
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
  v_system uuid := '76000000-0000-0000-0000-000000000076'::uuid;
  v_invalid_system uuid := '76000000-0000-0000-0000-000000000077'::uuid;
  v_host uuid := '76000000-0000-0000-0000-000000000001'::uuid;
  v_venue uuid := '76000000-0000-0000-0000-000000000002'::uuid;
  v_match uuid := '76000000-0000-0000-0000-000000000003'::uuid;
  v_match_two uuid := '76000000-0000-0000-0000-000000000004'::uuid;
  v_match_unavailable uuid := '76000000-0000-0000-0000-000000000005'::uuid;
  v_match_disabled_after_start uuid := '76000000-0000-0000-0000-000000000006'::uuid;
  v_link record;
  v_link_two record;
  v_unavailable_link record;
  v_disabled_after_start_link record;
  v_context record;
  v_disabled_token uuid;
  v_signup record;
  v_signup_two record;
  v_rerequest record;
  v_unavailable_signup record;
  v_disabled_after_start_signup record;
  v_missing_config_signup record;
  v_invalid_config_signup record;
  v_verify record;
  v_verify_two record;
  v_rerequest_verify record;
  v_token text;
  v_token_two text;
  v_email text := 'issue76-public@example.test';
  v_hash text := encode(extensions.digest('issue76-public@example.test', 'sha256'), 'hex');
  v_mp public.match_participants%rowtype;
  v_removed_original_mp public.match_participants%rowtype;
  v_dirty_removed_mp_id uuid;
  v_dirty_status_removed_mp_id uuid;
  v_mp_two public.match_participants%rowtype;
  v_rerequest_mp public.match_participants%rowtype;
  v_retry record;
  v_guest public.guests%rowtype;
  v_identity_count integer;
  v_participant_count integer;
  v_active_signup_count integer;
  v_host_owned_count integer;
  v_contact_record_count integer;
  v_relationship_count integer;
  v_proxy_count integer;
  v_group_contact_count integer;
  v_delivery_count integer;
  v_delivery_status text;
  v_delivery_attempt_count integer;
  v_delivery_payload jsonb;
  v_metadata_json jsonb;
  v_constraint_def text;
  v_public_signup_enum_count integer;
  v_anon_context_allowed boolean;
  v_auth_context_allowed boolean;
  v_service_context_allowed boolean;
  v_anon_link_allowed boolean;
  v_auth_link_allowed boolean;
  v_service_link_allowed boolean;
  v_anon_start_allowed boolean;
  v_auth_start_allowed boolean;
  v_service_start_allowed boolean;
  v_anon_delivery_result_allowed boolean;
  v_auth_delivery_result_allowed boolean;
  v_service_delivery_result_allowed boolean;
  v_anon_verify_allowed boolean;
  v_auth_verify_allowed boolean;
  v_service_verify_allowed boolean;
  v_anon_metadata_allowed boolean;
  v_auth_metadata_allowed boolean;
  v_service_metadata_allowed boolean;
  v_anon_config_select_allowed boolean;
  v_auth_config_select_allowed boolean;
  v_disabled_context_count integer;
  v_unavailable_context_count integer;
  v_link_throttle record;
  v_i integer;
  v_old_signup_status text;
  v_signup_status_check text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue76_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue76_results;

  DELETE FROM public.notification_deliveries
  WHERE payload->>'match_id' IN (v_match::text, v_match_two::text, v_match_unavailable::text, v_match_disabled_after_start::text)
     OR destination = v_email;
  DELETE FROM public.domain_events
  WHERE aggregate_type = 'public_match_signup'
     OR payload->>'match_id' IN (v_match::text, v_match_two::text, v_match_unavailable::text, v_match_disabled_after_start::text);
  DELETE FROM public.public_match_signups
  WHERE match_id IN (v_match, v_match_two, v_match_unavailable, v_match_disabled_after_start)
     OR email_sha256 = v_hash;
  DELETE FROM public.public_match_signup_links
  WHERE match_id IN (v_match, v_match_two, v_match_unavailable, v_match_disabled_after_start);
  DELETE FROM public.public_match_signup_identities
  WHERE email_sha256 = v_hash;
  DELETE FROM public.public_match_signup_config;
  DELETE FROM public.match_participant_actions
  WHERE match_id IN (v_match, v_match_two, v_match_unavailable, v_match_disabled_after_start);
  DELETE FROM public.match_participants
  WHERE match_id IN (v_match, v_match_two, v_match_unavailable, v_match_disabled_after_start);
  DELETE FROM public.matches
  WHERE id IN (v_match, v_match_two, v_match_unavailable, v_match_disabled_after_start);
  DELETE FROM public.guests
  WHERE email = v_email
     OR id IN (
       SELECT guest_id
       FROM public.public_match_signup_identities
       WHERE email_sha256 = v_hash
     );
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.profiles WHERE id = v_host;
  DELETE FROM auth.users WHERE id = v_host;
  DELETE FROM public.profiles WHERE id = v_invalid_system;
  DELETE FROM auth.users WHERE id = v_invalid_system;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_system, 'system-actor@example.test', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, display_name)
  VALUES (v_system, 'System Actor')
  ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_host, 'issue76-host@example.test', now());

  INSERT INTO public.profiles (id, display_name)
  VALUES (v_host, 'Issue 76 Host');

  INSERT INTO public.venues (id, name, timezone)
  VALUES (v_venue, 'Issue 76 Courts', 'America/Toronto');

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
    duration_minutes
  ) VALUES
    (v_match, v_host, 'active', v_venue, 1, 'issue76_public_signup', 2, current_date + 7, '18:00'::time, 90),
    (v_match_two, v_host, 'active', v_venue, 1, 'issue76_public_signup_two', 2, current_date + 8, '19:00'::time, 90),
    (v_match_unavailable, v_host, 'active', v_venue, 1, 'issue76_public_signup_inactive', 2, current_date + 9, '20:00'::time, 90),
    (v_match_disabled_after_start, v_host, 'active', v_venue, 1, 'issue76_public_signup_disabled_after_start', 2, current_date + 10, '21:00'::time, 90);

  SELECT pg_get_constraintdef(c.oid)
  INTO v_constraint_def
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'match_participants'
    AND c.conname = 'chk_participant_accepted_via';

  SELECT count(*)::integer
  INTO v_public_signup_enum_count
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'match_join_method'
    AND e.enumlabel = 'public_signup';

  INSERT INTO _issue76_results VALUES (
    'lifecycle surface unchanged and email_invitation already allowed',
    v_constraint_def LIKE '%email_invitation%'
      AND v_constraint_def NOT LIKE '%public_signup_email_verified%'
      AND v_public_signup_enum_count = 0,
    coalesce(v_constraint_def, 'missing_constraint')
  );

  SELECT pg_get_constraintdef(c.oid)
  INTO v_signup_status_check
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'public_match_signups'
    AND c.conname = 'public_match_signups_status_check';

  INSERT INTO _issue76_results VALUES (
    'public signup status constraint accepts participant_removed terminal state',
    v_signup_status_check LIKE '%participant_removed%',
    coalesce(v_signup_status_check, 'missing_signup_status_check')
  );

  SELECT has_function_privilege('anon', 'public.rpc_public_match_signup_context(uuid)', 'execute')
  INTO v_anon_context_allowed;

  SELECT has_function_privilege('authenticated', 'public.rpc_public_match_signup_context(uuid)', 'execute')
  INTO v_auth_context_allowed;

  SELECT has_function_privilege('service_role', 'public.rpc_public_match_signup_context(uuid)', 'execute')
  INTO v_service_context_allowed;

  SELECT has_function_privilege('anon', 'public.rpc_public_match_signup_link_get_or_create(uuid)', 'execute')
  INTO v_anon_link_allowed;

  SELECT has_function_privilege('authenticated', 'public.rpc_public_match_signup_link_get_or_create(uuid)', 'execute')
  INTO v_auth_link_allowed;

  SELECT has_function_privilege('service_role', 'public.rpc_public_match_signup_link_get_or_create(uuid)', 'execute')
  INTO v_service_link_allowed;

  SELECT has_function_privilege('anon', 'public.rpc_public_match_signup_start(uuid,text,text,text,boolean)', 'execute')
  INTO v_anon_start_allowed;

  SELECT has_function_privilege('authenticated', 'public.rpc_public_match_signup_start(uuid,text,text,text,boolean)', 'execute')
  INTO v_auth_start_allowed;

  SELECT has_function_privilege('service_role', 'public.rpc_public_match_signup_start(uuid,text,text,text,boolean)', 'execute')
  INTO v_service_start_allowed;

  SELECT has_function_privilege('anon', 'public.rpc_public_match_signup_record_delivery_result(uuid,text,text)', 'execute')
  INTO v_anon_delivery_result_allowed;

  SELECT has_function_privilege('authenticated', 'public.rpc_public_match_signup_record_delivery_result(uuid,text,text)', 'execute')
  INTO v_auth_delivery_result_allowed;

  SELECT has_function_privilege('service_role', 'public.rpc_public_match_signup_record_delivery_result(uuid,text,text)', 'execute')
  INTO v_service_delivery_result_allowed;

  SELECT has_function_privilege('anon', 'public.rpc_public_match_signup_verify(uuid,uuid,text)', 'execute')
  INTO v_anon_verify_allowed;

  SELECT has_function_privilege('authenticated', 'public.rpc_public_match_signup_verify(uuid,uuid,text)', 'execute')
  INTO v_auth_verify_allowed;

  SELECT has_function_privilege('service_role', 'public.rpc_public_match_signup_verify(uuid,uuid,text)', 'execute')
  INTO v_service_verify_allowed;

  SELECT has_function_privilege('anon', 'public.rpc_public_match_signup_participant_metadata(uuid)', 'execute')
  INTO v_anon_metadata_allowed;

  SELECT has_function_privilege('authenticated', 'public.rpc_public_match_signup_participant_metadata(uuid)', 'execute')
  INTO v_auth_metadata_allowed;

  SELECT has_function_privilege('service_role', 'public.rpc_public_match_signup_participant_metadata(uuid)', 'execute')
  INTO v_service_metadata_allowed;

  SELECT has_table_privilege('anon', 'public.public_match_signup_config', 'select')
  INTO v_anon_config_select_allowed;

  SELECT has_table_privilege('authenticated', 'public.public_match_signup_config', 'select')
  INTO v_auth_config_select_allowed;

  INSERT INTO _issue76_results VALUES (
    'public signup RPC grants match public, host-only, and service-only boundaries',
    v_anon_context_allowed = true
      AND v_auth_context_allowed = true
      AND v_service_context_allowed = true
      AND v_anon_link_allowed = false
      AND v_auth_link_allowed = true
      AND v_service_link_allowed = true
      AND v_anon_start_allowed = false
      AND v_auth_start_allowed = false
      AND v_service_start_allowed = true
      AND v_anon_delivery_result_allowed = false
      AND v_auth_delivery_result_allowed = false
      AND v_service_delivery_result_allowed = true
      AND v_anon_verify_allowed = false
      AND v_auth_verify_allowed = false
      AND v_service_verify_allowed = true
      AND v_anon_metadata_allowed = false
      AND v_auth_metadata_allowed = true
      AND v_service_metadata_allowed = true
      AND v_anon_config_select_allowed = false
      AND v_auth_config_select_allowed = false,
    'context_anon_execute=' || coalesce(v_anon_context_allowed::text, 'null')
      || ', context_auth_execute=' || coalesce(v_auth_context_allowed::text, 'null')
      || ', context_service_execute=' || coalesce(v_service_context_allowed::text, 'null')
      || ', link_anon_execute=' || coalesce(v_anon_link_allowed::text, 'null')
      || ', link_auth_execute=' || coalesce(v_auth_link_allowed::text, 'null')
      || ', link_service_execute=' || coalesce(v_service_link_allowed::text, 'null')
      || ', start_anon_execute=' || coalesce(v_anon_start_allowed::text, 'null')
      || ', start_auth_execute=' || coalesce(v_auth_start_allowed::text, 'null')
      || ', start_service_execute=' || coalesce(v_service_start_allowed::text, 'null')
      || ', delivery_audit_anon_execute=' || coalesce(v_anon_delivery_result_allowed::text, 'null')
      || ', delivery_audit_auth_execute=' || coalesce(v_auth_delivery_result_allowed::text, 'null')
      || ', delivery_audit_service_execute=' || coalesce(v_service_delivery_result_allowed::text, 'null')
      || ', verify_anon_execute=' || coalesce(v_anon_verify_allowed::text, 'null')
      || ', verify_auth_execute=' || coalesce(v_auth_verify_allowed::text, 'null')
      || ', verify_service_execute=' || coalesce(v_service_verify_allowed::text, 'null')
      || ', metadata_anon_execute=' || coalesce(v_anon_metadata_allowed::text, 'null')
      || ', metadata_auth_execute=' || coalesce(v_auth_metadata_allowed::text, 'null')
      || ', metadata_service_execute=' || coalesce(v_service_metadata_allowed::text, 'null')
      || ', config_anon_select=' || coalesce(v_anon_config_select_allowed::text, 'null')
      || ', config_auth_select=' || coalesce(v_auth_config_select_allowed::text, 'null')
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_host::text, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_link
  FROM public.rpc_public_match_signup_link_get_or_create(v_match)
  LIMIT 1;

  SELECT * INTO v_link_two
  FROM public.rpc_public_match_signup_link_get_or_create(v_match_two)
  LIMIT 1;

  SELECT * INTO v_unavailable_link
  FROM public.rpc_public_match_signup_link_get_or_create(v_match_unavailable)
  LIMIT 1;

  SELECT * INTO v_disabled_after_start_link
  FROM public.rpc_public_match_signup_link_get_or_create(v_match_disabled_after_start)
  LIMIT 1;

  INSERT INTO _issue76_results VALUES (
    'organizer can create public signup link',
    v_link.public_token IS NOT NULL
      AND v_link_two.public_token IS NOT NULL
      AND v_unavailable_link.public_token IS NOT NULL
      AND v_disabled_after_start_link.public_token IS NOT NULL,
    coalesce(v_link.public_token::text, 'missing_link')
  );

  PERFORM set_config('request.jwt.claims', '{}'::text, true);

  SELECT * INTO v_context
  FROM public.rpc_public_match_signup_context(v_link.public_token)
  LIMIT 1;

  INSERT INTO _issue76_results VALUES (
    'public context returns safe open match summary',
    v_context.signup_open = true
      AND v_context.match_id = v_match
      AND v_context.host_display_name = 'Issue 76 Host',
    coalesce(v_context.match_status, 'missing_context')
  );

  INSERT INTO public.public_match_signup_links(match_id, public_token, created_by, disabled_at)
  VALUES (v_match, gen_random_uuid(), v_host, now())
  RETURNING public_token INTO v_disabled_token;

  SELECT count(*)::integer INTO v_disabled_context_count
  FROM public.rpc_public_match_signup_context(v_disabled_token);

  INSERT INTO _issue76_results VALUES (
    'disabled public signup links do not return match context',
    v_disabled_context_count = 0,
    'disabled_context_rows=' || v_disabled_context_count::text
  );

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_start(
      v_disabled_token,
      'Disabled Link Public Signup',
      'issue76-disabled-link@example.test',
      null,
      false
    );
    INSERT INTO _issue76_results VALUES ('disabled public signup links reject signup start', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'disabled public signup links reject signup start',
      SQLERRM LIKE '%signup_link_not_found%',
      SQLERRM
    );
  END;

  SELECT * INTO v_unavailable_signup
  FROM public.rpc_public_match_signup_start(
    v_unavailable_link.public_token,
    'Inactive Match Public Signup',
    'issue76-inactive-match@example.test',
    null,
    false
  )
  LIMIT 1;

  UPDATE public.matches
  SET status = 'cancelled'
  WHERE id = v_match_unavailable;

  SELECT count(*)::integer INTO v_unavailable_context_count
  FROM public.rpc_public_match_signup_context(v_unavailable_link.public_token);

  INSERT INTO _issue76_results VALUES (
    'inactive public signup matches do not return public match context',
    v_unavailable_context_count = 0,
    'inactive_context_rows=' || v_unavailable_context_count::text
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_host::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_link_get_or_create(v_match_unavailable);
    INSERT INTO _issue76_results VALUES ('inactive matches cannot create or reuse public signup links', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'inactive matches cannot create or reuse public signup links',
      SQLERRM LIKE '%match_not_active%',
      SQLERRM
    );
  END;

  PERFORM set_config('request.jwt.claims', '{}'::text, true);

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_start(
      v_unavailable_link.public_token,
      'Inactive Match Public Signup Again',
      'issue76-inactive-match-again@example.test',
      null,
      false
    );
    INSERT INTO _issue76_results VALUES ('inactive matches reject public signup start', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'inactive matches reject public signup start',
      SQLERRM LIKE '%match_not_active%',
      SQLERRM
    );
  END;

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_verify(
      v_unavailable_link.public_token,
      v_unavailable_signup.signup_id,
      v_unavailable_signup.verification_token
    );
    INSERT INTO _issue76_results VALUES ('inactive matches reject public signup verification confirmation', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'inactive matches reject public signup verification confirmation',
      SQLERRM LIKE '%match_not_active%',
      SQLERRM
    );
  END;

  SELECT * INTO v_disabled_after_start_signup
  FROM public.rpc_public_match_signup_start(
    v_disabled_after_start_link.public_token,
    'Disabled After Start Public Signup',
    'issue76-disabled-after-start@example.test',
    null,
    false
  )
  LIMIT 1;

  UPDATE public.public_match_signup_links
  SET disabled_at = now()
  WHERE id = v_disabled_after_start_link.link_id;

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_verify(
      v_disabled_after_start_link.public_token,
      v_disabled_after_start_signup.signup_id,
      v_disabled_after_start_signup.verification_token
    );
    INSERT INTO _issue76_results VALUES ('disabled links reject public signup verification confirmation', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'disabled links reject public signup verification confirmation',
      SQLERRM LIKE '%signup_link_not_found%',
      SQLERRM
    );
  END;

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_start(v_link.public_token, 'Name Only', null, null, false);
    INSERT INTO _issue76_results VALUES ('name-only signup is rejected', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'name-only signup is rejected',
      SQLERRM LIKE '%email_required%',
      SQLERRM
    );
  END;

  SELECT * INTO v_missing_config_signup
  FROM public.rpc_public_match_signup_start(
    v_link_two.public_token,
    'Missing Config Public Signup',
    'issue76-missing-config@example.test',
    null,
    false
  )
  LIMIT 1;

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_verify(
      v_link_two.public_token,
      v_missing_config_signup.signup_id,
      v_missing_config_signup.verification_token
    );
    INSERT INTO _issue76_results VALUES ('missing system actor config fails closed', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'missing system actor config fails closed',
      SQLERRM LIKE '%public_signup_system_actor_not_configured%',
      SQLERRM
    );
  END;

  INSERT INTO public.public_match_signup_config(singleton_key, system_actor_user_id)
  VALUES (true, v_invalid_system)
  ON CONFLICT (singleton_key) DO UPDATE
  SET system_actor_user_id = excluded.system_actor_user_id;

  SELECT * INTO v_invalid_config_signup
  FROM public.rpc_public_match_signup_start(
    v_link_two.public_token,
    'Invalid Config Public Signup',
    'issue76-invalid-config@example.test',
    null,
    false
  )
  LIMIT 1;

  BEGIN
    PERFORM *
    FROM public.rpc_public_match_signup_verify(
      v_link_two.public_token,
      v_invalid_config_signup.signup_id,
      v_invalid_config_signup.verification_token
    );
    INSERT INTO _issue76_results VALUES ('non-existing configured system actor fails closed', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _issue76_results VALUES (
      'non-existing configured system actor fails closed',
      SQLERRM LIKE '%public_signup_system_actor_missing%',
      SQLERRM
    );
  END;

  INSERT INTO public.public_match_signup_config(singleton_key, system_actor_user_id)
  VALUES (true, v_system)
  ON CONFLICT (singleton_key) DO UPDATE
  SET system_actor_user_id = excluded.system_actor_user_id;

  SELECT * INTO v_signup
  FROM public.rpc_public_match_signup_start(
    v_link.public_token,
    'Public Signup Player',
    upper(v_email),
    '+1 555 555 7600',
    false
  )
  LIMIT 1;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match;

  SELECT count(*)::integer INTO v_delivery_count
  FROM public.notification_deliveries
  WHERE destination = v_email
    AND payload->>'template_type' = 'public_match_signup_verification'
    AND payload->>'match_id' = v_match::text;

  SELECT verification_delivery_status, verification_delivery_attempt_count
  INTO v_delivery_status, v_delivery_attempt_count
  FROM public.public_match_signups
  WHERE id = v_signup.signup_id;

  INSERT INTO _issue76_results VALUES (
    'signup creates server-only verification token and audited delivery request but no participant before verification',
    v_signup.verification_required = true
      AND v_participant_count = 0
      AND nullif(v_signup.verification_token, '') IS NOT NULL
      AND v_signup.email_normalized = v_email
      AND v_delivery_status = 'queued'
      AND v_delivery_attempt_count = 0
      AND v_delivery_count = 0,
    'participants=' || v_participant_count::text
      || ', token_present=' || (nullif(v_signup.verification_token, '') IS NOT NULL)::text
      || ', delivery_status=' || coalesce(v_delivery_status, 'null')
      || ', queued_public_signup_deliveries=' || v_delivery_count::text
  );

  PERFORM public.rpc_public_match_signup_record_delivery_result(v_signup.signup_id, 'sent', null);

  SELECT verification_delivery_status, verification_delivery_attempt_count
  INTO v_delivery_status, v_delivery_attempt_count
  FROM public.public_match_signups
  WHERE id = v_signup.signup_id;

  SELECT count(*)::integer INTO v_delivery_count
  FROM public.notification_deliveries
  WHERE destination = v_email
    AND payload->>'template_type' = 'public_match_signup_verification'
    AND payload->>'match_id' = v_match::text
    AND delivery_status = 'sent';

  SELECT payload INTO v_delivery_payload
  FROM public.notification_deliveries
  WHERE destination = v_email
    AND payload->>'template_type' = 'public_match_signup_verification'
    AND payload->>'match_id' = v_match::text
    AND delivery_status = 'sent'
  LIMIT 1;

  INSERT INTO _issue76_results VALUES (
    'verification email delivery result is audited in delivery ledger without exposing token payloads',
    v_delivery_status = 'sent'
      AND v_delivery_attempt_count = 1
      AND v_delivery_count = 1
      AND v_delivery_payload->>'delivery_audit_only' = 'true'
      AND NOT (v_delivery_payload ? 'verification_token')
      AND NOT (v_delivery_payload ? 'verification_token_hash')
      AND NOT (v_delivery_payload ? 'email_normalized')
      AND NOT (v_delivery_payload ? 'phone_normalized')
      AND NOT (v_delivery_payload ? 'email_sha256')
      AND NOT (v_delivery_payload ? 'marketing_email_opt_in'),
    'delivery_status=' || coalesce(v_delivery_status, 'null')
      || ', attempts=' || coalesce(v_delivery_attempt_count::text, 'null')
      || ', delivery_rows=' || v_delivery_count::text
  );

  SELECT * INTO v_retry
  FROM public.rpc_public_match_signup_start(
    v_link.public_token,
    'Public Signup Player Retry',
    v_email,
    null,
    false
  );

  SELECT count(*)::integer INTO v_delivery_count
  FROM public.notification_deliveries
  WHERE destination = v_email
    AND payload->>'template_type' = 'public_match_signup_verification'
    AND payload->>'match_id' = v_match::text
    AND delivery_status = 'queued';

  INSERT INTO _issue76_results VALUES (
    'signup verification requests are cooldown-throttled without queuing token payloads',
    v_retry.verification_required = false
      AND v_retry.verification_token IS NULL
      AND v_delivery_count = 0,
    'retry_required=' || coalesce(v_retry.verification_required::text, 'null')
      || ', retry_token=' || case when v_retry.verification_token is null then 'null' else 'present' end
      || ', queued_public_signup_deliveries=' || v_delivery_count::text
  );

  FOR v_i IN 1..4 LOOP
    PERFORM *
    FROM public.rpc_public_match_signup_start(
      v_link.public_token,
      'Issue 76 Throttle ' || v_i::text,
      'issue76-throttle-' || v_i::text || '@example.test',
      null,
      false
    );
  END LOOP;

  SELECT * INTO v_link_throttle
  FROM public.rpc_public_match_signup_start(
    v_link.public_token,
    'Issue 76 Link Throttle',
    'issue76-throttle-blocked@example.test',
    null,
    false
  )
  LIMIT 1;

  INSERT INTO _issue76_results VALUES (
    'public signup link throttles burst verification requests without leaking email existence',
    v_link_throttle.verification_required = false
      AND v_link_throttle.verification_token IS NULL
      AND v_link_throttle.email_normalized IS NULL,
    'verification_required=' || coalesce(v_link_throttle.verification_required::text, 'null')
      || ', token=' || case when v_link_throttle.verification_token is null then 'null' else 'present' end
      || ', email=' || coalesce(v_link_throttle.email_normalized, 'null')
  );

  v_token := v_signup.verification_token;

  SELECT * INTO v_verify
  FROM public.rpc_public_match_signup_verify(v_link.public_token, v_signup.signup_id, v_token)
  LIMIT 1;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = v_verify.match_participant_id;

  SELECT * INTO v_guest
  FROM public.guests
  WHERE id = v_mp.guest_id;

  INSERT INTO _issue76_results VALUES (
    'verified signup creates pending requested participant using existing email_invitation acceptance value',
    v_mp.status = 'pending'
      AND v_mp.join_method = 'requested'
      AND v_mp.participant_accepted_at IS NOT NULL
      AND v_mp.participant_accepted_via = 'email_invitation'
      AND v_mp.org_approved_at IS NULL
      AND v_mp.created_by = v_system
      AND v_guest.created_by = v_system,
    'status=' || v_mp.status::text
      || ', join_method=' || v_mp.join_method::text
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'null')
  );

  SELECT count(*)::integer INTO v_host_owned_count
  FROM public.user_roster_guests
  WHERE owner_user_id = v_host
    AND guest_id = v_mp.guest_id;

  SELECT count(*)::integer INTO v_contact_record_count
  FROM public.contact_records
  WHERE owner_user_id = v_host
    AND person_id = v_guest.person_id;

  SELECT count(*)::integer INTO v_relationship_count
  FROM public.person_relationships
  WHERE actor_user_id = v_host
    AND person_id = v_guest.person_id;

  SELECT count(*)::integer INTO v_proxy_count
  FROM public.person_match_proxies
  WHERE principal_person_id = v_guest.person_id;

  SELECT count(*)::integer INTO v_group_contact_count
  FROM public.group_contacts
  WHERE person_id = v_guest.person_id;

  INSERT INTO _issue76_results VALUES (
    'public signup does not create organizer-owned contact, group, or proxy records',
    v_host_owned_count = 0
      AND v_contact_record_count = 0
      AND v_relationship_count = 0
      AND v_proxy_count = 0
      AND v_group_contact_count = 0
      AND v_guest.phone IS NULL,
    'roster=' || v_host_owned_count::text
      || ', contact_records=' || v_contact_record_count::text
      || ', relationships=' || v_relationship_count::text
      || ', proxies=' || v_proxy_count::text
      || ', group_contacts=' || v_group_contact_count::text
      || ', guest_phone=' || coalesce(v_guest.phone, 'null')
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_host::text, 'role', 'authenticated')::text,
    true
  );

  SELECT to_jsonb(m)
  INTO v_metadata_json
  FROM public.rpc_public_match_signup_participant_metadata(v_match) m
  LIMIT 1;

  INSERT INTO _issue76_results VALUES (
    'host metadata is PII-safe',
    v_metadata_json->>'source' = 'public_match_signup'
      AND (v_metadata_json->>'email_verified')::boolean = true
      AND NOT (v_metadata_json ? 'email_normalized')
      AND NOT (v_metadata_json ? 'phone_normalized')
      AND NOT (v_metadata_json ? 'email_sha256')
      AND NOT (v_metadata_json ? 'marketing_email_opt_in')
      AND NOT (v_metadata_json ? 'verification_token_hash'),
    coalesce(v_metadata_json::text, 'missing_metadata')
  );

  SELECT * INTO v_mp
  FROM public.rpc_match_org_approve_participant(v_mp.id);

  INSERT INTO _issue76_results VALUES (
    'organizer approval uses existing lifecycle to confirm after verified signup',
    v_mp.status = 'confirmed'
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.confirmed_at IS NOT NULL,
    'status=' || v_mp.status::text
  );

  PERFORM set_config('request.jwt.claims', '{}'::text, true);

  PERFORM *
  FROM public.rpc_public_match_signup_start(
    v_link.public_token,
    'Public Signup Player Again',
    v_email,
    null,
    true
  );

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match
    AND guest_id = v_mp.guest_id
    AND removed_at IS NULL;

  INSERT INTO _issue76_results VALUES (
    'duplicate signup on same match does not create another active participant',
    v_participant_count = 1,
    'active_participants=' || v_participant_count::text
  );

  UPDATE public.public_match_signups
  SET verification_sent_at = now() - interval '20 minutes'
  WHERE link_id = v_link.link_id;

  UPDATE public.match_participants
  SET
    status = 'removed',
    removed_at = now(),
    removed_by = v_host
  WHERE id = v_mp.id
  RETURNING * INTO v_removed_original_mp;

  SELECT * INTO v_rerequest
  FROM public.rpc_public_match_signup_start(
    v_link.public_token,
    'Public Signup Player Return',
    v_email,
    null,
    false
  )
  LIMIT 1;

  SELECT status INTO v_old_signup_status
  FROM public.public_match_signups
  WHERE id = v_signup.signup_id;

  SELECT count(*)::integer INTO v_active_signup_count
  FROM public.public_match_signups s
  WHERE s.match_id = v_match
    AND s.email_sha256 = v_hash
    AND (
      s.status = 'pending_verification'
      OR (
        s.status = 'participant_created'
        AND EXISTS (
          SELECT 1
          FROM public.match_participants mp
          WHERE mp.id = s.match_participant_id
            AND mp.removed_at IS NULL
        )
      )
    );

  SELECT count(*)::integer INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = v_match
    AND guest_id = v_mp.guest_id
    AND removed_at IS NULL;

  INSERT INTO _issue76_results VALUES (
    'same email can re-request after prior public signup participant is removed',
    v_old_signup_status = 'participant_removed'
      AND v_rerequest.signup_id <> v_signup.signup_id
      AND v_rerequest.verification_required = true
      AND nullif(v_rerequest.verification_token, '') IS NOT NULL
      AND v_active_signup_count = 1
      AND v_participant_count = 0,
    'old_signup_status=' || coalesce(v_old_signup_status, 'null')
      || ', new_signup=' || coalesce(v_rerequest.signup_id::text, 'missing')
      || ', active_signups=' || coalesce(v_active_signup_count::text, 'null')
      || ', active_participants_before_verify=' || coalesce(v_participant_count::text, 'null')
  );

  SELECT * INTO v_rerequest_verify
  FROM public.rpc_public_match_signup_verify(
    v_link.public_token,
    v_rerequest.signup_id,
    v_rerequest.verification_token
  )
  LIMIT 1;

  SELECT * INTO v_rerequest_mp
  FROM public.match_participants
  WHERE id = v_rerequest_verify.match_participant_id;

  SELECT * INTO v_removed_original_mp
  FROM public.match_participants
  WHERE id = v_mp.id;

  INSERT INTO _issue76_results VALUES (
    're-request verification creates a fresh pending participant without reviving the removed row',
    v_rerequest_mp.id <> v_mp.id
      AND v_rerequest_mp.status = 'pending'
      AND v_rerequest_mp.removed_at IS NULL
      AND v_rerequest_mp.org_approved_at IS NULL
      AND v_rerequest_mp.participant_accepted_at IS NOT NULL
      AND v_removed_original_mp.removed_at IS NOT NULL,
    'new_participant=' || coalesce(v_rerequest_mp.id::text, 'missing')
      || ', old_participant=' || coalesce(v_mp.id::text, 'missing')
      || ', old_removed_at=' || coalesce(v_removed_original_mp.removed_at::text, 'null')
      || ', new_org_approved_at=' || coalesce(v_rerequest_mp.org_approved_at::text, 'null')
  );

  SELECT * INTO v_signup_two
  FROM public.rpc_public_match_signup_start(
    v_link_two.public_token,
    'Public Signup Player Second Match',
    v_email,
    null,
    false
  )
  LIMIT 1;

  INSERT INTO public.match_participants (
    match_id,
    status,
    join_method,
    guest_id,
    created_by,
    participant_accepted_at,
    participant_accepted_via,
    confirmation_source,
    source_person_id,
    removed_at,
    removed_by
  ) VALUES (
    v_match_two,
    'pending',
    'requested',
    v_mp.guest_id,
    v_system,
    now() - interval '1 day',
    'email_invitation',
    'player_response',
    v_guest.person_id,
    now() - interval '1 hour',
    v_system
  )
  RETURNING id INTO v_dirty_removed_mp_id;

  INSERT INTO public.match_participants (
    match_id,
    status,
    join_method,
    guest_id,
    created_by,
    participant_accepted_at,
    participant_accepted_via,
    confirmation_source,
    source_person_id,
    removed_at,
    removed_by
  ) VALUES (
    v_match_two,
    'removed',
    'requested',
    v_mp.guest_id,
    v_system,
    now() - interval '2 days',
    'email_invitation',
    'player_response',
    v_guest.person_id,
    null,
    null
  )
  RETURNING id INTO v_dirty_status_removed_mp_id;

  v_token_two := v_signup_two.verification_token;

  SELECT * INTO v_verify_two
  FROM public.rpc_public_match_signup_verify(v_link_two.public_token, v_signup_two.signup_id, v_token_two)
  LIMIT 1;

  SELECT * INTO v_mp_two
  FROM public.match_participants
  WHERE id = v_verify_two.match_participant_id;

  SELECT count(*)::integer INTO v_identity_count
  FROM public.public_match_signup_identities
  WHERE email_sha256 = v_hash;

  INSERT INTO _issue76_results VALUES (
    'verified email reuses one ownerless Contact Player identity across matches',
    v_identity_count = 1
      AND v_mp_two.guest_id = v_mp.guest_id
      AND v_mp_two.source_person_id = v_guest.person_id,
    'identity_count=' || v_identity_count::text
      || ', guest_reused=' || (v_mp_two.guest_id = v_mp.guest_id)::text
  );

  INSERT INTO _issue76_results VALUES (
    'participant reuse ignores dirty removed rows using removed_at canonical truth',
    v_mp_two.id <> v_dirty_removed_mp_id
      AND v_mp_two.removed_at IS NULL
      AND (
        SELECT status = 'removed'
        FROM public.match_participants
        WHERE id = v_dirty_removed_mp_id
      ),
    'verified_participant=' || coalesce(v_mp_two.id::text, 'missing')
      || ', dirty_removed=' || coalesce(v_dirty_removed_mp_id::text, 'missing')
      || ', verified_removed_at=' || coalesce(v_mp_two.removed_at::text, 'null')
  );

  INSERT INTO _issue76_results VALUES (
    'participant reuse normalizes removed status when removed_at is null',
    v_mp_two.id = v_dirty_status_removed_mp_id
      AND v_mp_two.status = 'pending'
      AND v_mp_two.removed_at IS NULL,
    'verified_participant=' || coalesce(v_mp_two.id::text, 'missing')
      || ', dirty_status_removed=' || coalesce(v_dirty_status_removed_mp_id::text, 'missing')
      || ', status=' || coalesce(v_mp_two.status::text, 'null')
  );

  RETURN QUERY SELECT * FROM _issue76_results;
END;
$$;
