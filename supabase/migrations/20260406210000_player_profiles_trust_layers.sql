ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS looking_to_play text,
  ADD COLUMN IF NOT EXISTS preferred_play_times text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.looking_to_play
IS 'Lightweight openness signal for new games. UI label: Looking to play.';

COMMENT ON COLUMN public.profiles.preferred_play_times
IS 'Lightweight time-window preferences. UI label: Preferred times.';

CREATE TABLE IF NOT EXISTS public.user_sport_profiles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_id smallint NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  level text,
  years_playing smallint,
  preferred_formats text[] NOT NULL DEFAULT '{}'::text[],
  current_frequency text,
  play_style text,
  competition_experience text,
  teams_played_on text,
  line_played text,
  highlights text,
  gear_primary text,
  gear_secondary text,
  gear_shoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_sport_profiles_pkey PRIMARY KEY (user_id, sport_id),
  CONSTRAINT user_sport_profiles_years_playing_check
    CHECK (years_playing IS NULL OR (years_playing >= 0 AND years_playing <= 80))
);

COMMENT ON TABLE public.user_sport_profiles
IS 'Per-sport social playing profile for a registered user. Keeps sport-specific trust and matchmaking details out of the shared profile layer.';

COMMENT ON COLUMN public.user_sport_profiles.level
IS 'Sport-specific level only. Keep line/teams in competition fields.';

COMMENT ON COLUMN public.user_sport_profiles.preferred_formats
IS 'Sport-specific preferred formats such as singles, doubles, or mixed.';

COMMENT ON COLUMN public.user_sport_profiles.current_frequency
IS 'Lightweight frequency signal such as weekly or multiple_times_a_week.';

COMMENT ON COLUMN public.user_sport_profiles.play_style
IS 'Optional social/freeform playing style note.';

CREATE INDEX IF NOT EXISTS idx_user_sport_profiles_sport
  ON public.user_sport_profiles (sport_id);

CREATE INDEX IF NOT EXISTS idx_user_sport_profiles_user
  ON public.user_sport_profiles (user_id);

ALTER TABLE public.user_sport_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sport_profiles'
      AND policyname = 'user_sport_profiles_select_own'
  ) THEN
    CREATE POLICY user_sport_profiles_select_own
      ON public.user_sport_profiles
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sport_profiles'
      AND policyname = 'user_sport_profiles_insert_own'
  ) THEN
    CREATE POLICY user_sport_profiles_insert_own
      ON public.user_sport_profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sport_profiles'
      AND policyname = 'user_sport_profiles_update_own'
  ) THEN
    CREATE POLICY user_sport_profiles_update_own
      ON public.user_sport_profiles
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sport_profiles'
      AND policyname = 'user_sport_profiles_delete_own'
  ) THEN
    CREATE POLICY user_sport_profiles_delete_own
      ON public.user_sport_profiles
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

GRANT ALL ON TABLE public.user_sport_profiles TO anon;
GRANT ALL ON TABLE public.user_sport_profiles TO authenticated;
GRANT ALL ON TABLE public.user_sport_profiles TO service_role;

DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text);
DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text, text, text, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.rpc_profile_update(
  p_first_name text DEFAULT NULL::text,
  p_last_name text DEFAULT NULL::text,
  p_contact_channel text DEFAULT NULL::text,
  p_contact_email text DEFAULT NULL::text,
  p_contact_phone text DEFAULT NULL::text,
  p_show_in_venue_member_discovery boolean DEFAULT NULL::boolean,
  p_allow_non_group_invites boolean DEFAULT NULL::boolean,
  p_looking_to_play text DEFAULT NULL::text,
  p_preferred_play_times text[] DEFAULT NULL::text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_preferred_play_times text[] := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_looking_to_play IS NOT NULL
    AND NULLIF(trim(p_looking_to_play), '') IS NOT NULL
    AND trim(p_looking_to_play) NOT IN (
      'very_open',
      'open',
      'occasional',
      'quite_full',
      'not_looking'
    ) THEN
    RAISE EXCEPTION 'invalid_looking_to_play';
  END IF;

  IF p_preferred_play_times IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_preferred_play_times) AS raw_value
    WHERE NULLIF(trim(raw_value), '') IS NOT NULL
      AND trim(raw_value) NOT IN (
        'weekday_mornings',
        'weekday_afternoons',
        'weekday_evenings',
        'saturday_mornings',
        'saturday_afternoons',
        'sunday_mornings',
        'sunday_afternoons',
        'flexible'
      )
  ) THEN
    RAISE EXCEPTION 'invalid_preferred_play_times';
  END IF;

  IF p_preferred_play_times IS NOT NULL THEN
    SELECT COALESCE(array_agg(value ORDER BY value), '{}'::text[])
      INTO v_preferred_play_times
    FROM (
      SELECT DISTINCT trim(raw_value) AS value
      FROM unnest(p_preferred_play_times) AS raw_value
      WHERE NULLIF(trim(raw_value), '') IS NOT NULL
    ) deduped;
  END IF;

  UPDATE public.profiles
  SET
    first_name = CASE WHEN p_first_name IS NOT NULL THEN NULLIF(trim(p_first_name), '') ELSE first_name END,
    last_name = CASE WHEN p_last_name IS NOT NULL THEN NULLIF(trim(p_last_name), '') ELSE last_name END,
    contact_channel = CASE WHEN p_contact_channel IN ('email', 'sms') THEN p_contact_channel ELSE contact_channel END,
    contact_email = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(trim(p_contact_email), '') ELSE contact_email END,
    contact_phone = CASE WHEN p_contact_phone IS NOT NULL THEN NULLIF(trim(p_contact_phone), '') ELSE contact_phone END,
    show_in_venue_member_discovery = CASE
      WHEN p_show_in_venue_member_discovery IS NOT NULL THEN p_show_in_venue_member_discovery
      ELSE show_in_venue_member_discovery
    END,
    allow_non_group_invites = CASE
      WHEN p_allow_non_group_invites IS NOT NULL THEN p_allow_non_group_invites
      ELSE allow_non_group_invites
    END,
    looking_to_play = CASE
      WHEN p_looking_to_play IS NOT NULL THEN NULLIF(trim(p_looking_to_play), '')
      ELSE looking_to_play
    END,
    preferred_play_times = CASE
      WHEN p_preferred_play_times IS NOT NULL THEN v_preferred_play_times
      ELSE preferred_play_times
    END,
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

