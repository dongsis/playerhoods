'use client'

import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { MatchListItem } from '@/lib/api/matches'
import type { PlayersData } from '@/lib/api/players'
import type { InviteCircleRow } from '@/lib/api/play-network'
import type { DiscoveryVolume, GearImage, GearItem, GearShowcaseEntry, GearStringJob, IdentityLinkCandidate, Profile, UserPlayCity, UserVerifiedEmail, Venue, VenueAdmin, VenueSport, Sport, UserSport, UserSportProfile } from '@/lib/types/database'
import type { VenueMembership } from '@/lib/api/identities'
import { IdentityLinkReviewCard } from '@/app/components/IdentityLinkReviewCard'
import { LeftNav, NavIcon, type DashTab } from './LeftNav'
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
import type { DashboardPreferenceSaveResult, IdentityLinkActionResult } from './dashboard.actions'
import type { LocationCityOption } from '@/lib/api/location-municipalities'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getContactPlayerResolution } from '@/lib/api/roster'

interface Props {
  userId: string
  items: MatchListItem[]
  notice?: string | null
  selectedMatchId?: string | null
  selectedMatchDetail?: ReactNode
  userEmail?: string | null
  playersData: PlayersData
  inviteCircle: InviteCircleRow[]
  verifiedEmails: UserVerifiedEmail[]
  identityLinkCandidates: IdentityLinkCandidate[]
  profile: Pick<
    Profile,
    | 'display_name'
    | 'first_name'
    | 'last_name'
    | 'gender'
    | 'availability_status'
    | 'availability_note'
    | 'availability_until'
    | 'primary_venue_id'
    | 'contact_channel'
    | 'contact_email'
    | 'profile_contact_email_normalized'
    | 'profile_contact_email_verified_at'
    | 'contact_phone'
    | 'avatar_url'
    | 'visible_in_city_discovery'
    | 'searchable_by_contact_info'
    | 'discovery_volume'
    | 'accepting_new_invites'
    | 'allow_non_group_invites'
    | 'shared_group_join_preference'
    | 'looking_to_play'
    | 'preferred_play_times'
  >
  myVenueMemberships: VenueMembership[]
  myVenuePrefs: Venue[]
  joinableVenues: Venue[]
  venueSports: VenueSport[]
  sports: Sport[]
  mySports: UserSport[]
  mySportProfiles: UserSportProfile[]
  myPlayCities: UserPlayCity[]
  availablePlayCities: LocationCityOption[]
  gearItems: GearItem[]
  gearImages: GearImage[]
  gearStringJobs: GearStringJob[]
  gearShowcaseEntries: GearShowcaseEntry[]
  myAdminVenues: (VenueAdmin & { venue: Venue })[]
  isSuperAdmin: boolean
  onUpdateProfile: (formData: FormData) => Promise<void>
  onAcceptIdentityLink: (guestId: string) => Promise<IdentityLinkActionResult>
  onKeepSeparateIdentityLink: (guestId: string) => Promise<IdentityLinkActionResult>
  onSetDisplayName: (newName: string) => Promise<void>
  onAvatarSaved: () => Promise<void>
  onSetPrimaryVenue: (venueId: string) => Promise<void>
  onLeaveVenue: (venueId: string) => Promise<void>
  onSaveVenuePreference: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onRemoveVenuePreference: (venueId: string) => Promise<void>
  onJoinVenue: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onSaveGlobalPreferences: (params: {
    visible_in_city_discovery?: boolean
    searchable_by_email_or_phone?: boolean
    discovery_volume?: DiscoveryVolume
    accepting_new_invites?: boolean
    play_cities?: Array<{ city_name: string; region?: string | null; country?: string | null }>
    allow_non_group_invites?: boolean
    shared_group_join_preference?: 'auto_join_saved_players' | 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
  }) => Promise<DashboardPreferenceSaveResult>
  onSetVenueMemberDiscovery: (venueId: string, visibleInVenueMemberDiscovery: boolean) => Promise<DashboardPreferenceSaveResult>
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
const MOBILE_DASH_TABS: DashTab[] = ['matches', 'hoods', 'groups', 'inbox', 'profile']

function isDashTab(value: string | null): value is DashTab {
  return value !== null && DASH_TABS.includes(value as DashTab)
}

function getDismissedMatchStorageKey(userId: string) {
  return `dashboard:dismissed-match-alerts:${userId}`
}

type DashboardLiveResponse = {
  items: MatchListItem[]
  inboxUnreadCount: number
}

type StarterMatchFormat = 'singles' | 'doubles' | 'unknown'
const STARTER_DISMISS_MS = 24 * 60 * 60 * 1000

function isExpectedLiveRefreshError(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalized = `${name} ${message}`.toLowerCase()

  return normalized.includes('abort')
    || normalized.includes('cancel')
    || normalized.includes('navigation')
    || normalized.includes('failed to fetch')
}

function getStarterFormatStorageKey(userId: string) {
  return `dashboard:first-hood-format:${userId}`
}

function getStarterDismissStorageKey(userId: string) {
  return `dashboard:first-hood-dismissed-at:${userId}`
}

function getStarterTarget(format: StarterMatchFormat) {
  return format === 'doubles' ? 3 : 1
}

function MobileBottomNav({
  active,
  onTab,
  onLogout,
  badges,
}: {
  active: DashTab
  onTab: (tab: DashTab) => void
  onLogout: () => void
  badges: Partial<Record<DashTab, number | undefined>>
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E2E8F0] bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.7rem)] pt-2 shadow-[0_-14px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-xl items-end justify-between gap-1">
        {MOBILE_DASH_TABS.map((tab) => {
          const isActive = active === tab
          const label = tab === 'profile' ? 'Profile' : `${tab.charAt(0).toUpperCase()}${tab.slice(1)}`
          const badge = badges[tab] ?? 0

          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTab(tab)}
              className={[
                'relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] px-2 py-2.5 transition',
                isActive
                  ? 'bg-[#eff6ff] text-[#0d6efd]'
                  : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-flex h-9 w-9 items-center justify-center rounded-full transition',
                  isActive ? 'bg-[#0d6efd] text-white shadow-[0_10px_20px_rgba(13, 110, 253, 0.18)]' : 'bg-[#F8FAFC] text-current',
                ].join(' ')}
              >
                <NavIcon tab={tab} className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[11px] font-semibold tracking-[-0.01em]">{label}</span>
              {badge > 0 ? (
                <span className="absolute right-[22%] top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold leading-none text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </button>
          )
        })}
        <button
          type="button"
          onClick={onLogout}
          className="relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] px-2 py-2.5 text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#1E293B]"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F8FAFC] text-current transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
              <path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v9A1.5 1.5 0 0 0 6.5 18H10" />
              <path d="M13 8l4 4-4 4" />
              <path d="M9 12h8" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold tracking-[-0.01em]">Log out</span>
        </button>
      </div>
    </nav>
  )
}

