ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS court_plan_mode text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS court_note text,
  ADD COLUMN IF NOT EXISTS final_court_label text,
  ADD COLUMN IF NOT EXISTS finalized_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS finalized_at timestamp with time zone;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_court_plan_mode_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_court_plan_mode_check
  CHECK (court_plan_mode IN ('secured', 'walk_in', 'self_book_later', 'needs_help_booking', 'other'));

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_finalized_by_user_id_fkey;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_finalized_by_user_id_fkey
  FOREIGN KEY (finalized_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.matches m
SET
  court_plan_mode = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.match_courts mc
      WHERE mc.match_id = m.id
    ) THEN 'secured'
    ELSE 'other'
  END,
  final_court_label = COALESCE(
    (
      SELECT mc.court_label
      FROM public.match_courts mc
      WHERE mc.match_id = m.id
      ORDER BY mc.slot_index ASC, mc.created_at ASC
      LIMIT 1
    ),
    m.final_court_label
  ),
  finalized_by_user_id = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.match_courts mc
      WHERE mc.match_id = m.id
    ) THEN COALESCE(m.finalized_by_user_id, m.organizer_id)
    ELSE m.finalized_by_user_id
  END,
  finalized_at = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.match_courts mc
      WHERE mc.match_id = m.id
    ) THEN COALESCE(
      m.finalized_at,
      (
        SELECT mc.created_at
        FROM public.match_courts mc
        WHERE mc.match_id = m.id
        ORDER BY mc.slot_index ASC, mc.created_at ASC
        LIMIT 1
      ),
      m.created_at
    )
    ELSE m.finalized_at
  END;

CREATE TABLE IF NOT EXISTS public.match_court_volunteers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'volunteered',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT match_court_volunteers_status_check
    CHECK (status IN ('volunteered', 'withdrawn')),
  CONSTRAINT match_court_volunteers_match_user_key
    UNIQUE (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.match_court_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  volunteer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  court_label text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT match_court_offers_status_check
    CHECK (status IN ('proposed', 'selected', 'not_selected', 'released'))
);

CREATE INDEX IF NOT EXISTS idx_match_court_volunteers_match_id
  ON public.match_court_volunteers(match_id);

CREATE INDEX IF NOT EXISTS idx_match_court_offers_match_id
  ON public.match_court_offers(match_id);

CREATE INDEX IF NOT EXISTS idx_match_court_offers_match_status
  ON public.match_court_offers(match_id, status);

DROP TRIGGER IF EXISTS set_updated_at__match_court_volunteers ON public.match_court_volunteers;
CREATE TRIGGER set_updated_at__match_court_volunteers
BEFORE UPDATE ON public.match_court_volunteers
FOR EACH ROW
EXECUTE FUNCTION public.tg__set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at__match_court_offers ON public.match_court_offers;
CREATE TRIGGER set_updated_at__match_court_offers
BEFORE UPDATE ON public.match_court_offers
FOR EACH ROW
EXECUTE FUNCTION public.tg__set_updated_at();

