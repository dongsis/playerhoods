-- =============================================================================
-- L2 Canonicalization Dry-Run Audit (Read-Only)
-- =============================================================================
-- Per Contact_Player_Canonicalization_Orchestration_Design.md
-- Outputs: dual active rows, stale confirmed guest rows, candidate retire list,
--          ambiguity / manual review list
-- NO WRITES. NO MIGRATIONS. READ-ONLY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DUAL ACTIVE ROWS
-- Same real person in same match has both active guest row AND active user row.
-- Match criteria: (a) email match: guest.email = auth.users.email
--                (b) identity_links: guest_participant linked to user_id
-- -----------------------------------------------------------------------------
SELECT
  '1_dual_active' AS output_set,
  mp_guest.match_id,
  mp_user.user_id,
  mp_guest.id AS guest_mp_id,
  mp_user.id AS user_mp_id,
  g.email AS guest_email,
  g.display_name AS guest_display_name,
  mp_guest.status AS guest_status,
  mp_user.status AS user_status,
  mp_guest.participant_accepted_at AS guest_participant_accepted_at,
  mp_user.participant_accepted_at AS user_participant_accepted_at,
  mp_guest.org_approved_at AS guest_org_approved_at,
  mp_user.org_approved_at AS user_org_approved_at,
  'email_match' AS match_source
FROM public.match_participants mp_guest
JOIN public.guests g ON g.id = mp_guest.guest_id
JOIN public.match_participants mp_user
  ON mp_user.match_id = mp_guest.match_id
  AND mp_user.user_id IS NOT NULL
JOIN auth.users u ON u.id = mp_user.user_id
WHERE mp_guest.guest_id IS NOT NULL
  AND mp_guest.removed_at IS NULL
  AND mp_user.removed_at IS NULL
  AND lower(trim(coalesce(g.email, ''))) = lower(trim(coalesce(u.email::text, '')))
  AND trim(coalesce(g.email, '')) <> ''

UNION ALL

SELECT
  '1_dual_active' AS output_set,
  mp_guest.match_id,
  mp_user.user_id,
  mp_guest.id AS guest_mp_id,
  mp_user.id AS user_mp_id,
  g.email AS guest_email,
  g.display_name AS guest_display_name,
  mp_guest.status AS guest_status,
  mp_user.status AS user_status,
  mp_guest.participant_accepted_at AS guest_participant_accepted_at,
  mp_user.participant_accepted_at AS user_participant_accepted_at,
  mp_guest.org_approved_at AS guest_org_approved_at,
  mp_user.org_approved_at AS user_org_approved_at,
  'identity_link' AS match_source
FROM public.match_participants mp_guest
JOIN public.guests g ON g.id = mp_guest.guest_id
JOIN public.identity_links il
  ON il.linked_type = 'guest_participant'
  AND il.linked_id = mp_guest.id
  AND il.user_id IS NOT NULL
JOIN public.match_participants mp_user
  ON mp_user.match_id = mp_guest.match_id
  AND mp_user.user_id = il.user_id
WHERE mp_guest.guest_id IS NOT NULL
  AND mp_guest.removed_at IS NULL
  AND mp_user.removed_at IS NULL
  AND NOT EXISTS (
    -- avoid duplicate if also matched by email
    SELECT 1 FROM auth.users u
    WHERE u.id = mp_user.user_id
      AND lower(trim(coalesce(g.email, ''))) = lower(trim(coalesce(u.email::text, '')))
      AND trim(coalesce(g.email, '')) <> ''
  )
ORDER BY match_id, user_id, guest_mp_id;


-- -----------------------------------------------------------------------------
-- 2. STALE CONFIRMED GUEST ROWS
-- status = 'confirmed' but participant_accepted_at IS NULL (invalid state)
-- -----------------------------------------------------------------------------
SELECT
  '2_stale_confirmed' AS output_set,
  mp.id AS guest_mp_id,
  mp.match_id,
  mp.guest_id,
  g.email,
  g.display_name,
  mp.status,
  mp.participant_accepted_at,
  mp.org_approved_at,
  mp.removed_at
FROM public.match_participants mp
JOIN public.guests g ON g.id = mp.guest_id
WHERE mp.guest_id IS NOT NULL
  AND mp.status = 'confirmed'
  AND mp.participant_accepted_at IS NULL
  AND mp.removed_at IS NULL
ORDER BY mp.match_id, mp.id;


-- -----------------------------------------------------------------------------
-- 3. CANDIDATE RETIRE LIST
-- Under user-row-canonical strategy: which guest rows would be retired,
-- which user row would remain canonical.
-- (Subset of dual active rows with explicit retire/canonical assignment)
-- -----------------------------------------------------------------------------
SELECT
  '3_candidate_retire' AS output_set,
  d.match_id,
  d.user_id,
  d.guest_mp_id AS would_retire_guest_mp_id,
  d.user_mp_id AS canonical_user_mp_id,
  d.guest_email,
  d.guest_display_name
