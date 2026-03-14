-- =============================================================================
-- Validation: delegate simplify - rpc_match_delegate_confirm_participant unified
-- =============================================================================

-- 1) rpc_match_delegate_confirm_participant exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_delegate_confirm_participant'
  ) THEN
    RAISE EXCEPTION 'rpc_match_delegate_confirm_participant does not exist';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_delegate_confirm_participant exists';
END;
$$;

-- 2) rpc_match_delegate_confirm_guest is dropped
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_delegate_confirm_guest'
  ) THEN
    RAISE EXCEPTION 'rpc_match_delegate_confirm_guest should be dropped';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_delegate_confirm_guest is dropped';
END;
$$;

-- 3) rpc_match_delegate_confirm_user is dropped
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_delegate_confirm_user'
  ) THEN
    RAISE EXCEPTION 'rpc_match_delegate_confirm_user should be dropped';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_delegate_confirm_user is dropped';
END;
$$;

-- 4) rpc_match_delegate_manual_confirm_targets is dropped
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_delegate_manual_confirm_targets'
  ) THEN
    RAISE EXCEPTION 'rpc_match_delegate_manual_confirm_targets should be dropped';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_delegate_manual_confirm_targets is dropped';
END;
$$;

-- 5) Phase4B helpers are dropped
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'apply_delegate_confirm_user_target') THEN
    RAISE EXCEPTION 'apply_delegate_confirm_user_target should be dropped';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'can_delegate_confirm_user_caller') THEN
    RAISE EXCEPTION 'can_delegate_confirm_user_caller should be dropped';
  END IF;
  RAISE NOTICE 'PASS: Phase4B helpers are dropped';
END;
$$;
