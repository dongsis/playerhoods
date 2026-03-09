import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailInvitation = {
  id: string
  status: string
  accepted_at: string | null
}

/** Accept invitation. Validates session email matches target. Idempotent if already accepted. */
export async function acceptInvitation(
  supabase: SupabaseClient,
  invitationId: string
): Promise<EmailInvitation> {
  const { data, error } = await supabase.rpc('rpc_email_invitation_accept', {
    p_invitation_id: invitationId,
  })
  if (error) throw error
  return data as EmailInvitation
}
