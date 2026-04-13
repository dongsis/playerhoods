'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { MatchListItem } from '@/lib/api/matches'
import type { PlayersData } from '@/lib/api/players'
import type { InviteCircleRow } from '@/lib/api/play-network'
import type { GearImage, GearItem, GearShowcaseEntry, GearStringJob, Profile, VenueIdentity, Venue, VenueAdmin, Sport, UserSport, UserSportProfile } from '@/lib/types/database'
import { LeftNav, type DashTab } from './LeftNav'
import { InboxPanel } from './InboxPanel'
import { MatchesPanel } from './MatchesPanel'
import { HoodsPanel } from './HoodsPanel'
import { GroupsPanel } from './GroupsPanel'
import { ProfilePanel } from './ProfilePanel'
import { VenueManagementPanel } from './VenueManagementPanel'
import { VenuesPanel } from './VenuesPanel'
import { GearPanel } from './GearPanel'
import type { GearImageInput, GearItemInput, GearShowcaseEntryInput, GearStringJobInput } from '@/lib/api/gear'
import type { GearLinkImportDraft } from '@/lib/gear-link-import'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'

interface Props {
  userId: string
  items: MatchListItem[]
  userEmail?: string | null
  playersData: PlayersData
  inviteCircle: InviteCircleRow[]
  profile: Pick<
    Profile,
    | 'display_name'
    | 'first_name'
    | 'last_name'
    | 'gender'
    | 'primary_venue_id'
    | 'contact_channel'
    | 'contact_email'
    | 'contact_phone'
    | 'avatar_url'
    | 'show_in_venue_member_discovery'
    | 'allow_non_group_invites'
    | 'looking_to_play'
    | 'preferred_play_times'
  >
  myIdentities: (VenueIdentity & { venue: Venue })[]
  myVenuePrefs: Venue[]
  joinableVenues: Venue[]
  sports: Sport[]
  mySports: UserSport[]
  mySportProfiles: UserSportProfile[]
  gearItems: GearItem[]
  gearImages: GearImage[]
  gearStringJobs: GearStringJob[]
  gearShowcaseEntries: GearShowcaseEntry[]
  myAdminVenues: (VenueAdmin & { venue: Venue })[]
  isSuperAdmin: boolean
  onUpdateProfile: (formData: FormData) => Promise<void>
  onSetDisplayName: (newName: string) => Promise<void>
  onAvatarSaved: () => Promise<void>
  onSetPrimaryVenue: (venueId: string) => Promise<void>
  onLeaveVenue: (venueId: string) => Promise<void>
  onRemoveVenuePreference: (venueId: string) => Promise<void>
  onJoinVenue: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onSaveGlobalPreferences: (params: {
    show_in_venue_member_discovery?: boolean
    allow_non_group_invites?: boolean
  }) => Promise<void>
  onSetVenuePreferences: (venueId: string, params: {
    visible_in_venue_member_discovery?: 'true' | 'false' | 'inherit'
    accept_non_group_invites_in_venue?: 'true' | 'false' | 'inherit'
  }) => Promise<void>
  onSetSports: (codes: string[]) => Promise<void>
  onSaveSportProfile: (input: {
    sport_id: number
    level?: string | null
    years_playing?: number | null
    preferred_formats?: string[]
    current_frequency?: string | null
    play_style?: string | null
    competition_experience?: string | null
    teams_played_on?: string | null
    line_played?: string | null
    highlights?: string | null
    gear_primary?: string | null
    gear_secondary?: string | null
    gear_shoes?: string | null
  }) => Promise<void>
  onCreateGearItem: (input: GearItemInput) => Promise<GearItem>
  onUpdateGearItem: (itemId: string, input: Partial<GearItemInput>) => Promise<GearItem>
  onDeleteGearItem: (itemId: string) => Promise<void>
  onArchiveGearItem: (itemId: string, archived: boolean) => Promise<GearItem>
  onMoveWishlistItemToOwned: (itemId: string) => Promise<GearItem>
  onCreateGearImage: (input: GearImageInput) => Promise<GearImage>
  onUpdateGearImage: (imageId: string, input: Partial<GearImageInput>) => Promise<GearImage>
  onDeleteGearImage: (imageId: string) => Promise<void>
  onCreateGearStringJob: (input: GearStringJobInput) => Promise<GearStringJob>
  onDeleteGearStringJob: (jobId: string) => Promise<void>
  onUpsertGearShowcaseEntry: (input: GearShowcaseEntryInput) => Promise<GearShowcaseEntry>
  onDeleteGearShowcaseEntry: (entryId: string) => Promise<void>
  onImportWishlistLink: (url: string) => Promise<GearLinkImportDraft>
  onParseContactScreenshots: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
  onCancelMatch: (matchId: string) => Promise<void>
  inboxUnreadCount?: number
}

const DASH_TABS: DashTab[] = ['inbox', 'matches', 'hoods', 'groups', 'venues', 'gear', 'profile', 'admin']

function isDashTab(value: string | null): value is DashTab {
  return value !== null && DASH_TABS.includes(value as DashTab)
}

