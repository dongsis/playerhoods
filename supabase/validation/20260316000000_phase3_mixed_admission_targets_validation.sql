-- =============================================================================
-- Validation SQL for 20260316000000_phase3_mixed_admission_targets
-- Run manually after migration. Some checks require manual setup.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_match_admission_targets exists with updated return shape
-- -----------------------------------------------------------------------------

SELECT p.proname, pg_get_function_result(p.oid)::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: includes target_kind, target_id, action_kind columns

-- -----------------------------------------------------------------------------
-- 2) Return shape includes target_kind, target_id, action_kind
-- -----------------------------------------------------------------------------

SELECT pg_get_function_result(p.oid)::text LIKE '%target_kind%'
   AND pg_get_function_result(p.oid)::text LIKE '%target_id%'
   AND pg_get_function_result(p.oid)::text LIKE '%action_kind%' AS has_required_columns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 3) Existing user sources still present (reentry, invite_circle, club_members, groups)
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%reentry_src%'
   AND pg_get_functiondef(p.oid) LIKE '%invite_circle_src%'
   AND pg_get_functiondef(p.oid) LIKE '%club_members_src%'
   AND pg_get_functiondef(p.oid) LIKE '%groups_src%' AS has_user_sources
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 4) User can_admit aligns with can_admit_user_to_match
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%can_admit_user_to_match%' AS uses_admit_predicate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 5) roster_contacts source for Contact Players
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%roster_contacts%'
   AND pg_get_functiondef(p.oid) LIKE '%roster_contacts_src%' AS has_contact_source
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 6) Linked Contact Player excluded (identity_links check)
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%identity_links%'
   AND pg_get_functiondef(p.oid) LIKE '%il.user_id IS NULL%' AS excludes_linked
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 7) Active guest filter (g.status = 'active')
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%g.status%active%' AS filters_active_guest
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 8) Already-in-match guest excluded (already_active_guests)
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%already_active_guests%'
   AND pg_get_functiondef(p.oid) LIKE '%guest_id%' AS excludes_active_guests
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 9) action_kind = nominate_contact_player for Contact Player rows
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%nominate_contact_player%' AS has_nominate_action
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 10) Combined result (UNION of user and contact rows)
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%UNION ALL%'
   AND pg_get_functiondef(p.oid) LIKE '%user_rows%'
   AND pg_get_functiondef(p.oid) LIKE '%contact_player_rows%' AS has_combined_result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 11) Search on mixed set (p_search / v_search)
-- -----------------------------------------------------------------------------

SELECT pg_get_functiondef(p.oid) LIKE '%v_search%'
   AND pg_get_functiondef(p.oid) LIKE '%ILIKE%' AS has_search
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
-- Expected: true

-- -----------------------------------------------------------------------------
-- 12) Manual: no duplicate same-person (linked contact vs user)
--    Setup: Create guest with email matching a user. Run reconcile. Call RPC.
--    Expected: Guest does NOT appear as contact_player (excluded by il.user_id IS NULL).
-- -----------------------------------------------------------------------------
