import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Sport, UserSport } from '@/lib/types/database'

type Client = SupabaseClient<Database>

/** List active sports (dictionary). */
export async function listSports(supabase: Client): Promise<Sport[]> {
  const { data, error } = await supabase.rpc('rpc_sports_list')
  if (error) throw error
  return (data ?? []) as Sport[]
}

/** Overwrite current user's sport preferences by code list. */
export async function setUserSports(supabase: Client, sportCodes: string[]): Promise<void> {
  const { error } = await supabase.rpc('rpc_user_sports_set', { p_sport_codes: sportCodes })
  if (error) throw error
}

/** Overwrite a guest's sport tags by code list (creator only). */
export async function setGuestSports(supabase: Client, guestId: string, sportCodes: string[]): Promise<void> {
  const { error } = await supabase.rpc('rpc_guest_sports_set', { p_guest_id: guestId, p_sport_codes: sportCodes })
  if (error) throw error
}

/** Get current user's sport preferences. RLS enforces user_id=auth.uid(). */
export async function getMySports(supabase: Client): Promise<UserSport[]> {
  const { data, error } = await supabase.from('user_sports').select('*')
  if (error) throw error
  return (data ?? []) as UserSport[]
}
