import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { GroupsPanel } from '@/app/dashboard/GroupsPanel'
import { getAllPlayersGroupedByVenue } from '@/lib/api/players'
import { listSports } from '@/lib/api/sports'

export default async function GroupsPage() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = await createSupabaseServerClient()
  const [playersData, sports] = await Promise.all([
    getAllPlayersGroupedByVenue(supabase, user.id),
    listSports(supabase),
  ])

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '1.5rem' }}>
      <GroupsPanel
        groups={playersData.groups}
        pendingInvites={playersData.pendingGroupInvites}
        sports={sports}
        showBackToDashboard
      />
    </div>
  )
}
