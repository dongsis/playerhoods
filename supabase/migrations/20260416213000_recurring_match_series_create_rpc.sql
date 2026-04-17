DROP FUNCTION IF EXISTS public.rpc_recurring_match_series_create(
  text,
  smallint,
  uuid,
  text,
  text,
  integer,
  integer,
  date,
  time,
  integer,
  text,
  text,
  uuid[],
  uuid[],
  integer
);

CREATE OR REPLACE FUNCTION public.rpc_recurring_match_series_create(
  p_name text,
  p_sport_id smallint,
  p_venue_id uuid DEFAULT NULL,
  p_game_type text DEFAULT NULL,
  p_doubles_format text DEFAULT NULL,
  p_required_count integer DEFAULT 4,
  p_required_court_count integer DEFAULT 1,
  p_start_date date DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_court_plan_mode text DEFAULT 'self_book_later',
  p_organizer_note text DEFAULT NULL,
  p_invitation_scope_group_ids uuid[] DEFAULT '{}'::uuid[],
  p_invitation_scope_user_ids uuid[] DEFAULT '{}'::uuid[],
  p_weeks_ahead_count integer DEFAULT 4
)
RETURNS public.recurring_match_series
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_series public.recurring_match_series;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'series_name_required';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'start_date_required';
  END IF;

  IF p_required_count IS NULL OR p_required_count < 1 THEN
    RAISE EXCEPTION 'invalid_required_count';
  END IF;

  IF p_required_court_count IS NULL OR p_required_court_count < 1 THEN
    RAISE EXCEPTION 'invalid_required_court_count';
  END IF;

  IF p_weeks_ahead_count IS NULL OR p_weeks_ahead_count < 1 OR p_weeks_ahead_count > 12 THEN
    RAISE EXCEPTION 'invalid_weeks_ahead_count';
  END IF;

  INSERT INTO public.recurring_match_series (
    organizer_id,
    name,
    sport_id,
    venue_id,
    game_type,
    doubles_format,
    required_count,
    required_court_count,
    match_weekday,
    start_date,
    start_time,
    duration_minutes,
    court_plan_mode,
    organizer_note,
    invitation_scope_group_ids,
    invitation_scope_user_ids,
    weeks_ahead_count
  )
  VALUES (
    v_actor_id,
    btrim(p_name),
    p_sport_id,
    p_venue_id,
    NULLIF(btrim(COALESCE(p_game_type, '')), ''),
    NULLIF(btrim(COALESCE(p_doubles_format, '')), ''),
    p_required_count,
    p_required_court_count,
    EXTRACT(DOW FROM p_start_date)::smallint,
    p_start_date,
    p_start_time,
    p_duration_minutes,
    COALESCE(NULLIF(btrim(COALESCE(p_court_plan_mode, '')), ''), 'self_book_later'),
    NULLIF(btrim(COALESCE(p_organizer_note, '')), ''),
    COALESCE(p_invitation_scope_group_ids, '{}'::uuid[]),
    COALESCE(p_invitation_scope_user_ids, '{}'::uuid[]),
    p_weeks_ahead_count
  )
  RETURNING * INTO v_series;

  RETURN v_series;
END;
$$;

ALTER FUNCTION public.rpc_recurring_match_series_create(
  text,
  smallint,
  uuid,
  text,
  text,
  integer,
  integer,
  date,
  time,
  integer,
  text,
  text,
  uuid[],
  uuid[],
  integer
) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_recurring_match_series_create(
  text,
  smallint,
  uuid,
  text,
  text,
  integer,
  integer,
  date,
  time,
  integer,
  text,
  text,
  uuid[],
  uuid[],
  integer
) IS 'Create a recurring match series using the caller as organizer. Security-definer wrapper around recurring_match_series insert.';

GRANT ALL ON FUNCTION public.rpc_recurring_match_series_create(
  text,
  smallint,
  uuid,
  text,
  text,
  integer,
  integer,
  date,
  time,
  integer,
  text,
  text,
  uuid[],
  uuid[],
  integer
) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_recurring_match_series_create(
  text,
  smallint,
  uuid,
  text,
  text,
  integer,
  integer,
  date,
  time,
  integer,
  text,
  text,
  uuid[],
  uuid[],
  integer
) TO service_role;
