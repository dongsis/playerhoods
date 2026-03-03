import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Guest } from '@/lib/types/database'

type Client = SupabaseClient<Database>

/** List caller's Personal Roster (favorites). Returns active guests only. */
export async function listRosterGuests(supabase: Client): Promise<Guest[]> {
  const { data, error } = await supabase.rpc('rpc_roster_guest_list')
  if (error) throw error
  return (data ?? []) as Guest[]
}

/** Create a Contact Player and auto-bookmark in caller's roster. */
export async function createRosterGuest(
  supabase: Client,
  params: {
    display_name: string
    email?: string | null
    phone?: string | null
    notes?: string | null
  }
): Promise<Guest> {
  const { data, error } = await supabase.rpc('rpc_roster_guest_create', {
    p_display_name: params.display_name,
    p_email: params.email ?? null,
    p_phone: params.phone ?? null,
    p_notes: params.notes ?? null,
  })
  if (error) throw error
  return data as Guest
}