export function DashboardShell({
  userId,
  items,
  userEmail,
  inboxUnreadCount,
  playersData,
  inviteCircle,
  profile,
  myIdentities,
  myVenuePrefs,
  joinableVenues,
  sports,
  mySports,
  mySportProfiles,
  gearItems,
  gearImages,
  gearStringJobs,
  gearShowcaseEntries,
  myAdminVenues,
  isSuperAdmin,
  onUpdateProfile,
  onSetDisplayName,
  onAvatarSaved,
  onSetPrimaryVenue,
  onLeaveVenue,
  onRemoveVenuePreference,
  onJoinVenue,
  onSaveGlobalPreferences,
  onSetVenuePreferences,
  onSetSports,
  onSaveSportProfile,
  onCreateGearItem,
  onUpdateGearItem,
  onDeleteGearItem,
  onArchiveGearItem,
  onMoveWishlistItemToOwned,
  onCreateGearImage,
  onUpdateGearImage,
  onDeleteGearImage,
  onCreateGearStringJob,
  onDeleteGearStringJob,
  onUpsertGearShowcaseEntry,
  onDeleteGearShowcaseEntry,
  onImportWishlistLink,
  onParseContactScreenshots,
  onImportScreenshotContacts,
  onCancelMatch,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAdmin = isSuperAdmin || myAdminVenues.length > 0
  const [activeTab, setActiveTab] = useState<DashTab>(() => {
    const requestedTab = searchParams.get('tab')
    if (requestedTab === 'players') return 'hoods'
    if (requestedTab === 'contacts') return 'hoods'
    return isDashTab(requestedTab) ? requestedTab : 'matches'
  })
  const [dismissedMatchIds, setDismissedMatchIds] = useState<Set<string>>(new Set())
  const [inboxBadge, setInboxBadge] = useState(inboxUnreadCount ?? 0)

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (activeTab === 'matches') {
      nextParams.delete('tab')
    } else {
      nextParams.set('tab', activeTab)
    }
    const nextQuery = nextParams.toString()
    const currentQuery = searchParams.toString()
    if (nextQuery === currentQuery) return
    router.replace(nextQuery ? `/dashboard?${nextQuery}` : '/dashboard', { scroll: false })
  }, [activeTab, router, searchParams])

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
      if (
        item.match.status === 'cancelled' &&
        !past
      ) {
        matchesBadge++
      }
    }
    const groupsBadge = playersData.pendingGroupInvites.length || undefined
    const profileBadge = playersData.proxyPendingCount || undefined
    return {
      inbox: inboxBadge || undefined,
      matches: matchesBadge || undefined,
      groups: groupsBadge,
      profile: profileBadge,
    }
  }, [items, playersData.pendingGroupInvites.length, playersData.proxyPendingCount, dismissedMatchIds, inboxBadge])

  const mainWidthClass = activeTab === 'profile' || activeTab === 'gear' || activeTab === 'hoods' || activeTab === 'groups'
    ? 'max-w-6xl'
    : 'max-w-3xl'

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
      <main className={`flex-1 ${mainWidthClass} mx-auto px-6 py-8`}>
        {activeTab === 'inbox' && (
          <InboxPanel onUnreadChange={setInboxBadge} />
        )}
        {activeTab === 'matches' && (
        <MatchesPanel
          items={items}
          userId={userId}
          defaultVenueId={profile.primary_venue_id ?? ''}
          onCancelMatch={onCancelMatch}
          dismissedAlertMatchIds={dismissedMatchIds}
          onViewedMatch={matchId =>
            setDismissedMatchIds(prev => new Set([...prev, matchId]))
          }
          onDismissAlert={matchId =>
            setDismissedMatchIds(prev => new Set([...prev, matchId]))
          }
        />
      )}
        {activeTab === 'hoods' && (
          <HoodsPanel
            userId={userId}
            items={items}
            inviteCircle={inviteCircle}
            groups={playersData.groups}
            myIdentities={myIdentities}
            sports={sports}
            enabledSportIds={mySports.map((sport) => sport.sport_id)}
            onParseScreenshots={onParseContactScreenshots}
            onImportScreenshotContacts={onImportScreenshotContacts}
            onOpenProfile={() => setActiveTab('profile')}
          />
        )}
        {activeTab === 'groups' && (
          <GroupsPanel
            groups={playersData.groups}
            pendingInvites={playersData.pendingGroupInvites}
            sports={sports}
          />
        )}
        {activeTab === 'profile' && (
          <ProfilePanel
            userId={userId}
            profile={profile}
            userEmail={userEmail}
            myIdentities={myIdentities}
            myVenuePrefs={myVenuePrefs}
            joinableVenues={joinableVenues}
            sports={sports}
            mySportIds={mySports.map(s => s.sport_id)}
            mySportProfiles={mySportProfiles}
            onUpdateProfile={onUpdateProfile}
            onSetDisplayName={onSetDisplayName}
            onAvatarSaved={onAvatarSaved}
            onSetPrimaryVenue={onSetPrimaryVenue}
            onLeaveVenue={onLeaveVenue}
            onRemoveVenuePreference={onRemoveVenuePreference}
            onJoinVenue={onJoinVenue}
            onSaveGlobalPreferences={onSaveGlobalPreferences}
            onSetVenuePreferences={onSetVenuePreferences}
            onSetSports={onSetSports}
            onSaveSportProfile={onSaveSportProfile}
          />
        )}
        {activeTab === 'gear' && (
          <GearPanel
            userId={userId}
            items={gearItems}
            images={gearImages}
            stringJobs={gearStringJobs}
            showcaseEntries={gearShowcaseEntries}
            onCreateItem={onCreateGearItem}
            onUpdateItem={onUpdateGearItem}
            onDeleteItem={onDeleteGearItem}
            onArchiveItem={onArchiveGearItem}
            onMoveWishlistToOwned={onMoveWishlistItemToOwned}
            onCreateImage={onCreateGearImage}
            onUpdateImage={onUpdateGearImage}
            onDeleteImage={onDeleteGearImage}
            onCreateStringJob={onCreateGearStringJob}
            onDeleteStringJob={onDeleteGearStringJob}
            onUpsertShowcase={onUpsertGearShowcaseEntry}
            onDeleteShowcase={onDeleteGearShowcaseEntry}
            onImportWishlistLink={onImportWishlistLink}
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
          <VenueManagementPanel
            myAdminVenues={myAdminVenues}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </main>
    </div>
  )
}
