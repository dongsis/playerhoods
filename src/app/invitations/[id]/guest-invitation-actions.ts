'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { acceptInvitationAsGuest } from '@/lib/invitations/accept-invitation-as-guest'
import { declineInvitationAsGuest } from '@/lib/invitations/decline-invitation-as-guest'

export async function acceptInvitationAsGuestAction(invitationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await acceptInvitationAsGuest(supabase, invitationId)
  revalidatePath(`/invitations/${invitationId}`)
}

export async function declineInvitationAsGuestAction(invitationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const systemActorId = process.env.GUEST_INVITATION_SYSTEM_ACTOR_ID?.trim()
  if (!systemActorId) {
    throw new Error('Missing GUEST_INVITATION_SYSTEM_ACTOR_ID for guest decline audit actor')
  }
  await declineInvitationAsGuest(supabase, invitationId, systemActorId)
  revalidatePath(`/invitations/${invitationId}`)
}
