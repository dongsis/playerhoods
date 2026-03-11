-- =============================================================================
-- Migration: Two-layer preferences — minimal implementation slice
-- Purpose: Wire global master switches (profiles) + club-scoped overrides
--          (club_identities) into discovery and admission.
-- Authoritative: Naming_Simplification_and_Club_Preferences_Plan.md
-- Scope: Schema add, rpc_club_members_discovery, can_admit_user_to_match Path B,
--        rpc_match_admission_targets club_members_src. No UI, no naming cleanup.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Schema: club_identities preference overrides (Layer 2)
-- Nullable. No backfill. NULL = no override, treated as true in logic.
-- -----------------------------------------------------------------------------

ALTER TABLE public.club_identities
  ADD COLUMN IF NOT EXISTS visible_in_club_member_discovery boolean,
  ADD COLUMN IF NOT EXISTS accept_non_group_invites_in_club boolean;

COMMENT ON COLUMN public.club_identities.visible_in_club_member_discovery IS
'Layer 2: Club-scoped override for discovery. NULL = no override (treat as true). Only applies when profiles.show_in_club_member_discovery is ON.';

COMMENT ON COLUMN public.club_identities.accept_non_group_invites_in_club IS
'Layer 2: Club-scoped override for non-group invites. NULL = no override (treat as true). Only applies when profiles.allow_non_group_invites is ON.';

-- -----------------------------------------------------------------------------
-- 2) rpc_club_members_discovery — two-layer discovery filter
-- Effective: profiles.show_in_club_member_discovery AND COALESCE(ci.visible..., true)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_club_members_discovery(
  p_club_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  club_handle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_identities
    WHERE club_id = p_club_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not_club_member';
  END IF;

  RETURN QUERY
  SELECT
    ci.user_id,
    p.display_name,
    p.avatar_url,
    ci.club_handle
  FROM public.club_identities ci
  JOIN public.profiles p ON p.id = ci.user_id
  WHERE ci.club_id = p_club_id
    AND ci.user_id <> v_uid
    AND p.show_in_club_member_discovery = true
    AND COALESCE(ci.visible_in_club_member_discovery, true) = true
    AND (
      p_search IS NULL
      OR p_search = ''
      OR p.display_name ILIKE '%' || trim(p_search) || '%'
      OR ci.club_handle ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.club_handle)) NULLS LAST,
           LOWER(ci.club_handle) NULLS LAST,
           ci.user_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_club_members_discovery(uuid, text) IS
'Phase 1: Club Members discovery. Two-layer: profiles.show_in_club_member_discovery AND COALESCE(club_identities.visible_in_club_member_discovery, true). Caller must be club member.';

