'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { LEGAL_AGREEMENT_VERSION } from '@/lib/legal'

export async function acceptOnboardingLegalAgreementAction() {
  const user = await getUser()
  if (!user) {
    return { ok: false as const, error: 'Please log in again.' }
  }

  const supabase = await createSupabaseServerClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('profiles')
    .update({
      age_confirmed_at: now,
      age_confirmation_version: LEGAL_AGREEMENT_VERSION,
      terms_accepted_at: now,
      terms_version: LEGAL_AGREEMENT_VERSION,
      privacy_accepted_at: now,
      privacy_version: LEGAL_AGREEMENT_VERSION,
      responsible_use_accepted_at: now,
      responsible_use_version: LEGAL_AGREEMENT_VERSION,
      onboarding_completed: true,
      updated_at: now,
    })
    .eq('id', user.id)
    .eq('onboarding_profile_completed', true)
    .select('id')
    .single()

  if (error || !data) {
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
