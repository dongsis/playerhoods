BEGIN;

-- ============================================================================
-- 1) user_sports
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_sports (
  user_id   uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_id  smallint NOT NULL REFERENCES public.sports(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sport_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sports_user
  ON public.user_sports(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sports_sport
  ON public.user_sports(sport_id);

ALTER TABLE public.user_sports ENABLE ROW LEVEL SECURITY;

-- owner can read their rows
DROP POLICY IF EXISTS user_sports_select_own ON public.user_sports;
CREATE POLICY user_sports_select_own
ON public.user_sports
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- owner can write their rows (direct write is OK; or you can keep RPC-only later)
DROP POLICY IF EXISTS user_sports_write_own ON public.user_sports;
CREATE POLICY user_sports_write_own
ON public.user_sports
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_sports_delete_own ON public.user_sports;
CREATE POLICY user_sports_delete_own
ON public.user_sports
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- 2) guest_sports
--    Contact Player sports tags
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guest_sports (
  guest_id  uuid     NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  sport_id  smallint NOT NULL REFERENCES public.sports(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, sport_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_sports_guest
  ON public.guest_sports(guest_id);

CREATE INDEX IF NOT EXISTS idx_guest_sports_sport
  ON public.guest_sports(sport_id);

ALTER TABLE public.guest_sports ENABLE ROW LEVEL SECURITY;

-- Read: authenticated can read (used for filtering invite candidates)
DROP POLICY IF EXISTS guest_sports_select_all_auth ON public.guest_sports;
CREATE POLICY guest_sports_select_all_auth
ON public.guest_sports
FOR SELECT
TO authenticated
USING (true);

-- Write: only the guest creator can manage tags
-- (guests.created_by is NOT NULL in your schema)
DROP POLICY IF EXISTS guest_sports_write_by_creator ON public.guest_sports;
CREATE POLICY guest_sports_write_by_creator
ON public.guest_sports
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = guest_id
      AND g.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS guest_sports_delete_by_creator ON public.guest_sports;
CREATE POLICY guest_sports_delete_by_creator
ON public.guest_sports
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = guest_id
      AND g.created_by = auth.uid()
  )
);

-- ============================================================================
-- 3) RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_sports_list()
RETURNS SETOF public.sports
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.sports
  WHERE is_active = true
  ORDER BY id;
$$;

-- Overwrite current user's sports by codes[]
CREATE OR REPLACE FUNCTION public.rpc_user_sports_set(p_sport_codes text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids smallint[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT array_agg(s.id ORDER BY s.id)
  INTO v_ids
  FROM public.sports s
  WHERE s.is_active = true
    AND s.code = ANY(p_sport_codes);

  -- Clear existing
  DELETE FROM public.user_sports
  WHERE user_id = auth.uid();

  -- Insert new (ignore null/empty)
  IF v_ids IS NOT NULL THEN
    INSERT INTO public.user_sports(user_id, sport_id)
    SELECT auth.uid(), unnest(v_ids);
  END IF;
END;
$$;

-- Overwrite a guest's sports by codes[] (only guest creator)
CREATE OR REPLACE FUNCTION public.rpc_guest_sports_set(
  p_guest_id uuid,
  p_sport_codes text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids smallint[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = p_guest_id
      AND g.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_guest_creator';
  END IF;

  SELECT array_agg(s.id ORDER BY s.id)
  INTO v_ids
  FROM public.sports s
  WHERE s.is_active = true
    AND s.code = ANY(p_sport_codes);

  DELETE FROM public.guest_sports
  WHERE guest_id = p_guest_id;

  IF v_ids IS NOT NULL THEN
    INSERT INTO public.guest_sports(guest_id, sport_id)
    SELECT p_guest_id, unnest(v_ids);
  END IF;
END;
$$;

-- ============================================================================
-- 4) Grants
-- ============================================================================
GRANT SELECT ON public.user_sports TO authenticated;
GRANT SELECT ON public.guest_sports TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_sports_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_user_sports_set(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_guest_sports_set(uuid, text[]) TO authenticated;

COMMIT;