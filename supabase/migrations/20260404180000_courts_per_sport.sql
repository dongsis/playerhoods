BEGIN;

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS sport_id integer;

UPDATE public.courts
SET sport_id = 1
WHERE sport_id IS NULL;

ALTER TABLE public.courts
  ALTER COLUMN sport_id SET DEFAULT 1;

ALTER TABLE public.courts
  ALTER COLUMN sport_id SET NOT NULL;

ALTER TABLE public.courts
  DROP CONSTRAINT IF EXISTS courts_venue_id_court_code_key;

ALTER TABLE public.courts
  DROP CONSTRAINT IF EXISTS courts_sport_id_fkey;

ALTER TABLE public.courts
  ADD CONSTRAINT courts_sport_id_fkey
  FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE RESTRICT;

ALTER TABLE public.courts
  DROP CONSTRAINT IF EXISTS courts_venue_id_sport_id_court_code_key;

ALTER TABLE public.courts
  ADD CONSTRAINT courts_venue_id_sport_id_court_code_key
  UNIQUE (venue_id, sport_id, court_code);

DROP FUNCTION IF EXISTS public.rpc_court_create(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_court_update(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_court_create(
  p_venue_id uuid,
  p_sport_id integer,
  p_court_code text,
  p_surface text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.courts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_court public.courts;
BEGIN
  IF NOT public.is_venue_admin(p_venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_court_code IS NULL OR trim(p_court_code) = '' THEN
    RAISE EXCEPTION 'court_code_required';
  END IF;

  INSERT INTO public.courts (venue_id, sport_id, court_code, surface, notes)
  VALUES (p_venue_id, p_sport_id, trim(p_court_code), p_surface, p_notes)
  RETURNING * INTO v_court;

  RETURN v_court;
END;
$$;

ALTER FUNCTION public.rpc_court_create(uuid, integer, text, text, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.rpc_court_update(
  p_court_id uuid,
  p_sport_id integer DEFAULT NULL,
  p_court_code text DEFAULT NULL,
  p_surface text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  SELECT venue_id INTO v_venue_id FROM public.courts WHERE id = p_court_id;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'court_not_found';
  END IF;

  IF NOT public.is_venue_admin(v_venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.courts
  SET
    sport_id = COALESCE(p_sport_id, sport_id),
    court_code = COALESCE(p_court_code, court_code),
    surface = COALESCE(p_surface, surface),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_court_id;
END;
$$;

ALTER FUNCTION public.rpc_court_update(uuid, integer, text, text, text) OWNER TO postgres;

GRANT ALL ON FUNCTION public.rpc_court_create(uuid, integer, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_court_create(uuid, integer, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_court_create(uuid, integer, text, text, text) TO service_role;

GRANT ALL ON FUNCTION public.rpc_court_update(uuid, integer, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_court_update(uuid, integer, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_court_update(uuid, integer, text, text, text) TO service_role;

COMMIT;
