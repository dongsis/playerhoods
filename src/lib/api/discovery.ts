import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, LookupVisibility, UserPlayCity } from '@/lib/types/database'

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
  primary_sport: string | null
  visibility: Exclude<LookupVisibility, 'none'>
  is_saved: boolean
  can_add: boolean
  can_request_add: boolean
  can_invite: boolean
  request_status: string | null
  next_eligible_at: string | null
}

export type SaveRequestResult = {
  request_id: string | null
  status: string
  next_eligible_at: string | null
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
  // App-level code should use "Exact Email / Phone Search" terminology.
  const { data, error } = await supabase.rpc('rpc_player_search_by_contact_info', {
    p_query: query,
  })
  if (error) throw error

  return ((data ?? []) as Database['public']['Functions']['rpc_player_search_by_contact_info']['Returns']).map((row) => ({
    user_id: row.user_id,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    primary_sport: row.primary_sport ?? null,
    visibility: row.visibility === 'requestable' ? 'requestable' : 'visible',
    is_saved: row.is_saved,
    can_add: row.can_add,
    can_request_add: row.can_request_add,
    can_invite: row.can_invite,
    request_status: row.request_status ?? null,
    next_eligible_at: row.next_eligible_at ?? null,
  }))
}

export async function sendUserSaveRequest(
  supabase: Client,
  targetUserId: string,
  source = 'contact_lookup',
): Promise<SaveRequestResult> {
  const { data, error } = await supabase.rpc('rpc_user_save_request_create', {
    p_target_user_id: targetUserId,
    p_source: source,
  })
  if (error) throw error

  const row = ((data ?? []) as Database['public']['Functions']['rpc_user_save_request_create']['Returns'])[0]
  return {
    request_id: row?.request_id ?? null,
    status: row?.status ?? 'pending',
    next_eligible_at: row?.next_eligible_at ?? null,
  }
}
