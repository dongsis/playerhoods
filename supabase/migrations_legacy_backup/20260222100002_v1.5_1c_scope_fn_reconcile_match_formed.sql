-- Migration: v1.5 Phase 1C — Scope function, reconcile COALESCE transition, match_formed pending_count
--
-- 1. is_user_in_scope_groups — internal-only scope predicate (NOT granted to authenticated)
-- 2. match_participant_reconcile_status — updated to use COALESCE(participant_accepted_at, user_accepted_at)
--    Continues writing both confirmed_at and status for RLS backward compat during transition.
-- 3. match_counts / match_formed views — updated to use timestamp-based logic, adds pending_count.

BEGIN;

-- ============================================================================
-- 1. is_user_in_scope_groups (internal helper — NOT executable by authenticated)
-- ============================================================================
-- Security note: SECURITY DEFINER + row_security=off gives this function read access
-- to group_members without RLS filtering. It is intentionally NOT granted to authenticated
-- to prevent membership oracle attacks. Called only from within other SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.is_user_in_scope_groups(
  p_scope_group_ids uuid[],
  p_user_id         uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = ANY(p_scope_group_ids)
      AND gm.user_id  = p_user_id
      AND gm.status   = 'active'
  );
$$;

-- Explicitly ensure authenticated cannot call this directly
REVOKE ALL ON FUNCTION public.is_user_in_scope_groups(uuid[], uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_user_in_scope_groups(uuid[], uuid) FROM anon;

COMMENT ON FUNCTION public.is_user_in_scope_groups IS
  'v1.5: Internal scope membership predicate. Checks user is active member of ANY of the given groups. '
  'SECURITY DEFINER + row_security=off. NOT granted to authenticated — internal RPC use only.';

-- ============================================================================
-- 2. match_participant_reconcile_status — COALESCE transition version
-- ============================================================================
-- v1.5 transition: uses COALESCE(participant_accepted_at, user_accepted_at) as the
-- accepted signal so both old and new columns are honoured during migration.
-- Continues to write status (for RLS compat) and confirmed_at (canonical).
-- confirmed_at is the ONLY field this function may set to mark confirmation.

CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp record;
  v_accepted_at timestamptz;
BEGIN
  SELECT
    id,
    status,
    user_id,
    guest_id,
    user_accepted_at,
    participant_accepted_at,
    org_approved_at,
    removed_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- Removed state: clear confirmed_at, set status = removed, exit
  IF v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET
      status       = 'removed',
      confirmed_at = NULL
    WHERE id = p_mp_id
      AND (status != 'removed' OR confirmed_at IS NOT NULL);
    RETURN;
  END IF;

  -- v1.5 transition: COALESCE new and old accepted field
  v_accepted_at := COALESCE(v_mp.participant_accepted_at, v_mp.user_accepted_at);

  -- Guest participant: only needs org_approved_at
  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET
        status       = 'confirmed',
        confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed' OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET
        status       = 'pending',
        confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending' OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  -- User participant: needs both participant-accepted AND org_approved_at
  IF v_mp.user_id IS NOT NULL THEN
    IF v_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET
        status       = 'confirmed',
        confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed' OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET
        status       = 'pending',
        confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending' OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_participant_reconcile_status(uuid) TO authenticated;

COMMENT ON FUNCTION public.match_participant_reconcile_status IS
  'v1.5 transition: Derives participant status from timestamps. Uses COALESCE(participant_accepted_at, '
  'user_accepted_at) to honour both old and new columns. Writes confirmed_at (canonical) and status '
  '(backward compat for RLS). confirmed_at is the only confirmation field this function may set.';

-- ============================================================================
-- 3. match_counts view — timestamp-based confirmed/pending counts
-- ============================================================================
-- Replaces status-based filter with confirmed_at IS NOT NULL (timestamp-based).
-- During transition this is equivalent since reconcile writes both confirmed_at and status.

CREATE OR REPLACE VIEW public.match_counts AS
SELECT
  m.id            AS match_id,
  m.required_count,
  count(*) FILTER (
    WHERE mp.removed_at IS NULL
      AND mp.confirmed_at IS NOT NULL
  )::int          AS confirmed_count,
  count(*) FILTER (
    WHERE mp.removed_at IS NULL
      AND mp.confirmed_at IS NULL
  )::int          AS pending_count
FROM public.matches m
LEFT JOIN public.match_participants mp ON mp.match_id = m.id
GROUP BY m.id, m.required_count;

COMMENT ON VIEW public.match_counts IS
  'v1.5: Counts confirmed (confirmed_at IS NOT NULL) and pending (confirmed_at IS NULL) '
  'non-removed participants per match. Timestamp-based, not status-based.';

-- ============================================================================
-- 4. match_formed view — expose pending_count
-- ============================================================================

CREATE OR REPLACE VIEW public.match_formed AS
SELECT
  mc.match_id,
  mc.required_count,
  mc.confirmed_count,
  (mc.confirmed_count >= mc.required_count) AS is_formed,  -- position 4: preserved from original
  mc.pending_count                                          -- position 5: new in v1.5
FROM public.match_counts mc;

COMMENT ON VIEW public.match_formed IS
  'v1.5: Extends match_counts with is_formed flag and exposes pending_count. '
  'pending_count allows non-organizer scope members to see pending count without leaking names.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'is_user_in_scope_groups'
  ) THEN
    RAISE EXCEPTION 'v1.5-1C: is_user_in_scope_groups not created';
  END IF;

  -- Verify authenticated cannot execute is_user_in_scope_groups
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'is_user_in_scope_groups'
      AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'v1.5-1C: is_user_in_scope_groups incorrectly granted to authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'match_formed'
  ) THEN
    RAISE EXCEPTION 'v1.5-1C: match_formed view not found';
  END IF;

  RAISE NOTICE 'v1.5-1C complete: is_user_in_scope_groups, reconcile COALESCE, match_formed pending_count';
END $$;

COMMIT;
