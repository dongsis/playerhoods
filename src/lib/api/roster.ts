import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Guest } from '@/lib/types/database'

type Client = SupabaseClient<Database>

/** Phase 2: Contact Player resolution. Single source for guest vs linked-user state. */
export type ContactPlayerResolved = {
  guest_id: string
  display_name: string
  email: string | null
  phone: string | null
  notes: string | null
  linked_user_id: string | null
  resolution_state: 'contact_only' | 'linked_user'
}

/** Phase 2: Get caller's roster guests with resolution (contact_only | linked_user). */
export async function getContactPlayerResolution(supabase: Client): Promise<ContactPlayerResolved[]> {
  const { data, error } = await supabase.rpc('rpc_contact_player_resolution')
  if (error) throw error
  return (data ?? []) as ContactPlayerResolved[]
}

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
