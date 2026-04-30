ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS required_court_count integer;

UPDATE public.matches m
SET required_court_count = GREATEST(
  1,
  COALESCE(
    (
      SELECT COUNT(*)
      FROM public.match_courts mc
      WHERE mc.match_id = m.id
    ),
    0
  )
)
WHERE m.required_court_count IS NULL;

UPDATE public.matches
SET required_court_count = 1
WHERE required_court_count IS NULL OR required_court_count < 1;

ALTER TABLE public.matches
  ALTER COLUMN required_court_count SET DEFAULT 1;

ALTER TABLE public.matches
  ALTER COLUMN required_court_count SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_required_court_count_check'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_required_court_count_check
      CHECK (required_court_count >= 1 AND required_court_count <= 6);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_match_court_offer_state(
  p_match_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match public.matches%rowtype;
  v_required_count integer;
  v_all_labels text[];
  v_selected_labels text[];
  v_summary_label text;
BEGIN
  IF p_match_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_match.finalized_by_user_id IS NOT NULL AND v_match.court_plan_mode = 'secured' THEN
    RETURN;
  END IF;

  v_required_count := GREATEST(COALESCE(v_match.required_court_count, 1), 1);

  SELECT array_agg(src.court_label ORDER BY src.court_label)
  INTO v_all_labels
  FROM (
    SELECT DISTINCT btrim(mco.court_label) AS court_label
    FROM public.match_court_offers mco
    WHERE mco.match_id = p_match_id
      AND mco.status <> 'released'
      AND NULLIF(btrim(COALESCE(mco.court_label, '')), '') IS NOT NULL
  ) AS src;

  IF COALESCE(array_length(v_all_labels, 1), 0) >= v_required_count THEN
    v_selected_labels := v_all_labels[1:v_required_count];
    v_summary_label := array_to_string(v_selected_labels, ', ');

    UPDATE public.matches
    SET
      court_plan_mode = 'secured',
      final_court_label = v_summary_label,
      finalized_by_user_id = NULL,
      finalized_at = COALESCE(finalized_at, now())
    WHERE id = p_match_id;

    DELETE FROM public.match_courts
    WHERE match_id = p_match_id;

    INSERT INTO public.match_courts (
      match_id,
      slot_index,
      court_label,
      created_by
    )
    SELECT
      p_match_id,
      labels.ordinality::integer,
      labels.court_label,
      v_match.organizer_id
    FROM unnest(v_selected_labels) WITH ORDINALITY AS labels(court_label, ordinality);
  ELSE
    UPDATE public.matches
    SET
      court_plan_mode = 'needs_help_booking',
      final_court_label = NULL,
      finalized_by_user_id = NULL,
      finalized_at = NULL
    WHERE id = p_match_id
      AND finalized_by_user_id IS NULL;

    DELETE FROM public.match_courts
    WHERE match_id = p_match_id;
  END IF;
END;
$$;

ALTER FUNCTION public.sync_match_court_offer_state(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.sync_match_court_offer_state(uuid) TO anon;
GRANT ALL ON FUNCTION public.sync_match_court_offer_state(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sync_match_court_offer_state(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_sync_match_court_offer_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.sync_match_court_offer_state(COALESCE(NEW.match_id, OLD.match_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.tg_sync_match_court_offer_state() OWNER TO postgres;

DROP TRIGGER IF EXISTS sync_match_court_offer_state ON public.match_court_offers;
CREATE TRIGGER sync_match_court_offer_state
AFTER INSERT OR UPDATE OR DELETE ON public.match_court_offers
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_match_court_offer_state();

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT match_id
    FROM public.match_court_offers
  LOOP
    PERFORM public.sync_match_court_offer_state(rec.match_id);
  END LOOP;
END
$$;
