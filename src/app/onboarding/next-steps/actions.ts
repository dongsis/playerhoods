'use server'

import { revalidatePath } from 'next/cache'
import { acceptIdentityLinkCandidate, keepSeparateIdentityLinkCandidate } from '@/lib/api/identity-links'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { LEGAL_AGREEMENT_VERSION } from '@/lib/legal'

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

export async function acceptOnboardingIdentityLinkAction(guestId: string) {
  const supabase = await createSupabaseServerClient()
  await acceptIdentityLinkCandidate(supabase, guestId)
  revalidatePath('/dashboard')
  revalidatePath('/onboarding/next-steps')
  revalidatePath('/profile')
}

export async function keepSeparateOnboardingIdentityLinkAction(guestId: string) {
  const supabase = await createSupabaseServerClient()
  await keepSeparateIdentityLinkCandidate(supabase, guestId)
  revalidatePath('/dashboard')
  revalidatePath('/onboarding/next-steps')
  revalidatePath('/profile')
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
