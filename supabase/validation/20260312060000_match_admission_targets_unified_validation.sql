-- =============================================================================
-- Validation SQL for 20260312060000_match_admission_targets_unified
-- Run manually after migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_match_admission_targets exists and signature
-- -----------------------------------------------------------------------------

SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: (p_match_id uuid, p_search text DEFAULT NULL)

-- -----------------------------------------------------------------------------
-- 2) Uses can_admit_user_to_match for eligible
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%can_admit_user_to_match%' AS uses_admit_predicate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 3) Caller gate includes non-org path
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%can_participants_invite_users%' AND
       pg_get_functiondef(p.oid) LIKE '%is_user_match_associated%' AS has_caller_gate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 4) EXECUTE grants
-- -----------------------------------------------------------------------------
-- Note: rpc_match_invite_targets and rpc_match_nominate_targets removed in Phase 1
-- (20260314000000_phase1_remove_legacy_target_rpcs.sql). API calls rpc_match_admission_targets directly.
-- -----------------------------------------------------------------------------

SELECT routine_name, grantee, privilege
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'rpc_match_admission_targets';
-- Expected: authenticated has EXECUTE
