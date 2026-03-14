-- When match details change (date/time/duration/club/courts), reset ALL confirmed participants
-- to pending, including contact players (guests). Previously only user participants were reset.

CREATE OR REPLACE FUNCTION public.fn_match_detail_change_reconfirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (
    OLD.match_date          IS DISTINCT FROM NEW.match_date
    OR OLD.start_time       IS DISTINCT FROM NEW.start_time
    OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
    OR OLD.club_id          IS DISTINCT FROM NEW.club_id
    OR OLD.court_ids        IS DISTINCT FROM NEW.court_ids
  ) THEN
    FOR v_id IN
      UPDATE public.match_participants mp
      SET
        participant_accepted_at  = NULL,
        participant_accepted_via = NULL,
        manual_confirmed_by     = NULL,
        confirmed_at            = NULL
      WHERE mp.match_id = NEW.id
        AND mp.removed_at IS NULL
        AND mp.confirmed_at IS NOT NULL
        AND (mp.user_id IS NULL OR mp.user_id IS DISTINCT FROM NEW.organizer_id)
      RETURNING mp.id
    LOOP
      PERFORM public.match_participant_reconcile_status(v_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_match_detail_change_reconfirm() IS
'v1.7: On match schedule/location change, reset all confirmed participants (users and contact players/guests) to pending. Organizer row excluded. org_approved_at preserved; reconcile derives status.';

-- Ensure trigger fires on all relevant columns (including club_id, court_ids)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'matches' AND t.tgname = 'trg_match_detail_change_reconfirm'
  ) THEN
    DROP TRIGGER trg_match_detail_change_reconfirm ON public.matches;
  END IF;
END$$;

CREATE TRIGGER trg_match_detail_change_reconfirm
AFTER UPDATE OF match_date, start_time, duration_minutes, club_id, court_ids ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_match_detail_change_reconfirm();
