import { redirect } from 'next/navigation'
import { getUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/auth-ui'
import { getIdentityLinkCandidates } from '@/lib/api/identity-links'
import {
  acceptOnboardingIdentityLinkAction,
  completeOnboardingNextStepAction,
  keepSeparateOnboardingIdentityLinkAction,
} from './actions'
import { OnboardingIdentityLinkStep } from './OnboardingIdentityLinkStep'

interface Props {
  searchParams: Promise<{ next?: string; primarySportId?: string; notice?: string }>
}

export default async function OnboardingNextStepsPage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { next, notice } = await searchParams
  const continueHref = sanitizeNextPath(next, '/dashboard')
  const supabase = await createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_profile_completed, onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    redirect(continueHref)
  }

  if (!profile?.onboarding_profile_completed) {
    redirect(`/onboarding/profile${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  }

  const identityLinkCandidates = await getIdentityLinkCandidates(supabase).catch(() => [])

  if (identityLinkCandidates.length === 0) {
    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id)
      .eq('onboarding_profile_completed', true)

    if (!error) {
      redirect(continueHref)
    }
  }

  return (
    <div className="space-y-4">
      {notice === 'email-verified' ? (
        <div className="mx-auto max-w-[920px] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-body-main font-semibold text-emerald-700">
          Email verified. Welcome to PlayerHoods.
        </div>
      ) : null}
      <OnboardingIdentityLinkStep
        continueHref={continueHref}
        candidates={identityLinkCandidates}
        onAccept={acceptOnboardingIdentityLinkAction}
        onKeepSeparate={keepSeparateOnboardingIdentityLinkAction}
        onSkip={completeOnboardingNextStepAction}
      />
    </div>
  )
}