CREATE OR REPLACE FUNCTION public.is_match_court_helper_eligible(
  p_match_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    public.is_match_organizer(p_match_id, p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.user_id = p_user_id
        AND mp.removed_at IS NULL
        AND mp.status IN ('pending', 'confirmed')
    );
$$;

ALTER FUNCTION public.is_match_court_helper_eligible(uuid, uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.is_match_court_helper_eligible(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.is_match_court_helper_eligible(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_match_court_helper_eligible(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_match_court_submit_offer(
  p_match_id uuid,
  p_court_label text,
  p_note text DEFAULT NULL
) RETURNS public.match_court_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_offer public.match_court_offers%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  IF v_match.court_plan_mode <> 'needs_help_booking' THEN
    RAISE EXCEPTION 'court_help_not_open';
  END IF;

  IF NULLIF(btrim(COALESCE(p_court_label, '')), '') IS NULL THEN
    RAISE EXCEPTION 'court_label_required';
  END IF;

  IF v_match.final_court_label IS NOT NULL THEN
    RAISE EXCEPTION 'court_already_selected';
  END IF;

  IF NOT public.is_match_court_helper_eligible(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_help_book';
  END IF;

  INSERT INTO public.match_court_volunteers (match_id, user_id, status)
  VALUES (p_match_id, v_uid, 'volunteered')
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET status = 'volunteered', updated_at = now();

  INSERT INTO public.match_court_offers (
    match_id,
    volunteer_user_id,
    court_label,
    note,
    status
  ) VALUES (
    p_match_id,
    v_uid,
    btrim(p_court_label),
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    'proposed'
  )
  RETURNING * INTO v_offer;

  RETURN v_offer;
END;
$$;

ALTER FUNCTION public.rpc_match_court_submit_offer(uuid, text, text) OWNER TO postgres;

GRANT ALL ON FUNCTION public.rpc_match_court_submit_offer(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_court_submit_offer(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_match_court_select_offer(
  p_match_id uuid,
  p_offer_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.match_court_offers%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_select_court';
  END IF;

  SELECT * INTO v_offer
  FROM public.match_court_offers
  WHERE id = p_offer_id
    AND match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'court_offer_not_found';
  END IF;

  IF v_offer.status = 'released' THEN
    RAISE EXCEPTION 'court_offer_released';
  END IF;

  UPDATE public.matches
  SET
    court_plan_mode = 'secured',
    final_court_label = v_offer.court_label,
    finalized_by_user_id = v_uid,
    finalized_at = now()
  WHERE id = p_match_id;

  UPDATE public.match_court_offers
  SET
    status = CASE
      WHEN id = p_offer_id THEN 'selected'
      WHEN status = 'released' THEN status
      ELSE 'not_selected'
    END,
    updated_at = now()
  WHERE match_id = p_match_id;

  DELETE FROM public.match_courts
  WHERE match_id = p_match_id;

  INSERT INTO public.match_courts (
    match_id,
    slot_index,
    court_label,
    created_by
  ) VALUES (
    p_match_id,
    1,
    v_offer.court_label,
    v_uid
  );
END;
$$;

ALTER FUNCTION public.rpc_match_court_select_offer(uuid, uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.rpc_match_court_select_offer(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_court_select_offer(uuid, uuid) TO service_role;

ALTER TABLE public.match_court_volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_court_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_court_volunteers_select ON public.match_court_volunteers;
CREATE POLICY match_court_volunteers_select
ON public.match_court_volunteers
FOR SELECT
TO authenticated
USING (
  public.is_match_organizer(match_id, auth.uid())
  OR public.is_caller_in_match_scope(match_id)
  OR public.is_caller_match_associated(match_id)
);

DROP POLICY IF EXISTS match_court_volunteers_insert_self ON public.match_court_volunteers;
CREATE POLICY match_court_volunteers_insert_self
ON public.match_court_volunteers
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_match_court_helper_eligible(match_id, auth.uid())
);

DROP POLICY IF EXISTS match_court_volunteers_update_self ON public.match_court_volunteers;
CREATE POLICY match_court_volunteers_update_self
ON public.match_court_volunteers
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_match_court_helper_eligible(match_id, auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  AND public.is_match_court_helper_eligible(match_id, auth.uid())
);

DROP POLICY IF EXISTS match_court_offers_select ON public.match_court_offers;
CREATE POLICY match_court_offers_select
ON public.match_court_offers
FOR SELECT
TO authenticated
USING (
  public.is_match_organizer(match_id, auth.uid())
  OR public.is_caller_in_match_scope(match_id)
  OR public.is_caller_match_associated(match_id)
);

DROP POLICY IF EXISTS match_court_offers_insert_self ON public.match_court_offers;
CREATE POLICY match_court_offers_insert_self
ON public.match_court_offers
FOR INSERT
TO authenticated
WITH CHECK (
  volunteer_user_id = auth.uid()
  AND public.is_match_court_helper_eligible(match_id, auth.uid())
);

DROP POLICY IF EXISTS match_court_offers_update_self ON public.match_court_offers;
CREATE POLICY match_court_offers_update_self
ON public.match_court_offers
FOR UPDATE
TO authenticated
USING (
  volunteer_user_id = auth.uid()
  OR public.is_match_organizer(match_id, auth.uid())
)
WITH CHECK (
  volunteer_user_id = auth.uid()
  OR public.is_match_organizer(match_id, auth.uid())
);

GRANT ALL ON TABLE public.match_court_volunteers TO anon;
GRANT ALL ON TABLE public.match_court_volunteers TO authenticated;
GRANT ALL ON TABLE public.match_court_volunteers TO service_role;

GRANT ALL ON TABLE public.match_court_offers TO anon;
GRANT ALL ON TABLE public.match_court_offers TO authenticated;
GRANT ALL ON TABLE public.match_court_offers TO service_role;
