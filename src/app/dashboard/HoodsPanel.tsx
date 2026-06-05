'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  fetchUserSportsMap,
  type GuestLookupRow,
} from '@/lib/api/hoods'
import {
  getCityPlayersDiscovery,
  sendUserSaveRequest,
  searchPlayersByEmailOrPhone,
  type CityDiscoveryRow,
} from '@/lib/api/discovery'
import {
  getAdmissionTargets,
  getContactPersonAdmissionTargets,
  inviteUserToMatch,
  inviteContactGuestToMatch,
  inviteContactPersonToMatch,
  type AdmissionTarget,
  type ContactPersonAdmissionTarget,
  type MatchListItem,
} from '@/lib/api/matches'
import type { InviteCircleRow } from '@/lib/api/play-network'
import {
  getInviteCircleList,
  getVenueMembersDiscovery,
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
import { ContactPlayerMark } from '@/app/components/ContactPlayerMark'
import { ParticipantDetailPanel, type DetailConnection, type DetailValue } from '@/app/components/ParticipantDetailPanel'
import { ContactScreenshotImportSection } from '@/app/dashboard/ContactScreenshotImportSection'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatTimeWindow } from '@/lib/format-time'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import { setGuestSports } from '@/lib/api/sports'
import { getLevelLabel } from '@/lib/profile-options'
import { getAvailabilityStatusDotClass } from '@/lib/profile-options'
import { getPreferredPlayTimeLabel } from '@/lib/profile-options'
import { getVenueDisplayName } from '@/lib/venues/display'
import type {
  AvailabilityStatus,
  Sport,
  UserPlayCity,
  Venue,
} from '@/lib/types/database'
import type { VenueMembership } from '@/lib/api/identities'

type SupportedSportCode = 'tennis' | 'pickleball' | 'badminton'
type HoodSection = 'hood' | 'discover'
type HoodFilter = 'all' | 'saved' | 'linked' | 'club' | 'group'
type DiscoverSource = 'club_members' | 'city_players' | 'search_people'
type IdentityType = 'platform' | 'contact' | 'linked'
type ContactGender = 'male' | 'female' | 'unspecified' | null
type StarterMatchFormat = 'singles' | 'doubles' | 'unknown'
type MobileContactView = 'smart' | 'manual' | 'benefits'
type SourceBadge =
  | 'My Contact'
  | 'Starred'
  | 'From Group'
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
  cityNames: Set<string>
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
  saveActionKind: 'direct_save' | 'save_request'
  saveRequestStatus: string | null
  saveRequestNextEligibleAt: string | null
  canInvite: boolean
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
  cityNames: string[]
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
  saveActionKind: 'direct_save' | 'save_request'
  saveRequestStatus: string | null
  saveRequestNextEligibleAt: string | null
  canInvite: boolean
}

type ClubDiscoverPerson = {
  userId: string
  displayName: string
  clubNames: string[]
}

type CityDiscoverPerson = {
  userId: string
  displayName: string
  cityNames: string[]
  isSaved: boolean
}

type SearchDiscoverPerson = {
  userId: string
  displayName: string
  visibility: 'visible' | 'requestable'
  isSaved: boolean
  canAdd: boolean
  canRequestAdd: boolean
  canInvite: boolean
  requestStatus: string | null
  nextEligibleAt: string | null
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
  myVenueMemberships: VenueMembership[]
  sports: Sport[]
  enabledSportIds: number[]
  myPlayCities: UserPlayCity[]
  onRefreshDashboardLive: () => Promise<void>
  onParseScreenshots?: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts?: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
  onOpenProfile: () => void
  openContactComposerSignal?: number
  onStarterStatusChange?: (status: {
    contactCount: number
    preferredFormat: StarterMatchFormat
    firstMatchCreated: boolean
  }) => void
}

const SUPPORTED_SPORTS: SupportedSportCode[] = ['tennis', 'pickleball', 'badminton']

const STARTER_DISMISS_MS = 24 * 60 * 60 * 1000

function getStarterFormatStorageKey(userId: string) {
  return `dashboard:first-hood-format:${userId}`
}

function getStarterDismissStorageKey(userId: string) {
  return `dashboard:first-hood-dismissed-at:${userId}`
}

function getStarterTarget(format: StarterMatchFormat) {
  return format === 'doubles' ? 3 : 1
}

function StarterPeopleIcon({
  count,
  complete,
}: {
  count: number
  complete: boolean
}) {
  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-[#D7E2F0] bg-[#F8FBFF] text-[#0d6efd] sm:h-28 sm:w-28">
      <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="18" r="6" />
        <circle cx="32" cy="17" r="5" />
        <path d="M8 36c1.8-6 5.5-9 10-9s8.2 3 10 9" />
        <path d="M27 34c1.4-4.2 4.2-6.4 7.5-6.4 2.8 0 5.2 1.3 7 3.9" />
      </svg>
      <span className={[
        'absolute bottom-5 right-5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-black text-white',
        complete ? 'bg-[#22C55E]' : 'bg-[#60A5FA]',
      ].join(' ')}>
        {Math.min(count, 99)}
      </span>
    </div>
  )
}

