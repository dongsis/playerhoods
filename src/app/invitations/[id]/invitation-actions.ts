'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { acceptIdentityLinkCandidate, keepSeparateIdentityLinkCandidate } from '@/lib/api/identity-links'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'

type IdentityLinkActionResult = { ok: true } | { ok: false; error: string }

function getIdentityLinkActionError(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('not_authenticated')) return 'Please log in again.'
  if (message.includes('review_required')) return 'Please verify your contact information before linking.'
  if (message.includes('guest_not_found')) return 'This invitation is no longer available to link.'
  return 'Could not link this invitation. Please try again.'
}

function revalidateInvitationSurfaces(invitationId: string, relatedId?: string | null, relatedType?: string | null) {
  revalidatePath(`/invitations/${invitationId}`)
  revalidatePath('/dashboard')
  revalidatePath('/matches')
  if (relatedType === 'match' && relatedId) {
    revalidatePath(`/matches/${relatedId}`)
  }
}

function getInvitationActionErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('not_authenticated')) return 'not-authenticated'
  if (message.includes('email_mismatch')) return 'email-mismatch'
  if (message.includes('invitation_expired')) return 'expired'
  if (message.includes('match_not_active') || message.includes('Match is not active')) return 'match-not-active'
  if (message.includes('participant_ambiguous')) return 'participant-ambiguous'
  if (message.includes('participant_not_found') || message.includes('anchored_participant_not_found')) return 'participant-not-found'
  if (message.includes('invitation_not_found')) return 'not-found'
  return 'failed'
}

function redirectToInvitation(invitationId: string, params: Record<string, string>) {
  const query = new URLSearchParams(params)
  redirect(`/invitations/${invitationId}?${query.toString()}`)
}

async function callInvitationRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rpcName: 'rpc_email_invitation_accept' | 'rpc_email_invitation_decline',
  invitationId: string,
) {
  const { error } = await (supabase as typeof supabase & {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>
  }).rpc(rpcName, {
    p_invitation_id: invitationId,
  })

  if (error) throw error
}

export async function acceptInvitationAuthenticatedAction(
  invitationId: string,
  relatedId?: string | null,
  relatedType?: string | null,
) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    redirectToInvitation(invitationId, { error: 'not-authenticated' })
  }

  try {
    await callInvitationRpc(supabase, 'rpc_email_invitation_accept', invitationId)
    revalidateInvitationSurfaces(invitationId, relatedId, relatedType)
  } catch (error) {
    console.error('[invitation:accept-authenticated]', error)
    redirectToInvitation(invitationId, { error: getInvitationActionErrorCode(error) })
  }

  redirectToInvitation(invitationId, { notice: 'accepted' })
}

export async function declineInvitationAuthenticatedAction(
  invitationId: string,
  relatedId?: string | null,
  relatedType?: string | null,
) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    redirectToInvitation(invitationId, { error: 'not-authenticated' })
  }

  try {
    await callInvitationRpc(supabase, 'rpc_email_invitation_decline', invitationId)
    revalidateInvitationSurfaces(invitationId, relatedId, relatedType)
  } catch (error) {
    console.error('[invitation:decline-authenticated]', error)
    redirectToInvitation(invitationId, { error: getInvitationActionErrorCode(error) })
  }

  redirectToInvitation(invitationId, { notice: 'declined' })
}

export async function acceptInvitationIdentityLinkAndContinueAction(
  invitationId: string,
  guestId: string,
  relatedId?: string | null,
  relatedType?: string | null,
): Promise<IdentityLinkActionResult> {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    return { ok: false, error: 'Please log in again.' }
  }

  try {
    await acceptIdentityLinkCandidate(supabase, guestId)

    await callInvitationRpc(supabase, 'rpc_email_invitation_accept', invitationId)

    revalidateInvitationSurfaces(invitationId, relatedId, relatedType)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}

export async function keepSeparateInvitationIdentityLinkAction(
  invitationId: string,
  guestId: string,
  relatedId?: string | null,
  relatedType?: string | null,
): Promise<IdentityLinkActionResult> {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    return { ok: false, error: 'Please log in again.' }
  }

  try {
    await keepSeparateIdentityLinkCandidate(supabase, guestId)
    revalidateInvitationSurfaces(invitationId, relatedId, relatedType)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}
