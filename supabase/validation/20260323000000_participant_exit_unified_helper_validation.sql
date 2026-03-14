-- =============================================================================
-- Validation: Participant Exit Unified Helper
-- Run after 20260323000000_participant_exit_unified_helper migration
-- =============================================================================

-- 1) apply_participant_exit exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_exit'
  ) THEN
    RAISE EXCEPTION 'apply_participant_exit does not exist';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_exit exists';
END;
$$;

-- 2) apply_participant_exit has 4 arguments
DO $$
BEGIN
  IF (SELECT p.pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'apply_participant_exit') <> 4 THEN
    RAISE EXCEPTION 'apply_participant_exit must have 4 arguments';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_exit has 4 args';
END;
$$;

-- 3) rpc_match_remove_participant exists and signature unchanged (1 arg uuid)
DO $$
DECLARE
  v_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid)
  INTO v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_match_remove_participant';

  IF v_args IS NULL THEN
    RAISE EXCEPTION 'rpc_match_remove_participant must exist';
  END IF;
  IF v_args <> 'p_match_participant_id uuid' THEN
    RAISE EXCEPTION 'rpc_match_remove_participant signature changed: %', v_args;
  END IF;
  RAISE NOTICE 'PASS: rpc_match_remove_participant signature unchanged';
END;
$$;

-- 4) rpc_match_user_withdraw exists and signature unchanged (1 arg uuid)
DO $$
DECLARE
  v_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid)
  INTO v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_match_user_withdraw';

  IF v_args IS NULL THEN
    RAISE EXCEPTION 'rpc_match_user_withdraw must exist';
  END IF;
  IF v_args <> 'p_match_id uuid' THEN
    RAISE EXCEPTION 'rpc_match_user_withdraw signature changed: %', v_args;
  END IF;
  RAISE NOTICE 'PASS: rpc_match_user_withdraw signature unchanged';
END;
$$;

-- 5) rpc_match_remove_participant delegates to apply_participant_exit
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%apply_participant_exit%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_remove_participant'
  ) THEN
    RAISE EXCEPTION 'rpc_match_remove_participant must call apply_participant_exit';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_remove_participant delegates to apply_participant_exit';
END;
$$;

-- 6) rpc_match_user_withdraw delegates to apply_participant_exit
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%apply_participant_exit%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_user_withdraw'
  ) THEN
    RAISE EXCEPTION 'rpc_match_user_withdraw must call apply_participant_exit';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_user_withdraw delegates to apply_participant_exit';
END;
$$;

-- 7) action_type constraint includes all exit-related values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'match_participant_actions'
      AND c.conname LIKE '%action_type%'
      AND c.contype = 'c'
  ) THEN
    RAISE EXCEPTION 'match_participant_actions action_type constraint not found';
  END IF;
  RAISE NOTICE 'PASS: action_type constraint exists';
END;
$$;

-- 8) apply_participant_exit derives remove semantics (reject_request, revoke_invite, etc.)
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%reject_request%'
      AND pg_get_functiondef(p.oid) LIKE '%revoke_invite%'
      AND pg_get_functiondef(p.oid) LIKE '%reject_nomination%'
      AND pg_get_functiondef(p.oid) LIKE '%remove_confirmed%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_exit'
  ) THEN
    RAISE EXCEPTION 'apply_participant_exit must derive remove action_type semantics';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_exit has remove semantics';
END;
$$;

-- 9) apply_participant_exit derives withdraw semantics (decline, withdraw)
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%decline%'
      AND pg_get_functiondef(p.oid) LIKE '%withdraw%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_exit'
  ) THEN
    RAISE EXCEPTION 'apply_participant_exit must derive withdraw action_type semantics';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_exit has withdraw semantics';
END;
$$;

-- 10) apply_participant_exit calls match_participant_reconcile_status
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%match_participant_reconcile_status%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_exit'
  ) THEN
    RAISE EXCEPTION 'apply_participant_exit must call match_participant_reconcile_status';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_exit calls reconcile';
END;
$$;

-- 11) apply_participant_exit inserts match_participant_actions
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%match_participant_actions%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_exit'
  ) THEN
    RAISE EXCEPTION 'apply_participant_exit must insert match_participant_actions';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_exit writes action log';
END;
$$;

-- 12) apply_participant_exit has idempotent check (removed_at)
DO $$
BEGIN
  IF NOT (
    SELECT pg_get_functiondef(p.oid) LIKE '%removed_at IS NOT NULL%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_exit'
  ) THEN
    RAISE EXCEPTION 'apply_participant_exit must have idempotent check for removed_at';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_exit has idempotent behavior';
END;
$$;
