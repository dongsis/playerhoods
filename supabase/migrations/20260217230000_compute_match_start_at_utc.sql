-- ============================================================================
-- Trigger function: compute start_at_utc from club timezone
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_match_start_at_utc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT timezone INTO v_timezone
  FROM public.clubs
  WHERE id = NEW.club_id;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Club timezone not found';
  END IF;

  NEW.start_at_utc :=
    (
      (NEW.match_date::text || ' ' || NEW.start_time::text)::timestamp
      AT TIME ZONE v_timezone
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_match_start_at_utc ON public.matches;

CREATE TRIGGER trg_compute_match_start_at_utc
BEFORE INSERT OR UPDATE OF match_date, start_time, club_id
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.compute_match_start_at_utc();
