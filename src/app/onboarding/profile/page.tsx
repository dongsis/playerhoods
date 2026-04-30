import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { ProfileForm } from './ProfileForm'
import type { Profile } from '@/lib/types/database'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function OnboardingProfilePage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { next } = await searchParams
  const supabase = await createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // If profile already has display_name, skip onboarding
  if (profile?.display_name) {
    redirect(next || '/dashboard')
  }

  return (
    <div className="ph-page-narrow">
      <section className="ph-card px-6 py-6">
        <div className="ph-kicker mb-2">Welcome</div>
        <h1 className="ph-title">Set up your profile</h1>
        <p className="ph-subtitle mb-8 mt-2">
        Choose a display name so other players can recognize you.
        </p>
        <ProfileForm
          userId={user.id}
          existing={profile as Profile | null}
          next={next || '/dashboard'}
        />
      </section>
    </div>
  )
}
