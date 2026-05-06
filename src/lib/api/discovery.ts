import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, UserPlayCity } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type CityDiscoveryRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  shared_city_names: string[]
  is_saved: boolean
}

export type EmailOrPhoneSearchRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  match_type: 'email' | 'phone'
  is_saved: boolean
}

export async function getMyPlayCities(
  supabase: Client,
  userId: string,
): Promise<UserPlayCity[]> {
  const { data, error } = await supabase
    .from('user_play_cities')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as UserPlayCity[]
}

export async function replaceMyPlayCities(
  supabase: Client,
  cities: Array<{ city_name: string; region?: string | null; country?: string | null }>,
): Promise<void> {
  const payload = cities.map((city) => ({
    city_name: city.city_name,
    region: city.region ?? null,
    country: city.country ?? null,
  }))

  const { error } = await supabase.rpc('rpc_user_play_cities_replace', {
    p_cities: payload,
  })
  if (error) throw error
}

export async function getCityPlayersDiscovery(
  supabase: Client,
  city: string,
  search?: string | null,
): Promise<CityDiscoveryRow[]> {
  const { data, error } = await supabase.rpc('rpc_city_players_discovery', {
    p_city: city,
    p_search: search ?? null,
  })
  if (error) throw error

  return ((data ?? []) as Database['public']['Functions']['rpc_city_players_discovery']['Returns']).map((row) => ({
    user_id: row.user_id,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    shared_city_names: row.shared_city_names ?? [],
    is_saved: row.is_saved,
  }))
}

export async function searchPlayersByEmailOrPhone(
  supabase: Client,
  query: string,
): Promise<EmailOrPhoneSearchRow[]> {
  // Legacy RPC name is still rpc_player_search_by_contact_info.
  // App-level code should use "Email / Phone Search" terminology.
  const { data, error } = await supabase.rpc('rpc_player_search_by_contact_info', {
    p_query: query,
  })
  if (error) throw error

  return ((data ?? []) as Database['public']['Functions']['rpc_player_search_by_contact_info']['Returns']).map((row) => ({
    user_id: row.user_id,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    match_type: row.match_type === 'phone' ? 'phone' : 'email',
    is_saved: row.is_saved,
  }))
}
