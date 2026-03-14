-- =============================================================================
-- Validation: Admission Family Unified Helper
-- Run after 20260324000000_admission_family_unified_helper migration
-- =============================================================================

-- 1) apply_participant_admission exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_admission'
  ) THEN
    RAISE EXCEPTION 'apply_participant_admission does not exist';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_admission exists';
END;
$$;

-- 2) apply_participant_admission has 4 arguments
DO $$
BEGIN
  IF (SELECT p.pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'apply_participant_admission') <> 4 THEN
    RAISE EXCEPTION 'apply_participant_admission must have 4 arguments';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_admission has 4 args';
END;
$$;

-- 3) rpc_match_admit_user exists and delegates to apply_participant_admission
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%apply_participant_admission%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admit_user'
  ) THEN
    RAISE EXCEPTION 'rpc_match_admit_user must call apply_participant_admission';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_admit_user delegates to apply_participant_admission';
END;
$$;

-- 4) rpc_match_request_join exists and delegates to apply_participant_admission
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%apply_participant_admission%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_request_join'
  ) THEN
    RAISE EXCEPTION 'rpc_match_request_join must call apply_participant_admission';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_request_join delegates to apply_participant_admission';
END;
$$;

-- 5) rpc_match_admit_user signature unchanged (2 args: match_id, target_user_id)
DO $$
DECLARE
  v_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid)
  INTO v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admit_user';

  IF v_args IS NULL THEN
    RAISE EXCEPTION 'rpc_match_admit_user must exist';
  END IF;
  IF v_args <> 'p_match_id uuid, p_target_user_id uuid' THEN
    RAISE EXCEPTION 'rpc_match_admit_user signature changed: %', v_args;
  END IF;
  RAISE NOTICE 'PASS: rpc_match_admit_user signature unchanged';
END;
$$;

-- 6) rpc_match_request_join signature unchanged (1 arg: match_id)
DO $$
DECLARE
  v_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid)
  INTO v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_match_request_join';

  IF v_args IS NULL THEN
    RAISE EXCEPTION 'rpc_match_request_join must exist';
  END IF;
  IF v_args <> 'p_match_id uuid' THEN
    RAISE EXCEPTION 'rpc_match_request_join signature changed: %', v_args;
  END IF;
  RAISE NOTICE 'PASS: rpc_match_request_join signature unchanged';
END;
$$;

-- 7) rpc_match_nominate_user still delegates to rpc_match_admit_user
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%rpc_match_admit_user%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_nominate_user'
  ) THEN
    RAISE EXCEPTION 'rpc_match_nominate_user must call rpc_match_admit_user';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_nominate_user delegates to rpc_match_admit_user';
END;
$$;

-- 8) apply_participant_admission handles all three admission kinds
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%requested%'
      AND pg_get_functiondef(p.oid) LIKE '%invited%'
      AND pg_get_functiondef(p.oid) LIKE '%nominated%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_admission'
  ) THEN
    RAISE EXCEPTION 'apply_participant_admission must handle requested, invited, nominated';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_admission has all admission kinds';
END;
$$;

-- 9) apply_participant_admission calls reconcile
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%match_participant_reconcile_status%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_admission'
  ) THEN
    RAISE EXCEPTION 'apply_participant_admission must call match_participant_reconcile_status';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_admission calls reconcile';
END;
$$;

-- 10) apply_participant_admission writes action log
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%match_participant_actions%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_admission'
  ) THEN
    RAISE EXCEPTION 'apply_participant_admission must insert match_participant_actions';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_admission writes action log';
END;
$$;
