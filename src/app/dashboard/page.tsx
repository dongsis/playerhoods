import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData, cancelMatch, type MatchListItem } from '@/lib/api/matches'
import { getUnreadNotificationCount } from '@/lib/api/notifications'
import { getAllPlayersGroupedByClub, type PlayersData } from '@/lib/api/players'
import { getMyClubIdentities, getJoinableClubs, updateProfile, getMyVenuePreferences } from '@/lib/api/identities'
import { isSuperAdmin, getMyAdminClubs } from '@/lib/api/clubs'
import type { Profile, ClubIdentity, Club } from '@/lib/types/database'
import { DashboardShell } from './DashboardShell'

export default async function DashboardPage() {

 

  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()

  // Reconcile identity: link guest participants to user by email (e.g. after signup from nomination email)
  const { error: reconcileErr } = await supabase.rpc('rpc_reconcile_identity_guest_participants')
  if (reconcileErr) console.error('[Dashboard] reconcile identity:', reconcileErr)

  const [
    items,
    inboxUnreadCount,
    playersData,
    myIdentities,
    joinableClubs,
    superAdmin,
    myAdminClubs,
    profileRes,
    myVenuePrefs
  ] =
    await Promise.all([
      getMatchListData(supabase, user.id).catch(() => [] as MatchListItem[]),
      getUnreadNotificationCount(supabase).catch(() => 0),
      getAllPlayersGroupedByClub(supabase, user.id).catch(() => ({
        clubs: [],
        groups: [],
        noClub: [],
        pendingGroupInvites: []
      }) as PlayersData),
      getMyClubIdentities(supabase, user.id).catch(() => [] as (ClubIdentity & { club: Club })[]),
      getJoinableClubs(supabase, user.id).catch(() => [] as Club[]),
      isSuperAdmin(supabase),
      getMyAdminClubs(supabase).catch(() => []),
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single(),
      getMyVenuePreferences(supabase, user.id).catch(() => []),
    ])

  const profile =
    (profileRes.error ? null : (profileRes.data as Pick<
      Profile,
      'display_name' | 'first_name' | 'last_name' | 'primary_club_id' | 'contact_channel' | 'contact_email' | 'contact_phone' | 'avatar_url'
    > | null)) ?? {
      display_name: user.email ?? '',
      first_name: null,
      last_name: null,
      primary_club_id: null,
      contact_channel: 'email',
      contact_email: null,
      contact_phone: null,
      avatar_url: null,
    }

  async function handleCancelMatch(matchId: string) {
    'use server'
    const supabaseSrv = await createSupabaseServerClient()
    await cancelMatch(supabaseSrv, matchId)
    revalidatePath('/dashboard')
  }

  async function handleAvatarSaved() {
    'use server'
    revalidatePath('/dashboard')
  }

  async function handleUpdateProfile(formData: FormData) {
    'use server'
    const supabaseSrv = await createSupabaseServerClient()
    const ch = formData.get('contact_channel') as string | null
    await updateProfile(supabaseSrv, {
      first_name: (formData.get('first_name') as string) || undefined,
      last_name: (formData.get('last_name') as string) || undefined,
      contact_channel: (ch === 'email' || ch === 'sms') ? ch : undefined,
      contact_email: formData.has('contact_email') ? (formData.get('contact_email') as string) ?? '' : undefined,
      contact_phone: formData.has('contact_phone') ? (formData.get('contact_phone') as string) ?? '' : undefined,
    })
    revalidatePath('/dashboard')
  }

    return (
    <>
      <div className="bg-amber-500/90 text-black text-center py-2 text-sm font-semibold uppercase tracking-wide">
        Debug mode active — dashboard data may not reflect production.
      </div>

      <DashboardShell
        userId={user.id}
        items={items}
        userEmail={user.email}
        inboxUnreadCount={inboxUnreadCount}
        playersData={playersData}
        profile={profile}
        myIdentities={myIdentities}
        myVenuePrefs={myVenuePrefs}
        joinableCount={joinableClubs.length}
        myAdminClubs={myAdminClubs}
        isSuperAdmin={superAdmin}
        onUpdateProfile={handleUpdateProfile}
        onAvatarSaved={handleAvatarSaved}
        onCancelMatch={handleCancelMatch}
      />
    </>
  )
}