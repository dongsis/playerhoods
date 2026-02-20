'use client'

import { useState } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import type { PlayersData } from '@/lib/api/players'
import type { Profile, ClubIdentity, Club, ClubAdmin } from '@/lib/types/database'
import { LeftNav, type DashTab } from './LeftNav'
import { MatchesPanel } from './MatchesPanel'
import { PlayersPanel } from './PlayersPanel'
import { ProfilePanel } from './ProfilePanel'
import { ClubManagementPanel } from './ClubManagementPanel'

interface Props {
  userId: string
  items: MatchListItem[]
  playersData: PlayersData
  profile: Pick<Profile, 'display_name' | 'first_name' | 'last_name' | 'primary_club_id'>
  myIdentities: (ClubIdentity & { club: Club })[]
  joinableCount: number
  myAdminClubs: (ClubAdmin & { club: Club })[]
  isSuperAdmin: boolean
  onUpdateProfile: (formData: FormData) => Promise<void>
  onCancelMatch: (matchId: string) => Promise<void>
  onGetInvitableUsers: (groupId: string) => Promise<{ id: string; display_name: string }[]>
  onInviteToGroup: (groupId: string, userId: string) => Promise<void>
}

export function DashboardShell({
  userId,
  items,
  playersData,
  profile,
  myIdentities,
  joinableCount,
  myAdminClubs,
  isSuperAdmin,
  onUpdateProfile,
  onCancelMatch,
  onGetInvitableUsers,
  onInviteToGroup,
}: Props) {
  const isAdmin = isSuperAdmin || myAdminClubs.length > 0
  const [activeTab, setActiveTab] = useState<DashTab>('matches')

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Left nav — sticky sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-100 bg-white sticky top-0 h-screen">
        <LeftNav active={activeTab} onTab={setActiveTab} isAdmin={isAdmin} />
      </aside>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        {activeTab === 'matches' && (
          <MatchesPanel items={items} userId={userId} onCancelMatch={onCancelMatch} />
        )}
        {activeTab === 'players' && (
          <PlayersPanel
            data={playersData}
            userId={userId}
            onGetInvitableUsers={onGetInvitableUsers}
            onInviteToGroup={onInviteToGroup}
          />
        )}
        {activeTab === 'profile' && (
          <ProfilePanel
            profile={profile}
            myIdentities={myIdentities}
            joinableCount={joinableCount}
            onUpdateProfile={onUpdateProfile}
          />
        )}
        {activeTab === 'admin' && isAdmin && (
          <ClubManagementPanel
            myAdminClubs={myAdminClubs}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </main>
    </div>
  )
}
