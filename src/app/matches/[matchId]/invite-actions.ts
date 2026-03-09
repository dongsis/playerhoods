'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createEmailInvitation } from '@/lib/invitations/create-email-invitation'
import { processQueuedNotificationDeliveries } from '@/lib/notifications/workers/process-queued-notification-deliveries'

export async function createMatchEmailInvitationAndSend(params: {
  matchId: string
  targetEmail: string
  targetName?: string | null
}) {
  const supabase = await createSupabaseServerClient()
  await createEmailInvitation(supabase, {
    targetEmail: params.targetEmail.trim(),
    targetName: params.targetName?.trim() || null,
    relatedType: 'match',
    relatedId: params.matchId,
  })
  await processQueuedNotificationDeliveries(supabase, 5)
}
