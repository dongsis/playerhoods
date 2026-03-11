-- =============================================================================
-- Validation SQL for 20260312040000_match_invite_targets_unified
-- Run manually after migration. Some tests require domain data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Function exists and has expected signature
-- -----------------------------------------------------------------------------

SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: (p_match_id uuid, p_search text DEFAULT NULL)

-- -----------------------------------------------------------------------------
-- 2) Return type includes required columns (function def contains column names)
-- -----------------------------------------------------------------------------

SELECT
  pg_get_functiondef(p.oid) LIKE '%user_id%' AND
  pg_get_functiondef(p.oid) LIKE '%display_name%' AND
  pg_get_functiondef(p.oid) LIKE '%avatar_url%' AND
  pg_get_functiondef(p.oid) LIKE '%club_handle%' AND
  pg_get_functiondef(p.oid) LIKE '%source%' AND
  pg_get_functiondef(p.oid) LIKE '%eligible%' AND
  pg_get_functiondef(p.oid) LIKE '%sort_name%' AS has_required_columns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 3) Invite Circle candidate appears (manual setup)
-- -----------------------------------------------------------------------------
-- Setup: Organizer O has user T in Invite Circle. Match M has organizer O.
-- Call: SELECT * FROM rpc_match_invite_targets(match_id, NULL) AS org O.
-- Expected: T appears with source = 'invite_circle'.

-- 3a) Function references user_invite_circle
SELECT pg_get_functiondef(p.oid) LIKE '%user_invite_circle%' AS has_invite_circle
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 4) Club Members candidate appears (manual setup)
-- -----------------------------------------------------------------------------
-- Setup: Match has club_id (or organizer has primary_club_id). Organizer and
-- user T are both club members. T has show_in_club_member_discovery = true.
-- Call: SELECT * FROM rpc_match_invite_targets(match_id, NULL).
-- Expected: T appears with source = 'club_members' (or deduped to higher priority if also in Invite Circle).

-- 4a) Function references club_identities
SELECT pg_get_functiondef(p.oid) LIKE '%club_identities%' AS has_club_identities
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 5) Duplicate user across sources is deduplicated
-- -----------------------------------------------------------------------------
-- Manual: User T in both Invite Circle and Club Members. Call RPC.
-- Expected: One row per user_id; source = 'invite_circle' (higher priority).

SELECT pg_get_functiondef(p.oid) LIKE '%DISTINCT ON%' AS has_dedup
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 6) Self is excluded
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%organizer_id%' AND
       (pg_get_functiondef(p.oid) LIKE '%<> v_match.organizer_id%' OR
        pg_get_functiondef(p.oid) LIKE '%!= v_match.organizer_id%') AS self_excluded
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 7) Already-present non-removed participant is excluded
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%already_active%' AS excludes_active
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 8) Search filters candidate rows only
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%p_search%' AND
       pg_get_functiondef(p.oid) LIKE '%display_name%' AND
       pg_get_functiondef(p.oid) LIKE '%club_handle%' AS search_on_display_and_handle
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 9) eligible aligns with can_invite_user_to_match
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%can_invite_user_to_match%' AS uses_predicate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_invite_targets';
-- Expected: true

-- Manual: For a candidate with eligible=true, call rpc_match_invite_user(match_id, user_id).
-- Expected: success (or appropriate lifecycle result).
-- Manual: For a candidate with eligible=false, call rpc_match_invite_user.
-- Expected: forbidden.

-- -----------------------------------------------------------------------------
-- 10) EXECUTE permission for authenticated
-- -----------------------------------------------------------------------------

SELECT grantee, privilege
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'rpc_match_invite_targets';
-- Expected: authenticated has EXECUTE

-- -----------------------------------------------------------------------------
-- 11) Unauthenticated / missing match / forbidden caller
-- -----------------------------------------------------------------------------
-- Manual: Call without auth → not_authenticated
-- Manual: Call with invalid match_id → Match not found
-- Manual: Call as non-organizer → Only the match organizer can perform this action
