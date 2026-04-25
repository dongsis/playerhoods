'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { processDeliveriesAction } from '@/app/matches/[matchId]/process-deliveries-action'
import type { GroupContactWithDisplay } from '@/lib/api/groups'
import {
  addContactPlayerToGroup,
  inviteUserToGroup,
} from '@/lib/api/groups'
import {
  fetchGroupContactsByGroup,
  fetchGuestLookupMap,
  fetchGuestSportsMap,
  fetchPublicPlayerProfiles,
  type GuestLookupRow,
} from '@/lib/api/hoods'
import {
  getAdmissionTargets,
  inviteUserToMatch,
  nominateGuest,
  requestMatchProxyBindingForContactPlayer,
  type AdmissionTarget,
  type MatchListItem,
} from '@/lib/api/matches'
import type { InviteCircleRow } from '@/lib/api/play-network'
import {
  getVenueInvitableMembers,
  removeFromInviteCircle,
  saveContactPlayer,
  saveToInviteCircle,
} from '@/lib/api/play-network'
import type { GroupWithMembers } from '@/lib/api/players'
import {
  getPublicPlayerProfile,
  type PublicPlayerProfile,
  type PublicSportProfile,
} from '@/lib/api/player-profiles'
import {
  createRosterGuest,
  getContactPlayerResolution,
  updateRosterGuest,
  type ContactPlayerResolved,
} from '@/lib/api/roster'
import { Avatar } from '@/app/components/Avatar'
import { ContactScreenshotImportSection } from '@/app/dashboard/ContactScreenshotImportSection'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatTimeWindow } from '@/lib/format-time'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import { setGuestSports } from '@/lib/api/sports'
import { getLevelLabel } from '@/lib/profile-options'
import { getAvailabilityStatusDotClass } from '@/lib/profile-options'
import { getPreferredPlayTimeLabel } from '@/lib/profile-options'
import { getGroupIconMeta } from '@/lib/group-icons'
import { getVenueDisplayName } from '@/lib/venues/display'
import type {
  AvailabilityStatus,
  Sport,
  Venue,
  VenueIdentity,
} from '@/lib/types/database'

type SupportedSportCode = 'tennis' | 'pickleball' | 'badminton'
type HoodSection = 'hood' | 'discover'
type HoodFilter = 'all' | 'saved' | 'group'
type DiscoverSource = 'club_members' | 'played_with'
type IdentityType = 'platform' | 'contact' | 'linked'
type ContactGender = 'male' | 'female' | 'unspecified' | null
type SourceBadge =
  | 'My Contact'
  | 'Starred'
  | 'From Group'
  | 'Played With'
  | 'Linked'

type HoodSport = Sport & { code: SupportedSportCode }

type MutablePerson = {
  key: string
  userId: string | null
  guestId: string | null
  personId: string | null
  linkedUserId: string | null
  displayName: string
  avatarUrl: string | null
  identityType: IdentityType
  sourceBadges: Set<SourceBadge>
  groupNames: Set<string>
  clubNames: Set<string>
  isMyContact: boolean
  isSaved: boolean
  isFromGroup: boolean
  isLinked: boolean
  isClubMember: boolean
  isPlayedWith: boolean
  canEditContact: boolean
  gender: ContactGender
  level: string | null
  playType: string | null
  statusLabel: string | null
  engagedSports: string[]
  preferredFormats: string[]
  sportLabel: string
  recentInteractionAt: string | null
  sharedMatchCount: number
  saveSourceGroupId: string | null
  saveSourceMatchId: string | null
}

type HoodPerson = {
  key: string
  userId: string | null
  guestId: string | null
  personId: string | null
  linkedUserId: string | null
  displayName: string
  avatarUrl: string | null
  identityType: IdentityType
  sourceBadges: SourceBadge[]
  groupNames: string[]
  clubNames: string[]
  isMyContact: boolean
  isSaved: boolean
  isFromGroup: boolean
  isLinked: boolean
  isClubMember: boolean
  isPlayedWith: boolean
  canEditContact: boolean
  gender: ContactGender
  level: string | null
  playType: string | null
  statusLabel: string | null
  engagedSports: string[]
  preferredFormats: string[]
  sportLabel: string
  recentInteractionAt: string | null
  sharedMatchCount: number
  saveSourceGroupId: string | null
  saveSourceMatchId: string | null
}

type ClubDiscoverPerson = {
  userId: string
  displayName: string
  clubNames: string[]
}

type ClubDiscoverGroup = {
  groupId: string
  name: string
  description: string | null
  primarySportId: number | null
  iconKey: string
  clubNames: string[]
  memberCount: number
}

type SupportData = {
  contacts: ContactPlayerResolved[]
  contactsByGuestId: Map<string, ContactPlayerResolved>
  savedContactPersonIds: Set<string>
  profilesByUserId: Map<string, PublicPlayerProfile | null>
  groupContactsByGroupId: Map<string, GroupContactWithDisplay[]>
  guestLookupByGuestId: Map<string, GuestLookupRow>
  guestSportsByGuestId: Map<string, number[]>
}

type Props = {
  userId: string
  items: MatchListItem[]
  inviteCircle: InviteCircleRow[]
  groups: GroupWithMembers[]
  myIdentities: (VenueIdentity & { venue: Venue })[]
  sports: Sport[]
  enabledSportIds: number[]
  onParseScreenshots: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
  onOpenProfile: () => void
}

const SUPPORTED_SPORTS: SupportedSportCode[] = ['tennis', 'pickleball', 'badminton']

function isSupportedSportCode(value: string): value is SupportedSportCode {
  return SUPPORTED_SPORTS.includes(value as SupportedSportCode)
}

function getIdentityLabel(identityType: IdentityType): string {
  switch (identityType) {
    case 'contact':
      return 'Contact'
    case 'linked':
      return 'Linked'
    case 'platform':
    default:
      return 'Platform'
  }
}

function normalizeDisplayName(value: string | null | undefined): string {
  if (!value) return 'Unknown player'
  return value.replace(/\s+\(Not registered\)$/i, '').trim() || 'Unknown player'
}

function formatStatusLabel(
  profile: PublicPlayerProfile | null | undefined,
  contact?: ContactPlayerResolved | null,
): string | null {
  if (contact?.availability_status) {
    switch (contact.availability_status) {
      case 'busy':
        return 'Busy'
      case 'away':
        return 'Away'
      case 'inactive':
        return 'Inactive'
      case 'available':
      default:
        return 'Available'
    }
  }

  switch (profile?.looking_to_play) {
    case 'quite_full':
      return 'Busy'
    case 'not_looking':
      return 'Away'
    case 'occasional':
      return 'Occasionally'
    case 'very_open':
    case 'open':
      return 'Open'
    default:
      return null
  }
}

function formatGenderPill(gender: 'male' | 'female' | 'unspecified' | null): string | null {
  switch (gender) {
    case 'female':
      return 'F'
    case 'male':
      return 'M'
    default:
      return null
  }
}

const CONTACT_GENDER_OPTIONS: Array<{
  value: Exclude<ContactGender, null> | ''
  label: string
}> = [
  { value: '', label: 'Not shared yet' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
]

function formatFormatLabel(value: string): string {
  switch (value) {
    case 'singles':
      return 'Singles'
    case 'doubles':
      return 'Doubles'
    case 'open_play':
      return 'Open play'
    default:
      return value.replace(/_/g, ' ')
  }
}

function formatAvailabilityLabel(value: string | null | undefined): string {
  switch (value) {
    case 'quite_full':
      return 'Busy'
    case 'not_looking':
      return 'Away'
    case 'occasional':
      return 'Occasional'
    case 'very_open':
      return 'Very open'
    case 'open':
      return 'Open'
    default:
      return 'Not shared yet'
  }
}

function getStatusBadgeTone(statusLabel: string | null | undefined): {
  label: string
  shortLabel: string
  className: string
} | null {
  switch (statusLabel?.trim().toLowerCase()) {
    case 'very open':
      return {
        label: 'Very open',
        shortLabel: 'VO',
        className: 'bg-[#22C55E] text-white ring-1 ring-[#16A34A]/20',
      }
    case 'open':
    case 'available':
      return {
        label: 'Open',
        shortLabel: 'O',
        className: 'bg-[#4CAF72] text-white ring-1 ring-[#3C915E]/20',
      }
    case 'occasionally':
    case 'occasional':
      return {
        label: 'Occasionally',
        shortLabel: 'OC',
        className: 'bg-[#6E8B6D] text-white ring-1 ring-[#5C755B]/20',
      }
    case 'busy':
      return {
        label: 'Busy',
        shortLabel: 'B',
        className: 'bg-[#5B6472] text-white ring-1 ring-[#4B5563]/20',
      }
    case 'away':
      return {
        label: 'Away',
        shortLabel: 'A',
        className: 'bg-[#475569] text-white ring-1 ring-[#334155]/20',
      }
    case 'not looking right now':
    case 'inactive':
      return {
        label: 'Not looking right now',
        shortLabel: 'N',
        className: 'bg-[#1E293B] text-white ring-1 ring-[#0F172A]/20',
      }
    default:
      return null
  }
}

function formatPreferredTimes(value: string[] | null | undefined): string {
  if (!value || value.length === 0) return 'Not shared yet'
  return value
    .map((item) => getPreferredPlayTimeLabel(item) ?? item)
    .join(', ')
}

function formatCompactLevel(value: string | null | undefined): string | null {
  if (!value) return null

  const label = getLevelLabel(value) ?? value
  const match = label.match(/\(([^)]+)\)/)
  if (match?.[1]) {
    return match[1].replace(/\s*-\s*/g, '/')
  }

  return value
}

function getSportProfile(
  profile: PublicPlayerProfile | null | undefined,
  sportId: number,
): PublicSportProfile | null {
  return profile?.sport_profiles.find((item) => item.sport_id === sportId) ?? null
}

function profileMatchesSport(
  profile: PublicPlayerProfile | null | undefined,
  sportId: number,
): boolean {
  return Boolean(getSportProfile(profile, sportId))
}

function formatRecentDate(value: string | null): string | null {
  if (!value) return null
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return null
  }
}

function isFutureMatch(item: MatchListItem): boolean {
  const now = new Date().toISOString()
  if (item.match.status !== 'active') return false
  if (item.match.start_at_utc) return item.match.start_at_utc > now
  if (item.match.match_date) return item.match.match_date >= now.slice(0, 10)
  return true
}

function buildCanonicalKey(input: {
  linkedUserId?: string | null
  userId?: string | null
  personId?: string | null
  guestId?: string | null
}) {
  const canonicalUserId = input.linkedUserId ?? input.userId
  if (canonicalUserId) return `user:${canonicalUserId}`
  if (input.personId) return `person:${input.personId}`
  if (input.guestId) return `guest:${input.guestId}`
  return `unknown:${Math.random().toString(36).slice(2)}`
}