FROM (
  SELECT
    mp_guest.match_id,
    mp_user.user_id,
    mp_guest.id AS guest_mp_id,
    mp_user.id AS user_mp_id,
    g.email AS guest_email,
    g.display_name AS guest_display_name
  FROM public.match_participants mp_guest
  JOIN public.guests g ON g.id = mp_guest.guest_id
  JOIN public.match_participants mp_user
    ON mp_user.match_id = mp_guest.match_id
    AND mp_user.user_id IS NOT NULL
  JOIN auth.users u ON u.id = mp_user.user_id
  WHERE mp_guest.guest_id IS NOT NULL
    AND mp_guest.removed_at IS NULL
    AND mp_user.removed_at IS NULL
    AND lower(trim(coalesce(g.email, ''))) = lower(trim(coalesce(u.email::text, '')))
    AND trim(coalesce(g.email, '')) <> ''

  UNION

  SELECT
    mp_guest.match_id,
    mp_user.user_id,
    mp_guest.id AS guest_mp_id,
    mp_user.id AS user_mp_id,
    g.email AS guest_email,
    g.display_name AS guest_display_name
  FROM public.match_participants mp_guest
  JOIN public.guests g ON g.id = mp_guest.guest_id
  JOIN public.identity_links il
    ON il.linked_type = 'guest_participant'
    AND il.linked_id = mp_guest.id
    AND il.user_id IS NOT NULL
  JOIN public.match_participants mp_user
    ON mp_user.match_id = mp_guest.match_id
    AND mp_user.user_id = il.user_id
  WHERE mp_guest.guest_id IS NOT NULL
    AND mp_guest.removed_at IS NULL
    AND mp_user.removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = mp_user.user_id
        AND lower(trim(coalesce(g.email, ''))) = lower(trim(coalesce(u.email::text, '')))
        AND trim(coalesce(g.email, '')) <> ''
    )
) d
ORDER BY match_id, user_id, would_retire_guest_mp_id;


-- -----------------------------------------------------------------------------
-- 4. AMBIGUITY / MANUAL REVIEW LIST
-- Cases that cannot be safely canonicalized automatically.
-- (a) Active guest with NULL/empty email - cannot match to user
-- (b) Multiple active guest rows for same email in same match
-- (c) Dual active where user row has no email in auth.users
-- -----------------------------------------------------------------------------
-- 4a: Active guest with no email (cannot match)
SELECT
  '4a_guest_no_email' AS ambiguity_type,
  mp.id AS guest_mp_id,
  mp.match_id,
  mp.guest_id,
  g.email,
  g.display_name,
  'Guest has no email; cannot match to user' AS reason
FROM public.match_participants mp
JOIN public.guests g ON g.id = mp.guest_id
WHERE mp.guest_id IS NOT NULL
  AND mp.removed_at IS NULL
  AND (g.email IS NULL OR trim(coalesce(g.email, '')) = '')
ORDER BY mp.match_id, mp.id;

-- 4b: Multiple active guest rows for same email in same match
SELECT
  '4b_multiple_guests_same_email' AS ambiguity_type,
  mp1.match_id,
  g.email,
  mp1.id AS guest_mp_id_1,
  mp2.id AS guest_mp_id_2,
  'Multiple active guest rows for same email in same match' AS reason
FROM public.match_participants mp1
JOIN public.guests g ON g.id = mp1.guest_id
JOIN public.match_participants mp2
  ON mp2.match_id = mp1.match_id
  AND mp2.guest_id IS NOT NULL
  AND mp2.id > mp1.id
JOIN public.guests g2 ON g2.id = mp2.guest_id
WHERE mp1.guest_id IS NOT NULL
  AND mp1.removed_at IS NULL
  AND mp2.removed_at IS NULL
  AND lower(trim(coalesce(g.email, ''))) = lower(trim(coalesce(g2.email, '')))
  AND trim(coalesce(g.email, '')) <> ''
ORDER BY mp1.match_id, g.email;

-- 4c: Dual active but user has no email in auth.users (edge case)
SELECT
  '4c_user_no_email' AS ambiguity_type,
  mp_guest.match_id,
  mp_user.user_id,
  mp_guest.id AS guest_mp_id,
  mp_user.id AS user_mp_id,
  g.email AS guest_email,
  'User has no email in auth.users; match via identity_links only' AS reason
FROM public.match_participants mp_guest
JOIN public.guests g ON g.id = mp_guest.guest_id
JOIN public.identity_links il
  ON il.linked_type = 'guest_participant'
  AND il.linked_id = mp_guest.id
JOIN public.match_participants mp_user
  ON mp_user.match_id = mp_guest.match_id
  AND mp_user.user_id = il.user_id
JOIN auth.users u ON u.id = mp_user.user_id
WHERE mp_guest.guest_id IS NOT NULL
  AND mp_guest.removed_at IS NULL
  AND mp_user.removed_at IS NULL
  AND (u.email IS NULL OR trim(u.email::text) = '')
ORDER BY mp_guest.match_id, mp_user.user_id;