export function DashboardShell({
  userId,
  items,
  notice,
  selectedMatchId,
  selectedMatchDetail,
  userEmail,
  inboxUnreadCount,
  playersData,
  inviteCircle,
  verifiedEmails,
  identityLinkCandidates,
  profile,
  myVenueMemberships,
  myVenuePrefs,
  joinableVenues,
  venueSports,
  sports,
  mySports,
  mySportProfiles,
  myPlayCities,
  availablePlayCities,
  gearItems,
  gearImages,
  gearStringJobs,
  gearShowcaseEntries,
  myAdminVenues,
  isSuperAdmin,
  onUpdateProfile,
  onAcceptIdentityLink,
  onKeepSeparateIdentityLink,
  onSetDisplayName,
  onAvatarSaved,
  onSetPrimaryVenue,
  onLeaveVenue,
  onSaveVenuePreference,
  onRemoveVenuePreference,
  onJoinVenue,
  onSaveGlobalPreferences,
  onSetVenueMemberDiscovery,
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
    if ((requestedTab === 'venues' || requestedTab === 'admin' || requestedTab === 'gear') && !isAdmin) return 'matches'
    return isDashTab(requestedTab) ? requestedTab : 'matches'
  })
  const [viewedMatchIds, setViewedMatchIds] = useState<Set<string>>(new Set())
  const [dismissedMatchIds, setDismissedMatchIds] = useState<Set<string>>(new Set())
  const [dismissedMatchIdsReady, setDismissedMatchIdsReady] = useState(false)
  const [inboxBadge, setInboxBadge] = useState(inboxUnreadCount ?? 0)
  const [liveItems, setLiveItems] = useState(items)
  const [starterContactCount, setStarterContactCount] = useState(0)
  const [starterFormat, setStarterFormat] = useState<StarterMatchFormat>('unknown')
  const [starterDismissedAt, setStarterDismissedAt] = useState<number | null>(null)
  const [openContactComposerSignal, setOpenContactComposerSignal] = useState(0)
  const liveRefreshInFlightRef = useRef(false)

  const refreshDashboardLive = useCallback(async () => {
    if (liveRefreshInFlightRef.current) return
    liveRefreshInFlightRef.current = true

    try {
      const response = await fetch('/api/dashboard/live', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status !== 401) {
          console.error('[DashboardShell] live refresh failed:', response.status)
        }
        return
      }

      const payload = await response.json() as DashboardLiveResponse
      setLiveItems(payload.items ?? [])
      setInboxBadge(payload.inboxUnreadCount ?? 0)
    } catch (error) {
      if (isExpectedLiveRefreshError(error)) {
        return
      }
      console.error('[DashboardShell] live refresh request failed:', error)
    } finally {
      liveRefreshInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    setLiveItems(items)
  }, [items])

  useEffect(() => {
    setInboxBadge(inboxUnreadCount ?? 0)
  }, [inboxUnreadCount])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(getStarterFormatStorageKey(userId))
      if (stored === 'singles' || stored === 'doubles' || stored === 'unknown') {
        setStarterFormat(stored)
      }
      const storedDismissedAt = Number(window.localStorage.getItem(getStarterDismissStorageKey(userId)) ?? '')
      if (Number.isFinite(storedDismissedAt) && storedDismissedAt > 0) {
        setStarterDismissedAt(storedDismissedAt)
      }
    } catch {
      // Keep the default format if localStorage is unavailable.
    }

    const supabase = createSupabaseBrowserClient()
    let cancelled = false
    getContactPlayerResolution(supabase)
      .then((contacts) => {
        if (cancelled) return
        setStarterContactCount(contacts.length)
      })
      .catch((error) => {
        console.warn('[DashboardShell] starter contact count failed:', error)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const handleStarterFormatChange = useCallback((format: StarterMatchFormat) => {
    setStarterFormat(format)
    try {
      window.localStorage.setItem(getStarterFormatStorageKey(userId), format)
    } catch {
      // Ignore localStorage failures.
    }
  }, [userId])

  const handleStarterDismiss = useCallback(() => {
    const dismissedAt = Date.now()
    setStarterDismissedAt(dismissedAt)
    try {
      window.localStorage.setItem(getStarterDismissStorageKey(userId), String(dismissedAt))
    } catch {
      // Ignore localStorage failures.
    }
  }, [userId])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(getDismissedMatchStorageKey(userId))
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        if (Array.isArray(parsed)) {
          setDismissedMatchIds(new Set(parsed))
        }
      }
    } catch (error) {
      console.warn('[DashboardShell] restore dismissed match alerts failed:', error)
    } finally {
      setDismissedMatchIdsReady(true)
    }
  }, [userId])

  useEffect(() => {
    if (!dismissedMatchIdsReady) return
    try {
      window.localStorage.setItem(
        getDismissedMatchStorageKey(userId),
        JSON.stringify(Array.from(dismissedMatchIds)),
      )
    } catch (error) {
      console.warn('[DashboardShell] persist dismissed match alerts failed:', error)
    }
  }, [dismissedMatchIds, dismissedMatchIdsReady, userId])

  const suppressedMatchIds = useMemo(
    () => new Set([...viewedMatchIds, ...dismissedMatchIds]),
    [dismissedMatchIds, viewedMatchIds],
  )
  const firstMatchCreated = useMemo(
    () => liveItems.some((item) => item.match.organizer_id === userId),
    [liveItems, userId],
  )
  const starterTarget = getStarterTarget(starterFormat)
  const starterDismissedRecently = starterDismissedAt !== null && Date.now() - starterDismissedAt < STARTER_DISMISS_MS
  const shouldShowStarterCard = !starterDismissedRecently
    && !(starterContactCount >= starterTarget && firstMatchCreated)

  useEffect(() => {
    if (!isAdmin && (activeTab === 'venues' || activeTab === 'admin' || activeTab === 'gear')) {
      setActiveTab('matches')
      return
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    if (activeTab === 'matches') {
      nextParams.delete('tab')
    } else {
      nextParams.set('tab', activeTab)
      nextParams.delete('matchId')
    }
    const nextQuery = nextParams.toString()
    const currentQuery = searchParams.toString()
    if (nextQuery === currentQuery) return
    router.replace(nextQuery ? `/dashboard?${nextQuery}` : '/dashboard', { scroll: false })
  }, [activeTab, isAdmin, router, searchParams])

  useEffect(() => {
    const shouldLiveRefresh = activeTab === 'matches' || activeTab === 'inbox'
    if (!shouldLiveRefresh) {
      return
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshDashboardLive()
    }, 5000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshDashboardLive()
      }
    }
    const handleDashboardLiveRefresh = () => {
      void refreshDashboardLive()
    }

    if (document.visibilityState === 'visible') {
      void refreshDashboardLive()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('playerhoods:dashboard-live-refresh', handleDashboardLiveRefresh)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('playerhoods:dashboard-live-refresh', handleDashboardLiveRefresh)
    }
  }, [activeTab, refreshDashboardLive])

  // Compute nav badge counts
  const badges = useMemo(() => {
    const nowIso = new Date().toISOString()
    let matchesBadge = 0
    for (const item of liveItems) {
      if (suppressedMatchIds.has(item.match.id)) continue
      const mp = item.myParticipant
      if (!mp) continue
      const past = item.match.start_at_utc
        ? item.match.start_at_utc < nowIso
        : item.match.match_date
          ? item.match.match_date < nowIso.slice(0, 10)
          : false
      const hasUserAccepted = mp.participant_accepted_at != null
      // Pending invite needing user action. Some DB rows still use the historical
      // join_method value for participant-suggested invites.
      if (
        mp.status === 'pending' &&
        (
          ((mp.join_method === 'invited' || mp.join_method === 'nominated') && !hasUserAccepted)
          || (mp.join_method === 'requested' && mp.org_approved_at !== null && !hasUserAccepted)
        ) &&
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
    const hoodsStarterDot = !starterDismissedRecently && starterContactCount < starterTarget
    const matchesStarterDot = !starterDismissedRecently && starterContactCount >= starterTarget && !firstMatchCreated
    return {
      inbox: inboxBadge || undefined,
      matches: matchesBadge || (matchesStarterDot ? -1 : undefined),
      hoods: hoodsStarterDot ? -1 : undefined,
      groups: groupsBadge,
    }
  }, [firstMatchCreated, inboxBadge, liveItems, playersData.pendingGroupInvites.length, starterContactCount, starterDismissedRecently, starterTarget, suppressedMatchIds])

  const mainWidthClass = activeTab === 'matches'
    ? 'max-w-[1500px]'
    : activeTab === 'profile' || activeTab === 'gear' || activeTab === 'hoods' || activeTab === 'groups'
    ? 'max-w-6xl'
    : 'max-w-3xl'
  const shouldLeftAlignMain = activeTab === 'groups'
  const handleLogout = useCallback(async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  return (
    <div className="flex min-h-screen bg-[#F0F7FF]">
      {/* Left nav — sticky sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-[#E2E8F0] bg-[#F1F1F3] md:block">
        <LeftNav
          active={activeTab}
          onTab={setActiveTab}
          isAdmin={isAdmin}
          badges={{ ...badges, inbox: badges.inbox ?? inboxBadge }}
          badgeTooltips={{
            hoods: 'Add contacts to build your first Hood.',
            matches: 'Start your first match from your Hood.',
          }}
        />
      </aside>

      {/* Main content */}
      <main className={`flex-1 px-4 pb-28 pt-4 md:px-6 md:py-8 ${shouldLeftAlignMain ? '' : `${mainWidthClass} mx-auto`}`}>
        {notice === 'email-verified' ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-body-main font-semibold text-emerald-700">
            Email verified. Welcome to PlayerHoods.
          </div>
        ) : null}
        {identityLinkCandidates.length > 0 && activeTab !== 'profile' ? (
          <div className="mb-6">
            <IdentityLinkReviewCard
              title="We found invitations for you"
              body="We found matches linked to your contact information."
              candidates={identityLinkCandidates}
              onAccept={onAcceptIdentityLink}
              onKeepSeparate={onKeepSeparateIdentityLink}
            />
          </div>
        ) : null}
        {activeTab === 'inbox' && (
          <InboxPanel onUnreadChange={setInboxBadge} />
        )}
        {activeTab === 'matches' && (
        <MatchesPanel
          items={liveItems}
          userId={userId}
          defaultVenueId={profile.primary_venue_id ?? ''}
          myPlayCities={myPlayCities}
          venueSports={venueSports}
          profileAvatarUrl={profile.avatar_url}
          profileDisplayName={profile.display_name}
          profileFirstName={profile.first_name}
          profileLastName={profile.last_name}
          selectedMatchId={selectedMatchId ?? null}
          selectedMatchDetail={selectedMatchDetail}
          onCancelMatch={onCancelMatch}
          onParseScreenshots={onParseContactScreenshots}
          onImportScreenshotContacts={onImportScreenshotContacts}
          starterCard={shouldShowStarterCard ? {
            contactCount: starterContactCount,
            preferredFormat: starterFormat,
            firstMatchCreated,
            onPreferredFormatChange: handleStarterFormatChange,
            onDismiss: handleStarterDismiss,
            onAddContact: () => {
              setActiveTab('hoods')
              setOpenContactComposerSignal((value) => value + 1)
            },
          } : null}
          dismissedAlertMatchIds={suppressedMatchIds}
          onViewedMatch={matchId =>
            setViewedMatchIds(prev => new Set([...prev, matchId]))
          }
          onDismissAlert={matchId =>
            setDismissedMatchIds(prev => new Set([...prev, matchId]))
          }
        />
      )}
        {activeTab === 'hoods' && (
          <HoodsPanel
            userId={userId}
            items={liveItems}
            inviteCircle={inviteCircle}
            groups={playersData.groups}
            myVenueMemberships={myVenueMemberships}
            sports={sports}
            enabledSportIds={mySports.map((sport) => sport.sport_id)}
            myPlayCities={myPlayCities}
            onRefreshDashboardLive={refreshDashboardLive}
            onParseScreenshots={onParseContactScreenshots}
            onImportScreenshotContacts={onImportScreenshotContacts}
            onOpenProfile={() => setActiveTab('profile')}
            openContactComposerSignal={openContactComposerSignal}
            onStarterStatusChange={({ contactCount, preferredFormat }) => {
              setStarterContactCount(contactCount)
              setStarterFormat(preferredFormat)
            }}
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
            verifiedEmails={verifiedEmails}
            identityLinkCandidates={identityLinkCandidates}
            myVenueMemberships={myVenueMemberships}
            myVenuePrefs={myVenuePrefs}
            joinableVenues={joinableVenues}
            venueSports={venueSports}
            sports={sports}
            mySportIds={mySports.map(s => s.sport_id)}
            mySportProfiles={mySportProfiles}
            myPlayCities={myPlayCities}
            availablePlayCities={availablePlayCities}
            onUpdateProfile={onUpdateProfile}
            onAcceptIdentityLink={onAcceptIdentityLink}
            onKeepSeparateIdentityLink={onKeepSeparateIdentityLink}
            onSetDisplayName={onSetDisplayName}
            onAvatarSaved={onAvatarSaved}
            onSetPrimaryVenue={onSetPrimaryVenue}
            onLeaveVenue={onLeaveVenue}
            onSaveVenuePreference={onSaveVenuePreference}
            onRemoveVenuePreference={onRemoveVenuePreference}
            onJoinVenue={onJoinVenue}
            onSaveGlobalPreferences={onSaveGlobalPreferences}
            onSetVenueMemberDiscovery={onSetVenueMemberDiscovery}
            onSetSports={onSetSports}
            onSaveSportProfile={onSaveSportProfile}
          />
        )}
        {activeTab === 'gear' && isAdmin && (
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
            myVenueMemberships={myVenueMemberships}
            myVenuePrefs={myVenuePrefs}
            isAdmin={isAdmin}
            myAdminVenues={myAdminVenues}
          />
        )}
        {activeTab === 'admin' && isAdmin && (
          <VenueManagementPanel
            myAdminVenues={myAdminVenues}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </main>
      <MobileBottomNav active={activeTab} onTab={setActiveTab} onLogout={handleLogout} badges={{ ...badges, inbox: badges.inbox ?? inboxBadge }} />
    </div>
  )
}
