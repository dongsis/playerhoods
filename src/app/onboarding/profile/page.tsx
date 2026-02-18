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
    <div style={{ maxWidth: '480px', margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Welcome! Set up your profile</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Choose a display name so other players can recognize you.
      </p>
      <ProfileForm
        userId={user.id}
        existing={profile as Profile | null}
        next={next || '/dashboard'}
      />
    </div>
  )
}
