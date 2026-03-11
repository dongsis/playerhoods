-- =============================================================================
-- Validation SQL for 20260312030000_match_invite_permission_slice
-- Run manually after migration. Some tests require domain data (clubs, groups, matches).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Function exists and signature
-- -----------------------------------------------------------------------------

SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_invite_user_to_match';
-- Expected: (p_match_id uuid, p_actor_id uuid, p_target_user_id uuid)

-- -----------------------------------------------------------------------------
-- 2) Predicate logic: allow_non_group_invites in function body
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%allow_non_group_invites%' AS has_allow_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_invite_user_to_match';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 3) rpc_match_invite_user uses predicate
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%can_invite_user_to_match%' AS uses_predicate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_user';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 4) Grant: rpc_match_invite_user has EXECUTE for authenticated
-- -----------------------------------------------------------------------------

SELECT grantee, privilege
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'rpc_match_invite_user';
-- Expected: authenticated has EXECUTE

-- -----------------------------------------------------------------------------
-- 5) Manual validation cases (require domain data)
-- -----------------------------------------------------------------------------
--
-- 5a) Group-based path still works
--     Setup: match with scope; target in scope OR share group with organizer.
--     Call: rpc_match_invite_user(match_id, target_id) as organizer.
--     Expected: success.
--
-- 5b) Non-group direct invite when allow_non_group_invites = true
--     Setup: target NOT in scope, NOT share group; target.allow_non_group_invites = true.
--     Call: rpc_match_invite_user(match_id, target_id) as organizer.
--     Expected: success.
--
-- 5c) Non-group direct invite when allow_non_group_invites = false
--     Setup: target NOT in scope, NOT share group; target.allow_non_group_invites = false.
--     Call: rpc_match_invite_user(match_id, target_id) as organizer.
--     Expected: forbidden.
--
-- 5d) Self-invite rejected
--     Call: rpc_match_invite_user(match_id, organizer_id) as organizer.
--     Expected: Cannot invite yourself.
--
-- 5e) Target not found rejected
--     Call: rpc_match_invite_user(match_id, '00000000-0000-0000-0000-000000000001') as organizer.
--     Expected: target_not_found.
--
-- 5f) Duplicate / already participant
--     Setup: target already pending/confirmed in match.
--     Call: rpc_match_invite_user(match_id, target_id) as organizer.
--     Expected: User is already a participant in this match.
--
-- 5g) Re-entry (removed) still works
--     Setup: target was removed from match.
--     Call: rpc_match_invite_user(match_id, target_id) as organizer.
--     Expected: success (re-entry).
