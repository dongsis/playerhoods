import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, IdentityLinkCandidate } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export async function getIdentityLinkCandidates(
  supabase: Client,
): Promise<IdentityLinkCandidate[]> {
  const { data, error } = await supabase.rpc('rpc_identity_link_candidates')
  if (error) throw error
  return (data ?? []) as IdentityLinkCandidate[]
}

export async function reconcileIdentityGuestParticipants(
  supabase: Client,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_reconcile_identity_guest_participants')
  if (error) throw error
}

export async function acceptIdentityLinkCandidate(
  supabase: Client,
  guestId: string,
): Promise<{
  ok: boolean
  guest_id: string
  linked_user_id: string
  linked_match_participant_count: number
  saved_owner_count: number
  archived_contact_count: number
  owner_notification_count: number
}> {
  const { data, error } = await supabase.rpc('rpc_identity_link_accept', {
    p_guest_id: guestId,
  })
  if (error) throw error
  return data as {
    ok: boolean
    guest_id: string
    linked_user_id: string
    linked_match_participant_count: number
    saved_owner_count: number
    archived_contact_count: number
    owner_notification_count: number
  }
}

export async function keepSeparateIdentityLinkCandidate(
  supabase: Client,
  guestId: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_identity_link_keep_separate', {
    p_guest_id: guestId,
  })
  if (error) throw error
}