-- -----------------------------------------------------------------------------
-- 3) can_admit_user_to_match — Path B (non-group) two-layer
-- Club context: COALESCE(matches.club_id, organizer.primary_club_id)
-- When no club context: fallback to global only (continuity).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_admit_user_to_match(
  p_match_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.profiles p_target ON p_target.id = p_target_user_id
    WHERE m.id = p_match_id
      AND m.status = 'active'
      AND p_target_user_id <> p_actor_id
      AND NOT public.is_user_match_associated(p_match_id, p_target_user_id)
      -- Caller gate: organizer OR (can_participants_invite + InScope/MatchAssociated)
      AND (
        p_actor_id = m.organizer_id
        OR (
          m.can_participants_invite_users = true
          AND (
            public.is_user_in_scope_groups(
              COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
              p_actor_id
            )
            OR public.is_user_match_associated(p_match_id, p_actor_id)
          )
        )
      )
      -- Target eligibility: same for organizer and participant
      AND (
        -- Re-entry
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id AND mp.user_id = p_target_user_id
            AND mp.status = 'removed'
        )
        OR
        -- Path A: group-based (InScope OR ShareGroup with actor)
        (
          public.is_user_in_scope_groups(
            COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
            p_target_user_id
          )
          OR public.do_users_share_group(p_target_user_id, p_actor_id)
        )
        OR
        -- Path B: non-group direct. Two-layer: global AND club override.
        -- Club context: COALESCE(match.club_id, organizer.primary_club_id).
        -- No club context: continuity fallback to global only.
        (
          p_target.allow_non_group_invites = true
          AND (
            COALESCE(m.club_id, (SELECT primary_club_id FROM public.profiles WHERE id = m.organizer_id)) IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM public.club_identities ci
              WHERE ci.user_id = p_target_user_id
                AND ci.club_id = COALESCE(m.club_id, (SELECT primary_club_id FROM public.profiles WHERE id = m.organizer_id))
                AND ci.accept_non_group_invites_in_club = false
            )
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_admit_user_to_match(uuid, uuid, uuid) IS
'Phase 1: Unified predicate for match admission. Path B (non-group): two-layer — profiles.allow_non_group_invites AND COALESCE(club_identities.accept_non_group_invites_in_club, true). Club context: match.club_id or organizer.primary_club_id. No sport-scoped permission. Tennis/racket/pickleball share same model.';

-- -----------------------------------------------------------------------------
-- 4) rpc_match_admission_targets — club_members_src two-layer discovery
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_admission_targets(
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
  v_can_call     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_can_call := public.is_match_organizer(p_match_id, v_uid)
    OR (
      v_match.can_participants_invite_users = true
      AND (
        public.is_user_in_scope_groups(
          COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]),
          v_uid
        )
        OR public.is_user_match_associated(p_match_id, v_uid)
      )
    );

  IF NOT v_can_call THEN
    RETURN;
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);
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
  reentry_src AS (
    SELECT DISTINCT mp.user_id, 'reentry'::text AS src
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.status = 'removed'
      AND mp.user_id <> v_match.organizer_id
      AND mp.user_id <> v_uid
      AND mp.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
  ),
  invite_circle_src AS (
    SELECT uic.target_user_id AS user_id, 'invite_circle'::text AS src
    FROM public.user_invite_circle uic
    WHERE uic.owner_user_id = v_uid
      AND uic.target_user_id <> v_match.organizer_id
      AND uic.target_user_id <> v_uid
      AND uic.target_user_id NOT IN (SELECT aa.user_id FROM already_active aa)
  ),
  club_members_src AS (
    SELECT ci.user_id, 'club_members'::text AS src
    FROM public.club_identities ci
    JOIN public.profiles p ON p.id = ci.user_id
    WHERE v_club_context IS NOT NULL
      AND ci.club_id = v_club_context
      AND ci.user_id <> v_match.organizer_id
      AND ci.user_id <> v_uid
      AND p.show_in_club_member_discovery = true
      AND COALESCE(ci.visible_in_club_member_discovery, true) = true
      AND ci.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
      AND EXISTS (
        SELECT 1 FROM public.club_identities ci_caller
        WHERE ci_caller.club_id = v_club_context AND ci_caller.user_id = v_uid
      )
  ),
  scope_members AS (
    SELECT DISTINCT gm.user_id
    FROM public.group_members gm
    WHERE gm.group_id = ANY(v_scope_ids)
      AND gm.status = 'active'
      AND gm.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other ON gm_caller.group_id = gm_other.group_id
    JOIN public.groups g ON g.id = gm_caller.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
      AND gm_other.user_id <> v_match.organizer_id
      AND g.group_kind = 'friend'
  ),
  groups_src AS (
    SELECT sm.user_id, 'groups'::text AS src FROM scope_members sm
    UNION
    SELECT sg.user_id, 'groups'::text AS src FROM shared_group_members sg
  ),
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
    WHERE user_id <> v_uid
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
    public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) AS eligible,
    CASE
      WHEN public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) THEN 'admit_allowed'
      ELSE 'admit_forbidden'
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

COMMENT ON FUNCTION public.rpc_match_admission_targets(uuid, text) IS
'Phase 1: Unified admission targets. Club members source uses two-layer discovery. eligible=can_admit_user_to_match. No sport-scoped permission. Tennis/racket/pickleball share same model.';
