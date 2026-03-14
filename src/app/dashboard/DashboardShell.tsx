'use client'

import { useState, useMemo, useEffect } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import type { PlayersData } from '@/lib/api/players'
import type { Profile, ClubIdentity, Club, ClubAdmin } from '@/lib/types/database'
import { LeftNav, type DashTab } from './LeftNav'
import { InboxPanel } from './InboxPanel'
import { MatchesPanel } from './MatchesPanel'
import { PlayersPanel } from './PlayersPanel'
import { ProfilePanel } from './ProfilePanel'
import { ClubManagementPanel } from './ClubManagementPanel'
import { VenuesPanel } from './VenuesPanel'
import { ContactsPanel } from './ContactsPanel'

interface Props {
  userId: string
  items: MatchListItem[]
  userEmail?: string | null
  playersData: PlayersData
  profile: Pick<Profile, 'display_name' | 'first_name' | 'last_name' | 'primary_club_id' | 'contact_channel' | 'contact_email' | 'contact_phone' | 'avatar_url'>
  myIdentities: (ClubIdentity & { club: Club })[]
  myVenuePrefs: Club[]
  joinableCount: number
  myAdminClubs: (ClubAdmin & { club: Club })[]
  isSuperAdmin: boolean
  onUpdateProfile: (formData: FormData) => Promise<void>
  onAvatarSaved: () => Promise<void>
  onCancelMatch: (matchId: string) => Promise<void>
  inboxUnreadCount?: number
}

export function DashboardShell({
  userId,
  items,
  userEmail,
  inboxUnreadCount,
  playersData,
  profile,
  myIdentities,
  myVenuePrefs,
  joinableCount,
  myAdminClubs,
  isSuperAdmin,
  onUpdateProfile,
  onAvatarSaved,
  onCancelMatch,
}: Props) {
  const isAdmin = isSuperAdmin || myAdminClubs.length > 0
  const [activeTab, setActiveTab] = useState<DashTab>('matches')
  const [dismissedMatchIds, setDismissedMatchIds] = useState<Set<string>>(new Set())
  const [inboxBadge, setInboxBadge] = useState(inboxUnreadCount ?? 0)

  // Once user has entered Matches tab, dismiss "removed" matches from badge (so number decreases)
  useEffect(() => {
    if (activeTab !== 'matches') return
    setDismissedMatchIds(prev => {
      let changed = false
      const next = new Set(prev)
      for (const item of items) {
        if (item.myParticipant?.status === 'removed' && !next.has(item.match.id)) {
          next.add(item.match.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [activeTab, items])

  // Compute nav badge counts
  const badges = useMemo(() => {
    const nowIso = new Date().toISOString()
    let matchesBadge = 0
    for (const item of items) {
      if (dismissedMatchIds.has(item.match.id)) continue
      const mp = item.myParticipant
      if (!mp) continue
      const past = item.match.start_at_utc
        ? item.match.start_at_utc < nowIso
        : item.match.match_date
          ? item.match.match_date < nowIso.slice(0, 10)
          : false
      // Pending invite/nomination needing user action
      if (
        mp.status === 'pending' &&
        (mp.join_method === 'invited' || mp.join_method === 'nominated') &&
        !past
      ) {
        matchesBadge++
      }
      // Removed from upcoming active match (exclude self-declined cases)
      const removalNote = (mp.removal_note as string | null)?.toLowerCase() ?? ''
      const selfDeclined = removalNote.includes('declined')
      if (
        mp.status === 'removed' &&
        item.match.status === 'active' &&
        !past &&
        !selfDeclined
      ) {
        matchesBadge++
      }
    }
    const playersBadge = playersData.pendingGroupInvites.length
    return {
      inbox: inboxBadge || undefined,
      matches: matchesBadge || undefined,
      players: playersBadge || undefined,
    }
  }, [items, playersData.pendingGroupInvites.length, dismissedMatchIds, inboxBadge])

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Left nav — sticky sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-100 bg-white sticky top-0 h-screen">
        <LeftNav
          active={activeTab}
          onTab={setActiveTab}
          isAdmin={isAdmin}
          badges={{ ...badges, inbox: badges.inbox ?? inboxBadge }}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        {activeTab === 'inbox' && (
          <InboxPanel onUnreadChange={setInboxBadge} />
        )}
        {activeTab === 'matches' && (
          <MatchesPanel
            items={items}
            userId={userId}
            onCancelMatch={onCancelMatch}
            onViewedMatch={matchId =>
              setDismissedMatchIds(prev => new Set([...prev, matchId]))
            }
          />
        )}
        {activeTab === 'players' && (
          <PlayersPanel
            data={playersData}
            userId={userId}
          />
        )}
        {activeTab === 'contacts' && (
          <ContactsPanel groups={playersData.groups} />
        )}
        {activeTab === 'profile' && (
          <ProfilePanel
            userId={userId}
            profile={profile}
            userEmail={userEmail}
            myIdentities={myIdentities}
            joinableCount={joinableCount}
            onUpdateProfile={onUpdateProfile}
            onAvatarSaved={onAvatarSaved}
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
