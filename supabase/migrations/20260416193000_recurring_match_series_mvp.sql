CREATE TABLE IF NOT EXISTS public.recurring_match_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  sport_id smallint NOT NULL DEFAULT 1 REFERENCES public.sports(id),
  venue_id uuid NULL REFERENCES public.venues(id) ON DELETE SET NULL,
  game_type text NULL,
  doubles_format text NULL,
  required_count integer NOT NULL DEFAULT 4,
  required_court_count integer NOT NULL DEFAULT 1,
  match_weekday smallint NOT NULL CHECK (match_weekday BETWEEN 0 AND 6),
  start_date date NOT NULL,
  start_time time NULL,
  duration_minutes integer NULL,
  court_plan_mode text NOT NULL DEFAULT 'self_book_later',
  organizer_note text NULL,
  invitation_scope_group_ids uuid[] NOT NULL DEFAULT '{}',
  invitation_scope_user_ids uuid[] NOT NULL DEFAULT '{}',
  weeks_ahead_count integer NOT NULL DEFAULT 4 CHECK (weeks_ahead_count BETWEEN 1 AND 12),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS recurring_series_id uuid NULL REFERENCES public.recurring_match_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurring_instance_index integer NULL;

CREATE INDEX IF NOT EXISTS idx_matches_recurring_series_id
  ON public.matches (recurring_series_id, match_date);

CREATE OR REPLACE FUNCTION public.can_access_recurring_match_series(
  p_series_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.recurring_match_series rms
      WHERE rms.id = p_series_id
        AND rms.organizer_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      LEFT JOIN public.match_participants mp
        ON mp.match_id = m.id
       AND mp.user_id = p_user_id
       AND mp.removed_at IS NULL
       AND mp.status IN ('pending', 'confirmed', 'waiting_list')
      WHERE m.recurring_series_id = p_series_id
        AND (
          m.organizer_id = p_user_id
          OR mp.id IS NOT NULL
        )
    );
$$;

ALTER FUNCTION public.can_access_recurring_match_series(uuid, uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.can_access_recurring_match_series(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_recurring_match_series(uuid, uuid) TO service_role;

ALTER TABLE public.recurring_match_series ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recurring_match_series'
      AND policyname = 'recurring_match_series_select_v1'
  ) THEN
    CREATE POLICY recurring_match_series_select_v1
      ON public.recurring_match_series
      FOR SELECT
      TO authenticated
      USING (public.can_access_recurring_match_series(id, auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recurring_match_series'
      AND policyname = 'recurring_match_series_insert_v1'
  ) THEN
    CREATE POLICY recurring_match_series_insert_v1
      ON public.recurring_match_series
      FOR INSERT
      TO authenticated
      WITH CHECK (organizer_id = auth.uid());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recurring_match_series'
      AND policyname = 'recurring_match_series_update_v1'
  ) THEN
    CREATE POLICY recurring_match_series_update_v1
      ON public.recurring_match_series
      FOR UPDATE
      TO authenticated
      USING (organizer_id = auth.uid())
      WITH CHECK (organizer_id = auth.uid());
  END IF;
END
$$;

GRANT ALL ON TABLE public.recurring_match_series TO authenticated;
GRANT ALL ON TABLE public.recurring_match_series TO service_role;
