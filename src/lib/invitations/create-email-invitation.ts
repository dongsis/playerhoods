import type { SupabaseClient } from '@supabase/supabase-js'

export type CreateEmailInvitationParams = {
  targetEmail: string
  targetName?: string | null
  relatedType: 'match'
  relatedId: string
  expiresAt?: string | null
}

export type EmailInvitation = {
  id: string
  inviter_user_id: string
  target_email: string
  target_name: string | null
  related_type: string
  related_id: string
  match_participant_id: string | null
  status: string
  magic_link_flow_status: string
  created_at: string
}

/** Create email invitation. Emits domain event; processor creates delivery job. */
export async function createEmailInvitation(
  supabase: SupabaseClient,
  params: CreateEmailInvitationParams
): Promise<EmailInvitation> {
  const { data, error } = await supabase.rpc('rpc_email_invitation_create', {
    p_target_email: params.targetEmail.trim().toLowerCase(),
    p_target_name: params.targetName?.trim() || null,
    p_related_type: params.relatedType,
    p_related_id: params.relatedId,
    p_expires_at: params.expiresAt || null,
  })
  if (error) throw error
  return data as EmailInvitation
}
