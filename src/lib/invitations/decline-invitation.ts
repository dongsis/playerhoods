import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailInvitation = {
  id: string
  status: string
  declined_at: string | null
}

/** Decline invitation. Validates session email matches target. Idempotent if already declined. */
export async function declineInvitation(
  supabase: SupabaseClient,
  invitationId: string
): Promise<EmailInvitation> {
  const { data, error } = await supabase.rpc('rpc_email_invitation_decline', {
    p_invitation_id: invitationId,
  })
  if (error) throw error
  return data as EmailInvitation
}
