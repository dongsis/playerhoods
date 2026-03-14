import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailInvitation = {
  id: string
  status: string
  accepted_at: string | null
}

/** Accept invitation as guest via invitation anchor path. */
export async function acceptInvitationAsGuest(
  supabase: SupabaseClient,
  invitationId: string
): Promise<EmailInvitation> {
  const { data, error } = await supabase.rpc('rpc_email_invitation_accept_as_guest', {
    p_invitation_id: invitationId,
  })
  if (error) throw error
  return data as EmailInvitation
}
