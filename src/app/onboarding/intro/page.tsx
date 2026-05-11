import { redirect } from 'next/navigation'
import { sanitizeNextPath } from '@/lib/auth-ui'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { OnboardingIntroCarousel } from './OnboardingIntroCarousel'

interface Props {
  searchParams: Promise<{ next?: string; notice?: string }>
}

export default async function OnboardingIntroPage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { next, notice } = await searchParams
  const continueHref = sanitizeNextPath(next, '/dashboard')
  const supabase = await createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, onboarding_profile_completed')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.onboarding_completed) {
    redirect(continueHref)
  }

  if (profile?.onboarding_profile_completed) {
    redirect(`/onboarding/next-steps?next=${encodeURIComponent(continueHref)}`)
  }

  return <OnboardingIntroCarousel next={continueHref} notice={notice} />
}
