import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  updateProfile,
  setClubHandle,
  setPrimaryClub,
  checkClubHandle,
  joinClub,
  getMyClubIdentities,
  getJoinableClubs,
} from '@/lib/api/identities'
import { ProfileEditForm } from './ProfileEditForm'
import { ClubIdentityRow } from './ClubIdentityRow'
import { ClubJoinForm } from './ClubJoinForm'

export default async function ProfilePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()

  const [{ data: profile }, identities, joinable] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getMyClubIdentities(supabase, user.id),
    getJoinableClubs(supabase, user.id),
  ])

  if (!profile) redirect('/onboarding/profile')

  // Server actions
  async function handleUpdateProfile(formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await updateProfile(supabase, {
      first_name: (formData.get('first_name') as string)?.trim() || undefined,
      last_name: (formData.get('last_name') as string)?.trim() || undefined,
    })
    revalidatePath('/profile')
  }

  async function handleRename(clubId: string, newHandle: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await setClubHandle(supabase, clubId, newHandle)
    revalidatePath('/profile')
  }

  async function handleSetPrimary(clubId: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await setPrimaryClub(supabase, clubId)
    revalidatePath('/profile')
  }

  async function handleCheckHandle(clubId: string, handle: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    return checkClubHandle(supabase, clubId, handle)
  }

  async function handleJoin(clubId: string, handle: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await joinClub(supabase, clubId, handle)
    revalidatePath('/profile')
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '1.5rem' }}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/matches">← Matches</Link>
      </nav>

      <h1>Your Profile</h1>

      {/* Display name (read-only — set via club handle or onboarding) */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Identity</h2>
        <p style={{ margin: '0 0 0.25rem' }}>
          <strong>Display Name:</strong> {profile.display_name || <em style={{ color: '#888' }}>not set</em>}
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
          Your display name is set by your primary club handle. To change it, rename your handle in the primary club below.
        </p>
      </section>

      {/* Non-identity fields */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Name</h2>
        <ProfileEditForm
          firstName={profile.first_name}
          lastName={profile.last_name}
          onSubmit={handleUpdateProfile}
        />
      </section>

      {/* Club memberships */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Club Memberships</h2>
        {identities.length === 0 ? (
          <p style={{ color: '#888' }}>You have not joined any clubs yet.</p>
        ) : (
          identities.map(identity => (
            <ClubIdentityRow
              key={identity.id}
              identity={identity}
              isPrimary={profile.primary_club_id === identity.club_id}
              onRename={handleRename}
              onSetPrimary={handleSetPrimary}
            />
          ))
        )}
      </section>

      {/* Join a club */}
      {joinable.length > 0 && (
        <section style={{ padding: '1rem', border: '1px solid #ccc' }}>
          <h2 style={{ marginTop: 0 }}>Join a Club</h2>
          <ClubJoinForm
            clubs={joinable}
            defaultHandle={profile.display_name ?? ''}
            onCheckHandle={handleCheckHandle}
            onJoin={handleJoin}
          />
        </section>
      )}
    </div>
  )
}
