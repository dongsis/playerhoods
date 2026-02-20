import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData, cancelMatch } from '@/lib/api/matches'
import { getAllPlayersGroupedByClub } from '@/lib/api/players'
import { getMyClubIdentities, getJoinableClubs, updateProfile } from '@/lib/api/identities'
import { isSuperAdmin, getMyAdminClubs } from '@/lib/api/clubs'
import { getInvitableUsers, inviteUserToGroup } from '@/lib/api/groups'
import type { Profile } from '@/lib/types/database'
import { DashboardShell } from './DashboardShell'

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()

  const [items, playersData, myIdentities, joinableClubs, superAdmin, myAdminClubs, profileRes] =
    await Promise.all([
      getMatchListData(supabase, user.id),
      getAllPlayersGroupedByClub(supabase),
      getMyClubIdentities(supabase, user.id),
      getJoinableClubs(supabase, user.id),
      isSuperAdmin(supabase),
      getMyAdminClubs(supabase).catch(() => []),
      supabase
        .from('profiles')
        .select('display_name, first_name, last_name, primary_club_id')
        .eq('id', user.id)
        .single(),
    ])

  const profile = (profileRes.data as Pick<
    Profile,
    'display_name' | 'first_name' | 'last_name' | 'primary_club_id'
  > | null) ?? {
    display_name: user.email ?? '',
    first_name: null,
    last_name: null,
    primary_club_id: null,
  }

  async function handleCancelMatch(matchId: string) {
    'use server'
    const supabaseSrv = await createSupabaseServerClient()
    await cancelMatch(supabaseSrv, matchId)
    revalidatePath('/dashboard')
  }

  async function handleGetInvitableUsers(groupId: string) {
    'use server'
    const supabaseSrv = await createSupabaseServerClient()
    return getInvitableUsers(supabaseSrv, groupId)
  }

  async function handleInviteToGroup(groupId: string, inviteeId: string) {
    'use server'
    const supabaseSrv = await createSupabaseServerClient()
    await inviteUserToGroup(supabaseSrv, groupId, inviteeId)
    revalidatePath('/dashboard')
  }

  async function handleUpdateProfile(formData: FormData) {
    'use server'
    const supabaseSrv = await createSupabaseServerClient()
    await updateProfile(supabaseSrv, {
      first_name: (formData.get('first_name') as string) || undefined,
      last_name: (formData.get('last_name') as string) || undefined,
    })
    revalidatePath('/dashboard')
  }

  return (
    <DashboardShell
      userId={user.id}
      items={items}
      playersData={playersData}
      profile={profile}
      myIdentities={myIdentities}
      joinableCount={joinableClubs.length}
      myAdminClubs={myAdminClubs}
      isSuperAdmin={superAdmin}
      onUpdateProfile={handleUpdateProfile}
      onCancelMatch={handleCancelMatch}
      onGetInvitableUsers={handleGetInvitableUsers}
      onInviteToGroup={handleInviteToGroup}
    />
  )
}
