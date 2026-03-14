import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailInvitation = {
  id: string
  status: string
  declined_at: string | null
}

/** Decline invitation as guest via invitation anchor path. */
export async function declineInvitationAsGuest(
  supabase: SupabaseClient,
  invitationId: string,
  systemActorId: string
): Promise<EmailInvitation> {
  const { data, error } = await supabase.rpc('rpc_email_invitation_decline_as_guest', {
    p_invitation_id: invitationId,
    p_system_actor_id: systemActorId,
  })
  if (error) throw error
  return data as EmailInvitation
}