function toPersonMatchKey(person: HoodPerson): string {
  return `${person.userId ?? ''}:${person.guestId ?? ''}:${person.personId ?? ''}`
}

function ensurePerson(
  map: Map<string, MutablePerson>,
  seed: Partial<MutablePerson> & { key: string; displayName: string; sportLabel: string },
): MutablePerson {
  const existing = map.get(seed.key)
  if (existing) {
    if (seed.userId) existing.userId = seed.userId
    if (seed.guestId) existing.guestId = seed.guestId
    if (seed.personId) existing.personId = seed.personId
    if (seed.linkedUserId) existing.linkedUserId = seed.linkedUserId
    if (seed.avatarUrl) existing.avatarUrl = seed.avatarUrl
    if (seed.displayName && (!existing.displayName || existing.displayName === 'Unknown player')) existing.displayName = seed.displayName
    if (seed.gender && !existing.gender) existing.gender = seed.gender
    if (seed.level && !existing.level) existing.level = seed.level
    if (seed.playType && !existing.playType) existing.playType = seed.playType
    if (seed.statusLabel && !existing.statusLabel) existing.statusLabel = seed.statusLabel
    if ((seed.engagedSports?.length ?? 0) > 0) {
      for (const sportName of seed.engagedSports ?? []) {
        if (!existing.engagedSports.includes(sportName)) existing.engagedSports.push(sportName)
      }
    }
    if ((seed.preferredFormats?.length ?? 0) > 0) {
      for (const format of seed.preferredFormats ?? []) {
        if (!existing.preferredFormats.includes(format)) existing.preferredFormats.push(format)
      }
    }
    if (seed.canEditContact) existing.canEditContact = true
    if (seed.isMyContact) existing.isMyContact = true
    if (seed.isSaved) existing.isSaved = true
    if (seed.isFromGroup) existing.isFromGroup = true
    if (seed.isLinked) existing.isLinked = true
    if (seed.isClubMember) existing.isClubMember = true
    if (seed.isPlayedWith) existing.isPlayedWith = true
    if (seed.saveSourceGroupId && !existing.saveSourceGroupId) existing.saveSourceGroupId = seed.saveSourceGroupId
    if (seed.saveSourceMatchId && !existing.saveSourceMatchId) existing.saveSourceMatchId = seed.saveSourceMatchId
    if (seed.recentInteractionAt && (!existing.recentInteractionAt || seed.recentInteractionAt > existing.recentInteractionAt)) existing.recentInteractionAt = seed.recentInteractionAt
    if ((seed.sharedMatchCount ?? 0) > existing.sharedMatchCount) existing.sharedMatchCount = seed.sharedMatchCount ?? 0
    if (existing.identityType !== 'linked') {
      if (seed.identityType === 'linked') existing.identityType = 'linked'
      if (seed.identityType === 'contact') existing.identityType = 'contact'
    }
    return existing
  }

  const created: MutablePerson = {
    key: seed.key,
    userId: seed.userId ?? null,
    guestId: seed.guestId ?? null,
    personId: seed.personId ?? null,
    linkedUserId: seed.linkedUserId ?? null,
    displayName: seed.displayName,
    avatarUrl: seed.avatarUrl ?? null,
    identityType: seed.identityType ?? 'platform',
    sourceBadges: new Set(),
    groupNames: new Set(),
    clubNames: new Set(),
    isMyContact: seed.isMyContact ?? false,
    isSaved: seed.isSaved ?? false,
    isFromGroup: seed.isFromGroup ?? false,
    isLinked: seed.isLinked ?? false,
    isClubMember: seed.isClubMember ?? false,
    isPlayedWith: seed.isPlayedWith ?? false,
    canEditContact: seed.canEditContact ?? false,
    gender: seed.gender ?? null,
    level: seed.level ?? null,
    playType: seed.playType ?? null,
    statusLabel: seed.statusLabel ?? null,
    engagedSports: seed.engagedSports ?? [],
    preferredFormats: seed.preferredFormats ?? [],
    sportLabel: seed.sportLabel,
    recentInteractionAt: seed.recentInteractionAt ?? null,
    sharedMatchCount: seed.sharedMatchCount ?? 0,
    saveSourceGroupId: seed.saveSourceGroupId ?? null,
    saveSourceMatchId: seed.saveSourceMatchId ?? null,
  }
  map.set(seed.key, created)
  return created
}

function finalizePeople(map: Map<string, MutablePerson>): HoodPerson[] {
  return Array.from(map.values()).map((person) => ({
    ...person,
    sourceBadges: Array.from(person.sourceBadges),
    groupNames: Array.from(person.groupNames),
    clubNames: Array.from(person.clubNames),
  }))
}

function matchesFilter(person: HoodPerson, filter: HoodFilter): boolean {
  switch (filter) {
    case 'saved':
      return isPersonStarred(person)
    case 'group':
      return person.isFromGroup
    case 'all':
    default:
      return true
  }
}

function sortHoodPeople(left: HoodPerson, right: HoodPerson, openMatchCount: Map<string, number>): number {
  const openDelta = (openMatchCount.get(right.key) ?? 0) - (openMatchCount.get(left.key) ?? 0)
  if (openDelta !== 0) return openDelta
  const leftRecent = left.recentInteractionAt ?? ''
  const rightRecent = right.recentInteractionAt ?? ''
  if (leftRecent !== rightRecent) return rightRecent.localeCompare(leftRecent)
  if (left.isMyContact !== right.isMyContact) return left.isMyContact ? -1 : 1
  if (isPersonStarred(left) !== isPersonStarred(right)) return isPersonStarred(left) ? -1 : 1
  if (left.isFromGroup !== right.isFromGroup) return left.isFromGroup ? -1 : 1
  return left.displayName.localeCompare(right.displayName)
}

function sortDiscoverPeople(left: HoodPerson, right: HoodPerson): number {
  if (left.sharedMatchCount !== right.sharedMatchCount) return right.sharedMatchCount - left.sharedMatchCount
  if (left.clubNames.length !== right.clubNames.length) return right.clubNames.length - left.clubNames.length
  return left.displayName.localeCompare(right.displayName)
}

function getHoodsUiStorageKey(userId: string) {
  return `dashboard:hoods-ui:${userId}`
}

function readPersistedHoodsUiState(userId: string): {
  section: HoodSection
  selectedSportCode: SupportedSportCode
  hoodFilter: HoodFilter
  discoverSource: DiscoverSource
} | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(getHoodsUiStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<{
      section: HoodSection
      selectedSportCode: SupportedSportCode
      hoodFilter: HoodFilter | 'contacts'
      discoverSource: DiscoverSource
    }>

    const section = parsed.section === 'discover' ? 'discover' : 'hood'
    const selectedSportCode = parsed.selectedSportCode && SUPPORTED_SPORTS.includes(parsed.selectedSportCode)
      ? parsed.selectedSportCode
      : 'tennis'
    const hoodFilter: HoodFilter =
      parsed.hoodFilter === 'contacts' || parsed.hoodFilter === 'saved'
        ? 'saved'
        : parsed.hoodFilter === 'group'
          ? 'group'
          : 'all'
    const discoverSource: DiscoverSource =
      parsed.discoverSource === 'played_with' ? 'played_with' : 'club_members'

    return { section, selectedSportCode, hoodFilter, discoverSource }
  } catch {
    return null
  }
}