ALTER FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[]) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[])
IS 'Canonical profile update RPC. Includes contact preferences, global discovery/invite switches, and shared trust-building profile fields.';

GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[]) TO anon;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[]) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_user_sport_profile_upsert(
  p_sport_id smallint,
  p_level text DEFAULT NULL::text,
  p_years_playing smallint DEFAULT NULL::smallint,
  p_preferred_formats text[] DEFAULT NULL::text[],
  p_current_frequency text DEFAULT NULL::text,
  p_play_style text DEFAULT NULL::text,
  p_competition_experience text DEFAULT NULL::text,
  p_teams_played_on text DEFAULT NULL::text,
  p_line_played text DEFAULT NULL::text,
  p_highlights text DEFAULT NULL::text,
  p_gear_primary text DEFAULT NULL::text,
  p_gear_secondary text DEFAULT NULL::text,
  p_gear_shoes text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_preferred_formats text[] := '{}'::text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sports WHERE id = p_sport_id AND is_active = true) THEN
    RAISE EXCEPTION 'sport_not_found';
  END IF;

  IF p_years_playing IS NOT NULL AND (p_years_playing < 0 OR p_years_playing > 80) THEN
    RAISE EXCEPTION 'invalid_years_playing';
  END IF;

  IF p_current_frequency IS NOT NULL
    AND NULLIF(trim(p_current_frequency), '') IS NOT NULL
    AND trim(p_current_frequency) NOT IN (
      'occasionally',
      'few_times_a_month',
      'weekly',
      'multiple_times_a_week'
    ) THEN
    RAISE EXCEPTION 'invalid_current_frequency';
  END IF;

  IF p_preferred_formats IS NOT NULL THEN
    SELECT COALESCE(array_agg(value ORDER BY value), '{}'::text[])
      INTO v_preferred_formats
    FROM (
      SELECT DISTINCT trim(raw_value) AS value
      FROM unnest(p_preferred_formats) AS raw_value
      WHERE NULLIF(trim(raw_value), '') IS NOT NULL
    ) deduped;
  END IF;

  INSERT INTO public.user_sport_profiles (
    user_id,
    sport_id,
    level,
    years_playing,
    preferred_formats,
    current_frequency,
    play_style,
    competition_experience,
    teams_played_on,
    line_played,
    highlights,
    gear_primary,
    gear_secondary,
    gear_shoes,
    updated_at
  ) VALUES (
    auth.uid(),
    p_sport_id,
    NULLIF(trim(p_level), ''),
    p_years_playing,
    v_preferred_formats,
    NULLIF(trim(p_current_frequency), ''),
    NULLIF(trim(p_play_style), ''),
    NULLIF(trim(p_competition_experience), ''),
    NULLIF(trim(p_teams_played_on), ''),
    NULLIF(trim(p_line_played), ''),
    NULLIF(trim(p_highlights), ''),
    NULLIF(trim(p_gear_primary), ''),
    NULLIF(trim(p_gear_secondary), ''),
    NULLIF(trim(p_gear_shoes), ''),
    now()
  )
  ON CONFLICT (user_id, sport_id)
  DO UPDATE SET
    level = EXCLUDED.level,
    years_playing = EXCLUDED.years_playing,
    preferred_formats = EXCLUDED.preferred_formats,
    current_frequency = EXCLUDED.current_frequency,
    play_style = EXCLUDED.play_style,
    competition_experience = EXCLUDED.competition_experience,
    teams_played_on = EXCLUDED.teams_played_on,
    line_played = EXCLUDED.line_played,
    highlights = EXCLUDED.highlights,
    gear_primary = EXCLUDED.gear_primary,
    gear_secondary = EXCLUDED.gear_secondary,
    gear_shoes = EXCLUDED.gear_shoes,
    updated_at = now();
