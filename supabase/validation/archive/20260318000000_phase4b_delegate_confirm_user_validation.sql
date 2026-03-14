-- =============================================================================
-- Phase 4B validation: delegate confirm user helpers and RPC behavior
-- ARCHIVED 2026-03-21: Phase4B helpers and rpc_match_delegate_confirm_user,
-- rpc_match_delegate_manual_confirm_targets dropped in delegate simplify.
-- See 20260321000000_delegate_simplify_validation.sql for current checks.
-- =============================================================================

-- 1) can_delegate_confirm_user_caller exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_delegate_confirm_user_caller'
  ) THEN
    RAISE EXCEPTION 'can_delegate_confirm_user_caller does not exist';
  END IF;
  RAISE NOTICE 'PASS: can_delegate_confirm_user_caller exists';
END;
$$;

-- 2) can_delegate_confirm_user_target exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_delegate_confirm_user_target'
  ) THEN
    RAISE EXCEPTION 'can_delegate_confirm_user_target does not exist';
  END IF;
  RAISE NOTICE 'PASS: can_delegate_confirm_user_target exists';
END;
$$;

-- 3) check_delegate_confirm_user_target exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_delegate_confirm_user_target'
  ) THEN
    RAISE EXCEPTION 'check_delegate_confirm_user_target does not exist';
  END IF;
  RAISE NOTICE 'PASS: check_delegate_confirm_user_target exists';
END;
$$;

-- 4) get_delegate_user_target_state exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_delegate_user_target_state'
  ) THEN
    RAISE EXCEPTION 'get_delegate_user_target_state does not exist';
  END IF;
  RAISE NOTICE 'PASS: get_delegate_user_target_state exists';
END;
$$;

-- 5) apply_delegate_confirm_user_target exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_delegate_confirm_user_target'
  ) THEN
    RAISE EXCEPTION 'apply_delegate_confirm_user_target does not exist';
  END IF;
  RAISE NOTICE 'PASS: apply_delegate_confirm_user_target exists';
END;
$$;

-- 6) get_delegate_user_target_state returns expected values
--    Manual: create match, add user as pending → 'active_present'; remove → 'removed_present'; no row → 'absent'
DO $$
DECLARE
  v_result text;
BEGIN
  v_result := public.get_delegate_user_target_state('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid);
  IF v_result NOT IN ('active_present', 'removed_present', 'absent') THEN
    RAISE EXCEPTION 'get_delegate_user_target_state returned unexpected: %', v_result;
  END IF;
  RAISE NOTICE 'PASS: get_delegate_user_target_state returns valid state (got: %)', v_result;
END;
$$;

-- 7) rpc_match_delegate_confirm_user still exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_delegate_confirm_user'
  ) THEN
    RAISE EXCEPTION 'rpc_match_delegate_confirm_user does not exist';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_delegate_confirm_user exists';
END;
$$;

-- 8) rpc_match_delegate_manual_confirm_targets still exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_delegate_manual_confirm_targets'
  ) THEN
    RAISE EXCEPTION 'rpc_match_delegate_manual_confirm_targets does not exist';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_delegate_manual_confirm_targets exists';
END;
$$;

-- 9) Manual: active_present → reject; removed_present → re-entry; absent → fresh
DO $$
BEGIN
  RAISE NOTICE 'PASS: validation complete. Manual tests: delegate_confirm_user for active/removed/absent targets.';
END;
$$;