function sourceBadgeClass(badge: SourceBadge) {
  switch (badge) {
    case 'Starred':
      return 'bg-emerald-50 text-emerald-700'
    case 'From Group':
      return 'bg-amber-50 text-amber-700'
    case 'My Contact':
      return 'bg-sky-50 text-sky-700'
    case 'Linked':
      return 'bg-violet-50 text-violet-700'
    case 'Played With':
      return 'bg-rose-50 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function isPersonStarred(person: Pick<HoodPerson, 'isSaved' | 'isMyContact'>): boolean {
  return person.isSaved || person.isMyContact
}

function getVisibleSourceBadges(person: HoodPerson): SourceBadge[] {
  if (!person.userId) return person.sourceBadges
  return person.sourceBadges.filter((badge) => badge !== 'My Contact' && badge !== 'Linked')
}

function shouldShowIdentityBadge(person: HoodPerson): boolean {
  return person.identityType !== 'platform'
}

function getPeopleEmptyState(
  section: HoodSection,
  hoodFilter: HoodFilter,
  discoverSource: DiscoverSource,
  sportName: string,
): string {
  if (section === 'discover') {
    return `No ${discoverSource === 'club_members' ? 'club members' : 'played with people'} are available in ${sportName} right now.`
  }

  switch (hoodFilter) {
    case 'saved':
      return `No starred people are in your ${sportName.toLowerCase()} hood yet.`
    case 'group':
      return `No people from groups are in your ${sportName.toLowerCase()} hood yet.`
    case 'all':
    default:
      return `Your ${sportName} Hood is empty. Add contacts, save players, or bring people in through groups.`
  }
}

function AddToGroupDialog({
  groups,
  person,
  onClose,
  onConfirm,
  pending,
  emptyMessage,
}: {
  groups: GroupWithMembers[]
  person: HoodPerson
  onClose: () => void
  onConfirm: (groupId: string) => Promise<void>
  pending: boolean
  emptyMessage: string
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-h2 text-slate-900">Add to Shared Group</h3>
            <p className="text-body-sub mt-1 text-slate-500">
              Choose which Shared Group should include {person.displayName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-body-sub text-slate-400 transition hover:text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {groups.length === 0 && (
            <p className="text-body-main rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">
              {emptyMessage}
            </p>
          )}
          {groups.map((groupRow) => (
            <button
              key={groupRow.group.id}
              type="button"
              disabled={pending}
              onClick={() => void onConfirm(groupRow.group.id)}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              <span>
                <span className="text-body-main block font-medium text-slate-900">{groupRow.group.name}</span>
                <span className="text-body-sub block text-slate-500">
                  {groupRow.members.length} member{groupRow.members.length === 1 ? '' : 's'}
                </span>
              </span>
              {groupRow.group.primary_sport_id ? (
                <span className="text-body-sub rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                  Shared Group
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function HoodPersonDrawer({
  open,
  person,
  sport,
  myClubNames,
  items,
  contactRecord,
  onClose,
  onSaveToggle,
  onOpenAddToGroup,
  onOpenProxyManager,
  onUpdateContact,
}: {
  open: boolean
  person: HoodPerson | null
  sport: HoodSport
  myClubNames: string[]
  items: MatchListItem[]
  contactRecord: ContactPlayerResolved | null
  onClose: () => void
  onSaveToggle: (person: HoodPerson) => Promise<void>
  onOpenAddToGroup: (person: HoodPerson) => void
  onOpenProxyManager: () => void
  onUpdateContact: (input: {
    guest_id: string
    display_name: string
    gender?: ContactGender
    email?: string | null
    phone?: string | null
  }) => Promise<void>
}) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [proxyPending, setProxyPending] = useState(false)
  const [editingContact, setEditingContact] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactGender, setContactGender] = useState<ContactGender>(null)
  const [proxyRequestState, setProxyRequestState] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  useEffect(() => {
    if (!open) {
      setProfile(null)
      return
    }

    if (!person?.userId) {
      setProfile(null)
      return
    }

    let cancelled = false
    const supabase = createSupabaseBrowserClient()

    getPublicPlayerProfile(supabase, person.userId)
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch((error) => {
        console.error('[hoods] drawer profile:', error)
      })

    return () => {
      cancelled = true
    }
  }, [open, person?.userId])

  useEffect(() => {
    if (!open) return
    setEditingContact(false)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [onClose, open])

  useEffect(() => {
    if (!open || !person) return
    setContactName(contactRecord?.display_name ?? person.displayName)
    setContactEmail(contactRecord?.email ?? '')
    setContactPhone(contactRecord?.phone ?? '')
    setContactGender(contactRecord?.gender ?? person.gender ?? null)
  }, [contactRecord, open, person])

  const selectedSportProfile = useMemo(
    () => getSportProfile(profile, sport.id),
    [profile, sport.id],
  )

  const sharedMatches = useMemo(() => {
    if (!person) return []
    return items
      .filter((item) => item.match.sport_id === sport.id)
      .filter((item) =>
        item.participants.some((participant) =>
          (person.userId && participant.user_id === person.userId)
          || (person.guestId && participant.guest_id === person.guestId),
        ),
      )
      .sort((left, right) => (right.match.start_at_utc ?? '').localeCompare(left.match.start_at_utc ?? ''))
      .slice(0, 5)
  }, [items, person, sport.id])

  const sharedClubNames = useMemo(() => {
    if (!person) return [] as string[]
    const clubSet = new Set(myClubNames)
    return person.clubNames.filter((clubName) => clubSet.has(clubName))
  }, [myClubNames, person])

  if (!open || !person) return null

  const visibleSourceBadges = getVisibleSourceBadges(person)
  const genderPill = formatGenderPill(profile?.gender ?? person.gender)
  const activeSportProfile = profile?.sport_profiles.find((sportProfile) => sportProfile.sport_id === sport.id) ?? null
  const currentStatusLabel = person.statusLabel ?? formatAvailabilityLabel(profile?.looking_to_play)
  const currentStatusDotClass = getAvailabilityStatusDotClass(currentStatusLabel)
  const isStarred = isPersonStarred(person)
  const isAutoStarredContact = person.isMyContact && !person.isSaved

  return (
    <div className="fixed inset-0 z-[125]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30"
        aria-label="Close person drawer"
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto border-l border-slate-200 bg-slate-50 p-5 shadow-[-18px_0_48px_-28px_rgba(15,23,42,0.36)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={person.avatarUrl}
              displayName={person.displayName}
              size="md"
              className="h-12 w-12 text-body-main"
            />
            <div>
              <h2 className="text-h2 text-slate-900">
                {person.displayName}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {shouldShowIdentityBadge(person) && (
                  <span className="text-label rounded-full bg-slate-900 px-2.5 py-1 text-white">
                    {getIdentityLabel(person.identityType)}
                  </span>
                )}
                {visibleSourceBadges.map((badge) => (
                  <span
                    key={badge}
                    className={`text-body-sub rounded-full px-2.5 py-1 font-medium ${sourceBadgeClass(badge)}`}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-body-sub text-slate-400 transition hover:text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-h2 text-slate-900">Overview</h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-label">Gender</dt>
                <dd className="text-body-main mt-1 text-slate-700">{genderPill ?? 'Not shared yet'}</dd>
              </div>
              <div>
                <dt className="text-label">Current status</dt>
                <dd className="text-body-main mt-1 inline-flex items-center gap-2 text-slate-700">
                  <span>{currentStatusLabel}</span>
                  {currentStatusDotClass ? (
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${currentStatusDotClass}`} aria-hidden="true" />
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-label">Shared clubs</dt>
                <dd className="text-body-main mt-1 text-slate-700">{sharedClubNames.join(', ') || 'None shared yet'}</dd>
              </div>
              <div>
                <dt className="text-label">Preferred times</dt>
                <dd className="text-body-main mt-1 text-slate-700">{formatPreferredTimes(profile?.preferred_play_times)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-h2 text-slate-900">Playing Profile</h3>
            {activeSportProfile ? (
              <div className="mt-4">
                <div className="text-title-main text-slate-900">{activeSportProfile.sport_name}</div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-label">Level</dt>
                    <dd className="text-body-main mt-1 text-slate-700">{getLevelLabel(activeSportProfile.level) ?? activeSportProfile.level ?? 'Not shared yet'}</dd>
                  </div>
                  <div>
                    <dt className="text-label">Preferred format</dt>
                    <dd className="text-body-main mt-1 text-slate-700">
                      {activeSportProfile.preferred_formats.length > 0
                        ? activeSportProfile.preferred_formats.map(formatFormatLabel).join(', ')
                        : 'Not shared yet'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label">Play style</dt>
                    <dd className="text-body-main mt-1 text-slate-700">{activeSportProfile.play_style ?? 'Not shared yet'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-label">Tournament / league experience</dt>
                    <dd className="text-body-main mt-1 whitespace-pre-wrap text-slate-700">{activeSportProfile.competition_experience ?? 'Not shared yet'}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="text-body-main mt-4 text-slate-500">No sport profile details shared yet.</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-label text-slate-400">Actions</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {(person.userId || person.guestId) && (
                <button
                  type="button"
                  onClick={() => void onSaveToggle(person)}
                  className="text-body-main rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {isAutoStarredContact ? 'Starred contact' : isStarred ? 'Unstar' : 'Star player'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenAddToGroup(person)}
                className="text-body-main rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Add to Shared Group
              </button>
              {person.canEditContact && (
                <button
                  type="button"
                  onClick={() => setEditingContact((current) => !current)}
                  className="text-body-main rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {editingContact ? 'Close editor' : 'Edit Contact'}
                </button>
              )}
            </div>
            {person.canEditContact && editingContact && person.guestId && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Display name"
                    className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition hover:border-slate-300 focus:border-slate-300"
                  />
                  <input
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="Email"
                    className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition hover:border-slate-300 focus:border-slate-300"
                  />
                  <input
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    placeholder="Phone"
                    className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition hover:border-slate-300 focus:border-slate-300"
                  />
                  <select
                    value={contactGender ?? ''}
                    onChange={(event) => setContactGender((event.target.value || null) as ContactGender)}
                    className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition hover:border-slate-300 focus:border-slate-300"
                  >
                    {CONTACT_GENDER_OPTIONS.map((option) => (
                      <option key={option.value || 'empty'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingContact(false)}
                    className="text-body-main rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingContact || !contactName.trim()}
                    onClick={async () => {
                      setSavingContact(true)
                      try {
                        await onUpdateContact({
                          guest_id: person.guestId!,
                          display_name: contactName.trim(),
                          gender: contactGender,
                          email: contactEmail.trim() || null,
                          phone: contactPhone.trim() || null,
                        })
                        setEditingContact(false)
                      } finally {
                        setSavingContact(false)
                      }
                    }}
                    className="text-body-main rounded-full bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                  >
                    {savingContact ? 'Saving...' : 'Save contact'}
                  </button>
                </div>
              </div>
            )}
            {sharedMatches.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h4 className="text-title-main text-slate-900">Match History</h4>
                <div className="mt-3 space-y-2">
                  {sharedMatches.map((item) => (
                    <div key={item.match.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-body-main font-medium text-slate-800">{item.sportName ?? person.sportLabel}</div>
                      <div className="text-body-sub mt-1 text-slate-500">
                        {formatTimeWindow(
                          item.match.start_at_utc,
                          item.match.match_date,
                          item.match.start_time,
                          item.match.duration_minutes,
                          item.venueTimezone ?? 'UTC',
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>
      </aside>
    </div>
  )
}

function InvitePopover({
  person,
  matches,
  onInviteExisting,
  onInviteNew,
  pendingId,
}: {
  person: HoodPerson
  matches: MatchListItem[]
  onInviteExisting: (person: HoodPerson, matchId: string) => Promise<void>
  onInviteNew: (person: HoodPerson) => void
  pendingId: string | null
}) {
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_22px_44px_-26px_rgba(15,23,42,0.32)]">
      <h4 className="text-title-main text-slate-900">Open Matches</h4>
      <div className="mt-3 space-y-2">
        {matches.length === 0 ? (
          <div className="text-body-main rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-slate-500">
            No open matches
          </div>
        ) : (
          matches.map((item) => (
            <button
              key={item.match.id}
              type="button"
              onClick={() => void onInviteExisting(person, item.match.id)}
              disabled={pendingId === item.match.id}
              className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              <span className="text-body-main block font-medium text-slate-900">
                {item.venueName ?? item.sportName ?? 'Open match'}
              </span>
              <span className="text-body-sub mt-1 block text-slate-500">
                {formatTimeWindow(
                  item.match.start_at_utc,
                  item.match.match_date,
                  item.match.start_time,
                  item.match.duration_minutes,
                  item.venueTimezone ?? 'UTC',
                )}
              </span>
              <span className="text-body-sub mt-1 block text-slate-400">
                {pendingId === item.match.id
                  ? 'Invitingâ€¦'
                  : `${Math.max(item.match.required_count - item.confirmedCount, 0)} spot${Math.max(item.match.required_count - item.confirmedCount, 0) === 1 ? '' : 's'} left`}
              </span>
            </button>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => onInviteNew(person)}
        className="text-body-main mt-3 w-full rounded-full bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
      >
        Invite to New Match
      </button>
    </div>
  )
}

function HoodCard({
  person,
  myClubNames,
  openMatchCount,
  onOpenDrawer,
  onOpenMenuAddToGroup,
  onSaveToggle,
  inviteOpen,
  menuOpen,
  onToggleInvite,
  onToggleMenu,
  inviteMatches,
  onInviteExisting,
  onInviteNew,
  pendingInviteMatchId,
}: {
  person: HoodPerson
  myClubNames: string[]
  openMatchCount: number
  onOpenDrawer: (person: HoodPerson) => void
  onOpenMenuAddToGroup: (person: HoodPerson) => void
  onSaveToggle: (person: HoodPerson) => Promise<void>
  inviteOpen: boolean
  menuOpen: boolean
  onToggleInvite: (person: HoodPerson) => void
  onToggleMenu: (person: HoodPerson) => void
  inviteMatches: MatchListItem[]
  onInviteExisting: (person: HoodPerson, matchId: string) => Promise<void>
  onInviteNew: (person: HoodPerson) => void
  pendingInviteMatchId: string | null
}) {
  const compactContactCard = person.identityType === 'contact' && !person.isLinked
  const genderPill = formatGenderPill(person.gender)
  const sharedClubSet = new Set(myClubNames)
  const sharedClubNames = person.clubNames.filter((clubName) => sharedClubSet.has(clubName))
  const clubSummary = sharedClubNames.slice(0, 2).join(' · ')
  const levelLabel = formatCompactLevel(person.level)
  const currentStatusDotClass = getAvailabilityStatusDotClass(person.statusLabel)
  const shouldShowAvailabilityDot = person.identityType !== 'contact'
  const isStarred = isPersonStarred(person)
  const starButtonLabel = person.isMyContact && !person.isSaved
    ? 'Starred contact'
    : isStarred
      ? 'Unstar player'
      : 'Star player'

  return (
    <article
      className="relative rounded-[22px] border border-slate-200 bg-white p-2.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.28)] transition hover:border-slate-300"
      data-hood-menu-root
      data-hood-invite-root
    >
      <button
        type="button"
        onClick={() => onOpenDrawer(person)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2.5">
          <div className="relative shrink-0">
            <Avatar
              src={person.avatarUrl}
              displayName={person.displayName}
              size="md"
              className="h-9 w-9 text-body-sub"
            />
            {shouldShowAvailabilityDot && currentStatusDotClass ? (
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white ${currentStatusDotClass}`}
                aria-hidden="true"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 pr-12 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-title-main truncate leading-none text-slate-900">{person.displayName}</h3>
              {genderPill ? (
                <span className="text-label rounded-full bg-slate-100 px-1.5 py-[2px] text-slate-500">
                  {genderPill}
                </span>
              ) : null}
              {compactContactCard && (
                <span className="text-label rounded-full bg-slate-100 px-1.5 py-[2px]">
                  Contact
                </span>
              )}
            </div>
            {(clubSummary || levelLabel) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {clubSummary ? (
                  <span className="text-body-sub truncate text-[#3B82F6]">
                    {clubSummary}
                  </span>
                ) : null}
                {levelLabel ? (
                  <span className="text-label rounded-full border border-slate-200 bg-white px-1.5 py-[2px] text-slate-700">
                    {levelLabel}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </button>

      <div className="absolute right-2 top-2 flex flex-col items-center gap-1">
        {(person.userId || person.guestId) && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void onSaveToggle(person)
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label={starButtonLabel}
            title={starButtonLabel}
          >
            <span
              aria-hidden="true"
              className={[
                'text-[12px] leading-none transition',
                isStarred ? 'text-[#FACC15]' : 'text-slate-300',
              ].join(' ')}
            >
              {isStarred ? '★' : '☆'}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleMenu(person)
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          aria-label="More actions"
        >
          <span className="flex flex-col items-center gap-0.5" aria-hidden="true">
            <span className="h-0.5 w-0.5 rounded-full bg-current" />
            <span className="h-0.5 w-0.5 rounded-full bg-current" />
            <span className="h-0.5 w-0.5 rounded-full bg-current" />
          </span>
        </button>
      </div>

      {inviteOpen && (
        <InvitePopover
          person={person}
          matches={inviteMatches}
          onInviteExisting={onInviteExisting}
          onInviteNew={onInviteNew}
          pendingId={pendingInviteMatchId}
        />
      )}

      {menuOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_22px_44px_-26px_rgba(15,23,42,0.32)]">
          <button
            type="button"
            onClick={() => {
              onToggleInvite(person)
              onToggleMenu(person)
            }}
            className="text-body-main w-full rounded-2xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50"
          >
            Invite to Match{openMatchCount > 0 ? ` (${openMatchCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => onOpenMenuAddToGroup(person)}
            className="text-body-main w-full rounded-2xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50"
          >
            Add to Shared Group
          </button>
          <button
            type="button"
            onClick={() => onOpenDrawer(person)}
            className="text-body-main w-full rounded-2xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50"
          >
            View
          </button>
          {person.canEditContact && (
            <button
              type="button"
              onClick={() => onOpenDrawer(person)}
              className="text-body-main w-full rounded-2xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50"
            >
              Edit Contact
            </button>
          )}
        </div>
      )}
    </article>
  )
}

export function HoodsPanel({
  userId,
  items,
  inviteCircle,
  groups,
  myIdentities,
  sports,
  enabledSportIds,
  onParseScreenshots,
  onImportScreenshotContacts,
  onOpenProfile,
}: Props) {
  const router = useRouter()
  const sportOptions = useMemo(
    () =>
      sports
        .filter(
          (sport): sport is HoodSport =>
            isSupportedSportCode(sport.code) && enabledSportIds.includes(sport.id),
        )
        .sort(
          (left, right) =>
            SUPPORTED_SPORTS.indexOf(left.code) - SUPPORTED_SPORTS.indexOf(right.code),
        ),
    [enabledSportIds, sports],
  )

  const persistedUiState = readPersistedHoodsUiState(userId)
  const [section, setSection] = useState<HoodSection>(persistedUiState?.section ?? 'hood')
  const [selectedSportCode, setSelectedSportCode] = useState<SupportedSportCode>(persistedUiState?.selectedSportCode ?? 'tennis')
  const [hoodFilter, setHoodFilter] = useState<HoodFilter>(persistedUiState?.hoodFilter ?? 'all')
  const [discoverSource, setDiscoverSource] = useState<DiscoverSource>(persistedUiState?.discoverSource ?? 'club_members')
  const [search, setSearch] = useState('')
  const [contactToolsOpen, setContactToolsOpen] = useState(false)
  const [supportData, setSupportData] = useState<SupportData>({
    contacts: [],
    contactsByGuestId: new Map(),
    savedContactPersonIds: new Set(),
    profilesByUserId: new Map(),
    groupContactsByGroupId: new Map(),
    guestLookupByGuestId: new Map(),
    guestSportsByGuestId: new Map(),
  })
  const [clubDiscover, setClubDiscover] = useState<ClubDiscoverPerson[]>([])
  const [clubDiscoverGroups, setClubDiscoverGroups] = useState<ClubDiscoverGroup[]>([])
  const [clubProfiles, setClubProfiles] = useState<Map<string, PublicPlayerProfile | null>>(new Map())
  const [directInviteClubMemberIds, setDirectInviteClubMemberIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clubDiscoverError, setClubDiscoverError] = useState<string | null>(null)
  const [activeDrawerKey, setActiveDrawerKey] = useState<string | null>(null)
  const [activeInviteKey, setActiveInviteKey] = useState<string | null>(null)
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null)
  const [groupDialogPerson, setGroupDialogPerson] = useState<HoodPerson | null>(null)
  const [groupPending, setGroupPending] = useState(false)
  const [pendingInviteMatchId, setPendingInviteMatchId] = useState<string | null>(null)
  const [admissionTargetsByMatchId, setAdmissionTargetsByMatchId] = useState<Map<string, AdmissionTarget[]>>(new Map())
  const [contactComposerMode, setContactComposerMode] = useState<'manual' | 'screenshot' | null>(null)
  const [contactDisplayName, setContactDisplayName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactGender, setContactGender] = useState<ContactGender>(null)
  const [creatingContact, setCreatingContact] = useState(false)

  useEffect(() => {
    if (sportOptions.some((sport) => sport.code === selectedSportCode)) return
    if (sportOptions[0]) setSelectedSportCode(sportOptions[0].code)
  }, [selectedSportCode, sportOptions])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        getHoodsUiStorageKey(userId),
        JSON.stringify({
          section,
          selectedSportCode,
          hoodFilter,
          discoverSource,
        }),
      )
    } catch {
      // Ignore localStorage failures and keep the in-memory UI state.
    }
  }, [discoverSource, hoodFilter, section, selectedSportCode, userId])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest('[data-hood-menu-root]')) return
      if (target.closest('[data-hood-invite-root]')) return
      setActiveMenuKey(null)
      setActiveInviteKey(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  const selectedSport = useMemo(
    () => sportOptions.find((sport) => sport.code === selectedSportCode) ?? sportOptions[0] ?? null,
    [selectedSportCode, sportOptions],
  )
  const venueNameAliasMap = useMemo(
    () => new Map(myIdentities.map((identity) => [identity.venue.name, getVenueDisplayName(identity.venue)])),
    [myIdentities],
  )
  const myClubNames = useMemo(
    () => Array.from(new Set(myIdentities.map((identity) => getVenueDisplayName(identity.venue)).filter(Boolean))),
    [myIdentities],
  )

  const sportNameByIdAll = useMemo(
    () => new Map(sports.map((sport) => [sport.id, sport.display_name])),
    [sports],
  )

  const addToGroupOptions = useMemo(() => {
    if (!groupDialogPerson) return groups

    if (groupDialogPerson.userId) {
      return groups.filter((groupRow) =>
        groupRow.members.some((member) => member.userId === userId),
      )
    }

    if (groupDialogPerson.guestId) {
      return groups.filter((groupRow) =>
        groupRow.members.some((member) => member.userId === userId),
      )
    }

    return []
  }, [groupDialogPerson, groups, userId])

  const addToGroupEmptyMessage = useMemo(() => {
    if (!groupDialogPerson) return 'No groups available yet.'
    if (groupDialogPerson.userId) {
      return 'You can only add registered players to Shared Groups where you are already an active member.'
    }
    if (groupDialogPerson.guestId) {
      return 'You can add contacts to Shared Groups where you are already an active member.'
    }
    return 'No groups available yet.'
  }, [groupDialogPerson])

  const loadSupportData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      const contacts = await getContactPlayerResolution(supabase)
      const contactsByGuestId = new Map(contacts.map((contact) => [contact.guest_id, contact]))
      const groupContactsByGroupId = await fetchGroupContactsByGroup(
        supabase,
        groups.map((group) => group.group.id),
      )

      const guestIds = Array.from(
        new Set([
          ...contacts.map((contact) => contact.guest_id),
          ...Array.from(groupContactsByGroupId.values()).flat().map((contact) => contact.guest_id),
          ...items.flatMap((item) =>
            item.participants
              .map((participant) => participant.guest_id)
              .filter((guestId): guestId is string => Boolean(guestId)),
          ),
        ]),
      )

      const guestLookupByGuestId = await fetchGuestLookupMap(supabase, guestIds)
      const guestSportsByGuestId = await fetchGuestSportsMap(supabase, guestIds)
      const guestPersonIds = Array.from(
        new Set(
          Array.from(guestLookupByGuestId.values())
            .map((row) => row.person_id)
            .filter((value): value is string => Boolean(value)),
        ),
      )

      const userIds = Array.from(
        new Set([
          ...inviteCircle.map((row) => row.target_user_id),
          ...groups.flatMap((group) => group.members.map((member) => member.userId)),
          ...contacts.map((contact) => contact.linked_user_id).filter((value): value is string => Boolean(value)),
          ...items.flatMap((item) =>
            item.participants
              .map((participant) => participant.user_id)
              .filter((value): value is string => Boolean(value)),
          ),
        ]),
      )

      const [profilesByUserId, savedRelationshipsRes] = await Promise.all([
        fetchPublicPlayerProfiles(supabase, userIds),
        guestPersonIds.length > 0
          ? supabase
              .from('person_relationships')
              .select('person_id')
              .eq('relationship_type', 'saved')
              .in('person_id', guestPersonIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if ('error' in savedRelationshipsRes && savedRelationshipsRes.error) {
        throw savedRelationshipsRes.error
      }

      const savedContactPersonIds = new Set(
        (((savedRelationshipsRes.data ?? []) as { person_id: string }[]))
          .map((relationship) => relationship.person_id),
      )

      setSupportData({
        contacts,
        contactsByGuestId,
        savedContactPersonIds,
        profilesByUserId,
        groupContactsByGroupId,
        guestLookupByGuestId,
        guestSportsByGuestId,
      })
    } catch (loadError) {
      setError((loadError as Error).message)
    } finally {
      setLoading(false)
    }
  }, [groups, inviteCircle, items])

  useEffect(() => {
    void loadSupportData()
  }, [loadSupportData])

  useEffect(() => {
    if (!selectedSport) return
    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    const loadClubDiscover = async () => {
      try {
        setClubDiscoverError(null)
        const venueIds = Array.from(new Set(myIdentities.map((identity) => identity.venue_id)))
        const entries = await Promise.all(
          venueIds.map(async (venueId) => {
            const identity = myIdentities.find((item) => item.venue_id === venueId)
            const invitableRows = await getVenueInvitableMembers(supabase, venueId, userId)
            return {
              people: invitableRows.map((row) => ({
                userId: row.user_id,
                displayName: normalizeDisplayName(row.display_name),
                clubName: identity ? getVenueDisplayName(identity.venue) : 'Club',
              })),
            }
          }),
        )

        const deduped = new Map<string, ClubDiscoverPerson>()
        for (const entry of entries.flatMap((item) => item.people)) {
          const existing = deduped.get(entry.userId)
          if (existing) {
            if (!existing.clubNames.includes(entry.clubName)) existing.clubNames.push(entry.clubName)
            continue
          }
          deduped.set(entry.userId, {
            userId: entry.userId,
            displayName: entry.displayName,
            clubNames: [entry.clubName],
          })
        }

        const profiles = await fetchPublicPlayerProfiles(supabase, Array.from(deduped.keys()))
        const candidateGroups = groups.filter(({ group, members }) =>
          group.open_to_club_members
          && group.venue_id != null
          && venueIds.includes(group.venue_id)
          && !members.some((member) => member.userId === userId)
          && (group.primary_sport_id == null || group.primary_sport_id === selectedSport.id),
        )

        const nextDiscoverGroups = candidateGroups.reduce<ClubDiscoverGroup[]>((acc, { group, members }) => {
            const venue = myIdentities.find((identity) => identity.venue_id === group.venue_id)?.venue
            const clubName = venue ? getVenueDisplayName(venue) : null
            if (!clubName) return acc

            acc.push({
              groupId: group.id,
              name: group.name,
              description: group.description ?? null,
              primarySportId: group.primary_sport_id ?? null,
              iconKey: group.icon_key ?? 'spark',
              clubNames: [clubName],
              memberCount: members.length,
            })
            return acc
          }, [])

        if (cancelled) return

        setClubProfiles(profiles)
        setDirectInviteClubMemberIds(new Set(deduped.keys()))
        setClubDiscover(
          Array.from(deduped.values()).filter((person) =>
            profileMatchesSport(profiles.get(person.userId), selectedSport.id),
          ),
        )
        setClubDiscoverGroups(nextDiscoverGroups)
      } catch (clubError) {
        console.error('[hoods] club discover:', clubError)
        if (!cancelled) {
          setClubProfiles(new Map())
          setClubDiscover([])
          setClubDiscoverGroups([])
          setDirectInviteClubMemberIds(new Set())
          setClubDiscoverError((clubError as Error).message || 'Failed to load club members.')
        }
      }
    }

    void loadClubDiscover()
    return () => {
      cancelled = true
    }
  }, [groups, myIdentities, selectedSport, userId])

  const combinedProfiles = useMemo(
    () => new Map([...supportData.profilesByUserId, ...clubProfiles]),
    [clubProfiles, supportData.profilesByUserId],
  )

  const hoodPeople = useMemo(() => {
    if (!selectedSport) return [] as HoodPerson[]
    const map = new Map<string, MutablePerson>()
    const savedUserIds = new Set(inviteCircle.map((row) => row.target_user_id))

    for (const contact of supportData.contacts) {
      const lookup = supportData.guestLookupByGuestId.get(contact.guest_id)
      const linkedUserId = contact.linked_user_id ?? null
      const linkedProfile = linkedUserId ? combinedProfiles.get(linkedUserId) : null
      const guestSportIds = supportData.guestSportsByGuestId.get(contact.guest_id) ?? []
      if (!guestSportIds.includes(selectedSport.id) && !profileMatchesSport(linkedProfile, selectedSport.id)) continue

      const key = buildCanonicalKey({
        linkedUserId,
        userId: linkedUserId,
        personId: lookup?.person_id ?? null,
        guestId: contact.guest_id,
      })
      const selectedSportProfile = getSportProfile(linkedProfile, selectedSport.id)
      const person = ensurePerson(map, {
        key,
        userId: linkedUserId,
        guestId: contact.guest_id,
        personId: lookup?.person_id ?? null,
        linkedUserId,
        displayName: normalizeDisplayName(linkedProfile?.display_name ?? contact.display_name),
        avatarUrl: linkedProfile?.avatar_url ?? null,
        identityType: linkedUserId ? 'linked' : 'contact',
        isMyContact: true,
        isLinked: Boolean(linkedUserId),
        canEditContact: true,
        gender: linkedProfile?.gender ?? contact.gender ?? null,
        level: selectedSportProfile?.level ?? null,
        playType: selectedSportProfile?.play_style ?? null,
        statusLabel: formatStatusLabel(linkedProfile, contact),
        engagedSports: linkedProfile
          ? linkedProfile.sport_profiles.map((item) => item.sport_name)
          : guestSportIds.map((sportId) => sportNameByIdAll.get(sportId) ?? selectedSport.display_name),
        preferredFormats: selectedSportProfile?.preferred_formats ?? [],
        sportLabel: selectedSport.display_name,
      })
      person.sourceBadges.add('My Contact')
      person.sourceBadges.add('Starred')
      if (linkedUserId) person.sourceBadges.add('Linked')
      if (savedUserIds.has(linkedUserId ?? '')) {
        person.isSaved = true
        person.sourceBadges.add('Starred')
      }
      const sharedVenueNames = linkedProfile?.shared_venue_names ?? []
      if (linkedUserId && directInviteClubMemberIds.has(linkedUserId)) {
        person.isClubMember = true
      }
      for (const venueName of sharedVenueNames) {
        person.clubNames.add(venueNameAliasMap.get(venueName) ?? venueName)
      }
    }

    for (const row of inviteCircle) {
      const profile = combinedProfiles.get(row.target_user_id)
      if (!profileMatchesSport(profile, selectedSport.id)) continue
      if (row.target_user_id === userId) continue

      const key = buildCanonicalKey({ userId: row.target_user_id })
      const selectedSportProfile = getSportProfile(profile, selectedSport.id)
      const person = ensurePerson(map, {
        key,
        userId: row.target_user_id,
        displayName: normalizeDisplayName(profile?.display_name ?? row.target_display_name),
        avatarUrl: profile?.avatar_url ?? row.target_avatar_url,
        identityType: 'platform',
        isSaved: true,
        gender: profile?.gender ?? null,
        level: selectedSportProfile?.level ?? null,
        playType: selectedSportProfile?.play_style ?? null,
        statusLabel: formatStatusLabel(profile),
        engagedSports: profile?.sport_profiles.map((entry) => entry.sport_name) ?? [selectedSport.display_name],
        preferredFormats: selectedSportProfile?.preferred_formats ?? [],
        sportLabel: selectedSport.display_name,
      })
      person.isSaved = true
      person.sourceBadges.add('Starred')
      const sharedVenueNames = profile?.shared_venue_names ?? []
      if (directInviteClubMemberIds.has(row.target_user_id)) {
        person.isClubMember = true
      }
      for (const venueName of sharedVenueNames) {
        person.clubNames.add(venueNameAliasMap.get(venueName) ?? venueName)
      }
    }

    for (const group of groups.filter((row) => row.group.primary_sport_id === selectedSport.id)) {
      for (const member of group.members) {
        if (member.userId === userId) continue
        const profile = combinedProfiles.get(member.userId)
        const selectedSportProfile = getSportProfile(profile, selectedSport.id)
        const key = buildCanonicalKey({ userId: member.userId })
        const person = ensurePerson(map, {
          key,
          userId: member.userId,
          displayName: normalizeDisplayName(profile?.display_name ?? member.displayName),
          avatarUrl: profile?.avatar_url ?? null,
          identityType: 'platform',
          isFromGroup: true,
          gender: profile?.gender ?? null,
          level: selectedSportProfile?.level ?? null,
          playType: selectedSportProfile?.play_style ?? null,
          statusLabel: formatStatusLabel(profile),
          engagedSports: profile?.sport_profiles.map((entry) => entry.sport_name) ?? [selectedSport.display_name],
          preferredFormats: selectedSportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
        })
        person.isFromGroup = true
        person.sourceBadges.add('From Group')
        person.groupNames.add(group.group.name)
        const sharedVenueNames = profile?.shared_venue_names ?? []
        if (directInviteClubMemberIds.has(member.userId)) {
          person.isClubMember = true
        }
        for (const venueName of sharedVenueNames) {
          person.clubNames.add(venueNameAliasMap.get(venueName) ?? venueName)
        }
      }

      for (const contact of supportData.groupContactsByGroupId.get(group.group.id) ?? []) {
        const ownedContact = supportData.contactsByGuestId.get(contact.guest_id)
        const linkedUserId = ownedContact?.linked_user_id ?? null
        const linkedProfile = linkedUserId ? combinedProfiles.get(linkedUserId) : null
        const lookup = supportData.guestLookupByGuestId.get(contact.guest_id)
        const key = buildCanonicalKey({
          linkedUserId,
          userId: linkedUserId,
          personId: lookup?.person_id ?? contact.person_id,
          guestId: contact.guest_id,
        })
        const selectedSportProfile = getSportProfile(linkedProfile, selectedSport.id)
        const person = ensurePerson(map, {
          key,
          userId: linkedUserId,
          guestId: contact.guest_id,
          personId: lookup?.person_id ?? contact.person_id,
          linkedUserId,
          displayName: normalizeDisplayName(linkedProfile?.display_name ?? contact.display_name),
          avatarUrl: linkedProfile?.avatar_url ?? null,
          identityType: linkedUserId ? 'linked' : 'contact',
          isFromGroup: true,
          isLinked: Boolean(linkedUserId),
          isMyContact: Boolean(ownedContact),
          isSaved: Boolean((lookup?.person_id ?? contact.person_id) && supportData.savedContactPersonIds.has((lookup?.person_id ?? contact.person_id)!)),
          canEditContact: Boolean(ownedContact),
          gender: linkedProfile?.gender ?? ownedContact?.gender ?? null,
          level: selectedSportProfile?.level ?? null,
          playType: selectedSportProfile?.play_style ?? null,
          statusLabel: formatStatusLabel(linkedProfile, ownedContact ?? null),
          engagedSports: linkedProfile
            ? linkedProfile.sport_profiles.map((item) => item.sport_name)
            : ((supportData.guestSportsByGuestId.get(contact.guest_id) ?? []).map((sportId) => sportNameByIdAll.get(sportId) ?? selectedSport.display_name)),
          preferredFormats: selectedSportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
          saveSourceGroupId: group.group.id,
        })
        person.isFromGroup = true
        person.sourceBadges.add('From Group')
        person.groupNames.add(group.group.name)
        if (linkedUserId) person.sourceBadges.add('Linked')
        if (ownedContact) person.sourceBadges.add('My Contact')
        if (person.isSaved || person.isMyContact) person.sourceBadges.add('Starred')
        const sharedVenueNames = linkedProfile?.shared_venue_names ?? []
        if (linkedUserId && directInviteClubMemberIds.has(linkedUserId)) {
          person.isClubMember = true
        }
        for (const venueName of sharedVenueNames) {
          person.clubNames.add(venueNameAliasMap.get(venueName) ?? venueName)
        }
      }
    }

    return finalizePeople(map)
  }, [combinedProfiles, directInviteClubMemberIds, groups, inviteCircle, selectedSport, sportNameByIdAll, supportData, userId])

  const hoodKeySet = useMemo(
    () => new Set(hoodPeople.map((person) => toPersonMatchKey(person))),
    [hoodPeople],
  )

  const playedWithPeople = useMemo(() => {
    if (!selectedSport) return [] as HoodPerson[]
    const map = new Map<string, MutablePerson>()

    for (const item of items) {
      if (item.match.sport_id !== selectedSport.id) continue
      if (!item.myParticipant) continue

      for (const participant of item.participants) {
        if (participant.id === item.myParticipant.id) continue

        if (participant.user_id && participant.user_id !== userId) {
          const profile = combinedProfiles.get(participant.user_id)
          const sportProfile = getSportProfile(profile, selectedSport.id)
          const key = buildCanonicalKey({ userId: participant.user_id })
          const person = ensurePerson(map, {
            key,
            userId: participant.user_id,
            displayName: normalizeDisplayName(profile?.display_name ?? participant.display_name),
            avatarUrl: profile?.avatar_url ?? participant.avatar_url ?? null,
            identityType: 'platform',
            isPlayedWith: true,
            gender: profile?.gender ?? null,
            level: sportProfile?.level ?? null,
            playType: sportProfile?.play_style ?? null,
            statusLabel: formatStatusLabel(profile),
            engagedSports: profile?.sport_profiles.map((entry) => entry.sport_name) ?? [selectedSport.display_name],
            preferredFormats: sportProfile?.preferred_formats ?? [],
            sportLabel: selectedSport.display_name,
            recentInteractionAt: item.match.start_at_utc ?? item.match.created_at,
            sharedMatchCount: 0,
            saveSourceMatchId: item.match.id,
          })
          person.isPlayedWith = true
          person.sharedMatchCount += 1
          person.sourceBadges.add('Played With')
          person.recentInteractionAt = item.match.start_at_utc ?? item.match.created_at
          const sharedVenueNames = profile?.shared_venue_names ?? []
          if (directInviteClubMemberIds.has(participant.user_id)) {
            person.isClubMember = true
          }
          for (const venueName of sharedVenueNames) {
            person.clubNames.add(venueNameAliasMap.get(venueName) ?? venueName)
          }
          continue
        }

        if (!participant.guest_id) continue

        const ownedContact = supportData.contactsByGuestId.get(participant.guest_id)
        const linkedUserId = ownedContact?.linked_user_id ?? null
        const linkedProfile = linkedUserId ? combinedProfiles.get(linkedUserId) : null
        const lookup = supportData.guestLookupByGuestId.get(participant.guest_id)
        const key = buildCanonicalKey({
          linkedUserId,
          userId: linkedUserId,
          personId: lookup?.person_id ?? null,
          guestId: participant.guest_id,
        })
        const sportProfile = getSportProfile(linkedProfile, selectedSport.id)
        const person = ensurePerson(map, {
          key,
          userId: linkedUserId,
          guestId: participant.guest_id,
          personId: lookup?.person_id ?? null,
          linkedUserId,
          displayName: normalizeDisplayName(linkedProfile?.display_name ?? participant.display_name),
          avatarUrl: linkedProfile?.avatar_url ?? null,
          identityType: linkedUserId ? 'linked' : 'contact',
          isPlayedWith: true,
          isLinked: Boolean(linkedUserId),
          isMyContact: Boolean(ownedContact),
          isSaved: Boolean(lookup?.person_id && supportData.savedContactPersonIds.has(lookup.person_id)),
          canEditContact: Boolean(ownedContact),
          gender: linkedProfile?.gender ?? ownedContact?.gender ?? null,
          level: sportProfile?.level ?? null,
          playType: sportProfile?.play_style ?? null,
          statusLabel: formatStatusLabel(linkedProfile, ownedContact ?? null),
          engagedSports: linkedProfile
            ? linkedProfile.sport_profiles.map((entry) => entry.sport_name)
            : ((supportData.guestSportsByGuestId.get(participant.guest_id) ?? []).map((sportId) => sportNameByIdAll.get(sportId) ?? selectedSport.display_name)),
          preferredFormats: sportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
          recentInteractionAt: item.match.start_at_utc ?? item.match.created_at,
          sharedMatchCount: 0,
          saveSourceMatchId: item.match.id,
        })
        person.isPlayedWith = true
        person.sharedMatchCount += 1
        person.sourceBadges.add('Played With')
        person.recentInteractionAt = item.match.start_at_utc ?? item.match.created_at
        if (linkedUserId) person.sourceBadges.add('Linked')
        if (ownedContact) person.sourceBadges.add('My Contact')
        if (person.isSaved || person.isMyContact) person.sourceBadges.add('Starred')
        const sharedVenueNames = linkedProfile?.shared_venue_names ?? []
        if (linkedUserId && directInviteClubMemberIds.has(linkedUserId)) {
          person.isClubMember = true
        }
        for (const venueName of sharedVenueNames) {
          person.clubNames.add(venueNameAliasMap.get(venueName) ?? venueName)
        }
      }
    }

    return finalizePeople(map).filter((person) => !hoodKeySet.has(toPersonMatchKey(person)))
  }, [combinedProfiles, directInviteClubMemberIds, hoodKeySet, items, selectedSport, sportNameByIdAll, supportData, userId])

  const discoverPeople = useMemo(() => {
    if (!selectedSport) return [] as HoodPerson[]

    if (discoverSource === 'club_members') {
      const map = new Map<string, MutablePerson>()
      for (const clubMember of clubDiscover) {
        if (clubMember.userId === userId) continue
        const profile = combinedProfiles.get(clubMember.userId)
        const sportProfile = getSportProfile(profile, selectedSport.id)
        const key = buildCanonicalKey({ userId: clubMember.userId })
        const person = ensurePerson(map, {
          key,
          userId: clubMember.userId,
          displayName: normalizeDisplayName(profile?.display_name ?? clubMember.displayName),
          avatarUrl: profile?.avatar_url ?? null,
          identityType: 'platform',
          isClubMember: true,
          gender: profile?.gender ?? null,
          level: sportProfile?.level ?? null,
          playType: sportProfile?.play_style ?? null,
          statusLabel: formatStatusLabel(profile),
          engagedSports: profile?.sport_profiles.map((entry) => entry.sport_name) ?? [selectedSport.display_name],
          preferredFormats: sportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
        })
        person.isClubMember = true
        for (const clubName of clubMember.clubNames) {
          person.clubNames.add(clubName)
        }
      }
      return finalizePeople(map).filter((person) => !hoodKeySet.has(toPersonMatchKey(person)))
    }

    return playedWithPeople
  }, [clubDiscover, combinedProfiles, directInviteClubMemberIds, discoverSource, hoodKeySet, playedWithPeople, selectedSport, userId])

  const openMatches = useMemo(() => {
    if (!selectedSport) return [] as MatchListItem[]
    return items.filter((item) =>
      item.match.sport_id === selectedSport.id
      && isFutureMatch(item)
      && item.confirmedCount < item.match.required_count,
    )
  }, [items, selectedSport])

  useEffect(() => {
    if (!selectedSport || openMatches.length === 0) {
      setAdmissionTargetsByMatchId(new Map())
      return
    }

    let cancelled = false
    const supabase = createSupabaseBrowserClient()

    const loadAdmissionTargets = async () => {
      const nextMap = new Map<string, AdmissionTarget[]>()
      await Promise.all(
        openMatches.map(async (item) => {
          try {
            const targets = await getAdmissionTargets(supabase, item.match.id)
            nextMap.set(item.match.id, targets)
          } catch (loadError) {
            console.error(`[hoods] admission targets ${item.match.id}:`, loadError)
            nextMap.set(item.match.id, [])
          }
        }),
      )
      if (!cancelled) setAdmissionTargetsByMatchId(nextMap)
    }

    void loadAdmissionTargets()
    return () => {
      cancelled = true
    }
  }, [openMatches, selectedSport])

  const openMatchTargetsByPerson = useMemo(() => {
    const result = new Map<string, MatchListItem[]>()
    const allPeople = [...hoodPeople, ...discoverPeople]
    for (const person of allPeople) {
      for (const match of openMatches) {
        const targets = admissionTargetsByMatchId.get(match.match.id) ?? []
        const canInvite = targets.some((target) =>
          target.can_admit
          && (
            (person.userId && target.action_kind === 'admit_user' && target.target_id === person.userId)
            || (person.guestId && target.action_kind === 'nominate_contact_player' && target.target_id === person.guestId)
          ),
        )
        if (!canInvite) continue
        const list = result.get(person.key) ?? []
        list.push(match)
        result.set(person.key, list)
      }
    }
    return result
  }, [admissionTargetsByMatchId, discoverPeople, hoodPeople, openMatches])

  const openMatchCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [key, matches] of openMatchTargetsByPerson.entries()) {
      counts.set(key, matches.length)
    }
    return counts
  }, [openMatchTargetsByPerson])

  const filteredHoodPeople = useMemo(() => {
    const query = search.trim().toLowerCase()
    return hoodPeople
      .filter((person) => matchesFilter(person, hoodFilter))
      .filter((person) => {
        if (!query) return true
        return [
          person.displayName,
          person.groupNames.join(' '),
          person.clubNames.join(' '),
          person.sourceBadges.join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((left, right) => sortHoodPeople(left, right, openMatchCount))
  }, [hoodFilter, hoodPeople, openMatchCount, search])

  const filteredDiscoverPeople = useMemo(() => {
    const query = search.trim().toLowerCase()
    return discoverPeople
      .filter((person) => {
        if (!query) return true
        return [
          person.displayName,
          person.clubNames.join(' '),
          person.sourceBadges.join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort(sortDiscoverPeople)
  }, [discoverPeople, search])

  const sportNameById = useMemo(
    () => new Map(sports.map((sport) => [sport.id, sport.display_name])),
    [sports],
  )

  const filteredDiscoverGroups = useMemo(() => {
    if (section !== 'discover' || discoverSource !== 'club_members') return [] as ClubDiscoverGroup[]
    const query = search.trim().toLowerCase()
    return clubDiscoverGroups
      .filter((group) => {
        if (!query) return true
        return [
          group.name,
          group.description ?? '',
          group.clubNames.join(' '),
          group.primarySportId ? sportNameById.get(group.primarySportId) ?? '' : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [clubDiscoverGroups, discoverSource, search, section, sportNameById])

  const activeDrawerPerson = useMemo(
    () => [...hoodPeople, ...discoverPeople].find((person) => person.key === activeDrawerKey) ?? null,
    [activeDrawerKey, discoverPeople, hoodPeople],
  )

  const navigateToNewMatch = useCallback((person?: HoodPerson | null) => {
    if (!selectedSport) return
    const params = new URLSearchParams()
    params.set('tab', 'matches')
    params.set('createSport', String(selectedSport.id))
    if (person?.userId) params.set('inviteUserId', person.userId)
    if (!person?.userId && person?.guestId) params.set('inviteGuestId', person.guestId)
    router.push(`/dashboard?${params.toString()}`)
  }, [router, selectedSport])

  const handleSaveToggle = useCallback(async (person: HoodPerson) => {
    const supabase = createSupabaseBrowserClient()
    setError(null)
    setMessage(null)
    try {
      if (person.isMyContact && !person.isSaved) {
        setMessage(`${person.displayName} is one of your starred contacts.`)
        return
      }
      if (person.isSaved && person.userId) {
        await removeFromInviteCircle(supabase, person.userId)
        setMessage(`${person.displayName} was removed from Starred.`)
      } else if (person.isSaved && person.personId) {
        const { error: removeError } = await supabase
          .from('person_relationships')
          .delete()
          .eq('actor_user_id', userId)
          .eq('person_id', person.personId)
          .eq('relationship_type', 'saved')
        if (removeError) throw removeError
        setMessage(`${person.displayName} was removed from Starred.`)
      } else if (person.userId) {
        await saveToInviteCircle(supabase, person.userId, person.isPlayedWith ? 'played_with_auto' : 'manual')
        setMessage(`${person.displayName} is now starred.`)
      } else if (person.guestId) {
        await saveContactPlayer(supabase, person.guestId, {
          source: person.saveSourceGroupId ? 'group_contact' : person.saveSourceMatchId ? 'shared_match' : 'manual',
          groupId: person.saveSourceGroupId,
          matchId: person.saveSourceMatchId,
        })
        setMessage(`${person.displayName} is now starred.`)
      }
      await loadSupportData()
      router.refresh()
    } catch (saveError) {
      setError((saveError as Error).message)
    }
  }, [loadSupportData, router])

  const handleInviteExisting = useCallback(async (person: HoodPerson, matchId: string) => {
    const supabase = createSupabaseBrowserClient()
    setPendingInviteMatchId(matchId)
    setError(null)
    setMessage(null)
    try {
      if (person.userId) {
        await inviteUserToMatch(supabase, matchId, person.userId)
      } else if (person.guestId) {
        await nominateGuest(supabase, matchId, person.guestId)
        await processDeliveriesAction()
      }
      setMessage(`${person.displayName} was invited to the match.`)
      setActiveInviteKey(null)
      router.refresh()
    } catch (inviteError) {
      setError((inviteError as Error).message)
    } finally {
      setPendingInviteMatchId(null)
    }
  }, [router])

  const handleAddToGroup = useCallback(async (groupId: string) => {
    if (!groupDialogPerson) return
    const supabase = createSupabaseBrowserClient()
    const normalizeGroupError = (message?: string) => {
      if (message === 'not_authorized') return 'You need to be an active member of this Shared Group.'
      if (message === 'guest_not_accessible') return 'You can only add contact players you can already view.'
      return message ?? 'Could not add this person to the Shared Group.'
    }
    setGroupPending(true)
    setError(null)
    setMessage(null)
    try {
      if (groupDialogPerson.userId) {
        await inviteUserToGroup(supabase, groupId, groupDialogPerson.userId)
      } else if (groupDialogPerson.guestId) {
        await addContactPlayerToGroup(supabase, groupId, groupDialogPerson.guestId)
      }
      setMessage(`${groupDialogPerson.displayName} was added to the Shared Group.`)
      setGroupDialogPerson(null)
      await loadSupportData()
      router.refresh()
    } catch (groupError) {
      setError(normalizeGroupError((groupError as Error).message))
    } finally {
      setGroupPending(false)
    }
  }, [groupDialogPerson, loadSupportData, router])

  const handleCreateContact = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSport) return

    const displayName = contactDisplayName.trim()
    const email = contactEmail.trim().toLowerCase() || null
    const phone = contactPhone.trim() || null

    if (!displayName) {
      setError('Contact name is required.')
      return
    }
    if (!email && !phone) {
      setError('Enter either email or phone for this contact.')
      return
    }

    const supabase = createSupabaseBrowserClient()
    setCreatingContact(true)
    setError(null)
    setMessage(null)
    try {
      const newGuest = await createRosterGuest(supabase, {
        display_name: displayName,
        gender: contactGender,
        email,
        phone,
      })
      await setGuestSports(supabase, newGuest.id, [selectedSport.code])
      setMessage(`${displayName} was added to your ${selectedSport.display_name} contacts.`)
      setContactDisplayName('')
      setContactEmail('')
      setContactPhone('')
      setContactGender(null)
      setContactComposerMode(null)
      await loadSupportData()
      router.refresh()
    } catch (createError) {
      setError((createError as Error).message)
    } finally {
      setCreatingContact(false)
    }
  }, [contactDisplayName, contactEmail, contactGender, contactPhone, loadSupportData, router, selectedSport])

  const handleUpdateContact = useCallback(async (input: {
    guest_id: string
    display_name: string
    gender?: ContactGender
    email?: string | null
    phone?: string | null
  }) => {
    const supabase = createSupabaseBrowserClient()
    setError(null)
    setMessage(null)
    try {
      await updateRosterGuest(supabase, input)
      await loadSupportData()
      router.refresh()
      setMessage(`${input.display_name} updated.`)
    } catch (updateError) {
      setError((updateError as Error).message)
      throw updateError
    }
  }, [loadSupportData, router])

  const handleScreenshotImported = useCallback(async () => {
    if (!selectedSport) return
    const existingGuestIds = new Set(supportData.contacts.map((contact) => contact.guest_id))
    const supabase = createSupabaseBrowserClient()

    try {
      const refreshedContacts = await getContactPlayerResolution(supabase)
      const newGuestIds = refreshedContacts
        .map((contact) => contact.guest_id)
        .filter((guestId) => !existingGuestIds.has(guestId))

      await Promise.all(
        newGuestIds.map((guestId) => setGuestSports(supabase, guestId, [selectedSport.code])),
      )

      setMessage(`Imported contacts were added to your ${selectedSport.display_name} hood.`)
      setContactComposerMode(null)
      await loadSupportData()
      router.refresh()
    } catch (importError) {
      setError((importError as Error).message)
    }
  }, [loadSupportData, router, selectedSport, supportData.contacts])

  const clearMessage = useCallback(() => {
    setMessage(null)
  }, [])

  if (!selectedSport) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6">
        <h2 className="text-h2 text-slate-900">Enable a sport to open Hoods</h2>
        <p className="text-body-main mt-2 leading-6 text-slate-500">
          Hoods only appear for sports you enable in your profile. Turn on at least one sport in My Profile first.
        </p>
        <button
          type="button"
          onClick={onOpenProfile}
          className="text-body-main mt-4 rounded-full bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
        >
          Open My Profile
        </button>
      </div>
    )
  }

  const activePeople = section === 'discover' ? filteredDiscoverPeople : filteredHoodPeople
  const showSavedContactTools = section === 'hood' && hoodFilter === 'saved'
  const showContactTools = showSavedContactTools && contactToolsOpen
  return (
    <div className="space-y-5">
      <div className="rounded-[30px] border border-[#E2E8F0] bg-white px-5 py-5 shadow-[0_20px_42px_-34px_rgba(30,41,59,0.16)]">
        <div className="flex flex-wrap gap-2">
          {sportOptions.map((sport) => (
            <button
              key={sport.id}
              type="button"
              onClick={() => {
                clearMessage()
                setSection('hood')
                setSelectedSportCode(sport.code)
              }}
              className={[
                'text-body-main rounded-full px-4 py-2 font-semibold transition',
                section === 'hood' && selectedSport.code === sport.code
                  ? 'bg-[#1E293B] text-white'
                  : 'bg-[#F0F7FF] text-[#475569] hover:bg-[#E8F1FB]',
              ].join(' ')}
            >
              {`My ${sport.display_name} Hood`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              clearMessage()
              setSection('discover')
            }}
            className={[
              'text-body-main rounded-full px-4 py-2 font-semibold transition',
              section === 'discover'
                ? 'bg-[#1E293B] text-white'
                : 'bg-[#F0F7FF] text-[#475569] hover:bg-[#E8F1FB]',
            ].join(' ')}
          >
            Discover
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 md:gap-3">
          <div className="flex flex-wrap gap-2">
            {section === 'hood'
              ? ([
                  ['all', 'All'],
                  ['saved', 'Starred'],
                  ['group', 'From Group'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      clearMessage()
                      setHoodFilter(value)
                    }}
                    className={[
                      'text-body-main rounded-full px-4 py-2 font-medium transition',
                      hoodFilter === value
                        ? 'bg-[#1E293B] text-white'
                        : 'bg-[#F0F7FF] text-[#475569] hover:bg-[#E8F1FB]',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))
              : ([
                  ['club_members', 'Club Members'],
                  ['played_with', 'Played With'],
                ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    clearMessage()
                    setDiscoverSource(value)
                  }}
                  className={[
                    'text-body-main rounded-full px-4 py-2 font-medium transition',
                    discoverSource === value
                    ? 'bg-[#1E293B] text-white'
                    : 'bg-[#F0F7FF] text-[#475569] hover:bg-[#E8F1FB]',
                  ].join(' ')}
                >
                  {label}
                </button>
                ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={section === 'discover' && discoverSource === 'club_members' ? 'Search people or groups' : 'Search people'}
            className="text-body-main h-11 min-w-[240px] flex-1 rounded-full border border-[#E2E8F0] bg-white px-4 text-[#1E293B] outline-none transition focus:border-[#C25E46]"
          />
        </div>
      </div>

      {message && (
        <div className="text-body-main rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="text-body-main rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {error}
        </div>
      )}
      {!error && clubDiscoverError && section === 'discover' && discoverSource === 'club_members' && (
        <div className="text-body-main rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          Club Members discovery is temporarily unavailable: {clubDiscoverError}
        </div>
      )}

      {showSavedContactTools ? (
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => {
              clearMessage()
              setError(null)
              setContactToolsOpen((current) => {
                const next = !current
                setContactComposerMode(next ? 'manual' : null)
                return next
              })
            }}
            className={[
              'text-body-main rounded-full px-4 py-2 font-medium transition',
              contactToolsOpen
                ? 'bg-[#1E293B] text-white'
                : 'border border-[#E2E8F0] bg-white text-[#475569] hover:border-[#C25E46]/35 hover:bg-[#F8FBFF]',
            ].join(' ')}
          >
            {contactToolsOpen ? 'Close contact player tools' : 'Add contact player'}
          </button>
        </div>
      ) : null}

      {showContactTools && (
        <div className="rounded-[28px] border border-[#E2E8F0] bg-white p-5 shadow-[0_20px_42px_-34px_rgba(30,41,59,0.16)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-h2 text-[#1E293B]">Contact Tools</h3>
              <p className="text-body-sub mt-1 text-[#64748B]">Add or import contacts.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  clearMessage()
                  setContactComposerMode((current) => current === 'manual' ? null : 'manual')
                  setError(null)
                }}
                className={[
                  'text-body-main rounded-full px-4 py-2 font-medium transition',
                  contactComposerMode === 'manual'
                    ? 'bg-[#C25E46] text-white'
                    : 'border border-[#E2E8F0] bg-white text-[#475569] hover:border-[#C25E46]/35 hover:bg-[#F8FBFF]',
                ].join(' ')}
              >
                {contactComposerMode === 'manual' ? 'Close Add Contact' : 'Add Contact'}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearMessage()
                  setContactComposerMode((current) => current === 'screenshot' ? null : 'screenshot')
                  setError(null)
                }}
                className={[
                  'text-body-main rounded-full px-4 py-2 font-medium transition',
                  contactComposerMode === 'screenshot'
                    ? 'bg-[#C25E46] text-white'
                    : 'border border-[#E2E8F0] bg-white text-[#475569] hover:border-[#C25E46]/35 hover:bg-[#F8FBFF]',
                ].join(' ')}
              >
                {contactComposerMode === 'screenshot' ? 'Close Import' : 'Import from Screenshot'}
              </button>
            </div>
          </div>

          {contactComposerMode === 'manual' && (
            <form onSubmit={handleCreateContact} className="mt-4 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-label text-slate-400">
                  Add to {selectedSport.display_name}
                </div>
              </div>
              <label className="text-body-main text-slate-600">
                <span className="mb-1 block">Name</span>
                <input
                  type="text"
                  value={contactDisplayName}
                  onChange={(event) => setContactDisplayName(event.target.value)}
                  placeholder="Display name"
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-slate-300"
                />
              </label>
              <label className="text-body-main text-slate-600">
                <span className="mb-1 block">Email</span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="Email"
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-slate-300"
                />
              </label>
              <label className="text-body-main text-slate-600">
                <span className="mb-1 block">Phone</span>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="Phone"
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-slate-300"
                />
              </label>
              <label className="text-body-main text-slate-600">
                <span className="mb-1 block">Gender</span>
                <select
                  value={contactGender ?? ''}
                  onChange={(event) => setContactGender((event.target.value || null) as ContactGender)}
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-slate-300"
                >
                  {CONTACT_GENDER_OPTIONS.map((option) => (
                    <option key={option.value || 'empty'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-sub text-slate-500">Adds to your hood.</p>
                <button
                  type="submit"
                  disabled={creatingContact}
                  className="text-body-main rounded-full bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
                >
                  {creatingContact ? 'Adding...' : 'Add Contact'}
                </button>
              </div>
            </form>
          )}

          {contactComposerMode === 'screenshot' && (
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <ContactScreenshotImportSection
                userId={userId}
                existingContacts={supportData.contacts}
                onParseScreenshots={onParseScreenshots}
                onImportScreenshotContacts={onImportScreenshotContacts}
                onImported={handleScreenshotImported}
              />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-body-main rounded-[28px] border border-slate-200 bg-white p-6 text-slate-500">
          Loading hood...
        </div>
      ) : activePeople.length === 0 && filteredDiscoverGroups.length === 0 ? (
        <div className="text-body-main rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          {getPeopleEmptyState(section, hoodFilter, discoverSource, selectedSport.display_name)}
        </div>
      ) : (
        <div className="space-y-5">
          {activePeople.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {activePeople.map((person) => (
                <HoodCard
                  key={person.key}
                  person={person}
                  myClubNames={myClubNames}
                  openMatchCount={openMatchCount.get(person.key) ?? 0}
                  onOpenDrawer={(nextPerson) => setActiveDrawerKey(nextPerson.key)}
                  onOpenMenuAddToGroup={(nextPerson) => {
                    setGroupDialogPerson(nextPerson)
                    setActiveMenuKey(null)
                  }}
                  onSaveToggle={handleSaveToggle}
                  inviteOpen={activeInviteKey === person.key}
                  menuOpen={activeMenuKey === person.key}
                  onToggleInvite={(nextPerson) => {
                    setActiveMenuKey(null)
                    setActiveInviteKey((current) => (current === nextPerson.key ? null : nextPerson.key))
                  }}
                  onToggleMenu={(nextPerson) => {
                    setActiveInviteKey(null)
                    setActiveMenuKey((current) => (current === nextPerson.key ? null : nextPerson.key))
                  }}
                  inviteMatches={openMatchTargetsByPerson.get(person.key) ?? []}
                  onInviteExisting={handleInviteExisting}
                  onInviteNew={navigateToNewMatch}
                  pendingInviteMatchId={pendingInviteMatchId}
                />
              ))}
            </div>
          ) : null}

          {section === 'discover' && discoverSource === 'club_members' && filteredDiscoverGroups.length > 0 ? (
            <section className="rounded-[28px] border border-[#E2E8F0] bg-white p-5 shadow-[0_20px_42px_-34px_rgba(30,41,59,0.16)]">
              <div className="mb-4">
                <div className="text-label text-[#94A3B8]">Groups</div>
                <p className="text-body-sub mt-1 text-[#64748B]">Open groups people from your club can discover.</p>
              </div>
              <div className="space-y-3">
                {filteredDiscoverGroups.map((group) => {
                  const icon = getGroupIconMeta(group.iconKey)
                  const sportName = group.primarySportId ? sportNameById.get(group.primarySportId) ?? 'Shared Group' : 'Shared Group'
                  const preview = group.description?.trim() || `Open to ${group.clubNames.join(', ')}.`
                  return (
                    <button
                      key={group.groupId}
                      type="button"
                      onClick={() => router.push(`/groups/${group.groupId}`)}
                      className="flex w-full items-center gap-4 rounded-[22px] border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-4 text-left transition hover:border-[#C25E46]/35 hover:bg-white"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#EEF2F7] bg-white text-[22px] shadow-[0_10px_24px_-22px_rgba(30,41,59,0.25)]">
                        {icon.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-h2 truncate text-[#1E293B]">{group.name}</div>
                          <span className="text-label rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[#C25E46]">
                            {sportName}
                          </span>
                        </div>
                        <div className="text-body-sub mt-1 text-[#64748B]">{preview}</div>
                        <div className="text-body-sub mt-2 text-[#94A3B8]">{group.clubNames.join(' · ')}</div>
                      </div>
                      <div className="text-body-sub shrink-0 rounded-[10px] bg-white px-2 py-1 font-bold text-[#94A3B8]">
                        {group.memberCount}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <HoodPersonDrawer
        open={Boolean(activeDrawerPerson)}
        person={activeDrawerPerson}
        sport={selectedSport}
        myClubNames={myClubNames}
        items={items}
        contactRecord={activeDrawerPerson?.guestId ? supportData.contactsByGuestId.get(activeDrawerPerson.guestId) ?? null : null}
        onClose={() => setActiveDrawerKey(null)}
        onSaveToggle={handleSaveToggle}
        onOpenAddToGroup={(person) => setGroupDialogPerson(person)}
        onOpenProxyManager={() => {
          setActiveDrawerKey(null)
          onOpenProfile()
        }}
        onUpdateContact={handleUpdateContact}
      />

      {groupDialogPerson && (
        <AddToGroupDialog
          groups={addToGroupOptions}
          person={groupDialogPerson}
          onClose={() => setGroupDialogPerson(null)}
          onConfirm={handleAddToGroup}
          pending={groupPending}
          emptyMessage={addToGroupEmptyMessage}
        />
      )}
    </div>
  )
}

