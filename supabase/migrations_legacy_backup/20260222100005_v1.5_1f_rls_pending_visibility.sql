-- Migration: v1.5 Phase 1F — Pending visibility enforcement + oracle risk mitigation
--
-- 1. Create is_caller_in_match_scope(match_id) — self-only scope check, replaces
--    the two-arg is_user_in_match_scope for all external-facing use.
--
-- 2. Update matches_select_visibility to use is_caller_in_match_scope.
--
-- 3. Replace match_participants_select with match_participants_select_v1_5:
--    - Organizer sees all rows
--    - User always sees own row (any status, including removed = self-notice)
--    - Confirmed (confirmed_at IS NOT NULL) rows visible to scope members
--    - Pending and removed rows NOT visible to other participants
--
-- 4. Revoke EXECUTE on is_user_in_match_scope(uuid, uuid) from authenticated
--    to prevent membership oracle attacks.
--
-- Known policy names being replaced (DO NOT drop others):
--   matches:           matches_select_visibility
--   match_participants: match_participants_select

BEGIN;

-- ============================================================================
-- 1. is_caller_in_match_scope — self-only wrapper (replaces two-arg version for callers)
-- ============================================================================
-- Uses auth.uid() internally so callers cannot check other users.
-- GRANT to authenticated: safe for direct RPC calls from TypeScript.

CREATE OR REPLACE FUNCTION public.is_caller_in_match_scope(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_user_in_match_scope(p_match_id, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_caller_in_match_scope(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_caller_in_match_scope IS
  'v1.5: Self-only scope check. Equivalent to is_user_in_match_scope(match_id, auth.uid()). '
  'Granted to authenticated for direct RPC use. Replaces the two-arg oracle-risk version '
  'for all TypeScript/client-facing calls.';

-- ============================================================================
-- 2. Update matches_select_visibility (replace is_user_in_match_scope call)
-- ============================================================================

DROP POLICY IF EXISTS matches_select_visibility ON public.matches;

CREATE POLICY matches_select_visibility
ON public.matches FOR SELECT
TO authenticated
USING (
  -- Organizer always sees their match
  organizer_id = auth.uid()

  -- Any participant (pending, confirmed, removed) can see the match
  OR EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = matches.id
      AND mp.user_id  = auth.uid()
  )

  -- Scope group members can discover and see the match
  OR public.is_caller_in_match_scope(id)
);

COMMENT ON POLICY matches_select_visibility ON public.matches IS
  'v1.5: Organizer, any participant, or scope member can see the match. '
  'Uses is_caller_in_match_scope (self-only) to prevent user enumeration.';

-- ============================================================================
-- 3. Replace match_participants_select with v1.5 pending-visibility policy
-- ============================================================================

DROP POLICY IF EXISTS match_participants_select ON public.match_participants;

CREATE POLICY match_participants_select_v1_5
ON public.match_participants FOR SELECT
TO authenticated
USING (
  -- Organizer sees all rows for their matches (pending, confirmed, removed)
  public.is_match_organizer(match_id, auth.uid())

  -- User always sees their own row (any status — self notice for removed)
  OR user_id = auth.uid()

  -- Confirmed non-removed rows visible to scope members
  -- confirmed_at IS NOT NULL is the v1.5 canonical confirmed signal.
  -- During transition this is equivalent to status='confirmed' (reconcile writes both).
  OR (
    confirmed_at IS NOT NULL
    AND removed_at IS NULL
    AND public.is_caller_in_match_scope(match_id)
  )
);

COMMENT ON POLICY match_participants_select_v1_5 ON public.match_participants IS
  'v1.5: Organizer sees all. User sees own row. Confirmed (confirmed_at IS NOT NULL) '
  'non-removed rows visible to scope members. Pending and removed rows hidden from '
  'non-organizer non-self callers — enforced at DB layer.';

-- ============================================================================
-- 4. Revoke two-arg is_user_in_match_scope from authenticated (oracle risk)
-- ============================================================================
-- After this, authenticated users cannot call is_user_in_match_scope(match_id, other_user_id).
-- The function remains executable by SECURITY DEFINER functions internally (no revoke from postgres).
-- RLS policies that previously called is_user_in_match_scope(id, auth.uid()) have been
-- updated above to use is_caller_in_match_scope(id) instead.
-- Remaining INSERT policies that reference is_user_in_match_scope are only evaluated for
-- direct inserts (not RPC inserts which bypass RLS as superuser) — they will fail-safe
-- with a permission error if attempted, which is the desired behavior.

REVOKE EXECUTE ON FUNCTION public.is_user_in_match_scope(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_user_in_match_scope(uuid, uuid) FROM anon;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- is_caller_in_match_scope exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_caller_in_match_scope'
  ) THEN
    RAISE EXCEPTION 'v1.5-1F: is_caller_in_match_scope not created';
  END IF;

  -- is_caller_in_match_scope is granted to authenticated
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'is_caller_in_match_scope'
      AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'v1.5-1F: is_caller_in_match_scope not granted to authenticated';
  END IF;

  -- Old match_participants_select policy is gone
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'match_participants' AND policyname = 'match_participants_select'
  ) THEN
    RAISE EXCEPTION 'v1.5-1F: old match_participants_select policy still exists';
  END IF;

  -- New policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'match_participants' AND policyname = 'match_participants_select_v1_5'
  ) THEN
    RAISE EXCEPTION 'v1.5-1F: match_participants_select_v1_5 not created';
  END IF;

  -- matches_select_visibility exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'matches' AND policyname = 'matches_select_visibility'
  ) THEN
    RAISE EXCEPTION 'v1.5-1F: matches_select_visibility not found';
  END IF;

  RAISE NOTICE 'v1.5-1F complete: pending visibility enforced, oracle functions restricted';
END $$;

COMMIT;
