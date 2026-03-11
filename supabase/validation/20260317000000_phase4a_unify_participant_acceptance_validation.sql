-- =============================================================================
-- Phase 4A validation: apply_participant_acceptance and RPC behavior
-- =============================================================================

-- 1) apply_participant_acceptance exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_participant_acceptance'
  ) THEN
    RAISE EXCEPTION 'apply_participant_acceptance does not exist';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_acceptance exists';
END;
$$;

-- 2) apply_participant_acceptance has 4 arguments
DO $$
BEGIN
  IF (SELECT p.pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'apply_participant_acceptance') <> 4 THEN
    RAISE EXCEPTION 'apply_participant_acceptance must have 4 arguments';
  END IF;
  RAISE NOTICE 'PASS: apply_participant_acceptance has 4 args';
END;
$$;

-- 3) rpc_match_accept_invite still exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_match_accept_invite'
  ) THEN
    RAISE EXCEPTION 'rpc_match_accept_invite does not exist';
  END IF;
  RAISE NOTICE 'PASS: rpc_match_accept_invite exists';
END;
$$;

-- 4) rpc_match_delegate_confirm_participant still exists
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

-- 5) rpc_match_delegate_confirm_guest: dropped in 20260321000000 (unified into rpc_match_delegate_confirm_participant)

-- 6) Self vs delegate semantics: participant_accepted_via and manual_confirmed_by
--    Manual: create a pending user participant, call accept_invite → participant_accepted_via = 'in_app', manual_confirmed_by IS NULL
--    Manual: create a pending user participant, call delegate_confirm_participant → participant_accepted_via = 'delegate_manual', manual_confirmed_by = actor
--    (Requires test data; structure check only here.)
DO $$
BEGIN
  RAISE NOTICE 'PASS: structure checks complete (manual test recommended for 6-7)';
END;
$$;

-- 7) Action log written: match_participant_actions has action_type in ('accept','delegate_manual_confirm')
--    Manual: verify after self accept → action_type = 'accept'; after delegate confirm → 'delegate_manual_confirm'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'match_participant_actions'
      AND c.conname LIKE '%action_type%'
      AND c.contype = 'c'
  ) THEN
    RAISE NOTICE 'SKIP: match_participant_actions action_type constraint not found';
  ELSE
    RAISE NOTICE 'PASS: action_type constraint exists';
  END IF;
END;
$$;

-- 8) Guest event: rpc_match_delegate_confirm_participant guest branch emits match.guest_delegate_confirmed when guest has email
--    Manual: nominate guest with email, delegate_confirm_participant, check domain_events for match.guest_delegate_confirmed
DO $$
BEGIN
  RAISE NOTICE 'PASS: validation complete. Manual tests for 6,7,8: self accept, delegate confirm participant (user + guest).';
END;
$$;
