-- =============================================================================
-- Validation: Unify invite/admit + grant cleanup
-- Run after 20260320000000 and 20260320010000 migrations
-- =============================================================================

-- Part A.1: can_invite_user_to_match is gone
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'can_invite_user_to_match'
  ) THEN
    RAISE EXCEPTION 'can_invite_user_to_match should be dropped';
  END IF;
  RAISE NOTICE 'PASS: can_invite_user_to_match is dropped';
END$$;

-- Part A.2: rpc_match_admission_targets uses can_admit_user_to_match
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%can_admit_user_to_match%'
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets'
  ) THEN
    RAISE EXCEPTION 'rpc_match_admission_targets must use can_admit_user_to_match';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_admission_targets uses can_admit_user_to_match';
END$$;

-- Part A.3: rpc_match_invite_user delegates to rpc_match_admit_user
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%rpc_match_admit_user%'
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_user'
  ) THEN
    RAISE EXCEPTION 'rpc_match_invite_user must delegate to rpc_match_admit_user';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_invite_user delegates to rpc_match_admit_user';
END$$;

-- Part A.4: rpc_match_admit_user uses can_admit_user_to_match
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%can_admit_user_to_match%'
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admit_user'
  ) THEN
    RAISE EXCEPTION 'rpc_match_admit_user must use can_admit_user_to_match';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_admit_user uses can_admit_user_to_match';
END$$;

-- Part B.1: Mutating RPCs do NOT have anon execute
DO $$
DECLARE
  v_funcs text[] := ARRAY[
    'rpc_match_invite_user', 'rpc_match_admit_user',
    'rpc_match_remove_participant',
    'rpc_match_org_approve_participant', 'rpc_match_request_join',
    'rpc_match_user_withdraw', 'rpc_match_create', 'rpc_match_nominate_user',
    'rpc_match_nominate_guest',     'rpc_match_delegate_confirm_participant',
    'rpc_roster_guest_create', 'rpc_venue_handle_set', 'rpc_group_set_display_name',
    'rpc_venue_admin_grant', 'rpc_venue_admin_revoke'
  ];
  v_fn text;
  v_has_anon boolean;
BEGIN
  FOREACH v_fn IN ARRAY v_funcs
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = v_fn
        AND grantee = 'anon' AND privilege_type = 'EXECUTE'
    ) INTO v_has_anon;
    IF v_has_anon THEN
      RAISE EXCEPTION 'Function % should not have anon EXECUTE', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: Mutating RPCs do not have anon execute';
END$$;

-- Part B.2: rpc_match_admit_user has authenticated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'rpc_match_admit_user'
      AND grantee = 'authenticated' AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'rpc_match_admit_user must have authenticated EXECUTE';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_admit_user has authenticated';
END$$;
