'use server'

import { revalidatePath } from 'next/cache'
import { acceptIdentityLinkCandidate, keepSeparateIdentityLinkCandidate } from '@/lib/api/identity-links'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { LEGAL_AGREEMENT_VERSION } from '@/lib/legal'

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
  if (message.trim()) return 'Could not link this invitation. Please try again.'
  return 'Could not link this invitation. Please try again.'
}

export async function acceptOnboardingLegalAgreementAction() {
  const user = await getUser()
  if (!user) {
    return { ok: false as const, error: 'Please log in again.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('rpc_complete_onboarding_legal_agreement', {
    p_age_confirmation_version: LEGAL_AGREEMENT_VERSION,
    p_terms_version: LEGAL_AGREEMENT_VERSION,
    p_privacy_version: LEGAL_AGREEMENT_VERSION,
    p_responsible_use_version: LEGAL_AGREEMENT_VERSION,
  })

  if (error) {
    return {
      ok: false as const,
      error: 'Could not save your legal agreement. Please try again.',
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/onboarding/profile')
  revalidatePath('/onboarding/next-steps')
  revalidatePath('/profile')

  return { ok: true as const }
}

export async function acceptOnboardingIdentityLinkAction(guestId: string): Promise<IdentityLinkActionResult> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  try {
    const supabase = await createSupabaseServerClient()
    await acceptIdentityLinkCandidate(supabase, guestId)
    revalidatePath('/dashboard')
    revalidatePath('/onboarding/next-steps')
    revalidatePath('/profile')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}

export async function keepSeparateOnboardingIdentityLinkAction(guestId: string): Promise<IdentityLinkActionResult> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  try {
    const supabase = await createSupabaseServerClient()
    await keepSeparateIdentityLinkCandidate(supabase, guestId)
    revalidatePath('/dashboard')
    revalidatePath('/onboarding/next-steps')
    revalidatePath('/profile')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}

export async function completeOnboardingNextStepAction() {
  const user = await getUser()
  if (!user) {
    throw new Error('Please log in again.')
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('rpc_complete_onboarding_next_step')

  if (error) {
    throw error
  }

  revalidatePath('/dashboard')
  revalidatePath('/onboarding/profile')
  revalidatePath('/onboarding/next-steps')
  revalidatePath('/profile')
}
