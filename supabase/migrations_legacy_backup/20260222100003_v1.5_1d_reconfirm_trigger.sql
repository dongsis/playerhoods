-- Migration: v1.5 Phase 1D — Reconfirm trigger on match detail changes
--
-- When match_date, start_time, or duration_minutes change, all non-removed participants
-- are reset to pending reconfirmation:
--   - participant_accepted_at = NULL
--   - participant_accepted_via = NULL
--   - manual_confirmed_by = NULL
--   - user_accepted_at = NULL  (transition: clear both old and new accepted fields)
--   - confirmed_at = NULL      (reconcile will re-derive when both sides re-confirm)
--
-- org_approved_at is preserved (spec: organizer approval survives match changes).
--
-- Note: venue_id is NOT included in the trigger condition because it does not exist
-- in the current DB schema. Add it when venue management is implemented.

BEGIN;

-- ============================================================================
-- Trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_match_detail_change_reconfirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when scheduling fields that affect participant commitment change
  IF (
    OLD.match_date        IS DISTINCT FROM NEW.match_date
    OR OLD.start_time     IS DISTINCT FROM NEW.start_time
    OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
  ) THEN
    -- Clear all participant-accepted-side artifacts for non-removed participants.
    -- org_approved_at is intentionally preserved (spec requirement).
    UPDATE public.match_participants
    SET
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      manual_confirmed_by      = NULL,
      user_accepted_at         = NULL,  -- transition: clear legacy field too
      confirmed_at             = NULL
    WHERE
      match_id    = NEW.id
      AND removed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_match_detail_change_reconfirm IS
  'v1.5: Clears all participant-accepted-side fields (accepted_at, accepted_via, manual_confirmed_by, '
  'confirmed_at) when match scheduling details change. org_approved_at is preserved. '
  'Fires AFTER UPDATE on matches when match_date, start_time, or duration_minutes change.';

-- ============================================================================
-- Attach trigger
-- ============================================================================

DROP TRIGGER IF EXISTS trg_match_detail_change_reconfirm ON public.matches;

CREATE TRIGGER trg_match_detail_change_reconfirm
AFTER UPDATE OF match_date, start_time, duration_minutes
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_match_detail_change_reconfirm();

COMMENT ON TRIGGER trg_match_detail_change_reconfirm ON public.matches IS
  'v1.5: Resets participant accepted-side fields when match scheduling changes. '
  'org_approved_at is preserved per spec.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_match_detail_change_reconfirm'
  ) THEN
    RAISE EXCEPTION 'v1.5-1D: fn_match_detail_change_reconfirm not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_match_detail_change_reconfirm'
  ) THEN
    RAISE EXCEPTION 'v1.5-1D: trg_match_detail_change_reconfirm not attached';
  END IF;

  RAISE NOTICE 'v1.5-1D complete: reconfirm trigger on match_date/start_time/duration_minutes';
END $$;

COMMIT;
