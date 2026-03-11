-- =============================================================================
-- Validation SQL for 20260312020000_club_members_discovery
-- Run manually after migration. Requires club with members and profiles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Function exists and signature correct
-- -----------------------------------------------------------------------------

SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_club_members_discovery';
-- Expected: (p_club_id uuid, p_search text DEFAULT NULL)

-- -----------------------------------------------------------------------------
-- 2) show_in_club_member_discovery filter enforced
-- -----------------------------------------------------------------------------

-- Users with show_in_club_member_discovery = false must NOT appear in results
-- Manual: set a club member's show_in_club_member_discovery = false, call RPC,
-- verify they are excluded

-- 2a) Verify function joins profiles and filters on show_in_club_member_discovery
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_club_members_discovery';
-- Expected: contains "show_in_club_member_discovery = true"

-- -----------------------------------------------------------------------------
-- 3) Non-member rejection
-- -----------------------------------------------------------------------------

-- Caller who is NOT a club member must get not_club_member
-- Run via Supabase client as user A who has no club_identity for club X:
--   SELECT * FROM rpc_club_members_discovery(club_x_id, NULL);
-- Expected: not_club_member

-- -----------------------------------------------------------------------------
-- 4) Self excluded
-- -----------------------------------------------------------------------------

-- Caller must not see themselves in results
-- Expected: "ci.user_id <> v_uid" in function body
SELECT pg_get_functiondef(p.oid) LIKE '%user_id <> v_uid%' OR
       pg_get_functiondef(p.oid) LIKE '%user_id != v_uid%' AS self_excluded
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_club_members_discovery';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 5) Grant check
-- -----------------------------------------------------------------------------

SELECT grantee, privilege
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'rpc_club_members_discovery';
-- Expected: authenticated has EXECUTE
