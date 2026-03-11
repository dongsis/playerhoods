-- =============================================================================
-- Migration: Play Network Core — Step 5: Minimal match invite targets/list
-- Purpose: Read-only invite candidates interface unifying Phase 1 sources
-- Authoritative: 00_AUTHORITATIVE_INDEX.md, playerhoods_five_pillars_implementation_v1.md
-- Scope: One RPC only. No invite writes, lifecycle, or other changes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rpc_match_invite_targets — unified invite candidates (organizer only)
-- Sources: reentry, invite_circle, club_members, groups (InScope + ShareGroup)
-- Dedup priority: reentry > invite_circle > club_members > groups
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_invite_targets(
  p_match_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  club_handle text,
  source text,
  eligible boolean,
  eligible_via text,
  sort_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_match        public.matches%rowtype;
  v_uid          uuid := auth.uid();
  v_scope_ids    uuid[] := '{}'::uuid[];
  v_club_context uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);
  -- Club context: match club first, then organizer's primary club
  v_club_context := COALESCE(
    v_match.club_id,
    (SELECT primary_club_id FROM public.profiles WHERE id = v_match.organizer_id)
  );

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
  ),
  -- Source 1: Re-entry (removed participants)
  reentry_src AS (
    SELECT DISTINCT mp.user_id, 'reentry'::text AS src
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.status = 'removed'
      AND mp.user_id <> v_match.organizer_id
      AND mp.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
  ),
  -- Source 2: Invite Circle (organizer's saved users)
  invite_circle_src AS (
    SELECT uic.target_user_id AS user_id, 'invite_circle'::text AS src
    FROM public.user_invite_circle uic
    WHERE uic.owner_user_id = v_match.organizer_id
      AND uic.target_user_id <> v_match.organizer_id
      AND uic.target_user_id NOT IN (SELECT aa.user_id FROM already_active aa)
  ),
  -- Source 3: Club Members (only when club context exists and organizer is member)
  club_members_src AS (
    SELECT ci.user_id, 'club_members'::text AS src
    FROM public.club_identities ci
    JOIN public.profiles p ON p.id = ci.user_id
    WHERE v_club_context IS NOT NULL
      AND ci.club_id = v_club_context
      AND ci.user_id <> v_match.organizer_id
      AND p.show_in_club_member_discovery = true
      AND ci.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
      AND EXISTS (
        SELECT 1 FROM public.club_identities ci_org
        WHERE ci_org.club_id = v_club_context AND ci_org.user_id = v_match.organizer_id
      )
  ),
  -- Source 4: Groups (InScope + ShareGroup, friend-only)
  scope_members AS (
    SELECT DISTINCT gm.user_id
    FROM public.group_members gm
    WHERE gm.group_id = ANY(v_scope_ids)
      AND gm.status = 'active'
      AND gm.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_org
    JOIN public.group_members gm_other ON gm_org.group_id = gm_other.group_id
    JOIN public.groups g ON g.id = gm_org.group_id
    WHERE gm_org.user_id = v_match.organizer_id
      AND gm_org.status = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_match.organizer_id
      AND g.group_kind = 'friend'
  ),
  groups_src AS (
    SELECT sm.user_id, 'groups'::text AS src FROM scope_members sm
    UNION
    SELECT sg.user_id, 'groups'::text AS src FROM shared_group_members sg
  ),
  -- Union all sources with priority for dedup (row_number picks first)
  all_sources AS (
    SELECT user_id, src, 1 AS pri FROM reentry_src
    UNION ALL
    SELECT user_id, src, 2 AS pri FROM invite_circle_src
    UNION ALL
    SELECT user_id, src, 3 AS pri FROM club_members_src
    UNION ALL
    SELECT user_id, src, 4 AS pri FROM groups_src
  ),
  deduped AS (
    SELECT DISTINCT ON (user_id) user_id, src
    FROM all_sources
    WHERE user_id <> v_match.organizer_id
    ORDER BY user_id, pri
  ),
  candidates AS (
    SELECT d.user_id, d.src AS source
    FROM deduped d
  )
  SELECT
    c.user_id,
    p.display_name,
    p.avatar_url,
    ci.club_handle,
    c.source,
    public.can_invite_user_to_match(p_match_id, v_uid, c.user_id) AS eligible,
    CASE
      WHEN public.can_invite_user_to_match(p_match_id, v_uid, c.user_id) THEN 'invite_allowed'
      ELSE 'invite_forbidden'
    END AS eligible_via,
    LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.club_handle, c.user_id::text)) AS sort_name
  FROM candidates c
  JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.club_identities ci
    ON ci.user_id = c.user_id AND ci.club_id = v_club_context
  WHERE (
    p_search IS NULL
    OR p_search = ''
    OR p.display_name ILIKE '%' || trim(p_search) || '%'
    OR ci.club_handle ILIKE '%' || trim(p_search) || '%'
  )
  ORDER BY sort_name NULLS LAST, c.user_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_invite_targets(uuid, text) IS
'Phase 1 Step 5: Unified invite candidates for organizer. Sources: reentry, invite_circle, club_members, groups. Dedup: reentry>invite_circle>club_members>groups. eligible=can_invite_user_to_match. Club context: match.club_id or organizer.primary_club_id.';

GRANT EXECUTE ON FUNCTION public.rpc_match_invite_targets(uuid, text) TO authenticated;
