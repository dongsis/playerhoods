import { redirect } from 'next/navigation'
import { sanitizeNextPath } from '@/lib/auth-ui'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'

interface Props {
  searchParams: Promise<{ next?: string; notice?: string }>
}

function buildOnboardingRedirect(path: '/onboarding/profile' | '/onboarding/next-steps', next: string, notice?: string) {
  const params = new URLSearchParams()
  params.set('next', next)
  if (notice) params.set('notice', notice)
  return `${path}?${params.toString()}`
}

export default async function OnboardingIntroPage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { next, notice } = await searchParams
  const continueHref = sanitizeNextPath(next, '/dashboard')
  const supabase = await createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'onboarding_completed, onboarding_profile_completed, age_confirmed_at, terms_accepted_at, privacy_accepted_at, responsible_use_accepted_at',
    )
    .eq('id', user.id)
    .maybeSingle()
  const hasLegalAgreement = Boolean(
    profile?.age_confirmed_at &&
      profile?.terms_accepted_at &&
      profile?.privacy_accepted_at &&
      profile?.responsible_use_accepted_at,
  )

  if (profile?.onboarding_completed && hasLegalAgreement) {
    redirect(continueHref)
  }

  if (profile?.onboarding_profile_completed && hasLegalAgreement) {
    redirect(buildOnboardingRedirect('/onboarding/next-steps', continueHref, notice))
  }

  redirect(buildOnboardingRedirect('/onboarding/profile', continueHref, notice))
}
