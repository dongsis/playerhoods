import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, UserSportProfile } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type PublicSportProfile = {
  sport_id: number
  sport_code: string
  sport_name: string
  level: string | null
  years_playing: number | null
  preferred_formats: string[]
  current_frequency: string | null
  play_style: string | null
  competition_experience: string | null
  teams_played_on: string | null
  line_played: string | null
  highlights: string | null
  gear_primary: string | null
  gear_secondary: string | null
  gear_shoes: string | null
}

export type PublicPlayerProfile = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  gender: 'male' | 'female' | 'unspecified' | null
  looking_to_play: string | null
  preferred_play_times: string[]
  sport_profiles: PublicSportProfile[]
  shared_venue_names: string[]
  shared_group_names: string[]
  shared_match_count: number
}

export type SaveSportProfileInput = {
  sport_id: number
  level?: string | null
  years_playing?: number | null
  preferred_formats?: string[]
  current_frequency?: string | null
  play_style?: string | null
  competition_experience?: string | null
  teams_played_on?: string | null
  line_played?: string | null
  highlights?: string | null
  gear_primary?: string | null
  gear_secondary?: string | null
  gear_shoes?: string | null
}

function normalizePublicSportProfiles(value: unknown): PublicSportProfile[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      sport_id: Number(item.sport_id ?? 0),
      sport_code: typeof item.sport_code === 'string' ? item.sport_code : '',
      sport_name: typeof item.sport_name === 'string' ? item.sport_name : '',
      level: typeof item.level === 'string' ? item.level : null,
      years_playing: typeof item.years_playing === 'number' ? item.years_playing : null,
      preferred_formats: Array.isArray(item.preferred_formats)
        ? item.preferred_formats.filter((value): value is string => typeof value === 'string')
        : [],
      current_frequency: typeof item.current_frequency === 'string' ? item.current_frequency : null,
      play_style: typeof item.play_style === 'string' ? item.play_style : null,
      competition_experience:
        typeof item.competition_experience === 'string' ? item.competition_experience : null,
      teams_played_on: typeof item.teams_played_on === 'string' ? item.teams_played_on : null,
      line_played: typeof item.line_played === 'string' ? item.line_played : null,
      highlights: typeof item.highlights === 'string' ? item.highlights : null,
      gear_primary: typeof item.gear_primary === 'string' ? item.gear_primary : null,
      gear_secondary: typeof item.gear_secondary === 'string' ? item.gear_secondary : null,
      gear_shoes: typeof item.gear_shoes === 'string' ? item.gear_shoes : null,
    }))
    .filter((item) => item.sport_id > 0 && item.sport_code.length > 0)
}

export async function getMySportProfiles(
  supabase: Client,
  userId: string,
): Promise<UserSportProfile[]> {
  const { data, error } = await supabase
    .from('user_sport_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('sport_id', { ascending: true })

  if (error) throw error
  return (data ?? []) as UserSportProfile[]
}

export async function saveMySportProfile(
  supabase: Client,
  input: SaveSportProfileInput,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_user_sport_profile_upsert', {
    p_sport_id: input.sport_id,
    p_level: input.level ?? null,
    p_years_playing: input.years_playing ?? null,
    p_preferred_formats: input.preferred_formats ?? [],
    p_current_frequency: input.current_frequency ?? null,
    p_play_style: input.play_style ?? null,
    p_competition_experience: input.competition_experience ?? null,
    p_teams_played_on: input.teams_played_on ?? null,
    p_line_played: input.line_played ?? null,
    p_highlights: input.highlights ?? null,
    p_gear_primary: input.gear_primary ?? null,
    p_gear_secondary: input.gear_secondary ?? null,
    p_gear_shoes: input.gear_shoes ?? null,
  })

  if (error) throw error
}

export async function getPublicPlayerProfile(
  supabase: Client,
  targetUserId: string,
): Promise<PublicPlayerProfile | null> {
  const { data, error } = await supabase.rpc('rpc_player_profile_get', {
    p_target_user_id: targetUserId,
  })

  if (error) throw error

  const row = (data ?? [])[0] as Database['public']['Functions']['rpc_player_profile_get']['Returns'][number] | undefined
  if (!row) return null

  return {
    user_id: row.user_id,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    gender: row.gender ?? null,
    looking_to_play: row.looking_to_play ?? null,
    preferred_play_times: row.preferred_play_times ?? [],
    sport_profiles: normalizePublicSportProfiles(row.sport_profiles),
    shared_venue_names: row.shared_venue_names ?? [],
    shared_group_names: row.shared_group_names ?? [],
    shared_match_count: row.shared_match_count ?? 0,
  }
}