function FirstHoodStarterCard({
  contactCount,
  firstMatchCreated,
  preferredFormat,
  onPreferredFormatChange,
  onAddContact,
  onStartMatch,
  onDismiss,
}: {
  contactCount: number
  firstMatchCreated: boolean
  preferredFormat: StarterMatchFormat
  onPreferredFormatChange: (format: StarterMatchFormat) => void
  onAddContact: () => void
  onStartMatch: () => void
  onDismiss: () => void
}) {
  const target = getStarterTarget(preferredFormat)
  const clampedCount = Math.min(contactCount, target)
  const ready = contactCount >= target
  const progressPercent = Math.max(6, Math.round((clampedCount / target) * 100))
  const plural = target === 1 ? 'contact saved as Player Card' : 'contacts saved as Player Cards'

  const copy = (() => {
    if (firstMatchCreated) {
      return {
        title: 'First match started',
        body: 'Nice. Your first Hood and match are set up.',
      }
    }
    if (ready && preferredFormat === 'singles') {
      return {
        title: 'Your singles match is ready to start',
        body: "You've saved 1 Player Card. Now invite them to a match.",
      }
    }
    if (ready && preferredFormat === 'doubles') {
      return {
        title: 'Your doubles group is ready',
        body: "You've saved 3 Player Cards. Now invite them to a match.",
      }
    }
    if (ready) {
      return {
        title: 'Your Hood is ready',
        body: `You've saved ${target} Player ${target === 1 ? 'Card' : 'Cards'}. Now invite them to your first match.`,
      }
    }
    if (contactCount > 0) {
      return {
        title: 'Keep building your Hood',
        body:
          preferredFormat === 'doubles'
            ? `You've saved ${contactCount} Player ${contactCount === 1 ? 'Card' : 'Cards'}. Add ${target - contactCount} more to make your first match easier.`
            : `You've saved ${contactCount} Player Card. Start a match now or add another regular player.`,
      }
    }
    if (preferredFormat === 'singles') {
      return {
        title: 'Build your first singles match',
        body: 'Add 1 person you play with, then invite them to a match.',
      }
    }
    if (preferredFormat === 'doubles') {
      return {
        title: 'Build your first doubles match',
        body: 'Add 3 people you play with, then invite them to a match.',
      }
    }
    return {
      title: 'Build your first Hood',
      body: 'Add people you play with, then invite them to your first match.',
    }
  })()

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-[#D7E2F0] bg-white px-5 py-5 shadow-[0_22px_60px_-42px_rgba(11,31,68,0.35)] sm:px-7 sm:py-6">
      <style>{`
        @keyframes starterContactGlow {
          0%, 78%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
          82% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.25); }
          96% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
        }
      `}</style>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] transition hover:bg-[#F1F5F9] hover:text-[#0B1F44]"
        aria-label="Dismiss starter card"
      >
        <ContactToolIcon kind="close" />
      </button>

      <div className="flex flex-col gap-5 pr-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-black tracking-[-0.02em] text-[#0B1F44]">{copy.title}</h2>
          <p className="mt-2 text-body-main leading-6 text-[#536179]">{copy.body}</p>

          {!ready && !firstMatchCreated ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">What do you usually play?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ['singles', 'Singles'],
                  ['doubles', 'Doubles'],
                  ['unknown', 'Not sure yet'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPreferredFormatChange(value)}
                    className={[
                      'rounded-full px-3.5 py-1.5 text-body-sub font-bold transition',
                      preferredFormat === value
                        ? 'bg-[#0B1F44] text-white'
                        : 'border border-[#D7E2F0] bg-white text-[#536179] hover:bg-[#F8FBFF]',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7A8AA6]">
                {firstMatchCreated
                  ? 'First match started'
                  : ready
                    ? `${clampedCount} / ${target} Player ${target === 1 ? 'Card' : 'Cards'} saved`
                    : `${clampedCount} / ${target} ${plural}`}
              </p>
              {ready || firstMatchCreated ? (
                <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#16A34A]">Done</span>
              ) : null}
            </div>
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-[#EEF3F8]">
              <div
                className={['h-full rounded-full transition-all duration-500', ready || firstMatchCreated ? 'bg-[#22C55E]' : 'bg-[#0d6efd]'].join(' ')}
                style={{ width: `${ready || firstMatchCreated ? 100 : progressPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {!ready && !firstMatchCreated ? (
              <button
                type="button"
                onClick={onAddContact}
                className="text-body-main inline-flex items-center gap-2 rounded-xl bg-[#0d6efd] px-5 py-3 font-bold text-white shadow-[0_16px_32px_-20px_rgba(37,99,235,0.9)] transition hover:bg-[#0b5ed7]"
                style={{ animation: 'starterContactGlow 6s ease-in-out infinite' }}
              >
                <span className="text-lg leading-none">+</span>
                Add My Contact
              </button>
            ) : null}
            <button
              type="button"
              onClick={onStartMatch}
              className={[
                'text-body-main inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold transition',
                ready || firstMatchCreated
                  ? 'bg-[#0d6efd] text-white shadow-[0_16px_32px_-20px_rgba(37,99,235,0.9)] hover:bg-[#0b5ed7]'
                  : 'bg-white text-[#7A8AA6] hover:bg-[#F8FBFF] hover:text-[#0B1F44]',
              ].join(' ')}
            >
              {firstMatchCreated ? 'View Match' : 'Start a Match'}
              {(ready || firstMatchCreated) ? <span aria-hidden="true">›</span> : null}
            </button>
          </div>
        </div>

        <StarterPeopleIcon count={clampedCount} complete={ready || firstMatchCreated} />
      </div>
    </section>
  )
}

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

function formatContactGenderLabel(gender: ContactGender): string | null {
  switch (gender) {
    case 'female':
      return 'Female'
    case 'male':
      return 'Male'
    case 'unspecified':
      return 'Prefer not to say'
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

function formatPreferredTimeList(value: string[] | null | undefined): string[] {
  if (!value || value.length === 0) return []
  return value
    .map((item) => getPreferredPlayTimeLabel(item) ?? item)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitDetailText(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatCompactLevel(value: string | null | undefined): string | null {
  if (!value) return null

  const label = getLevelLabel(value) ?? value
  const match = label.match(/\(([^)]+)\)/)
  if (match?.[1]) {
    return match[1].replace(/\s+/g, '')
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

function isPastMatch(item: MatchListItem, nowIso: string): boolean {
  if (item.match.start_at_utc) return item.match.start_at_utc < nowIso
  if (item.match.match_date) return item.match.match_date < nowIso.slice(0, 10)
  return false
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
    if (seed.saveActionKind === 'save_request') existing.saveActionKind = 'save_request'
    if (seed.saveRequestStatus !== undefined) existing.saveRequestStatus = seed.saveRequestStatus
    if (seed.saveRequestNextEligibleAt !== undefined) existing.saveRequestNextEligibleAt = seed.saveRequestNextEligibleAt
    if (seed.canInvite === false) existing.canInvite = false
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
    cityNames: new Set(),
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
    saveActionKind: seed.saveActionKind ?? 'direct_save',
    saveRequestStatus: seed.saveRequestStatus ?? null,
    saveRequestNextEligibleAt: seed.saveRequestNextEligibleAt ?? null,
    canInvite: seed.canInvite ?? true,
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
    cityNames: Array.from(person.cityNames),
  }))
}

function isContactModulePerson(person: Pick<HoodPerson, 'guestId' | 'isMyContact' | 'canEditContact' | 'identityType'>): boolean {
  return person.guestId !== null || person.isMyContact || person.canEditContact || person.identityType !== 'platform'
}

function isRegisteredPlayerPerson(person: HoodPerson): boolean {
  return person.userId !== null && !isContactModulePerson(person)
}

function isLinkedRegisteredContactPerson(person: HoodPerson): boolean {
  return person.userId !== null && person.identityType === 'linked'
}

function matchesFilter(person: HoodPerson, filter: HoodFilter): boolean {
  switch (filter) {
    case 'saved':
      return (isRegisteredPlayerPerson(person) || isLinkedRegisteredContactPerson(person)) && isPersonStarred(person)
    case 'linked':
      return person.isLinked
    case 'club':
      return person.isClubMember || person.clubNames.length > 0
    case 'group':
      return person.isFromGroup
    case 'all':
    default:
      return true
  }
}

function matchesHoodSearch(person: HoodPerson, query: string): boolean {
  if (!query) return true
  return [
    person.displayName,
    person.groupNames.join(' '),
    person.clubNames.join(' '),
    person.cityNames.join(' '),
    person.sourceBadges.join(' '),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query)
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
  if (left.cityNames.length !== right.cityNames.length) return right.cityNames.length - left.cityNames.length
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
      parsed.hoodFilter === 'saved'
        ? 'saved'
        : parsed.hoodFilter === 'linked'
          ? 'linked'
        : parsed.hoodFilter === 'club'
          ? 'club'
        : parsed.hoodFilter === 'group'
          ? 'group'
          : 'all'
    const discoverSource: DiscoverSource =
      parsed.discoverSource === 'city_players'
        ? 'city_players'
        : parsed.discoverSource === 'search_people'
          ? 'search_people'
          : 'club_members'

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
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getSourceBadgeLabel(badge: SourceBadge): string {
  switch (badge) {
    case 'Starred':
      return 'Saved'
    case 'From Group':
      return 'From Groups'
    default:
      return badge
  }
}

function isPersonStarred(person: Pick<HoodPerson, 'isSaved'>): boolean {
  return person.isSaved
}

function BookmarkIcon({ filled = false, className = '' }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className || 'h-4 w-4'} fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path
        d="M5.75 3.25h8.5c.55 0 1 .45 1 1v12.1c0 .38-.42.61-.74.4L10 13.82l-4.51 2.93a.48.48 0 0 1-.74-.4V4.25c0-.55.45-1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
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
    if (discoverSource === 'city_players') {
      return `No city players are available in ${sportName} right now.`
    }
    if (discoverSource === 'search_people') {
      return 'Enter an exact email, phone, or shared-club display name to find a registered player.'
    }
    return `No club members are available in ${sportName} right now.`
  }

  switch (hoodFilter) {
    case 'saved':
      return `No saved registered players are in your ${sportName.toLowerCase()} hood yet.`
    case 'group':
      return `No registered players from groups are in your ${sportName.toLowerCase()} hood yet.`
    case 'all':
    default:
      return `Your ${sportName} Hood is empty. Add players, add contacts, or bring people in through groups.`
  }
}

function getLookupContextForSearch(query: string) {
  const trimmed = query.trim()
  const digits = trimmed.replace(/\D/g, '')
  return trimmed.includes('@') || digits.length >= 7
    ? 'exact_contact_lookup'
    : 'same_public_venue_name_search'
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
  onUpdateContact: (input: {
    guest_id: string
    display_name: string
    gender?: ContactGender
    email?: string | null
    phone?: string | null
  }) => Promise<void>
}) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [editingContact, setEditingContact] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactGender, setContactGender] = useState<ContactGender>(null)

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
  const isContactDetail = isContactModulePerson(person)
  const canViewPrivateContactInfo = person.isMyContact || person.canEditContact
  const contactVenueLabel = sharedClubNames.join(', ') || 'Not shared yet'
  const detailTitle = isContactDetail ? 'Basic Info' : 'Profile Details'
  const formatLabels = activeSportProfile?.preferred_formats.map(formatFormatLabel).filter(Boolean) ?? []
  const preferredTimes = formatPreferredTimeList(profile?.preferred_play_times)
  const playStyles = splitDetailText(activeSportProfile?.play_style)

  const connections: DetailConnection[] = []

  const detailItems: DetailValue[] = []
  const detailGender = formatContactGenderLabel(profile?.gender ?? person.gender)
  if (detailGender) {
    detailItems.push({ key: 'gender', label: 'Gender', value: detailGender })
  }
  if (currentStatusLabel && currentStatusLabel !== 'Not shared yet' && !isContactDetail) {
    detailItems.push({ key: 'status', label: 'Current status', value: currentStatusLabel })
  }
  if (canViewPrivateContactInfo && contactRecord?.phone?.trim()) {
    detailItems.push({ key: 'phone', label: 'Phone', value: contactRecord.phone.trim() })
  }
  if (canViewPrivateContactInfo && contactRecord?.email?.trim()) {
    detailItems.push({ key: 'email', label: 'Email', value: contactRecord.email.trim() })
  }
  if (contactVenueLabel !== 'Not shared yet' && isContactDetail) {
    detailItems.push({ key: 'venue', label: 'Venue', value: contactVenueLabel })
  }
  if (person.isLinked) {
    detailItems.push({ key: 'linked', label: 'Account', value: 'This saved contact is now a registered PlayerHoods user.' })
  }

  const headerBadges = (
    <>
      {person.isMyContact ? (
        <span className="text-label rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-500">
          MY CONTACT
        </span>
      ) : null}
      {visibleSourceBadges
        .filter((badge) => badge !== 'My Contact')
        .map((badge) => (
          <span
            key={badge}
            className={`text-label rounded-md border border-transparent px-2 py-0.5 ${sourceBadgeClass(badge)}`}
          >
            {getSourceBadgeLabel(badge).toUpperCase()}
          </span>
        ))}
    </>
  )

  const extraContent = (
    <>
      {editingContact && person.canEditContact && person.guestId ? (
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Edit Contact
          </h3>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Name</span>
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Display name"
                className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Gender</span>
                <select
                  value={contactGender ?? ''}
                  onChange={(event) => setContactGender((event.target.value || null) as ContactGender)}
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                >
                  {CONTACT_GENDER_OPTIONS.map((option) => (
                    <option key={option.value || 'empty'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Phone</span>
                <input
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="+1 (000) 000-0000"
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Email</span>
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="Enter email address"
                className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>
        </section>
      ) : null}

    </>
  )

  const footer = (
    <div className="flex flex-wrap gap-3">
      {editingContact && person.canEditContact && person.guestId ? (
        <>
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
            className="text-body-sub inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {savingContact ? 'Saving...' : 'Save contact'}
          </button>
          <button
            type="button"
            onClick={() => setEditingContact(false)}
            className="text-body-sub inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          {(person.userId || person.guestId) ? (
            <button
              type="button"
              onClick={() => void onSaveToggle(person)}
              className="text-body-sub inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span className={isStarred ? 'text-[#B7D93D]' : 'text-slate-300'}>
                <BookmarkIcon filled={isStarred} className="h-4 w-4" />
              </span>
              {isContactDetail
                ? (isStarred ? 'Unstar contact' : 'Star contact')
                : person.saveActionKind === 'save_request'
                  ? person.saveRequestStatus === 'pending'
                    ? 'Request sent'
                    : 'Request to Add'
                  : (isStarred ? 'Remove from PlayerHood' : 'Add to PlayerHood')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenAddToGroup(person)}
            className="text-body-sub inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Add to Shared Group
          </button>
          {person.canEditContact ? (
            <button
              type="button"
              onClick={() => setEditingContact(true)}
              className="text-body-sub inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Edit contact
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="text-body-sub ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
        </>
      )}
    </div>
  )

  return (
    <ParticipantDetailPanel
      open={open}
      displayName={editingContact ? contactName : person.displayName}
      avatarUrl={person.avatarUrl}
      avatarFallback={isContactDetail ? 'contact' : 'initial'}
      statusClassName={isContactDetail ? null : currentStatusDotClass}
      headerBadges={headerBadges}
      level={getLevelLabel(activeSportProfile?.level) ?? activeSportProfile?.level ?? null}
      formatLabels={formatLabels}
      connections={connections}
      playStyles={playStyles}
      experience={activeSportProfile?.competition_experience ?? null}
      preferredTimes={preferredTimes}
      detailTitle={detailItems.length > 0 ? detailTitle : null}
      detailItems={detailItems}
      extraContent={extraContent}
      footer={footer}
      onClose={onClose}
    />
  )
}

function InvitePopover({
  person,
  matches,
  onInviteExisting,
  onInviteNew,
  pendingId,
  loading,
}: {
  person: HoodPerson
  matches: MatchListItem[]
  onInviteExisting: (person: HoodPerson, matchId: string) => Promise<void>
  onInviteNew: (person: HoodPerson) => void
  pendingId: string | null
  loading: boolean
}) {
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_22px_44px_-26px_rgba(15,23,42,0.32)]">
      <h4 className="text-title-main text-slate-900">Open Matches</h4>
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="text-body-main rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-slate-500">
            Loading open matches...
          </div>
        ) : matches.length === 0 ? (
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
  inviteTargetsLoading,
  onInviteExisting,
  onInviteNew,
  pendingInviteMatchId,
  compact = false,
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
  inviteTargetsLoading: boolean
  onInviteExisting: (person: HoodPerson, matchId: string) => Promise<void>
  onInviteNew: (person: HoodPerson) => void
  pendingInviteMatchId: string | null
  compact?: boolean
}) {
  const isContactCard = isContactModulePerson(person)
  const currentStatusDotClass = getAvailabilityStatusDotClass(person.statusLabel)
  const shouldShowAvailabilityDot = !isContactCard
  const isStarred = isPersonStarred(person)
  const requestDisabled = !isStarred && person.saveActionKind === 'save_request' && (
    person.saveRequestStatus === 'pending'
    || Boolean(person.saveRequestNextEligibleAt)
  )
  const starButtonLabel = isContactCard
    ? (isStarred ? 'Unstar contact' : 'Star contact')
    : person.saveActionKind === 'save_request'
      ? person.saveRequestStatus === 'pending'
        ? 'Request sent'
        : person.saveRequestNextEligibleAt
          ? `Request available ${new Date(person.saveRequestNextEligibleAt).toLocaleDateString()}`
          : 'Request to Add'
      : (isStarred ? 'Remove from PlayerHood' : 'Add to PlayerHood')

  return (
    <article
      className="relative w-full min-w-0 justify-self-stretch rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.28)] transition hover:border-slate-300"
      data-hood-menu-root
      data-hood-invite-root
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenDrawer(person)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-start gap-2.5">
            <div className="relative shrink-0">
              <Avatar
                src={person.avatarUrl}
                displayName={person.displayName}
                size="md"
                fallback={isContactCard ? 'contact' : 'initial'}
                className="h-9 w-9 text-body-sub"
              />
              {shouldShowAvailabilityDot && currentStatusDotClass ? (
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white ${currentStatusDotClass}`}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pr-1 pt-0.5">
              <div className="flex min-w-0 flex-col items-start gap-1">
                <div className="relative min-w-0 max-w-full">
                  <h3 className="text-title-main break-words leading-tight text-slate-900">{person.displayName}</h3>
                </div>
                {person.isLinked ? (
                  <span className="rounded-full border border-sky-100 bg-sky-50 px-1.5 py-[1px] text-[9px] font-black uppercase tracking-[0.08em] text-sky-700">
                    Linked
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
          {(person.userId || person.guestId) && (
            <button
              type="button"
              disabled={requestDisabled}
              onClick={(event) => {
                event.stopPropagation()
                void onSaveToggle(person)
              }}
              className={[
                'inline-flex h-7 w-7 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60',
                isStarred
                  ? 'border-[#B7D93D] bg-[#F7FFD8] text-[#8FB000] hover:border-[#9FC227] hover:bg-[#F2FFC1]'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
              aria-label={starButtonLabel}
              title={starButtonLabel}
            >
              <BookmarkIcon
                filled={isStarred}
                className={[
                  'h-4 w-4 transition',
                  isStarred ? 'text-[#8FB000]' : 'text-slate-300',
                ].join(' ')}
              />
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
      </div>

      {inviteOpen && person.canInvite && (
        <InvitePopover
          person={person}
          matches={inviteMatches}
          onInviteExisting={onInviteExisting}
          onInviteNew={onInviteNew}
          pendingId={pendingInviteMatchId}
          loading={inviteTargetsLoading}
        />
      )}

      {menuOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_22px_44px_-26px_rgba(15,23,42,0.32)]">
          {person.canInvite ? (
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
          ) : null}
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

function HoodCardGrid({
  people,
  myClubNames,
  openMatchCount,
  activeInviteKey,
  activeMenuKey,
  openMatchTargetsByPerson,
  loadingInviteKey,
  pendingInviteMatchId,
  onOpenDrawer,
  onOpenMenuAddToGroup,
  onSaveToggle,
  onToggleInvite,
  onToggleMenu,
  onInviteExisting,
  onInviteNew,
  compact = false,
}: {
  people: HoodPerson[]
  myClubNames: string[]
  openMatchCount: Map<string, number>
  activeInviteKey: string | null
  activeMenuKey: string | null
  openMatchTargetsByPerson: Map<string, MatchListItem[]>
  loadingInviteKey: string | null
  pendingInviteMatchId: string | null
  onOpenDrawer: (person: HoodPerson) => void
  onOpenMenuAddToGroup: (person: HoodPerson) => void
  onSaveToggle: (person: HoodPerson) => Promise<void>
  onToggleInvite: (person: HoodPerson) => void
  onToggleMenu: (person: HoodPerson) => void
  onInviteExisting: (person: HoodPerson, matchId: string) => Promise<void>
  onInviteNew: (person: HoodPerson) => void
  compact?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {people.map((person) => (
        <HoodCard
          key={person.key}
          person={person}
          myClubNames={myClubNames}
          openMatchCount={openMatchCount.get(person.key) ?? 0}
          onOpenDrawer={onOpenDrawer}
          onOpenMenuAddToGroup={onOpenMenuAddToGroup}
          onSaveToggle={onSaveToggle}
          inviteOpen={activeInviteKey === person.key}
          menuOpen={activeMenuKey === person.key}
          onToggleInvite={onToggleInvite}
          onToggleMenu={onToggleMenu}
          inviteMatches={openMatchTargetsByPerson.get(person.key) ?? []}
          inviteTargetsLoading={activeInviteKey === person.key && loadingInviteKey === person.key}
          onInviteExisting={onInviteExisting}
          onInviteNew={onInviteNew}
          pendingInviteMatchId={pendingInviteMatchId}
          compact={compact}
        />
      ))}
    </div>
  )
}

function ContactToolIcon({ kind }: { kind: 'card' | 'invite' | 'reply' | 'bell' | 'shield' | 'quick' | 'sync' | 'link' | 'spark' | 'close' }) {
  if (kind === 'card') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <rect x="4.2" y="3.2" width="11.6" height="13.6" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.9 13.4c.9-1.4 2-2 3.1-2s2.2.6 3.1 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'invite') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M7.7 12.3 12.3 7.7M8.2 6.1l.8-.8a3.4 3.4 0 0 1 4.8 4.8l-.8.8M11.8 13.9l-.8.8a3.4 3.4 0 0 1-4.8-4.8l.8-.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'reply') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M4.5 5.2h11a1.7 1.7 0 0 1 1.7 1.7v5.8a1.7 1.7 0 0 1-1.7 1.7H8.6L5 16.6v-2.2h-.5a1.7 1.7 0 0 1-1.7-1.7V6.9a1.7 1.7 0 0 1 1.7-1.7Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'bell') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M7.2 15.4h5.6M8.5 16.5a1.7 1.7 0 0 0 3 0M5.8 13.7c.8-.7 1.1-1.5 1.1-2.7V8.8a3.1 3.1 0 0 1 6.2 0V11c0 1.2.3 2 1.1 2.7H5.8ZM14.7 5.3l1.1-1.1M5.3 5.3 4.2 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'shield') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M10 2.8 15.2 5v4.1c0 3.3-1.8 5.8-5.2 7.9-3.4-2.1-5.2-4.6-5.2-7.9V5L10 2.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="m7.8 9.8 1.4 1.4 3.1-3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'quick') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M11.5 1.8 4.4 10.7h5.1l-1 7.5 7.1-8.9h-5.1l1-7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'sync') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M6.2 14.5H5.4a3.4 3.4 0 1 1 .8-6.7 4.6 4.6 0 0 1 8.8 1.4 2.7 2.7 0 0 1-.8 5.3H6.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'link') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M8.2 12.1 11.8 8.5M7.3 6.1l.9-.9a3.2 3.2 0 0 1 4.5 4.5l-.9.9M12.7 13.9l-.9.9a3.2 3.2 0 0 1-4.5-4.5l.9-.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'spark') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M10 2.4 11.4 7l4.3 1.5-4.3 1.6L10 14.6l-1.4-4.5-4.3-1.6L8.6 7 10 2.4ZM15.5 12.8l.6 1.7 1.6.6-1.6.6-.6 1.7-.6-1.7-1.6-.6 1.6-.6.6-1.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function useIsMobileContactLayout() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return isMobile
}

export function HoodsPanel({
  userId,
  items,
  inviteCircle,
  groups,
  myVenueMemberships,
  sports,
  enabledSportIds,
  myPlayCities,
  onRefreshDashboardLive,
  onParseScreenshots,
  onImportScreenshotContacts,
  onOpenProfile,
  openContactComposerSignal,
  onStarterStatusChange,
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
  const [searchPeopleInput, setSearchPeopleInput] = useState('')
  const [submittedSearchPeopleQuery, setSubmittedSearchPeopleQuery] = useState('')
  const [searchPeopleRequestKey, setSearchPeopleRequestKey] = useState(0)
  const [selectedCity, setSelectedCity] = useState<string>(myPlayCities[0]?.city_name ?? '')
  const [contactToolsOpen, setContactToolsOpen] = useState(false)
  const [inviteCircleRows, setInviteCircleRows] = useState<InviteCircleRow[]>(inviteCircle)
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
  const [cityDiscover, setCityDiscover] = useState<CityDiscoverPerson[]>([])
  const [searchDiscover, setSearchDiscover] = useState<SearchDiscoverPerson[]>([])
  const [clubProfiles, setClubProfiles] = useState<Map<string, PublicPlayerProfile | null>>(new Map())
  const [cityProfiles, setCityProfiles] = useState<Map<string, PublicPlayerProfile | null>>(new Map())
  const [searchProfiles, setSearchProfiles] = useState<Map<string, PublicPlayerProfile | null>>(new Map())
  const [directInviteClubMemberIds, setDirectInviteClubMemberIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshingSupportData, setRefreshingSupportData] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clubDiscoverError, setClubDiscoverError] = useState<string | null>(null)
  const [cityDiscoverError, setCityDiscoverError] = useState<string | null>(null)
  const [searchDiscoverError, setSearchDiscoverError] = useState<string | null>(null)
  const [searchDiscoverLoading, setSearchDiscoverLoading] = useState(false)
  const [activeDrawerKey, setActiveDrawerKey] = useState<string | null>(null)
  const [activeInviteKey, setActiveInviteKey] = useState<string | null>(null)
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null)
  const [groupDialogPerson, setGroupDialogPerson] = useState<HoodPerson | null>(null)
  const [groupPending, setGroupPending] = useState(false)
  const [pendingInviteMatchId, setPendingInviteMatchId] = useState<string | null>(null)
  const [admissionTargetsByMatchId, setAdmissionTargetsByMatchId] = useState<Map<string, AdmissionTarget[]>>(new Map())
  const [contactPersonTargetsByMatchId, setContactPersonTargetsByMatchId] = useState<Map<string, ContactPersonAdmissionTarget[]>>(new Map())
  const [loadingInviteKey, setLoadingInviteKey] = useState<string | null>(null)
  const [contactComposerMode, setContactComposerMode] = useState<'manual' | 'screenshot' | null>(null)
  const [mobileContactView, setMobileContactView] = useState<MobileContactView>('smart')
  const [contactDisplayName, setContactDisplayName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)
  const [savedStateOverrides, setSavedStateOverrides] = useState<Record<string, boolean>>({})
  const [starterPreferredFormat, setStarterPreferredFormat] = useState<StarterMatchFormat>('unknown')
  const [starterDismissedAt, setStarterDismissedAt] = useState<number | null>(null)
  const hasLoadedSupportDataRef = useRef(false)
  const isMobileContactLayout = useIsMobileContactLayout()

  useEffect(() => {
    if (sportOptions.some((sport) => sport.code === selectedSportCode)) return
    if (sportOptions[0]) setSelectedSportCode(sportOptions[0].code)
  }, [selectedSportCode, sportOptions])

  useEffect(() => {
    try {
      const storedFormat = window.localStorage.getItem(getStarterFormatStorageKey(userId))
      if (storedFormat === 'singles' || storedFormat === 'doubles' || storedFormat === 'unknown') {
        setStarterPreferredFormat(storedFormat)
      }
      const storedDismissedAt = Number(window.localStorage.getItem(getStarterDismissStorageKey(userId)) ?? '')
      if (Number.isFinite(storedDismissedAt) && storedDismissedAt > 0) {
        setStarterDismissedAt(storedDismissedAt)
      }
    } catch {
      // Ignore localStorage failures.
    }
  }, [userId])

  useEffect(() => {
    if (!openContactComposerSignal) return
    setContactToolsOpen(true)
    setMobileContactView('smart')
    setContactComposerMode('manual')
  }, [openContactComposerSignal])

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
    () => new Map(myVenueMemberships.map((membership) => [membership.venue.name, getVenueDisplayName(membership.venue)])),
    [myVenueMemberships],
  )
  const myClubNames = useMemo(
    () => Array.from(new Set(myVenueMemberships.map((membership) => getVenueDisplayName(membership.venue)).filter(Boolean))),
    [myVenueMemberships],
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

  const applySavedOverride = useCallback((person: HoodPerson): HoodPerson => {
    const override = savedStateOverrides[person.key]
    if (override === undefined) return person
    return {
      ...person,
      isSaved: override,
    }
  }, [savedStateOverrides])

  const loadSupportData = useCallback(async (options?: { foreground?: boolean }) => {
    const foreground = options?.foreground ?? !hasLoadedSupportDataRef.current
    if (foreground) {
      setLoading(true)
    } else {
      setRefreshingSupportData(true)
    }
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
          ...inviteCircleRows.map((row) => row.target_user_id),
          ...groups.flatMap((group) => group.members.map((member) => member.userId)),
          ...contacts.map((contact) => contact.linked_user_id).filter((value): value is string => Boolean(value)),
          ...Array.from(groupContactsByGroupId.values()).flat().map((contact) => contact.linked_user_id).filter((value): value is string => Boolean(value)),
          ...Array.from(guestLookupByGuestId.values()).map((guest) => guest.linked_user_id).filter((value): value is string => Boolean(value)),
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
      hasLoadedSupportDataRef.current = true
      if (foreground) {
        setLoading(false)
      } else {
        setRefreshingSupportData(false)
      }
    }
  }, [groups, inviteCircleRows, items])

  useEffect(() => {
    setInviteCircleRows(inviteCircle)
  }, [inviteCircle])

  useEffect(() => {
    void loadSupportData({ foreground: !hasLoadedSupportDataRef.current })
  }, [loadSupportData])

  useEffect(() => {
    if (myPlayCities.length === 0) {
      setSelectedCity('')
      return
    }
    if (!selectedCity || !myPlayCities.some((city) => city.city_name === selectedCity)) {
      setSelectedCity(myPlayCities[0]?.city_name ?? '')
    }
  }, [myPlayCities, selectedCity])

  useEffect(() => {
    if (!selectedSport) return
    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    const loadClubDiscover = async () => {
      try {
        setClubDiscoverError(null)
        const venueIds = Array.from(new Set(myVenueMemberships.map((membership) => membership.venue_id)))
        const entries = await Promise.all(
          venueIds.map(async (venueId) => {
            const membership = myVenueMemberships.find((item) => item.venue_id === venueId)
            const [discoverRows, invitableRows] = await Promise.all([
              getVenueMembersDiscovery(supabase, venueId, null),
              getVenueInvitableMembers(supabase, venueId, userId),
            ])
            const invitableUserIds = new Set(invitableRows.map((row) => row.user_id))
            return {
              people: discoverRows
                .filter((row) => row.user_id !== userId)
                .map((row) => ({
                userId: row.user_id,
                displayName: normalizeDisplayName(row.display_name),
                clubName: membership ? getVenueDisplayName(membership.venue) : 'Club',
                isInvitable: invitableUserIds.has(row.user_id),
              })),
            }
          }),
        )

        const deduped = new Map<string, ClubDiscoverPerson>()
        const directInvitableIds = new Set<string>()
        for (const entry of entries.flatMap((item) => item.people)) {
          if (entry.isInvitable) directInvitableIds.add(entry.userId)
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

        const userIds = Array.from(deduped.keys())
        const [profiles, userSportsMap] = await Promise.all([
          fetchPublicPlayerProfiles(supabase, userIds, 'same_public_venue_name_search'),
          fetchUserSportsMap(supabase, userIds),
        ])
        if (cancelled) return

        setClubProfiles(profiles)
        setDirectInviteClubMemberIds(directInvitableIds)
        setClubDiscover(
          Array.from(deduped.values()).filter((person) =>
            profileMatchesSport(profiles.get(person.userId), selectedSport.id)
            || (userSportsMap.get(person.userId) ?? []).includes(selectedSport.id),
          ),
        )
      } catch (clubError) {
        console.error('[hoods] club discover:', clubError)
        if (!cancelled) {
          setClubProfiles(new Map())
          setClubDiscover([])
          setDirectInviteClubMemberIds(new Set())
          setClubDiscoverError((clubError as Error).message || 'Failed to load club members.')
        }
      }
    }

    void loadClubDiscover()
    return () => {
      cancelled = true
    }
  }, [groups, myVenueMemberships, selectedSport, userId])

  useEffect(() => {
    if (!selectedSport || !selectedCity) {
      setCityDiscover([])
      setCityProfiles(new Map())
      setCityDiscoverError(null)
      return
    }

    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    const loadCityDiscover = async () => {
      try {
        setCityDiscoverError(null)
        const rows = await getCityPlayersDiscovery(supabase, selectedCity, null)
        const userIds = rows.map((row) => row.user_id)
        const [profiles, userSportsMap] = await Promise.all([
          fetchPublicPlayerProfiles(supabase, userIds),
          fetchUserSportsMap(supabase, userIds),
        ])

        if (cancelled) return

        setCityProfiles(profiles)
        setCityDiscover(
          rows
            .filter((row) => row.user_id !== userId)
            .filter((row) =>
              profileMatchesSport(profiles.get(row.user_id), selectedSport.id)
              || (userSportsMap.get(row.user_id) ?? []).includes(selectedSport.id),
            )
            .map((row) => ({
              userId: row.user_id,
              displayName: normalizeDisplayName(row.display_name),
              cityNames: row.shared_city_names,
              isSaved: row.is_saved,
            })),
        )
      } catch (cityError) {
        console.error('[hoods] city discover:', cityError)
        if (!cancelled) {
          setCityDiscover([])
          setCityProfiles(new Map())
          setCityDiscoverError((cityError as Error).message || 'Failed to load city players.')
        }
      }
    }

    void loadCityDiscover()
    return () => {
      cancelled = true
    }
  }, [selectedCity, selectedSport, userId])

  useEffect(() => {
    if (discoverSource !== 'search_people') {
      setSearchDiscover([])
      setSearchProfiles(new Map())
      setSearchDiscoverError(null)
      setSearchDiscoverLoading(false)
      return
    }

    const query = submittedSearchPeopleQuery.trim()
    if (!query) {
      setSearchDiscover([])
      setSearchProfiles(new Map())
      setSearchDiscoverError(null)
      setSearchDiscoverLoading(false)
      return
    }

    const supabase = createSupabaseBrowserClient()
    let cancelled = false
    setSearchDiscoverLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setSearchDiscoverError(null)
          const rows = await searchPlayersByEmailOrPhone(supabase, query)
          const visibleUserIds = rows
            .filter((row) => row.visibility === 'visible')
            .map((row) => row.user_id)
          const lookupContext = getLookupContextForSearch(query)
          const [profiles, userSportsMap] = await Promise.all([
            fetchPublicPlayerProfiles(supabase, visibleUserIds, lookupContext),
            fetchUserSportsMap(supabase, visibleUserIds),
          ])

          if (cancelled) return

          setSearchProfiles(profiles)
          setSearchDiscover(
            rows
              .filter((row) =>
                row.visibility === 'requestable'
                || profileMatchesSport(profiles.get(row.user_id), selectedSport?.id ?? 0)
                || (userSportsMap.get(row.user_id) ?? []).includes(selectedSport?.id ?? 0),
              )
              .map((row) => ({
                userId: row.user_id,
                displayName: normalizeDisplayName(row.display_name),
                visibility: row.visibility,
                isSaved: row.is_saved,
                canAdd: row.can_add,
                canRequestAdd: row.can_request_add,
                canInvite: row.can_invite,
                requestStatus: row.request_status,
                nextEligibleAt: row.next_eligible_at,
              })),
          )
          setSearchDiscoverLoading(false)
        } catch (searchError) {
          console.error('[hoods] exact search:', searchError)
          if (!cancelled) {
            setSearchDiscover([])
            setSearchProfiles(new Map())
            setSearchDiscoverError((searchError as Error).message || 'Search is temporarily unavailable.')
            setSearchDiscoverLoading(false)
          }
        }
      })()
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [discoverSource, searchPeopleRequestKey, selectedSport, submittedSearchPeopleQuery])

  const combinedProfiles = useMemo(
    () => new Map([...supportData.profilesByUserId, ...clubProfiles, ...cityProfiles, ...searchProfiles]),
    [cityProfiles, clubProfiles, searchProfiles, supportData.profilesByUserId],
  )

  const hoodPeople = useMemo(() => {
    if (!selectedSport) return [] as HoodPerson[]
    const map = new Map<string, MutablePerson>()
    const savedUserIds = new Set(inviteCircleRows.map((row) => row.target_user_id))

    for (const contact of supportData.contacts) {
      const lookup = supportData.guestLookupByGuestId.get(contact.guest_id)
      const personId = lookup?.person_id ?? null
      const linkedUserId = contact.linked_user_id ?? null
      const linkedProfile = linkedUserId ? combinedProfiles.get(linkedUserId) : null
      const guestSportIds = supportData.guestSportsByGuestId.get(contact.guest_id) ?? []
      const hasExplicitContactSports = guestSportIds.length > 0
      if (
        hasExplicitContactSports &&
        !guestSportIds.includes(selectedSport.id) &&
        !profileMatchesSport(linkedProfile, selectedSport.id)
      ) {
        continue
      }
      const isSavedContact = true

      const key = buildCanonicalKey({
        linkedUserId,
        userId: linkedUserId,
        personId,
        guestId: contact.guest_id,
      })
      const selectedSportProfile = getSportProfile(linkedProfile, selectedSport.id)
      const person = ensurePerson(map, {
        key,
        userId: linkedUserId,
        guestId: contact.guest_id,
        personId,
        linkedUserId,
        displayName: normalizeDisplayName(linkedProfile?.display_name ?? contact.display_name),
        avatarUrl: linkedProfile?.avatar_url ?? null,
        identityType: linkedUserId ? 'linked' : 'contact',
        isMyContact: true,
        isSaved: isSavedContact,
        isLinked: Boolean(linkedUserId),
        canEditContact: true,
        gender: linkedProfile?.gender ?? contact.gender ?? null,
        level: selectedSportProfile?.level ?? null,
        playType: selectedSportProfile?.play_style ?? null,
        statusLabel: formatStatusLabel(linkedProfile, contact),
        engagedSports: linkedProfile
          ? linkedProfile.sport_profiles.map((item) => item.sport_name)
          : hasExplicitContactSports
            ? guestSportIds.map((sportId) => sportNameByIdAll.get(sportId) ?? selectedSport.display_name)
            : [selectedSport.display_name],
        preferredFormats: selectedSportProfile?.preferred_formats ?? [],
        sportLabel: selectedSport.display_name,
      })
      person.sourceBadges.add('My Contact')
      if (linkedUserId) person.sourceBadges.add('Linked')
      if (isSavedContact) {
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

    for (const row of inviteCircleRows) {
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

    for (const group of groups.filter((row) => row.group.primary_sport_id == null || row.group.primary_sport_id === selectedSport.id)) {
      const groupMatchesSelectedSport = group.group.primary_sport_id === selectedSport.id

      for (const member of group.members) {
        if (member.userId === userId) continue
        const profile = combinedProfiles.get(member.userId)
        if (!groupMatchesSelectedSport && !profileMatchesSport(profile, selectedSport.id)) continue
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
        const lookup = supportData.guestLookupByGuestId.get(contact.guest_id)
        const linkedUserId = contact.linked_user_id ?? ownedContact?.linked_user_id ?? lookup?.linked_user_id ?? null
        const linkedProfile = linkedUserId ? combinedProfiles.get(linkedUserId) : null
        const guestSportIds = supportData.guestSportsByGuestId.get(contact.guest_id) ?? []
        const hasExplicitContactSports = guestSportIds.length > 0
        if (
          !groupMatchesSelectedSport
          && hasExplicitContactSports
          && !guestSportIds.includes(selectedSport.id)
          && !profileMatchesSport(linkedProfile, selectedSport.id)
        ) {
          continue
        }
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
            : hasExplicitContactSports
              ? guestSportIds.map((sportId) => sportNameByIdAll.get(sportId) ?? selectedSport.display_name)
              : [selectedSport.display_name],
          preferredFormats: selectedSportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
          saveSourceGroupId: group.group.id,
        })
        person.isFromGroup = true
        person.sourceBadges.add('From Group')
        person.groupNames.add(group.group.name)
        if (linkedUserId) person.sourceBadges.add('Linked')
        if (ownedContact) person.sourceBadges.add('My Contact')
        if (person.isSaved) person.sourceBadges.add('Starred')
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
  }, [combinedProfiles, directInviteClubMemberIds, groups, inviteCircleRows, selectedSport, sportNameByIdAll, supportData, userId])

  const discoverPeople = useMemo(() => {
    if (!selectedSport) return [] as HoodPerson[]
    const savedUserIds = new Set(inviteCircleRows.map((row) => row.target_user_id))

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
          isSaved: savedUserIds.has(clubMember.userId),
          gender: profile?.gender ?? null,
          level: sportProfile?.level ?? null,
          playType: sportProfile?.play_style ?? null,
          statusLabel: formatStatusLabel(profile),
          engagedSports: profile?.sport_profiles.map((entry) => entry.sport_name) ?? [selectedSport.display_name],
          preferredFormats: sportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
        })
        person.isClubMember = true
        if (savedUserIds.has(clubMember.userId)) person.sourceBadges.add('Starred')
        for (const clubName of clubMember.clubNames) {
          person.clubNames.add(clubName)
        }
      }
      return finalizePeople(map)
    }

    if (discoverSource === 'city_players') {
      const map = new Map<string, MutablePerson>()
      for (const cityPlayer of cityDiscover) {
        if (cityPlayer.userId === userId) continue
        const profile = combinedProfiles.get(cityPlayer.userId)
        const sportProfile = getSportProfile(profile, selectedSport.id)
        const key = buildCanonicalKey({ userId: cityPlayer.userId })
        const person = ensurePerson(map, {
          key,
          userId: cityPlayer.userId,
          displayName: normalizeDisplayName(profile?.display_name ?? cityPlayer.displayName),
          avatarUrl: profile?.avatar_url ?? null,
          identityType: 'platform',
          isSaved: savedUserIds.has(cityPlayer.userId) || cityPlayer.isSaved,
          gender: profile?.gender ?? null,
          level: sportProfile?.level ?? null,
          playType: sportProfile?.play_style ?? null,
          statusLabel: formatStatusLabel(profile),
          engagedSports: profile?.sport_profiles.map((entry) => entry.sport_name) ?? [selectedSport.display_name],
          preferredFormats: sportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
        })
        if (savedUserIds.has(cityPlayer.userId) || cityPlayer.isSaved) person.sourceBadges.add('Starred')
        for (const cityName of cityPlayer.cityNames) {
          person.cityNames.add(cityName)
        }
      }
      return finalizePeople(map)
    }

    if (discoverSource === 'search_people') {
      const map = new Map<string, MutablePerson>()
      for (const result of searchDiscover) {
        if (result.userId === userId) continue
        const profile = combinedProfiles.get(result.userId)
        const sportProfile = getSportProfile(profile, selectedSport.id)
        const key = buildCanonicalKey({ userId: result.userId })
        const person = ensurePerson(map, {
          key,
          userId: result.userId,
          displayName: normalizeDisplayName(profile?.display_name ?? result.displayName),
          avatarUrl: profile?.avatar_url ?? null,
          identityType: 'platform',
          isSaved: savedUserIds.has(result.userId) || result.isSaved,
          gender: profile?.gender ?? null,
          level: sportProfile?.level ?? null,
          playType: sportProfile?.play_style ?? null,
          statusLabel: formatStatusLabel(profile),
          engagedSports: profile?.sport_profiles.map((entry) => entry.sport_name) ?? [selectedSport.display_name],
          preferredFormats: sportProfile?.preferred_formats ?? [],
          sportLabel: selectedSport.display_name,
          saveActionKind: result.visibility === 'requestable' ? 'save_request' : 'direct_save',
          saveRequestStatus: result.requestStatus,
          saveRequestNextEligibleAt: result.nextEligibleAt,
          canInvite: result.canInvite,
        })
        if (savedUserIds.has(result.userId) || result.isSaved) person.sourceBadges.add('Starred')
      }
      return finalizePeople(map)
    }

    return [] as HoodPerson[]
  }, [cityDiscover, clubDiscover, combinedProfiles, discoverSource, inviteCircleRows, searchDiscover, selectedSport, userId])

  const openMatches = useMemo(() => {
    if (!selectedSport) return [] as MatchListItem[]
    return items.filter((item) =>
      item.match.sport_id === selectedSport.id
      && isFutureMatch(item)
      && item.confirmedCount < item.match.required_count,
    )
  }, [items, selectedSport])

  const loadInviteTargetsForPerson = useCallback(async (person: HoodPerson) => {
    if (!person.canInvite || openMatches.length === 0) return

    const missingMatches = openMatches.filter((item) =>
      !admissionTargetsByMatchId.has(item.match.id)
      || !contactPersonTargetsByMatchId.has(item.match.id),
    )
    if (missingMatches.length === 0) return

    setLoadingInviteKey(person.key)
    const supabase = createSupabaseBrowserClient()
    const nextMap = new Map(admissionTargetsByMatchId)
    const nextContactMap = new Map(contactPersonTargetsByMatchId)

    try {
      await Promise.all(
        missingMatches.map(async (item) => {
          try {
            const [targets, contactTargets] = await Promise.all([
              getAdmissionTargets(supabase, item.match.id),
              getContactPersonAdmissionTargets(supabase, item.match.id),
            ])
            nextMap.set(item.match.id, targets)
            nextContactMap.set(item.match.id, contactTargets)
          } catch (loadError) {
            console.error(`[hoods] admission targets ${item.match.id}:`, loadError)
            nextMap.set(item.match.id, [])
            nextContactMap.set(item.match.id, [])
          }
        }),
      )

      setAdmissionTargetsByMatchId(nextMap)
      setContactPersonTargetsByMatchId(nextContactMap)
    } finally {
      setLoadingInviteKey((current) => (current === person.key ? null : current))
    }
  }, [admissionTargetsByMatchId, contactPersonTargetsByMatchId, openMatches])

  const openMatchTargetsByPerson = useMemo(() => {
    const result = new Map<string, MatchListItem[]>()
    const allPeople = [...hoodPeople, ...discoverPeople]
    for (const person of allPeople) {
      if (!person.canInvite) continue
      for (const match of openMatches) {
        const targets = admissionTargetsByMatchId.get(match.match.id) ?? []
        const contactTargets = contactPersonTargetsByMatchId.get(match.match.id) ?? []
        const canInviteRegistered = targets.some((target) =>
          target.can_admit
          && person.userId
          && target.action_kind === 'admit_user'
          && target.target_id === person.userId,
        )
        const canInviteContact = contactTargets.some((target) =>
          target.can_invite
          && person.personId
          && target.person_id === person.personId,
        )
        const canInvite = canInviteRegistered || canInviteContact
        if (!canInvite) continue
        const list = result.get(person.key) ?? []
        list.push(match)
        result.set(person.key, list)
      }
    }
    return result
  }, [admissionTargetsByMatchId, contactPersonTargetsByMatchId, discoverPeople, hoodPeople, openMatches])

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
      .filter((person) => matchesHoodSearch(person, query))
      .sort((left, right) => sortHoodPeople(left, right, openMatchCount))
  }, [hoodFilter, hoodPeople, openMatchCount, search])

  const filteredDiscoverPeople = useMemo(() => {
    if (discoverSource === 'search_people') {
      return [...discoverPeople].sort(sortDiscoverPeople)
    }
    const query = search.trim().toLowerCase()
    return discoverPeople
      .filter((person) => {
        if (!query) return true
        return [
          person.displayName,
          person.clubNames.join(' '),
          person.cityNames.join(' '),
          person.sourceBadges.join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort(sortDiscoverPeople)
  }, [discoverPeople, discoverSource, search])

  const activeDrawerPerson = useMemo(() => {
    const person = [...hoodPeople, ...discoverPeople].find((entry) => entry.key === activeDrawerKey) ?? null
    return person ? applySavedOverride(person) : null
  }, [activeDrawerKey, applySavedOverride, discoverPeople, hoodPeople])

  const hasSubmittedSearchPeople = submittedSearchPeopleQuery.trim().length > 0
  const showSearchPeoplePanel = section === 'discover' && discoverSource === 'search_people'

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
    const originalSavedState = person.isSaved
    const nextSavedState = !originalSavedState
    setError(null)
    setMessage(null)
    setSavedStateOverrides((current) => ({
      ...current,
      [person.key]: nextSavedState,
    }))
    try {
      if (!person.isSaved && person.userId && person.saveActionKind === 'save_request') {
        const result = await sendUserSaveRequest(supabase, person.userId)
        setSavedStateOverrides((current) => {
          const next = { ...current }
          delete next[person.key]
          return next
        })
        setSearchDiscover((current) =>
          current.map((entry) =>
            entry.userId === person.userId
              ? {
                  ...entry,
                  requestStatus: result.status,
                  nextEligibleAt: result.next_eligible_at,
                }
              : entry,
          ),
        )
        if (result.status === 'pending') {
          setMessage(`Request sent to ${person.displayName}.`)
        } else if (result.status === 'already_saved') {
          setMessage(`${person.displayName} is already in your PlayerHood.`)
          const nextInviteCircleRows = await getInviteCircleList(supabase)
          setInviteCircleRows(nextInviteCircleRows)
        } else if (result.next_eligible_at) {
          setMessage(`You can send another request after ${new Date(result.next_eligible_at).toLocaleDateString()}.`)
        } else {
          setMessage(`Request status: ${result.status}.`)
        }
      } else if (person.isSaved && person.personId && isContactModulePerson(person)) {
        const { error: removeError } = await supabase
          .from('person_relationships')
          .delete()
          .eq('actor_user_id', userId)
          .eq('person_id', person.personId)
          .eq('relationship_type', 'saved')
        if (removeError) throw removeError
        setMessage(`${person.displayName} was removed from Saved.`)
      } else if (person.isSaved && person.userId) {
        await removeFromInviteCircle(supabase, person.userId)
        setMessage(`${person.displayName} was removed from your PlayerHood.`)
      } else if (person.guestId && isContactModulePerson(person)) {
        await saveContactPlayer(supabase, person.guestId, {
          source: person.saveSourceGroupId ? 'group_contact' : person.saveSourceMatchId ? 'shared_match' : 'manual',
          groupId: person.saveSourceGroupId,
          matchId: person.saveSourceMatchId,
        })
        setMessage(`${person.displayName} is now starred.`)
      } else if (person.userId) {
        await saveToInviteCircle(supabase, person.userId, person.isPlayedWith ? 'played_with_auto' : 'manual')
        setMessage(`${person.displayName} is now in your PlayerHood.`)
      }
      if (person.userId && !isContactModulePerson(person)) {
        const nextInviteCircleRows = await getInviteCircleList(supabase)
        setInviteCircleRows(nextInviteCircleRows)
      }
      await loadSupportData()
    } catch (saveError) {
      setSavedStateOverrides((current) => ({
        ...current,
        [person.key]: originalSavedState,
      }))
      setError((saveError as Error).message)
    }
  }, [loadSupportData])

  const handleToggleInvite = useCallback((person: HoodPerson) => {
    setActiveMenuKey(null)
    setActiveInviteKey((current) => {
      const next = current === person.key ? null : person.key
      if (next) {
        void loadInviteTargetsForPerson(person)
      }
      return next
    })
  }, [loadInviteTargetsForPerson])

  const handleInviteExisting = useCallback(async (person: HoodPerson, matchId: string) => {
    const supabase = createSupabaseBrowserClient()
    setPendingInviteMatchId(matchId)
    setError(null)
    setMessage(null)
    try {
      if (person.personId && isContactModulePerson(person)) {
        await inviteContactPersonToMatch(supabase, matchId, person.personId)
      } else if (person.userId) {
        await inviteUserToMatch(supabase, matchId, person.userId)
      } else if (person.guestId) {
        await inviteContactGuestToMatch(supabase, matchId, person.guestId)
      }
      setMessage(`${person.displayName} was invited to the match.`)
      setActiveInviteKey(null)
      processDeliveriesAction().catch(() => {})
      await onRefreshDashboardLive()
    } catch (inviteError) {
      setError((inviteError as Error).message)
    } finally {
      setPendingInviteMatchId(null)
    }
  }, [onRefreshDashboardLive])

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
    } catch (groupError) {
      setError(normalizeGroupError((groupError as Error).message))
    } finally {
      setGroupPending(false)
    }
  }, [groupDialogPerson, loadSupportData])

  const handleCreateContact = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSport) return

    const displayName = contactDisplayName.trim()
    const email = contactEmail.trim().toLowerCase() || null
    const phone = contactPhone.trim() || null
    const notes = contactNotes.trim() || null

    if (!displayName) {
      setError('Contact name is required.')
      return
    }
    if (!email && !phone) {
      setError('Email or phone required')
      return
    }

    const supabase = createSupabaseBrowserClient()
    setCreatingContact(true)
    setError(null)
    setMessage(null)
    try {
      const newGuest = await createRosterGuest(supabase, {
        display_name: displayName,
        gender: null,
        email,
        phone,
        notes,
      })
      await saveContactPlayer(supabase, newGuest.id, { source: 'manual' })
      await setGuestSports(supabase, newGuest.id, [selectedSport.code])
      setMessage(`${displayName} was saved. You can add another contact.`)
      setContactDisplayName('')
      setContactEmail('')
      setContactPhone('')
      setContactNotes('')
      setContactComposerMode('manual')
      setContactToolsOpen(true)
      setHoodFilter('saved')
      void loadSupportData({ foreground: false })
    } catch (createError) {
      setError((createError as Error).message)
    } finally {
      setCreatingContact(false)
    }
  }, [contactDisplayName, contactEmail, contactNotes, contactPhone, loadSupportData, selectedSport])

  const handleSearchPeopleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setSearchDiscoverError(null)
    const normalizedQuery = searchPeopleInput.trim()
    if (!normalizedQuery) {
      setSubmittedSearchPeopleQuery('')
      setSearchDiscover([])
      setSearchProfiles(new Map())
      setSearchDiscoverLoading(false)
      return
    }
    setSubmittedSearchPeopleQuery(normalizedQuery)
    setSearchPeopleRequestKey((current) => current + 1)
  }, [searchPeopleInput])

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
      setMessage(`${input.display_name} updated.`)
    } catch (updateError) {
      setError((updateError as Error).message)
      throw updateError
    }
  }, [loadSupportData])

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
      setContactToolsOpen(false)
      setHoodFilter('saved')
      await loadSupportData()
    } catch (importError) {
      setError((importError as Error).message)
    }
  }, [loadSupportData, selectedSport, supportData.contacts])

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

  const activePeople = useMemo(
    () => (section === 'discover' ? filteredDiscoverPeople : filteredHoodPeople).map(applySavedOverride),
    [applySavedOverride, filteredDiscoverPeople, filteredHoodPeople, section],
  )
  const savedPrimaryPeople = useMemo(() => {
    if (section !== 'hood' || hoodFilter !== 'saved') return [] as HoodPerson[]
    const query = search.trim().toLowerCase()
    return hoodPeople
      .map(applySavedOverride)
      .filter((person) =>
        isPersonStarred(person)
        && (isRegisteredPlayerPerson(person) || isLinkedRegisteredContactPerson(person))
        && matchesHoodSearch(person, query),
      )
      .sort((left, right) => sortHoodPeople(left, right, openMatchCount))
  }, [applySavedOverride, hoodFilter, hoodPeople, openMatchCount, search, section])
  const savedContactPeople = useMemo(() => {
    if (section !== 'hood' || hoodFilter !== 'saved') return [] as HoodPerson[]
    const query = search.trim().toLowerCase()
    const primaryKeys = new Set(savedPrimaryPeople.map((person) => person.key))
    return hoodPeople
      .map(applySavedOverride)
      .filter((person) =>
        person.isMyContact
        && !primaryKeys.has(person.key)
        && matchesHoodSearch(person, query),
      )
      .sort((left, right) => sortHoodPeople(left, right, openMatchCount))
  }, [applySavedOverride, hoodFilter, hoodPeople, openMatchCount, savedPrimaryPeople, search, section])
  const starterContactCount = useMemo(() => {
    const contactKeys = new Set<string>()
    hoodPeople
      .map(applySavedOverride)
      .forEach((person) => {
        if (!person.isMyContact) return
        contactKeys.add(person.personId ?? person.guestId ?? person.key)
      })
    return contactKeys.size
  }, [applySavedOverride, hoodPeople])
  const firstCreatedMatch = useMemo(
    () => items.find((item) => item.match.organizer_id === userId) ?? null,
    [items, userId],
  )
  const firstMatchCreated = Boolean(firstCreatedMatch)
  const starterTarget = getStarterTarget(starterPreferredFormat)
  const starterDismissedRecently = starterDismissedAt !== null && Date.now() - starterDismissedAt < STARTER_DISMISS_MS
  const shouldShowStarterCard = false
    && section === 'hood'
    && !starterDismissedRecently
    && !(starterContactCount >= starterTarget && firstMatchCreated)

  useEffect(() => {
    onStarterStatusChange?.({
      contactCount: starterContactCount,
      preferredFormat: starterPreferredFormat,
      firstMatchCreated,
    })
  }, [firstMatchCreated, onStarterStatusChange, starterContactCount, starterPreferredFormat])

  const handleStarterFormatChange = useCallback((format: StarterMatchFormat) => {
    setStarterPreferredFormat(format)
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

  const handleStarterAddContact = useCallback(() => {
    clearMessage()
    setSection('hood')
    setContactToolsOpen(true)
    setMobileContactView('smart')
    setContactComposerMode('manual')
    setError(null)
    window.setTimeout(() => {
      document.getElementById('add-my-contact-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [clearMessage])

  const handleStarterStartMatch = useCallback(() => {
    if (firstCreatedMatch?.match.id && firstMatchCreated) {
      router.push(`/matches/${firstCreatedMatch.match.id}`)
      return
    }
    if (!selectedSport) return
    const params = new URLSearchParams()
    params.set('tab', 'matches')
    params.set('createSport', String(selectedSport.id))
    params.set('starterHint', '1')
    if (starterPreferredFormat === 'singles' || starterPreferredFormat === 'unknown') {
      params.set('createFormat', 'singles')
    } else if (starterPreferredFormat === 'doubles') {
      params.set('createFormat', 'doubles')
    }
    router.push(`/dashboard?${params.toString()}`)
  }, [firstCreatedMatch?.match.id, firstMatchCreated, router, selectedSport, starterPreferredFormat])

  const showContactTools = section === 'hood' && contactToolsOpen
  return (
    <div className="space-y-5">
      {shouldShowStarterCard ? (
        <FirstHoodStarterCard
          contactCount={starterContactCount}
          firstMatchCreated={firstMatchCreated}
          preferredFormat={starterPreferredFormat}
          onPreferredFormatChange={handleStarterFormatChange}
          onAddContact={handleStarterAddContact}
          onStartMatch={handleStarterStartMatch}
          onDismiss={handleStarterDismiss}
        />
      ) : null}

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

        {section === 'discover' ? (
          <p className="mt-3 text-body-sub text-[#64748B]">
            Discover players. Save them to your Hood. Invite them to play.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 md:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {section === 'hood'
              ? [
                  <button
                    key="add-my-contact"
                    type="button"
                    onClick={() => {
                      clearMessage()
                      setSection('hood')
                      setContactToolsOpen(true)
                      setMobileContactView('smart')
                      setContactComposerMode('manual')
                      setError(null)
                    }}
                    className="text-body-main inline-flex items-center gap-2 rounded-full bg-[#0B1F44] px-5 py-2.5 font-semibold text-white shadow-[0_14px_28px_-20px_rgba(11,31,68,0.9)] transition hover:bg-[#102A5C]"
                  >
                    <span className="text-lg leading-none">+</span>
                    Add My Contact
                  </button>,
                  ...([
                    ['all', 'All'],
                    ['saved', 'Saved'],
                    ['group', 'From Groups'],
                  ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      clearMessage()
                      setContactToolsOpen(false)
                      setContactComposerMode(null)
                      setError(null)
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
                )),
                ]
              : ([
                  ['club_members', 'Club Members'],
                  ['city_players', 'City Players'],
                  ['search_people', 'Search People'],
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

          {!showSearchPeoplePanel ? (
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                section === 'discover'
                  ? 'Search people'
                  : 'Search people'
              }
              className="text-body-main h-11 min-w-[240px] flex-1 rounded-full border border-[#E2E8F0] bg-white px-4 text-[#1E293B] outline-none transition focus:border-[#0d6efd]"
            />
          ) : null}
        </div>

        {section === 'discover' && discoverSource === 'city_players' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {myPlayCities.length === 0 ? (
              <span className="text-body-sub text-[#94A3B8]">
                Add play cities in My Profile to use City Players discovery.
              </span>
            ) : (
              myPlayCities.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => {
                    clearMessage()
                    setSelectedCity(city.city_name)
                  }}
                  className={[
                    'text-body-sub rounded-full px-3 py-1.5 transition',
                    selectedCity === city.city_name
                      ? 'bg-[#1E293B] text-white'
                      : 'bg-[#F0F7FF] text-[#475569] hover:bg-[#E8F1FB]',
                  ].join(' ')}
                >
                  {city.city_name}
                </button>
              ))
            )}
          </div>
        ) : null}
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
      {!error && cityDiscoverError && section === 'discover' && discoverSource === 'city_players' && (
        <div className="text-body-main rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          City Players discovery is temporarily unavailable: {cityDiscoverError}
        </div>
      )}
      {!error && searchDiscoverError && section === 'discover' && discoverSource === 'search_people' && (
        <div className="text-body-main rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          Search People is temporarily unavailable: {searchDiscoverError}
        </div>
      )}
      {refreshingSupportData && !loading ? (
        <div className="text-body-sub rounded-2xl border border-slate-200 bg-white px-4 py-2 text-slate-500">
          Updating hood...
        </div>
      ) : null}

      {showSearchPeoplePanel ? (
        <div className="rounded-[28px] border border-[#E2E8F0] bg-white p-5 shadow-[0_20px_42px_-34px_rgba(30,41,59,0.16)]">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-h2 text-[#1E293B]">Find a registered player</h3>
              <p className="text-body-sub mt-1 text-[#64748B]">
                Find by exact email or phone. Some players may ask you to request access before you can add or invite them.
              </p>
            </div>
            <form onSubmit={handleSearchPeopleSubmit} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={searchPeopleInput}
                onChange={(event) => setSearchPeopleInput(event.target.value)}
                placeholder="Enter exact email or phone"
                className="text-body-main h-11 min-w-[240px] flex-1 rounded-full border border-[#E2E8F0] bg-white px-4 text-[#1E293B] outline-none transition focus:border-[#0d6efd]"
              />
              <button
                type="submit"
                disabled={searchDiscoverLoading || searchPeopleInput.trim().length === 0}
                className="text-body-main rounded-full bg-[#1E293B] px-5 py-2.5 font-semibold text-white transition hover:bg-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searchDiscoverLoading ? 'Searching...' : 'Search'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showContactTools && (
        <div id="add-my-contact-panel" className="overflow-hidden rounded-[40px] border border-[#E2E8F0] bg-white px-5 py-7 shadow-[0_26px_70px_-42px_rgba(11,31,68,0.35)] sm:px-8 lg:px-10">
          {isMobileContactLayout ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (mobileContactView === 'benefits') {
                      setMobileContactView('smart')
                      return
                    }
                    clearMessage()
                    setContactToolsOpen(false)
                    setContactComposerMode(null)
                    setError(null)
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#0B1F44] transition hover:bg-[#F1F5F9]"
                  aria-label={mobileContactView === 'benefits' ? 'Back to add contact' : 'Close add contact panel'}
                >
                  {mobileContactView === 'benefits' ? <span className="text-xl font-black leading-none">{'<'}</span> : <ContactToolIcon kind="close" />}
                </button>
                <h3 className="min-w-0 flex-1 text-center text-[22px] font-black tracking-[-0.01em] text-[#0B1F44]">
                  {mobileContactView === 'benefits' ? '5 Benefits for Adding Contacts' : 'Add My Contact'}
                </h3>
                <span className="h-10 w-10 shrink-0" aria-hidden="true" />
              </div>

              {mobileContactView === 'benefits' ? (
                <div className="space-y-5">
                  <div className="space-y-3">
                    {[
                      ['card', 'Save as player card', 'Add someone not on PlayerHoods yet.', 'bg-[#eff6ff] text-[#0d6efd]'],
                      ['invite', 'Invite by link', 'Send a private invite anytime.', 'bg-[#F1ECFF] text-[#6D5DF7]'],
                      ['reply', 'Email or SMS reply', 'They can accept without an account.', 'bg-[#EAFBF0] text-[#07823F]'],
                      ['bell', 'Register notification', 'Get notified when they join PlayerHoods.', 'bg-[#FFF7E6] text-[#C46B00]'],
                      ['shield', 'Private by default', 'Contact details stay hidden.', 'bg-[#EAF7FF] text-[#0877B8]'],
                    ].map(([key, title, body, tone], index) => (
                      <div key={title} className="flex items-start gap-3">
                        <span className={['flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 shadow-sm', tone].join(' ')}>
                          <ContactToolIcon kind={key as 'card' | 'invite' | 'reply' | 'bell' | 'shield'} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-body-main font-black text-[#0B1F44]">{index + 1}. {title}</p>
                          <p className="mt-1 text-body-sub text-[#64748B]">{body}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-[#E2E8F0] pt-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#0d6efd]">
                        <ContactToolIcon kind="spark" />
                      </span>
                      <div>
                        <h4 className="text-body-main font-black text-[#0B1F44]">Smart Import</h4>
                        <p className="mt-1 text-body-sub leading-5 text-[#64748B]">
                          Extract contact details from chat text, email headers, sheets, screenshots, and photos.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        ['Chat Group', 'Paste chat text, e.g. WhatsApp, iMessage'],
                        ['Email Header', 'Paste header From / To / Cc'],
                        ['Sheet / List', 'Paste or upload Excel, CSV, image'],
                      ].map(([title, body]) => (
                        <div key={title} className="rounded-2xl border border-[#D7E2F0] bg-[#F8FBFF] px-2 py-3 text-center">
                          <p className="text-[11px] font-black text-[#0B1F44]">{title}</p>
                          <p className="mt-2 text-[10px] leading-4 text-[#64748B]">{body}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMobileContactView('smart')}
                    className="min-h-11 w-full rounded-2xl border border-[#D7E2F0] bg-white px-5 py-3 text-body-main font-semibold text-[#0B1F44] transition hover:bg-[#F8FBFF]"
                  >
                    Back to Add My Contact
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileContactView('benefits')}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-[#D7E2F0] bg-white px-4 py-3 text-left text-body-main font-semibold text-[#0B1F44] transition hover:bg-[#F8FBFF]"
                  >
                    <span className="inline-flex items-center gap-3">
                      <span className="text-[#0d6efd]"><ContactToolIcon kind="spark" /></span>
                      <span>5 benefits for adding contacts</span>
                    </span>
                    <span className="text-xl leading-none text-[#0B1F44]" aria-hidden="true">{'>'}</span>
                  </button>

                  <div className="grid grid-cols-2 rounded-2xl border border-[#D7E2F0] bg-white p-1 text-body-main font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        clearMessage()
                        setMobileContactView('smart')
                        setError(null)
                      }}
                      className={[
                        'min-h-11 rounded-xl px-3 transition',
                        mobileContactView === 'smart' ? 'border border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]' : 'text-[#0B1F44]',
                      ].join(' ')}
                    >
                      Smart Import
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearMessage()
                        setMobileContactView('manual')
                        setError(null)
                      }}
                      className={[
                        'min-h-11 rounded-xl px-3 transition',
                        mobileContactView === 'manual' ? 'border border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]' : 'text-[#0B1F44]',
                      ].join(' ')}
                    >
                      Enter Manually
                    </button>
                  </div>

                  {mobileContactView === 'smart' ? (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-body-main font-black text-[#0B1F44]">Smart Import</h4>
                        <p className="mt-2 text-body-main leading-6 text-[#334155]">
                          We&apos;ll extract names, phone numbers, and emails from any image or text you paste or upload.
                        </p>
                      </div>
                      {onParseScreenshots && onImportScreenshotContacts ? (
                        <ContactScreenshotImportSection
                          userId={userId}
                          existingContacts={supportData.contacts}
                          onParseScreenshots={onParseScreenshots}
                          onImportScreenshotContacts={onImportScreenshotContacts}
                          onImported={async () => {
                            await handleScreenshotImported()
                            setMobileContactView('smart')
                          }}
                          variant="mobile-main"
                          secondaryActionLabel="Switch to Manual Entry"
                          onSecondaryAction={() => {
                            clearMessage()
                            setMobileContactView('manual')
                            setError(null)
                          }}
                        />
                      ) : (
                        <div className="space-y-3 rounded-2xl border border-[#D7E2F0] bg-[#F8FBFF] p-4">
                          <p className="text-body-main font-semibold text-[#475569]">Smart Import is not available right now.</p>
                          <button
                            type="button"
                            onClick={() => setMobileContactView('manual')}
                            className="min-h-11 w-full rounded-2xl border border-[#D7E2F0] bg-white px-5 py-3 text-body-main font-semibold text-[#0B1F44]"
                          >
                            Switch to Manual Entry
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleCreateContact} className="space-y-4">
                      <label className="text-body-main font-semibold text-[#0B1F44]">
                        <span className="mb-2 block">Full Name</span>
                        <input
                          type="text"
                          value={contactDisplayName}
                          onChange={(event) => setContactDisplayName(event.target.value)}
                          placeholder="Player's full name"
                          className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                        />
                      </label>
                      <label className="text-body-main font-semibold text-[#0B1F44]">
                        <span className="mb-2 block">Email</span>
                        <input
                          type="email"
                          value={contactEmail}
                          onChange={(event) => setContactEmail(event.target.value)}
                          placeholder="email@example.com"
                          className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                        />
                      </label>
                      <label className="text-body-main font-semibold text-[#0B1F44]">
                        <span className="mb-2 block">Phone</span>
                        <input
                          type="tel"
                          value={contactPhone}
                          onChange={(event) => setContactPhone(event.target.value)}
                          placeholder="+1 234 567 890"
                          className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                        />
                      </label>
                      <label className="text-body-main font-semibold text-[#0B1F44]">
                        <span className="mb-2 block">Notes</span>
                        <textarea
                          value={contactNotes}
                          onChange={(event) => setContactNotes(event.target.value)}
                          placeholder="Add any notes about this contact..."
                          rows={4}
                          className="text-body-main w-full resize-none rounded-2xl border border-[#A8B7CC] bg-white px-4 py-3 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                        />
                      </label>
                      {error ? (
                        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-body-main text-rose-700">
                          {error}
                        </p>
                      ) : null}
                      <div className="sticky bottom-0 z-10 space-y-3 border-t border-[#E2E8F0] bg-white/95 py-4 backdrop-blur">
                        <button
                          type="submit"
                          disabled={creatingContact}
                          className="min-h-12 w-full rounded-2xl bg-[#0d6efd] px-5 py-3 text-body-main font-bold text-white shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition hover:bg-[#0b5ed7] disabled:cursor-wait disabled:bg-[#94A3B8]"
                        >
                          {creatingContact ? 'Saving...' : 'Save Contact'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearMessage()
                            setMobileContactView('smart')
                            setError(null)
                          }}
                          className="min-h-11 w-full rounded-2xl border border-[#D7E2F0] bg-white px-5 py-3 text-body-main font-semibold text-[#0B1F44] transition hover:bg-[#F8FBFF]"
                        >
                          Back to Smart Import
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-[28px] font-black tracking-[-0.02em] text-[#0B1F44]">Add My Contact</h3>
                <button
                  type="button"
                  onClick={() => {
                    clearMessage()
                    setContactToolsOpen(false)
                    setContactComposerMode(null)
                    setError(null)
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0B1F44]"
                  aria-label="Close add contact panel"
                >
                  <ContactToolIcon kind="close" />
                </button>
              </div>

              <div className="mt-8 grid gap-5 border-b border-[#E2E8F0] pb-9 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    key: 'card' as const,
                    title: 'Save as player card',
                    body: 'Add someone not on PlayerHoods yet.',
                    tone: 'bg-[#eff6ff] text-[#0d6efd]',
                  },
                  {
                    key: 'invite' as const,
                    title: 'Invite by link',
                    body: 'Send a private invite link anytime.',
                    tone: 'bg-[#F1ECFF] text-[#6D5DF7]',
                  },
                  {
                    key: 'reply' as const,
                    title: 'Email or SMS reply',
                    body: 'They can accept without an account.',
                    tone: 'bg-[#EAFBF0] text-[#07823F]',
                  },
                  {
                    key: 'bell' as const,
                    title: 'Register notification',
                    body: 'Get notified when they join PlayerHoods.',
                    tone: 'bg-[#FFF7E6] text-[#C46B00]',
                  },
                  {
                    key: 'shield' as const,
                    title: 'Private by default',
                    body: 'Contact details stay hidden.',
                    tone: 'bg-[#EAF7FF] text-[#0877B8]',
                  },
                ].map((item, index) => (
                  <div
                    key={item.title}
                    className={[
                      'flex items-start gap-3 lg:flex-col lg:items-center lg:justify-start lg:text-center',
                      index > 0 ? 'lg:border-l-2 lg:border-[#CBD5E1]' : '',
                    ].join(' ')}
                  >
                    <span className={['flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 shadow-sm', item.tone].join(' ')}>
                      <ContactToolIcon kind={item.key} />
                    </span>
                    <span className="grid gap-1">
                      <span className="text-[11px] font-black leading-tight text-[#0B1F44]">{item.title}</span>
                      <span className="text-[10px] leading-tight text-[#94A3B8]">{item.body}</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)] lg:gap-14">
                <form onSubmit={handleCreateContact} className="grid gap-5 lg:border-r-2 lg:border-[#CBD5E1] lg:pr-10">
                  <label className="text-label text-[#536179]">
                    <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Name</span>
                    <input
                      type="text"
                      value={contactDisplayName}
                      onChange={(event) => setContactDisplayName(event.target.value)}
                      placeholder="Player's full name"
                      className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-label text-[#536179]">
                      <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Email</span>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(event) => setContactEmail(event.target.value)}
                        placeholder="email@example.com"
                        className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                      />
                    </label>
                    <label className="text-label text-[#536179]">
                      <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Phone</span>
                      <input
                        type="tel"
                        value={contactPhone}
                        onChange={(event) => setContactPhone(event.target.value)}
                        placeholder="+1 234 567 890"
                        className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                      />
                    </label>
                  </div>

                  <label className="text-label text-[#536179]">
                    <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Notes</span>
                    <textarea
                      value={contactNotes}
                      onChange={(event) => setContactNotes(event.target.value)}
                      placeholder="Add details like skill level or preferred times..."
                      rows={3}
                      className="text-body-main w-full resize-none rounded-2xl border border-[#A8B7CC] bg-white px-4 py-3 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={creatingContact}
                      className="text-body-main inline-flex min-w-[190px] items-center justify-center gap-2 rounded-2xl bg-[#0d6efd] px-5 py-4 font-bold text-white shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition hover:bg-[#0b5ed7] disabled:cursor-wait disabled:bg-[#94A3B8]"
                    >
                      <span className="text-lg leading-none">+</span>
                      {creatingContact ? 'Saving...' : 'Save Contact'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearMessage()
                        setContactToolsOpen(false)
                        setContactComposerMode(null)
                        setError(null)
                      }}
                      className="text-body-main rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 font-medium text-[#475569] transition hover:bg-[#F8FBFF]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>

                <div className="flex flex-col items-center justify-center gap-5 px-2 py-6 text-center lg:pl-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearMessage()
                      if (!onParseScreenshots || !onImportScreenshotContacts) {
                        setError('Smart Import is not available right now. Please refresh and try again.')
                        return
                      }
                      setContactComposerMode('screenshot')
                      setError(null)
                    }}
                    className="text-body-main inline-flex items-center gap-2 rounded-2xl bg-[#0d6efd] px-10 py-4 font-bold text-white shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition hover:bg-[#0b5ed7]"
                  >
                    <ContactToolIcon kind="spark" />
                    Smart Import
                  </button>
                  <p className="text-body-main max-w-sm text-[#94A3B8]">
                    Upload or paste a screenshot from email, chat, or a contact list.
                  </p>
                  <div className="grid w-full max-w-md grid-cols-3 gap-4 pt-4">
                    {[
                      ['Chat group', 'Tennis Group', 'Roger Federer'],
                      ['Email header', 'From', 'email@example.com'],
                      ['Sheet/list', 'Name', 'Sara Novak'],
                    ].map(([label, heading, body]) => (
                      <div key={label} className="flex aspect-[3/4] flex-col rounded-2xl border border-[#D7E2F0] bg-[#F8FBFF] p-3 opacity-70 shadow-sm">
                        <div className="h-2 w-10 rounded-full bg-[#DCE8F8]" />
                        <div className="mt-3 rounded-lg bg-[#F1F5F9] px-2 py-1 text-[10px] font-semibold text-[#64748B]">
                          {heading}
                        </div>
                        <div className="mt-2 truncate rounded-md bg-[#eff6ff] px-2 py-1 text-[10px] font-semibold text-[#0d6efd]">
                          {body}
                        </div>
                        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#64748B]">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {contactComposerMode === 'screenshot' && onParseScreenshots && onImportScreenshotContacts && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close screenshot import"
            className="absolute inset-0 bg-[#0B1F44]/40 backdrop-blur-sm"
            onClick={() => setContactComposerMode(null)}
          />
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white p-4 shadow-[0_32px_80px_-32px_rgba(11,31,68,0.5)] sm:max-h-[88vh] sm:rounded-[32px]">
            <div className="mb-4 flex items-start justify-between gap-4 px-1 pt-1 sm:px-2 sm:pt-2">
              <div>
                <h3 className="text-xl font-black text-[#1E293B] sm:text-h2">Smart Import</h3>
                <p className="text-body-sub mt-1 max-w-xl text-[#64748B]">
                  Upload or paste a screenshot from a chat group, email header, or contact list. We&apos;ll extract possible names, emails, and phone numbers for you to review before saving them as Contact Players.
                </p>
                <p className="text-body-sub mt-2 max-w-xl font-semibold text-[#475569]">
                  Nothing is sent or invited automatically. You choose which contacts to save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContactComposerMode(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0B1F44]"
                aria-label="Close import modal"
              >
                <ContactToolIcon kind="close" />
              </button>
            </div>
            <ContactScreenshotImportSection
              userId={userId}
              existingContacts={supportData.contacts}
              onParseScreenshots={onParseScreenshots}
              onImportScreenshotContacts={onImportScreenshotContacts}
              onImported={async () => {
                await handleScreenshotImported()
                setContactComposerMode(null)
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-body-main rounded-[28px] border border-slate-200 bg-white p-6 text-slate-500">
          Loading hood...
        </div>
      ) : showSearchPeoplePanel && searchDiscoverLoading ? (
        <div className="text-body-main rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          Looking for a matching registered player…
        </div>
      ) : showSearchPeoplePanel && !hasSubmittedSearchPeople ? (
        <div className="text-body-main rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          Search by exact email or phone, or an exact display name for someone who shares a club with you.
        </div>
      ) : showSearchPeoplePanel && hasSubmittedSearchPeople && activePeople.length === 0 ? (
        <div className="text-body-main rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          <p>No discoverable player found.</p>
          <p className="mt-2 text-body-sub text-slate-400">
            Check the email or phone number, or search the exact display name of someone who shares a club with you.
          </p>
        </div>
      ) : section === 'hood' && hoodFilter === 'saved' ? (
        savedPrimaryPeople.length === 0 && savedContactPeople.length === 0 ? (
          <div className="text-body-main rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
            {getPeopleEmptyState(section, hoodFilter, discoverSource, selectedSport.display_name)}
          </div>
        ) : (
          <div className="space-y-6">
            {savedPrimaryPeople.length > 0 ? (
              <HoodCardGrid
                people={savedPrimaryPeople}
                myClubNames={myClubNames}
                openMatchCount={openMatchCount}
                activeInviteKey={activeInviteKey}
                activeMenuKey={activeMenuKey}
                openMatchTargetsByPerson={openMatchTargetsByPerson}
                loadingInviteKey={loadingInviteKey}
                pendingInviteMatchId={pendingInviteMatchId}
                onOpenDrawer={(nextPerson) => setActiveDrawerKey(nextPerson.key)}
                onOpenMenuAddToGroup={(nextPerson) => {
                  setGroupDialogPerson(nextPerson)
                  setActiveMenuKey(null)
                }}
                onSaveToggle={handleSaveToggle}
                onToggleInvite={handleToggleInvite}
                onToggleMenu={(nextPerson) => {
                  setActiveInviteKey(null)
                  setActiveMenuKey((current) => (current === nextPerson.key ? null : nextPerson.key))
                }}
                onInviteExisting={handleInviteExisting}
                onInviteNew={navigateToNewMatch}
                compact
              />
            ) : null}
            {savedContactPeople.length > 0 ? (
              <section className="space-y-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#94A3B8]">
                  Player Card (Not on PlayerHoods yet)
                </h3>
                <HoodCardGrid
                  people={savedContactPeople}
                  myClubNames={myClubNames}
                  openMatchCount={openMatchCount}
                  activeInviteKey={activeInviteKey}
                  activeMenuKey={activeMenuKey}
                  openMatchTargetsByPerson={openMatchTargetsByPerson}
                  loadingInviteKey={loadingInviteKey}
                  pendingInviteMatchId={pendingInviteMatchId}
                  onOpenDrawer={(nextPerson) => setActiveDrawerKey(nextPerson.key)}
                  onOpenMenuAddToGroup={(nextPerson) => {
                    setGroupDialogPerson(nextPerson)
                    setActiveMenuKey(null)
                  }}
                  onSaveToggle={handleSaveToggle}
                  onToggleInvite={handleToggleInvite}
                  onToggleMenu={(nextPerson) => {
                    setActiveInviteKey(null)
                    setActiveMenuKey((current) => (current === nextPerson.key ? null : nextPerson.key))
                  }}
                  onInviteExisting={handleInviteExisting}
                  onInviteNew={navigateToNewMatch}
                  compact
                />
              </section>
            ) : null}
          </div>
        )
      ) : activePeople.length === 0 ? (
        section === 'hood' && contactToolsOpen ? null : (
          <div className="text-body-main rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
            {getPeopleEmptyState(section, hoodFilter, discoverSource, selectedSport.display_name)}
          </div>
        )
      ) : (
        <div className="space-y-5">
          {activePeople.length > 0 ? (
            <HoodCardGrid
              people={activePeople}
              myClubNames={myClubNames}
              openMatchCount={openMatchCount}
              activeInviteKey={activeInviteKey}
              activeMenuKey={activeMenuKey}
              openMatchTargetsByPerson={openMatchTargetsByPerson}
              loadingInviteKey={loadingInviteKey}
              pendingInviteMatchId={pendingInviteMatchId}
              onOpenDrawer={(nextPerson) => setActiveDrawerKey(nextPerson.key)}
              onOpenMenuAddToGroup={(nextPerson) => {
                setGroupDialogPerson(nextPerson)
                setActiveMenuKey(null)
              }}
              onSaveToggle={handleSaveToggle}
              onToggleInvite={handleToggleInvite}
              onToggleMenu={(nextPerson) => {
                setActiveInviteKey(null)
                setActiveMenuKey((current) => (current === nextPerson.key ? null : nextPerson.key))
              }}
              onInviteExisting={handleInviteExisting}
              onInviteNew={navigateToNewMatch}
            />
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

