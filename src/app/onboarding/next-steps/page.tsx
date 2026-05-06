import { redirect } from 'next/navigation'
import { getUser, createSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/auth-ui'
import { LegalAgreementCard } from './LegalAgreementCard'

interface Props {
  searchParams: Promise<{ next?: string; primarySportId?: string }>
}

export default async function OnboardingNextStepsPage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { next } = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_profile_completed, onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    redirect(sanitizeNextPath(next, '/dashboard'))
  }

  if (!profile?.onboarding_profile_completed) {
    redirect(`/onboarding/profile${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  }

  return (
    <div className="ph-page-narrow max-w-[760px] px-4 py-10">
      <LegalAgreementCard continueHref={sanitizeNextPath(next, '/dashboard')} />
    </div>
  )
}
