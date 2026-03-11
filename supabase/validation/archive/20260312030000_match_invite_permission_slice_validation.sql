-- ARCHIVED 2026-03-20: can_invite_user_to_match was dropped. rpc_match_invite_user
-- is now a thin wrapper around rpc_match_admit_user. Use 20260320000000 validation.
-- =============================================================================

-- (original content preserved for reference — do not run)

SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_invite_user_to_match';

SELECT pg_get_functiondef(p.oid) LIKE '%allow_non_group_invites%' AS has_allow_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_invite_user_to_match';

SELECT pg_get_functiondef(p.oid) LIKE '%can_invite_user_to_match%' AS uses_predicate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_user';
