-- Migration: v1.3 Phase B5 - Update RLS Policies
-- Description: Update visibility policies for removed participants and scope-based visibility
-- Status: v1.3 RLS Update (Critical for v1.3 semantics)

-- ============================================================================
-- 1. Update matches_select_visibility (Add scope-based visibility)
-- ============================================================================

DROP POLICY IF EXISTS matches_select_visibility ON public.matches;

CREATE POLICY matches_select_visibility
ON public.matches FOR SELECT
TO authenticated
USING (
  -- Organizer can always see
  organizer_id = auth.uid()

  -- Active participant can see
  OR is_match_participant_active(id, auth.uid())

  -- v1.3 NEW: Request-mode match visible to scope group members
  OR (
    admission_mode = 'request'
    AND is_user_in_match_scope(id, auth.uid())
  )
);

COMMENT ON POLICY matches_select_visibility ON matches IS
  'v1.3: Organizer, active participants, and scope members (for request-mode) can view match.';

-- ============================================================================
-- 2. Update match_participants_select (Allow removed participants to see own record if in scope)
-- ============================================================================

DROP POLICY IF EXISTS match_participants_select ON public.match_participants;

CREATE POLICY match_participants_select
ON public.match_participants FOR SELECT
TO authenticated
USING (
  -- Organizer can see all (including removed)
  is_match_organizer(match_id, auth.uid())

  -- User can see own record (including removed if in scope)
  OR (
    user_id = auth.uid()
    AND (
      -- If not removed, always visible
      status != 'removed'
      -- v1.3 NEW: If removed but still in scope, visible (for rejoin UI)
      OR (
        status = 'removed'
        AND EXISTS (
          SELECT 1 FROM matches m
          WHERE m.id = match_participants.match_id
            AND m.admission_mode = 'request'
            AND is_user_in_match_scope(m.id, auth.uid())
        )
      )
    )
  )

  -- Active participant can see other active participants (not removed)
  OR (
    is_match_participant_active(match_id, auth.uid())
    AND status != 'removed'
  )
);

COMMENT ON POLICY match_participants_select ON match_participants IS
  'v1.3: Organizer sees all. User sees own (including removed if in scope). Active participants see other active.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify policies exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'matches' AND policyname = 'matches_select_visibility'
  ) THEN
    RAISE EXCEPTION 'matches_select_visibility policy not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'match_participants' AND policyname = 'match_participants_select'
  ) THEN
    RAISE EXCEPTION 'match_participants_select policy not created';
  END IF;

  RAISE NOTICE 'Phase B5 complete: RLS policies updated for v1.3 (removed participant visibility)';
END $$;
