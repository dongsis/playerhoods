-- =============================================================================
-- Validation SQL for 20260312050000_unify_invite_nominate_admission
-- Run manually after migration. Some tests require domain data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) can_admit_user_to_match exists and has correct signature
-- -----------------------------------------------------------------------------

SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_admit_user_to_match';
-- Expected: (p_match_id uuid, p_actor_id uuid, p_target_user_id uuid)

-- -----------------------------------------------------------------------------
-- 2) rpc_match_admit_user exists and has correct signature
-- -----------------------------------------------------------------------------

SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admit_user';
-- Expected: (p_match_id uuid, p_target_user_id uuid)

-- -----------------------------------------------------------------------------
-- 3) can_admit_user_to_match includes allow_non_group_invites
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%allow_non_group_invites%' AS has_allow_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_admit_user_to_match';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 4) can_admit_user_to_match includes non-org caller gate
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%can_participants_invite_users%' AND
       pg_get_functiondef(p.oid) LIKE '%is_user_match_associated%' AS has_caller_gate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_admit_user_to_match';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 5) rpc_match_invite_user calls rpc_match_admit_user
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%rpc_match_admit_user%' AS calls_admit
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_user';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 6) rpc_match_nominate_user calls rpc_match_admit_user
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%rpc_match_admit_user%' AS calls_admit
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_nominate_user';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 7) rpc_match_admit_user uses can_admit_user_to_match
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%can_admit_user_to_match%' AS uses_predicate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admit_user';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 8) Organizer path: org_approved_at set for invite
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%org_approved_at%' AND
       pg_get_functiondef(p.oid) LIKE '%join_method%' AS has_org_invite_fields
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admit_user';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 9) Non-org path: nominated_by set, org_approved_at NULL
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%nominated_by%' AND
       pg_get_functiondef(p.oid) LIKE '%v_is_org%' AS has_nominate_branch
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admit_user';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 10) EXECUTE grants
-- -----------------------------------------------------------------------------

SELECT routine_name, grantee, privilege
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('rpc_match_admit_user', 'rpc_match_invite_user', 'rpc_match_nominate_user');
-- Expected: authenticated has EXECUTE for all three

-- -----------------------------------------------------------------------------
-- Manual validation cases (require domain data)
-- -----------------------------------------------------------------------------
--
-- 2) Organizer path works
--    Setup: Match M, organizer O, target T (in scope or share group or allow_non_group_invites).
--    Call: rpc_match_invite_user(match_id, target_id) as O.
--    Expected: success; join_method=invited, org_approved_at set.
--
-- 3) Non-organizer path works
--    Setup: Match M with can_participants_invite_users=true. Caller P in scope or match-associated.
--    Target T in ShareGroup with P (or InScope or allow_non_group_invites).
--    Call: rpc_match_nominate_user(match_id, target_id) as P.
--    Expected: success; join_method=nominated, org_approved_at NULL, nominated_by=P.
--
-- 4) Non-group path with allow_non_group_invites = true
--    Setup: Target T has allow_non_group_invites=true, not in scope, not share group.
--    Call: rpc_match_invite_user or rpc_match_nominate_user (with valid caller gate).
--    Expected: success.
--
-- 5) Non-group path with allow_non_group_invites = false
--    Setup: Target T has allow_non_group_invites=false, not in scope, not share group.
--    Call: rpc_match_invite_user or rpc_match_nominate_user.
--    Expected: forbidden.
--
-- 6) Self-admission rejected
--    Call: rpc_match_invite_user(match_id, organizer_id) as organizer.
--    Expected: Cannot invite yourself (invite) or cannot_admit_self (admit).
--
-- 7) Target not found rejected
--    Call: rpc_match_admit_user(match_id, '00000000-0000-0000-0000-000000000001').
--    Expected: target_not_found.
--
-- 8) Duplicate / currently-present
--    Setup: Target T already pending/confirmed in match.
--    Call: rpc_match_admit_user(match_id, target_id).
--    Expected: User is already a participant in this match.
--
-- 9) Re-entry behavior
--    Setup: Target T was removed from match.
--    Call: rpc_match_invite_user or rpc_match_nominate_user.
--    Expected: success; re-entry; reenter + invite/nominate action logs.
--
-- 10) Wrappers call through correctly
--     rpc_match_invite_user: organizer-only; delegates to rpc_match_admit_user.
--     rpc_match_nominate_user: non-org + caller gate; delegates to rpc_match_admit_user.
