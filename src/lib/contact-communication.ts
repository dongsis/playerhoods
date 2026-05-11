import type { SupabaseClient } from '@supabase/supabase-js'

export type ContactInvitationDeliveryStatus = {
  guest_id: string
  email: string | null
  phone: string | null
  email_opted_out: boolean
  sms_opted_out: boolean
  has_reachable_channel: boolean
}

export async function getContactInvitationDeliveryStatus(
  supabase: SupabaseClient,
  guestIds: string[],
): Promise<Map<string, ContactInvitationDeliveryStatus>> {
  const uniqueGuestIds = Array.from(new Set(guestIds.filter(Boolean)))
  if (uniqueGuestIds.length === 0) return new Map()

  const { data, error } = await supabase.rpc('rpc_contact_invitation_delivery_status', {
    p_guest_ids: uniqueGuestIds,
  })
  if (error) throw error

  return new Map(
    ((data ?? []) as ContactInvitationDeliveryStatus[]).map((row) => [row.guest_id, row]),
  )
}

export async function unsubscribeContactCommunication(
  supabase: SupabaseClient,
  params: {
    invitationId: string
    channel?: 'email' | 'sms' | null
    scope?: 'all' | 'playerhoods' | 'contact_invites' | 'match_invites' | null
    reason?: string | null
  },
) {
  const { data, error } = await supabase.rpc('rpc_contact_communication_unsubscribe', {
    p_invitation_id: params.invitationId,
    p_channel: params.channel ?? null,
    p_scope: params.scope ?? 'contact_invites',
    p_reason: params.reason ?? null,
  })
  if (error) throw error
  return data ?? []
}