END;
$$;

ALTER FUNCTION public.rpc_user_sport_profile_upsert(smallint, text, smallint, text[], text, text, text, text, text, text, text, text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_user_sport_profile_upsert(smallint, text, smallint, text[], text, text, text, text, text, text, text, text, text)
IS 'Upsert the caller''s per-sport social profile details.';

GRANT ALL ON FUNCTION public.rpc_user_sport_profile_upsert(smallint, text, smallint, text[], text, text, text, text, text, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_user_sport_profile_upsert(smallint, text, smallint, text[], text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_user_sport_profile_upsert(smallint, text, smallint, text[], text, text, text, text, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_player_profile_get(
  p_target_user_id uuid
) RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  looking_to_play text,
  preferred_play_times text[],
  sport_profiles jsonb,
  shared_venue_names text[],
  shared_group_names text[],
  shared_match_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  RETURN QUERY
  WITH target_profile AS (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.looking_to_play,
      p.preferred_play_times
    FROM public.profiles p
    WHERE p.id = p_target_user_id
  ),
  sport_rows AS (
    SELECT
      s.id AS sport_id,
      s.code AS sport_code,
      s.display_name AS sport_name,
      usp.level,
      usp.years_playing,
      COALESCE(usp.preferred_formats, '{}'::text[]) AS preferred_formats,
      usp.current_frequency,
      usp.play_style,
      usp.competition_experience,
      usp.teams_played_on,
      usp.line_played,
      usp.highlights,
      usp.gear_primary,
      usp.gear_secondary,
      usp.gear_shoes
    FROM public.user_sports us
    JOIN public.sports s
      ON s.id = us.sport_id
    LEFT JOIN public.user_sport_profiles usp
      ON usp.user_id = us.user_id
     AND usp.sport_id = us.sport_id
    WHERE us.user_id = p_target_user_id
    ORDER BY s.id
  ),
  shared_venues AS (
    SELECT DISTINCT v.name
    FROM public.venue_identities self_vi
    JOIN public.venue_identities target_vi
      ON target_vi.venue_id = self_vi.venue_id
    JOIN public.venues v
      ON v.id = self_vi.venue_id
    WHERE self_vi.user_id = auth.uid()
      AND target_vi.user_id = p_target_user_id
  ),
  shared_groups AS (
    SELECT DISTINCT g.name
    FROM public.group_members gm_self
    JOIN public.group_members gm_target
      ON gm_target.group_id = gm_self.group_id
    JOIN public.groups g
      ON g.id = gm_self.group_id
    WHERE gm_self.user_id = auth.uid()
      AND gm_self.status = 'active'
      AND gm_self.accepted_at IS NOT NULL
      AND gm_self.removed_at IS NULL
      AND gm_target.user_id = p_target_user_id
      AND gm_target.status = 'active'
      AND gm_target.accepted_at IS NOT NULL
      AND gm_target.removed_at IS NULL
  ),
  shared_matches AS (
    SELECT COUNT(DISTINCT mp_self.match_id)::integer AS shared_match_count
    FROM public.match_participants mp_self
    JOIN public.match_participants mp_target
      ON mp_target.match_id = mp_self.match_id
    WHERE mp_self.user_id = auth.uid()
      AND mp_target.user_id = p_target_user_id
      AND mp_self.status <> 'removed'
      AND mp_target.status <> 'removed'
  )
  SELECT
    tp.id AS user_id,
    tp.display_name,
    tp.avatar_url,
    tp.looking_to_play,
    COALESCE(tp.preferred_play_times, '{}'::text[]) AS preferred_play_times,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'sport_id', sr.sport_id,
            'sport_code', sr.sport_code,
            'sport_name', sr.sport_name,
            'level', sr.level,
            'years_playing', sr.years_playing,
            'preferred_formats', sr.preferred_formats,
            'current_frequency', sr.current_frequency,
            'play_style', sr.play_style,
            'competition_experience', sr.competition_experience,
            'teams_played_on', sr.teams_played_on,
            'line_played', sr.line_played,
            'highlights', sr.highlights,
            'gear_primary', sr.gear_primary,
            'gear_secondary', sr.gear_secondary,
            'gear_shoes', sr.gear_shoes
          )
          ORDER BY sr.sport_id
        )
        FROM sport_rows sr
      ),
      '[]'::jsonb
    ) AS sport_profiles,
    COALESCE((SELECT array_agg(name ORDER BY name) FROM shared_venues), '{}'::text[]) AS shared_venue_names,
    COALESCE((SELECT array_agg(name ORDER BY name) FROM shared_groups), '{}'::text[]) AS shared_group_names,
    COALESCE((SELECT shared_match_count FROM shared_matches), 0) AS shared_match_count
  FROM target_profile tp;
END;
$$;

ALTER FUNCTION public.rpc_player_profile_get(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_player_profile_get(uuid)
IS 'Returns the caller-facing public player profile plus natural shared-connection signals. Does not expose private saved-player logic.';

GRANT ALL ON FUNCTION public.rpc_player_profile_get(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_player_profile_get(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_player_profile_get(uuid) TO service_role;
