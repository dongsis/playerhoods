'use client'

import { useState, useMemo } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import type { PlayersData } from '@/lib/api/players'
import type { Profile, ClubIdentity, Club, ClubAdmin } from '@/lib/types/database'
import { LeftNav, type DashTab } from './LeftNav'
import { MatchesPanel } from './MatchesPanel'
import { PlayersPanel } from './PlayersPanel'
import { ProfilePanel } from './ProfilePanel'
import { ClubManagementPanel } from './ClubManagementPanel'
import { VenuesPanel } from './VenuesPanel'
import { ContactsPanel } from './ContactsPanel'

interface Props {
  userId: string
  items: MatchListItem[]
  playersData: PlayersData
  profile: Pick<Profile, 'display_name' | 'first_name' | 'last_name' | 'primary_club_id'>
  myIdentities: (ClubIdentity & { club: Club })[]
  myVenuePrefs: Club[]
  joinableCount: number
  myAdminClubs: (ClubAdmin & { club: Club })[]
  isSuperAdmin: boolean
  onUpdateProfile: (formData: FormData) => Promise<void>
  onCancelMatch: (matchId: string) => Promise<void>
}

export function DashboardShell({
  userId,
  items,
  playersData,
  profile,
  myIdentities,
  myVenuePrefs,
  joinableCount,
  myAdminClubs,
  isSuperAdmin,
  onUpdateProfile,
  onCancelMatch,
}: Props) {
  const isAdmin = isSuperAdmin || myAdminClubs.length > 0
  const [activeTab, setActiveTab] = useState<DashTab>('matches')

  // Compute nav badge counts
  const badges = useMemo(() => {
    const nowIso = new Date().toISOString()
    let matchesBadge = 0
    for (const item of items) {
      const mp = item.myParticipant
      if (!mp) continue
      const past = item.match.start_at_utc
        ? item.match.start_at_utc < nowIso
        : item.match.match_date
          ? item.match.match_date < nowIso.slice(0, 10)
          : false
      // Pending invite needing user action
      if (mp.status === 'pending' && mp.join_method === 'invited' && !past) matchesBadge++
      // Removed from upcoming active match
      if (mp.status === 'removed' && item.match.status === 'active' && !past) matchesBadge++
    }
    const playersBadge = playersData.pendingGroupInvites.length
    return { matches: matchesBadge || undefined, players: playersBadge || undefined }
  }, [items, playersData.pendingGroupInvites.length])

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Left nav — sticky sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-100 bg-white sticky top-0 h-screen">
        <LeftNav active={activeTab} onTab={setActiveTab} isAdmin={isAdmin} badges={badges} />
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
          />
        )}
        {activeTab === 'contacts' && (
          <ContactsPanel />
        )}
        {activeTab === 'profile' && (
          <ProfilePanel
            profile={profile}
            myIdentities={myIdentities}
            joinableCount={joinableCount}
            onUpdateProfile={onUpdateProfile}
          />
        )}
        {activeTab === 'venues' && (
          <VenuesPanel
            myIdentities={myIdentities}
            myVenuePrefs={myVenuePrefs}
            isAdmin={isAdmin}
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
