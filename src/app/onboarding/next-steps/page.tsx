import { redirect } from 'next/navigation'
import { getUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/auth-ui'
import { getIdentityLinkCandidates } from '@/lib/api/identity-links'
import {
  acceptOnboardingIdentityLinkAction,
  completeOnboardingNextStepAction,
  keepSeparateOnboardingIdentityLinkAction,
} from './actions'
import { LegalAgreementCard } from './LegalAgreementCard'
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
    .select(
      'onboarding_profile_completed, onboarding_completed, age_confirmed_at, terms_accepted_at, privacy_accepted_at, responsible_use_accepted_at',
    )
    .eq('id', user.id)
    .single()

  const hasLegalAgreement = Boolean(
    profile?.age_confirmed_at &&
      profile?.terms_accepted_at &&
      profile?.privacy_accepted_at &&
      profile?.responsible_use_accepted_at,
  )

  if (profile?.onboarding_completed && hasLegalAgreement) {
    redirect(continueHref)
  }

  if (!profile?.onboarding_profile_completed) {
    redirect(`/onboarding/profile${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  }

  if (!hasLegalAgreement) {
    const legalContinueHref = `/onboarding/next-steps?next=${encodeURIComponent(continueHref)}`

    return (
      <div className="space-y-4">
        {notice === 'email-verified' ? (
          <div className="mx-auto max-w-[920px] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-body-main font-semibold text-emerald-700">
            Email verified. Welcome to PlayerHoods.
          </div>
        ) : null}
        <LegalAgreementCard continueHref={legalContinueHref} />
      </div>
    )
  }

  const identityLinkCandidates = await getIdentityLinkCandidates(supabase).catch(() => [])

  if (identityLinkCandidates.length === 0) {
    const { error } = await supabase.rpc('rpc_complete_onboarding_next_step')

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
