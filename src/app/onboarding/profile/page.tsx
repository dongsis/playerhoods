import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { listSports } from '@/lib/api/sports'
import type { Profile, Venue } from '@/lib/types/database'
import { ProfileForm } from './ProfileForm'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function OnboardingProfilePage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { next } = await searchParams
  const supabase = await createSupabaseServerClient()

  const [{ data: profile }, sportsResult, venuesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),
    listSports(supabase),
    supabase
      .from('venues')
      .select('id, name, abbreviation, city, province, country, location_text, venue_kind')
      .not('city', 'is', null)
      .order('name', { ascending: true }),
  ])

  if (profile?.onboarding_completed) {
    redirect(next || '/dashboard')
  }

  if (profile?.onboarding_profile_completed) {
    redirect(`/onboarding/next-steps${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  }

  if (venuesResult.error) {
    throw venuesResult.error
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
          <ProfileForm
            existing={(profile as Profile | null) ?? null}
            next={next || '/dashboard'}
            sports={sportsResult.filter((sport) => sport.is_active)}
            venues={((venuesResult.data ?? []) as Pick<Venue, 'id' | 'name' | 'abbreviation' | 'city' | 'province' | 'country' | 'location_text' | 'venue_kind'>[])}
          />
        </div>
      </section>
    </div>
  )
}
