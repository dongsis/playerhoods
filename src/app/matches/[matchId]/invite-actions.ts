'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createEmailInvitation } from '@/lib/invitations/create-email-invitation'

export async function createMatchEmailInvitationAndSend(params: {
  matchId: string
  targetEmail?: string | null
  targetPhone?: string | null
  targetName?: string | null
}) {
  const supabase = await createSupabaseServerClient()
  await createEmailInvitation(supabase, {
    targetEmail: params.targetEmail?.trim() || null,
    targetPhone: params.targetPhone?.trim() || null,
    targetName: params.targetName?.trim() || null,
    relatedType: 'match',
    relatedId: params.matchId,
  })
}
