'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { acceptInvitationAsGuest } from '@/lib/invitations/accept-invitation-as-guest'
import { declineInvitationAsGuest } from '@/lib/invitations/decline-invitation-as-guest'
import { getStatusPath, issuePublicParticipantStatusTokenForInvitation } from '@/lib/public-participant-status'

const FALLBACK_GUEST_INVITATION_SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000001'

function getGuestInvitationActionErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('invitation_expired')) return 'expired'
  if (message.includes('participant_ambiguous')) return 'participant-ambiguous'
  if (message.includes('participant_not_found') || message.includes('anchored_participant_not_found')) return 'participant-not-found'
  if (message.includes('invitation_not_found')) return 'not-found'
  if (message.includes('related_type_not_supported')) return 'unsupported'
  return 'failed'
}

function redirectToInvitation(invitationId: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params)
  redirect(`/invitations/${invitationId}?${query.toString()}`)
}

export async function acceptInvitationAsGuestAction(invitationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const systemActorId =
    process.env.GUEST_INVITATION_SYSTEM_ACTOR_ID?.trim()
    || FALLBACK_GUEST_INVITATION_SYSTEM_ACTOR_ID
  let statusPath: string | null = null

  try {
    await acceptInvitationAsGuest(supabase, invitationId)
    try {
      const statusToken = await issuePublicParticipantStatusTokenForInvitation(invitationId, systemActorId)
      if (statusToken?.status_token) {
        statusPath = getStatusPath(statusToken.status_token, { notice: 'accepted' })
      }
    } catch (statusTokenError) {
      console.error('[invitation:accept-guest] status token issue failed', {
        safe_error_code: getGuestInvitationActionErrorCode(statusTokenError),
        has_error: true,
      })
    }
    revalidatePath(`/invitations/${invitationId}`)
  } catch (error) {
    console.error('[invitation:accept-guest]', error)
    redirectToInvitation(invitationId, { error: getGuestInvitationActionErrorCode(error) })
  }

  if (statusPath) {
    redirect(statusPath)
  }

  redirectToInvitation(invitationId, { notice: 'accepted' })
}

export async function declineInvitationAsGuestAction(invitationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const systemActorId =
    process.env.GUEST_INVITATION_SYSTEM_ACTOR_ID?.trim()
    || FALLBACK_GUEST_INVITATION_SYSTEM_ACTOR_ID
  try {
    await declineInvitationAsGuest(supabase, invitationId, systemActorId)
    revalidatePath(`/invitations/${invitationId}`)
  } catch (error) {
    console.error('[invitation:decline-guest]', error)
    redirectToInvitation(invitationId, { error: getGuestInvitationActionErrorCode(error) })
  }

  redirectToInvitation(invitationId, { notice: 'declined' })
}
