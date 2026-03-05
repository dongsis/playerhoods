import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  updateProfile,
  setDisplayName,
  setClubHandle,
  setPrimaryClub,
  checkClubHandle,
  joinClub,
  getMyClubIdentities,
  getJoinableClubs,
  getMyVenuePreferences,
  removeVenuePreference,
  getMyGroupMemberships,
  setGroupDisplayName,
} from '@/lib/api/identities'
import { listSports, getMySports, setUserSports } from '@/lib/api/sports'
import { ProfileEditForm } from './ProfileEditForm'
import { DisplayNameEditForm } from './DisplayNameEditForm'
import { ClubIdentityRow } from './ClubIdentityRow'
import { ClubJoinForm } from './ClubJoinForm'
import { GroupAliasRow } from './GroupAliasRow'
import { SportsPreferenceForm } from './SportsPreferenceForm'
import { ProfileAvatarSection } from './ProfileAvatarSection'

export default async function ProfilePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()

  const [{ data: profile }, identities, joinable, venuePrefs, groupMemberships, sports, mySports] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getMyClubIdentities(supabase, user.id),
    getJoinableClubs(supabase, user.id),
    getMyVenuePreferences(supabase, user.id).catch(() => []),
    getMyGroupMemberships(supabase, user.id).catch(() => []),
    listSports(supabase).catch(() => []),
    getMySports(supabase).catch(() => []),
  ])

  if (!profile) redirect('/onboarding/profile')

  // Server actions
  async function handleAvatarSaved() {
    'use server'
    revalidatePath('/profile')
  }

  async function handleSetDisplayName(newName: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await setDisplayName(supabase, newName)
    revalidatePath('/profile')
  }

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

  async function handleSetGroupAlias(groupId: string, alias: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await setGroupDisplayName(supabase, groupId, alias)
    revalidatePath('/profile')
  }

  async function handleRemoveVenuePref(venueId: string) {
    'use server'
    const srv = await createSupabaseServerClient()
    const u = await getUser()
    if (!u) return
    await removeVenuePreference(srv, u.id, venueId)
    revalidatePath('/profile')
  }

  async function handleSetSports(codes: string[]) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await setUserSports(supabase, codes)
    revalidatePath('/profile')
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '1.5rem' }}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard">← Dashboard</Link>
      </nav>

      <h1>Your Profile</h1>

      {/* v1.5 Identity: global display name (directly editable) */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Identity</h2>
        <div style={{ marginBottom: '1rem' }}>
          <ProfileAvatarSection
            userId={user.id}
            currentAvatarUrl={profile.avatar_url ?? null}
            onAvatarSaved={handleAvatarSaved}
          />
        </div>
        <div style={{ marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginBottom: '0.3rem' }}>
            Display Name — your global identity across playerhoods
          </span>
          {profile.display_name ? (
            <DisplayNameEditForm
              displayName={profile.display_name}
              onSave={handleSetDisplayName}
            />
          ) : (
            <em style={{ color: '#888' }}>Not set — complete onboarding to set your name.</em>
          )}
        </div>
      </section>

      {/* v1.6.3: Sports I Play */}
      {sports.length > 0 && (
        <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
          <h2 style={{ marginTop: 0 }}>Sports I Play</h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#666' }}>
            Select the sports you play. This helps with filtering and discovery.
          </p>
          <SportsPreferenceForm
            sports={sports}
            initialSportIds={mySports.map(s => s.sport_id)}
            onSave={handleSetSports}
          />
        </section>
      )}

      {/* v1.5 Identity: group-scoped aliases */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Group Aliases</h2>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#666' }}>
          Set a contextual alias per group. Your alias takes priority over your display name within that group.
        </p>
        {groupMemberships.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.85rem' }}>You are not an active member of any groups.</p>
        ) : (
          groupMemberships.map(m => (
            <GroupAliasRow
              key={m.id}
              membership={m}
              userDisplayName={profile.display_name ?? ''}
              onSetAlias={handleSetGroupAlias}
            />
          ))
        )}
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

      {/* Venue memberships (legacy: club handles are deprecated in v1.5) */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Venue Memberships</h2>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: '#aaa' }}>
          Per-venue handles are legacy. Your display name is now managed directly above.
        </p>
        {identities.length === 0 ? (
          <p style={{ color: '#888' }}>You have not joined any venues yet.</p>
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

      {/* My saved venues (lightweight preference, no handle required) */}
      {venuePrefs.length > 0 && (
        <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
          <h2 style={{ marginTop: 0 }}>My Saved Venues</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {venuePrefs.map(v => (
              <div
                key={v.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}
              >
                <div>
                  <Link href={`/venues/${v.id}`} style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    {v.name}
                  </Link>
                  {(v.location_text || v.timezone) && (
                    <div style={{ fontSize: '0.78rem', color: '#888' }}>
                      {[v.location_text, v.timezone].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <form action={handleRemoveVenuePref.bind(null, v.id)}>
                  <button
                    type="submit"
                    style={{ fontSize: '0.78rem', color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem' }}
                  >
                    Remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Join a venue */}
      {joinable.length > 0 && (
        <section style={{ padding: '1rem', border: '1px solid #ccc' }}>
          <h2 style={{ marginTop: 0 }}>Join a Venue</h2>
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
