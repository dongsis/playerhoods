'use server'

import { revalidatePath } from 'next/cache'
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
    throw new Error('Please log in again.')
  }

  await callInvitationRpc(supabase, 'rpc_email_invitation_accept', invitationId)

  revalidateInvitationSurfaces(invitationId, relatedId, relatedType)
}

export async function declineInvitationAuthenticatedAction(
  invitationId: string,
  relatedId?: string | null,
  relatedType?: string | null,
) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('Please log in again.')
  }

  await callInvitationRpc(supabase, 'rpc_email_invitation_decline', invitationId)

  revalidateInvitationSurfaces(invitationId, relatedId, relatedType)
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
