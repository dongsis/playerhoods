import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { listSports } from '@/lib/api/sports'
import { listLocationCityOptions } from '@/lib/api/location-municipalities'
import { listVenueOptions } from '@/lib/api/venues'
import type { Profile } from '@/lib/types/database'
import { ProfileForm } from './ProfileForm'

interface Props {
  searchParams: Promise<{ next?: string; notice?: string }>
}

export default async function OnboardingProfilePage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { next, notice } = await searchParams
  const supabase = await createSupabaseServerClient()

  const [{ data: profile }, sportsResult, venueOptions, cityOptions] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),
    listSports(supabase),
    listVenueOptions(supabase),
    listLocationCityOptions(supabase, { countryCode: 'CA', provinceCode: 'ON' }),
  ])

  if (profile?.onboarding_completed) {
    redirect(next || '/dashboard')
  }

  if (profile?.onboarding_profile_completed) {
    redirect(`/onboarding/next-steps${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  }

  return (
    <div className="ph-page-narrow max-w-[880px] px-4 py-8">
      <section className="ph-card overflow-hidden rounded-[32px]">
        <div className="border-b border-slate-100 bg-white px-8 py-10 text-center">
          <div className="ph-kicker mb-3">Welcome</div>
          <h1 className="ph-title">Set up your basic profile</h1>
          <p className="ph-subtitle mx-auto mt-3 max-w-[540px] text-[13px] leading-6">
            A few basics, then you are ready to find players and start a match.
          </p>
        </div>

        <div className="px-8 py-8">
          {notice === 'email-verified' ? (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-body-main font-semibold text-emerald-700">
              Email verified. Welcome to PlayerHoods.
            </div>
          ) : null}
          <ProfileForm
            existing={(profile as Profile | null) ?? null}
            next={next || '/dashboard'}
            sports={sportsResult.filter((sport) => sport.is_active)}
            venues={venueOptions}
            cityOptions={cityOptions}
          />
        </div>
      </section>
    </div>
  )
}
