-- Migration: Fix RLS visibility for removed participants
-- Problem: Removed users get 404 on match page because RLS blocks all access.
-- v1.3 semantics: removed is NOT terminal (ORG can reactivate). Removed users
-- must retain visibility of the match and their own participant record.

-- ============================================================================
-- 1. matches_select_visibility: Any participant (including removed) can see match
-- ============================================================================

DROP POLICY IF EXISTS matches_select_visibility ON public.matches;

CREATE POLICY matches_select_visibility
ON public.matches FOR SELECT
TO authenticated
USING (
  -- Organizer can always see
  organizer_id = auth.uid()

  -- Any participant (pending, confirmed, OR removed) can see
  OR EXISTS (
    SELECT 1 FROM match_participants mp
    WHERE mp.match_id = matches.id AND mp.user_id = auth.uid()
  )

  -- v1.3: Scope group members can see match (admission_mode deprecated)
  OR is_user_in_match_scope(id, auth.uid())
);

COMMENT ON POLICY matches_select_visibility ON matches IS
  'v1.3: Organizer, any participant (including removed), and scope group members can view match.';

-- ============================================================================
-- 2. match_participants_select: User always sees own record (including removed)
-- ============================================================================

DROP POLICY IF EXISTS match_participants_select ON public.match_participants;

CREATE POLICY match_participants_select
ON public.match_participants FOR SELECT
TO authenticated
USING (
  -- Organizer can see all (including removed)
  is_match_organizer(match_id, auth.uid())

  -- User can always see own record (including removed)
  OR user_id = auth.uid()

  -- Active participant can see other active participants (not removed)
  OR (
    is_match_participant_active(match_id, auth.uid())
    AND status != 'removed'
  )
);

COMMENT ON POLICY match_participants_select ON match_participants IS
  'v1.3: Organizer sees all. User always sees own record (including removed). Active participants see other active.';
