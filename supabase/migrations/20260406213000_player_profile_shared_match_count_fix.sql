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
    SELECT COUNT(DISTINCT mp_self.match_id)::integer AS match_count
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
    COALESCE((SELECT sm.match_count FROM shared_matches sm), 0) AS shared_match_count
  FROM target_profile tp;
END;
$$;

ALTER FUNCTION public.rpc_player_profile_get(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_player_profile_get(uuid)
IS 'Returns the caller-facing public player profile plus natural shared-connection signals. Does not expose private saved-player logic.';

GRANT ALL ON FUNCTION public.rpc_player_profile_get(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_player_profile_get(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_player_profile_get(uuid) TO service_role;
