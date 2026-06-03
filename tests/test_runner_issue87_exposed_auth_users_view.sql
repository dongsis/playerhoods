CREATE OR REPLACE FUNCTION public.test_runner_issue87_exposed_auth_users_view()
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
  v_user_a uuid := '87000000-0000-0000-0000-000000000001'::uuid;
  v_user_b uuid := '87000000-0000-0000-0000-000000000002'::uuid;
  v_view_relkind text;
  v_view_definition text;
  v_anon_view_select boolean;
  v_auth_view_select boolean;
  v_service_view_select boolean;
  v_anon_rpc_execute boolean;
  v_auth_rpc_execute boolean;
  v_user_a_rows jsonb;
  v_user_b_rows jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue87_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue87_results;

  DELETE FROM public.profiles WHERE id IN (v_user_a, v_user_b);
  DELETE FROM auth.users WHERE id IN (v_user_a, v_user_b);

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (v_user_a, 'issue87-a@example.test', now()),
    (v_user_b, 'issue87-b@example.test', now());

  INSERT INTO public.profiles (
    id,
    display_name,
    profile_contact_email_normalized,
    profile_contact_email_verified_at
  ) VALUES
    (v_user_a, 'Issue 87 A', 'issue87-a-contact@example.test', now()),
    (v_user_b, 'Issue 87 B', 'issue87-b-contact@example.test', now());

  SELECT c.relkind::text, pg_get_viewdef(c.oid, true)
  INTO v_view_relkind, v_view_definition
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'v_user_verified_emails';

  INSERT INTO _issue87_results VALUES (
    'v_user_verified_emails is an auth.users-derived normal view',
    v_view_relkind = 'v'
      AND v_view_definition ILIKE '%auth.users%'
      AND v_view_definition ILIKE '%email_confirmed_at%',
    'relkind=' || coalesce(v_view_relkind, 'missing')
  );

  SELECT has_table_privilege('anon', 'public.v_user_verified_emails', 'select')
  INTO v_anon_view_select;

  SELECT has_table_privilege('authenticated', 'public.v_user_verified_emails', 'select')
  INTO v_auth_view_select;

  SELECT has_table_privilege('service_role', 'public.v_user_verified_emails', 'select')
  INTO v_service_view_select;

  INSERT INTO _issue87_results VALUES (
    'anon and authenticated cannot select v_user_verified_emails',
    v_anon_view_select = false
      AND v_auth_view_select = false
      AND v_service_view_select = true,
    'anon_select=' || coalesce(v_anon_view_select::text, 'null')
      || ', authenticated_select=' || coalesce(v_auth_view_select::text, 'null')
      || ', service_role_select=' || coalesce(v_service_view_select::text, 'null')
  );

  SELECT has_function_privilege('anon', 'public.rpc_my_verified_emails()', 'execute')
  INTO v_anon_rpc_execute;

  SELECT has_function_privilege('authenticated', 'public.rpc_my_verified_emails()', 'execute')
  INTO v_auth_rpc_execute;

  INSERT INTO _issue87_results VALUES (
    'rpc_my_verified_emails is authenticated-only',
    v_anon_rpc_execute = false
      AND v_auth_rpc_execute = true,
    'anon_execute=' || coalesce(v_anon_rpc_execute::text, 'null')
      || ', authenticated_execute=' || coalesce(v_auth_rpc_execute::text, 'null')
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text,
    true
  );

  SELECT coalesce(jsonb_agg(to_jsonb(r) order by r.email_type), '[]'::jsonb)
  INTO v_user_a_rows
  FROM public.rpc_my_verified_emails() r;

  INSERT INTO _issue87_results VALUES (
    'rpc_my_verified_emails returns only caller verified emails',
    jsonb_array_length(v_user_a_rows) = 2
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_user_a_rows) elem
        WHERE elem->>'user_id' <> v_user_a::text
          OR elem->>'email_normalized' LIKE 'issue87-b%'
      )
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_user_a_rows) elem
        WHERE elem->>'email_normalized' = 'issue87-a@example.test'
          AND elem->>'email_type' = 'auth'
      )
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_user_a_rows) elem
        WHERE elem->>'email_normalized' = 'issue87-a-contact@example.test'
          AND elem->>'email_type' = 'profile_contact'
      ),
    coalesce(v_user_a_rows::text, 'null')
  );

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text,
    true
  );

  SELECT coalesce(jsonb_agg(to_jsonb(r) order by r.email_type), '[]'::jsonb)
  INTO v_user_b_rows
  FROM public.rpc_my_verified_emails() r;

  INSERT INTO _issue87_results VALUES (
    'rpc_my_verified_emails does not expose other users',
    jsonb_array_length(v_user_b_rows) = 2
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_user_b_rows) elem
        WHERE elem->>'user_id' <> v_user_b::text
          OR elem->>'email_normalized' LIKE 'issue87-a%'
      ),
    coalesce(v_user_b_rows::text, 'null')
  );

  DELETE FROM public.profiles WHERE id IN (v_user_a, v_user_b);
  DELETE FROM auth.users WHERE id IN (v_user_a, v_user_b);

  RETURN QUERY SELECT * FROM _issue87_results;
END;
$$;
