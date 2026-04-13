'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  type ContactPlayerResolved,
} from '@/lib/api/roster'
import { Avatar } from '@/app/components/Avatar'
import { ContactScreenshotImportSection } from '@/app/dashboard/ContactScreenshotImportSection'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatTimeWindow } from '@/lib/format-time'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import { setGuestSports } from '@/lib/api/sports'
import type {
  Sport,
  Venue,
  VenueIdentity,
} from '@/lib/types/database'

type SupportedSportCode = 'tennis' | 'pickleball' | 'badminton'
type HoodSection = 'hood' | 'discover'
type HoodFilter = 'all' | 'contacts' | 'saved' | 'group'
type DiscoverSource = 'club_members' | 'played_with'
type IdentityType = 'platform' | 'contact' | 'linked'
type SourceBadge =
  | 'My Contact'
  | 'Saved'
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
  level: string | null
  playType: string | null
  availability: string | null
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
  level: string | null
  playType: string | null
  availability: string | null
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

type SupportData = {
  contacts: ContactPlayerResolved[]
  contactsByGuestId: Map<string, ContactPlayerResolved>
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
  onParseScreenshots: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
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

function formatAvailability(profile: PublicPlayerProfile | null | undefined): string | null {
  if (!profile?.preferred_play_times?.length) return null
  return profile.preferred_play_times.map((entry) => entry.replace(/_/g, ' ')).join(', ')
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
    if (seed.level && !existing.level) existing.level = seed.level
    if (seed.playType && !existing.playType) existing.playType = seed.playType
    if (seed.availability && !existing.availability) existing.availability = seed.availability
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
    level: seed.level ?? null,
    playType: seed.playType ?? null,
    availability: seed.availability ?? null,
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
    case 'contacts':
      return person.isMyContact
    case 'saved':
      return person.isSaved
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
  if (left.isSaved !== right.isSaved) return left.isSaved ? -1 : 1
  if (left.isFromGroup !== right.isFromGroup) return left.isFromGroup ? -1 : 1
  return left.displayName.localeCompare(right.displayName)
}

function sortDiscoverPeople(left: HoodPerson, right: HoodPerson): number {
  if (left.sharedMatchCount !== right.sharedMatchCount) return right.sharedMatchCount - left.sharedMatchCount
  if (left.clubNames.length !== right.clubNames.length) return right.clubNames.length - left.clubNames.length
  return left.displayName.localeCompare(right.displayName)
}

function sourceBadgeClass(badge: SourceBadge) {
  switch (badge) {
    case 'Saved':
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
    case 'contacts':
      return `No contact people are in your ${sportName.toLowerCase()} hood yet.`
    case 'saved':
      return `No saved people are in your ${sportName.toLowerCase()} hood yet.`
    case 'group':
      return `No people from groups are in your ${sportName.toLowerCase()} hood yet.`
    case 'all':
    default:
      return `Your ${sportName} Hood is empty. Add contacts, save players, or bring people in through groups.`
  }
}

function ProxyManagementPanel({
  rows,
  loading,
  error,
  actingBindingId,
  onApprove,
  onDecline,
  onRevoke,
}: {
  rows: MatchProxyDashboardRow[]
  loading: boolean
  error: string | null
  actingBindingId: string | null
  onApprove: (bindingId: string) => Promise<void>
  onDecline: (bindingId: string) => Promise<void>
  onRevoke: (bindingId: string) => Promise<void>
}) {
  const pendingRows = rows.filter((row) => row.status === 'pending')
  const forMeRows = rows.filter((row) => row.relationship_role === 'for_me' && row.status === 'active')
  const iActForRows = rows.filter((row) => row.relationship_role === 'i_act_for' && row.status === 'active')
  const historyRows = rows.filter((row) => row.status === 'revoked' || row.status === 'rejected' || row.status === 'expired')

  const renderRow = (row: MatchProxyDashboardRow) => {
    const isActing = actingBindingId === row.binding_id
    const statusTone =
      row.status === 'active'
        ? 'bg-emerald-50 text-emerald-700'
        : row.status === 'pending'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-600'
    const relationshipCopy =
      row.relationship_role === 'for_me'
        ? `${row.proxy_name} can act for you`
        : `You can act for ${row.principal_name}`

    return (
      <div key={row.binding_id} className="rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-900">{relationshipCopy}</h4>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone}`}>
                {row.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {row.relationship_role === 'for_me'
                ? 'Your self-service controls stay active. A proxy can only handle participant-side match actions.'
                : 'You can only handle participant-side match actions for this person. Organizer controls do not transfer.'}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Updated {formatRecentDate(row.updated_at) ?? 'recently'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {row.can_approve && (
              <button
                type="button"
                onClick={() => void onApprove(row.binding_id)}
                disabled={isActing}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {isActing ? 'Working…' : 'Approve'}
              </button>
            )}
            {row.can_decline && (
              <button
                type="button"
                onClick={() => void onDecline(row.binding_id)}
                disabled={isActing}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              >
                {isActing ? 'Working…' : 'Decline'}
              </button>
            )}
            {row.can_revoke && (
              <button
                type="button"
                onClick={() => void onRevoke(row.binding_id)}
                disabled={isActing}
                className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
              >
                {isActing ? 'Working…' : 'Revoke'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const sections: Array<{ title: string; rows: MatchProxyDashboardRow[]; empty: string }> = [
    {
      title: 'Pending',
      rows: pendingRows,
      empty: 'No pending proxy requests need attention right now.',
    },
    {
      title: 'Who Can Act for Me',
      rows: forMeRows,
      empty: 'No active proxies can act for you yet.',
    },
    {
      title: 'I Can Act For',
      rows: iActForRows,
      empty: 'You are not currently acting for anyone else.',
    },
    {
      title: 'History',
      rows: historyRows,
      empty: 'No historical proxy changes yet.',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Pending Requests', pendingRows.length],
          ['Active Proxies for Me', forMeRows.length],
          ['People I Act For', iActForRows.length],
        ].map(([label, count]) => (
          <div key={label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.34)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{count}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading proxy relationships…
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.title} className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.34)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">{section.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {section.title === 'Pending'
                    ? 'Only direct proxy changes that need your attention show up here.'
                    : section.title === 'Who Can Act for Me'
                      ? 'These people may handle your participant-side match actions, while you still keep full self-service control.'
                      : section.title === 'I Can Act For'
                        ? 'These are the people whose participant-side match actions you can currently manage.'
                        : 'Past decisions stay visible here without creating inbox-style noise.'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {section.rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  {section.empty}
                </div>
              ) : (
                section.rows.map(renderRow)
              )}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function AddToGroupDialog({
  groups,
  person,
  onClose,
  onConfirm,
  pending,
}: {
  groups: GroupWithMembers[]
  person: HoodPerson
  onClose: () => void
  onConfirm: (groupId: string) => Promise<void>
  pending: boolean
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Add to Group</h3>
            <p className="mt-1 text-sm text-slate-500">
              Choose where to add {person.displayName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 transition hover:text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {groups.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No groups available yet.
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
                <span className="block text-sm font-medium text-slate-900">{groupRow.group.name}</span>
                <span className="block text-xs text-slate-500">
                  {groupRow.members.length} member{groupRow.members.length === 1 ? '' : 's'}
                </span>
              </span>
              {groupRow.group.primary_sport_id ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  Sport group
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
  items,
  onClose,
  onSaveToggle,
  onOpenAddToGroup,
  onOpenInvite,
  onOpenProxyManager,
}: {
  open: boolean
  person: HoodPerson | null
  sport: HoodSport
  items: MatchListItem[]
  onClose: () => void
  onSaveToggle: (person: HoodPerson) => Promise<void>
  onOpenAddToGroup: (person: HoodPerson) => void
  onOpenInvite: (person: HoodPerson) => void
  onOpenProxyManager: () => void
}) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [proxyPending, setProxyPending] = useState(false)
  const [proxyRequestState, setProxyRequestState] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  useEffect(() => {
    if (!open || !person?.userId) return
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
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [onClose, open])

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

  if (!open || !person) return null

  const visibleSourceBadges = getVisibleSourceBadges(person)

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
              className="h-12 w-12 text-base"
            />
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                {person.displayName}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {shouldShowIdentityBadge(person) && (
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                    {getIdentityLabel(person.identityType)}
                  </span>
                )}
                {visibleSourceBadges.map((badge) => (
                  <span
                    key={badge}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${sourceBadgeClass(badge)}`}
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
            className="text-sm text-slate-400 transition hover:text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Overview</h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Sport</dt>
                <dd className="mt-1 text-sm text-slate-700">{person.sportLabel}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Level</dt>
                <dd className="mt-1 text-sm text-slate-700">{selectedSportProfile?.level ?? person.level ?? 'Not shared yet'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Club</dt>
                <dd className="mt-1 text-sm text-slate-700">{person.clubNames.join(', ') || 'Not shared yet'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Preferred play type</dt>
                <dd className="mt-1 text-sm text-slate-700">{selectedSportProfile?.play_style ?? person.playType ?? 'Not shared yet'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Relationship</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {visibleSourceBadges.map((badge) => (
                <span
                  key={badge}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${sourceBadgeClass(badge)}`}
                >
                  {badge}
                </span>
              ))}
            </div>
            {person.groupNames.length > 0 && (
              <p className="mt-4 text-sm text-slate-600">
                From groups: {person.groupNames.join(', ')}
              </p>
            )}
            {person.sharedMatchCount > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                Shared matches: {person.sharedMatchCount}
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Actions</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenInvite(person)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Invite to Match
              </button>
              {(person.userId || person.guestId) && (
                <button
                  type="button"
                  onClick={() => void onSaveToggle(person)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {person.isSaved && person.userId ? 'Unsave' : person.isSaved ? 'Saved' : 'Save'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenAddToGroup(person)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Add to Group
              </button>
              {person.canEditContact && (
                <p className="w-full text-xs text-slate-500">
                  Edit Contact is routed through the Contacts tab in this version.
                </p>
              )}
            </div>
            {sharedMatches.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-900">Match History</h4>
                <div className="mt-3 space-y-2">
                  {sharedMatches.map((item) => (
                    <div key={item.match.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm font-medium text-slate-800">{item.sportName ?? person.sportLabel}</div>
                      <div className="mt-1 text-xs text-slate-500">
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

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Proxy</h3>
            <p className="mt-3 text-sm text-slate-600">
              Principal keeps full self-service control. Proxy only covers participant-side match actions.
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Use the Proxy tab for the full management view, including pending, active, and revoked relationships.
            </p>
            {proxyRequestState && (
              <p
                className={`mt-3 text-sm ${
                  proxyRequestState.tone === 'success' ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {proxyRequestState.message}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenProxyManager}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Open Proxy Tab
              </button>
            </div>
            {person.guestId && (
              <button
                type="button"
                disabled={proxyPending}
                onClick={async () => {
                  const supabase = createSupabaseBrowserClient()
                  setProxyPending(true)
                  setProxyRequestState(null)
                  try {
                    await requestMatchProxyBindingForContactPlayer(supabase, person.guestId!)
                    setProxyRequestState({
                      tone: 'success',
                      message: `Proxy request sent for ${person.displayName}.`,
                    })
                  } catch (error) {
                    setProxyRequestState({
                      tone: 'error',
                      message: (error as Error).message,
                    })
                  } finally {
                    setProxyPending(false)
                  }
                }}
                className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              >
                {proxyPending ? 'Requesting...' : 'Request Match Proxy'}
              </button>
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
      <h4 className="text-sm font-semibold text-slate-900">Open Matches</h4>
      <div className="mt-3 space-y-2">
        {matches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
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
              <span className="block text-sm font-medium text-slate-900">
                {item.venueName ?? item.sportName ?? 'Open match'}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {formatTimeWindow(
                  item.match.start_at_utc,
                  item.match.match_date,
                  item.match.start_time,
                  item.match.duration_minutes,
                  item.venueTimezone ?? 'UTC',
                )}
              </span>
              <span className="mt-1 block text-xs text-slate-400">
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
        className="mt-3 w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Invite to New Match
      </button>
    </div>
  )
}

function HoodCard({
  person,
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
  const visibleSourceBadges = getVisibleSourceBadges(person)

  return (
    <article className="relative rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.3)] transition hover:border-slate-300">
      <button
        type="button"
        onClick={() => onOpenDrawer(person)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-3">
          <Avatar
            src={person.avatarUrl}
            displayName={person.displayName}
            size="md"
            className="h-11 w-11 text-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-900">{person.displayName}</h3>
              {shouldShowIdentityBadge(person) && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {getIdentityLabel(person.identityType)}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleSourceBadges.map((badge) => (
                <span
                  key={badge}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${sourceBadgeClass(badge)}`}
                >
                  {badge}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{cardMetaLine(person)}</p>
          </div>
        </div>
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleInvite(person)}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Invite to Match{openMatchCount > 0 ? ` (${openMatchCount})` : ''}
        </button>
        {!person.isSaved && (person.userId || person.guestId) && (
          <button
            type="button"
            onClick={() => void onSaveToggle(person)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Save
          </button>
        )}
        {person.isSaved && person.userId && (
          <button
            type="button"
            onClick={() => void onSaveToggle(person)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Unsave
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggleMenu(person)}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          More
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
          {!person.isSaved && (person.userId || person.guestId) && (
            <button
              type="button"
              onClick={() => void onSaveToggle(person)}
              className="w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              Save
            </button>
          )}
          {person.isSaved && person.userId && (
            <button
              type="button"
              onClick={() => void onSaveToggle(person)}
              className="w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              Unsave
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenMenuAddToGroup(person)}
            className="w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Add to Group
          </button>
          <button
            type="button"
            onClick={() => onOpenDrawer(person)}
            className="w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            View
          </button>
          {person.canEditContact && (
            <button
              type="button"
              onClick={() => onOpenDrawer(person)}
              className="w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
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
  onParseScreenshots,
  onImportScreenshotContacts,
}: Props) {
  const router = useRouter()
  const sportOptions = useMemo(
    () =>
      sports
        .filter((sport): sport is HoodSport => isSupportedSportCode(sport.code))
        .sort(
          (left, right) =>
            SUPPORTED_SPORTS.indexOf(left.code) - SUPPORTED_SPORTS.indexOf(right.code),
        ),
    [sports],
  )

  const [section, setSection] = useState<HoodSection>('hood')
  const [selectedSportCode, setSelectedSportCode] = useState<SupportedSportCode>('tennis')
  const [hoodFilter, setHoodFilter] = useState<HoodFilter>('all')
  const [discoverSource, setDiscoverSource] = useState<DiscoverSource>('club_members')
  const [search, setSearch] = useState('')
  const [supportData, setSupportData] = useState<SupportData>({
    contacts: [],
    contactsByGuestId: new Map(),
    profilesByUserId: new Map(),
    groupContactsByGroupId: new Map(),
    guestLookupByGuestId: new Map(),
    guestSportsByGuestId: new Map(),
  })
  const [clubDiscover, setClubDiscover] = useState<ClubDiscoverPerson[]>([])
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
  const [contactNotes, setContactNotes] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)
  const [proxyRows, setProxyRows] = useState<MatchProxyDashboardRow[]>([])
  const [proxyLoading, setProxyLoading] = useState(false)
  const [proxyError, setProxyError] = useState<string | null>(null)
  const [proxyActionBindingId, setProxyActionBindingId] = useState<string | null>(null)

  useEffect(() => {
    if (sportOptions.some((sport) => sport.code === selectedSportCode)) return
    if (sportOptions[0]) setSelectedSportCode(sportOptions[0].code)
  }, [selectedSportCode, sportOptions])

  const selectedSport = useMemo(
    () => sportOptions.find((sport) => sport.code === selectedSportCode) ?? sportOptions[0] ?? null,
    [selectedSportCode, sportOptions],
  )

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

      const profilesByUserId = await fetchPublicPlayerProfiles(supabase, userIds)

      setSupportData({
        contacts,
        contactsByGuestId,
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

  const loadProxyRows = useCallback(async () => {
    setProxyLoading(true)
    setProxyError(null)
    const supabase = createSupabaseBrowserClient()
    try {
      const rows = await getMatchProxyDashboard(supabase)
      setProxyRows(rows)
    } catch (loadError) {
      setProxyRows([])
      setProxyError((loadError as Error).message)
    } finally {
      setProxyLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section !== 'proxy') return
    void loadProxyRows()
  }, [loadProxyRows, section])

  useEffect(() => {
    if (!selectedSport) return
    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    const loadClubDiscover = async () => {
      try {
        setClubDiscoverError(null)
        const entries = await Promise.all(
          Array.from(new Set(myIdentities.map((identity) => identity.venue_id))).map(async (venueId) => {
            const identity = myIdentities.find((item) => item.venue_id === venueId)
            const invitableRows = await getVenueInvitableMembers(supabase, venueId, userId)
            return {
              people: invitableRows.map((row) => ({
                userId: row.user_id,
                displayName: normalizeDisplayName(row.display_name),
                clubName: identity?.venue.name ?? 'Club',
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
        if (cancelled) return

        setClubProfiles(profiles)
        setDirectInviteClubMemberIds(new Set(deduped.keys()))
        setClubDiscover(
          Array.from(deduped.values()).filter((person) =>
            profileMatchesSport(profiles.get(person.userId), selectedSport.id),
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
  }, [myIdentities, selectedSport, userId])

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
        avatarUrl: linkedProfile?.avatar_url ?? lookup?.avatar_url ?? null,
        identityType: linkedUserId ? 'linked' : 'contact',
        isMyContact: true,
        isLinked: Boolean(linkedUserId),
        canEditContact: true,
        level: selectedSportProfile?.level ?? null,
        playType: selectedSportProfile?.play_style ?? null,
        availability: formatAvailability(linkedProfile),
        sportLabel: selectedSport.display_name,
      })
      person.sourceBadges.add('My Contact')
      if (linkedUserId) person.sourceBadges.add('Linked')
      if (savedUserIds.has(linkedUserId ?? '')) {
        person.isSaved = true
        person.sourceBadges.add('Saved')
      }
      const sharedVenueNames = linkedProfile?.shared_venue_names ?? []
      if (linkedUserId && directInviteClubMemberIds.has(linkedUserId)) {
        person.isClubMember = true
      }
      for (const venueName of sharedVenueNames) {
        person.clubNames.add(venueName)
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
        level: selectedSportProfile?.level ?? null,
        playType: selectedSportProfile?.play_style ?? null,
        availability: formatAvailability(profile),
        sportLabel: selectedSport.display_name,
      })
      person.isSaved = true
      person.sourceBadges.add('Saved')
      const sharedVenueNames = profile?.shared_venue_names ?? []
      if (directInviteClubMemberIds.has(row.target_user_id)) {
        person.isClubMember = true
      }
      for (const venueName of sharedVenueNames) {
        person.clubNames.add(venueName)
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
          level: selectedSportProfile?.level ?? null,
          playType: selectedSportProfile?.play_style ?? null,
          availability: formatAvailability(profile),
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
          person.clubNames.add(venueName)
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
          avatarUrl: linkedProfile?.avatar_url ?? contact.avatar_url,
          identityType: linkedUserId ? 'linked' : 'contact',
          isFromGroup: true,
          isLinked: Boolean(linkedUserId),
          isMyContact: Boolean(ownedContact),
          canEditContact: Boolean(ownedContact),
          level: selectedSportProfile?.level ?? null,
          playType: selectedSportProfile?.play_style ?? null,
          availability: formatAvailability(linkedProfile),
          sportLabel: selectedSport.display_name,
        })
        person.isFromGroup = true
        person.sourceBadges.add('From Group')
        person.groupNames.add(group.group.name)
        if (linkedUserId) person.sourceBadges.add('Linked')
        if (ownedContact) person.sourceBadges.add('My Contact')
        const sharedVenueNames = linkedProfile?.shared_venue_names ?? []
        if (linkedUserId && directInviteClubMemberIds.has(linkedUserId)) {
          person.isClubMember = true
        }
        for (const venueName of sharedVenueNames) {
          person.clubNames.add(venueName)
        }
      }
    }

    return finalizePeople(map)
  }, [combinedProfiles, directInviteClubMemberIds, groups, inviteCircle, selectedSport, supportData, userId])

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
            level: sportProfile?.level ?? null,
            playType: sportProfile?.play_style ?? null,
            availability: formatAvailability(profile),
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
            person.clubNames.add(venueName)
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
          avatarUrl: linkedProfile?.avatar_url ?? lookup?.avatar_url ?? participant.avatar_url ?? null,
          identityType: linkedUserId ? 'linked' : 'contact',
          isPlayedWith: true,
          isLinked: Boolean(linkedUserId),
          level: sportProfile?.level ?? null,
          playType: sportProfile?.play_style ?? null,
          availability: formatAvailability(linkedProfile),
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
        const sharedVenueNames = linkedProfile?.shared_venue_names ?? []
        if (linkedUserId && directInviteClubMemberIds.has(linkedUserId)) {
          person.isClubMember = true
        }
        for (const venueName of sharedVenueNames) {
          person.clubNames.add(venueName)
        }
      }
    }

    return finalizePeople(map).filter((person) => !hoodKeySet.has(toPersonMatchKey(person)))
  }, [combinedProfiles, directInviteClubMemberIds, hoodKeySet, items, selectedSport, supportData, userId])

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
          level: sportProfile?.level ?? null,
          playType: sportProfile?.play_style ?? null,
          availability: formatAvailability(profile),
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
      if (person.isSaved && person.userId) {
        await removeFromInviteCircle(supabase, person.userId)
        setMessage(`${person.displayName} was removed from Saved.`)
      } else if (person.userId) {
        await saveToInviteCircle(supabase, person.userId, person.isPlayedWith ? 'played_with_auto' : 'manual')
        setMessage(`${person.displayName} is now in this hood.`)
      } else if (person.guestId) {
        await saveContactPlayer(supabase, person.guestId, {
          source: person.saveSourceGroupId ? 'group_contact' : person.saveSourceMatchId ? 'shared_match' : 'manual',
          groupId: person.saveSourceGroupId,
          matchId: person.saveSourceMatchId,
        })
        setMessage(`${person.displayName} is now in this hood.`)
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
    setGroupPending(true)
    setError(null)
    setMessage(null)
    try {
      if (groupDialogPerson.userId) {
        await inviteUserToGroup(supabase, groupId, groupDialogPerson.userId)
      } else if (groupDialogPerson.guestId) {
        await addContactPlayerToGroup(supabase, groupId, groupDialogPerson.guestId)
      }
      setMessage(`${groupDialogPerson.displayName} was added to the group flow.`)
      setGroupDialogPerson(null)
      await loadSupportData()
      router.refresh()
    } catch (groupError) {
      setError((groupError as Error).message)
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
    const notes = contactNotes.trim() || null

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
        email,
        phone,
        notes,
      })
      await setGuestSports(supabase, newGuest.id, [selectedSport.code])
      setMessage(`${displayName} was added to your ${selectedSport.display_name} contacts.`)
      setContactDisplayName('')
      setContactEmail('')
      setContactPhone('')
      setContactNotes('')
      setContactComposerMode(null)
      await loadSupportData()
      router.refresh()
    } catch (createError) {
      setError((createError as Error).message)
    } finally {
      setCreatingContact(false)
    }
  }, [contactDisplayName, contactEmail, contactNotes, contactPhone, loadSupportData, router, selectedSport])

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

  if (!selectedSport) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No supported sports are configured yet.
      </div>
    )
  }

  const activePeople = section === 'discover' ? filteredDiscoverPeople : filteredHoodPeople
  const showContactTools = section === 'hood' && hoodFilter === 'contacts'
  const proxyPendingCount = proxyRows.filter((row) => row.status === 'pending').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {sportOptions.map((sport) => (
          <button
            key={sport.id}
            type="button"
            onClick={() => {
              setSection('hood')
              setSelectedSportCode(sport.code)
              setHoodFilter('all')
            }}
            className={[
              'rounded-full px-4 py-2 text-sm font-medium transition',
              section === 'hood' && selectedSport.code === sport.code
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
            ].join(' ')}
          >
            My {sport.display_name} Hood
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSection('discover')}
          className={[
            'rounded-full px-4 py-2 text-sm font-medium transition',
            section === 'discover'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
          ].join(' ')}
        >
          Discover
        </button>
        <button
          type="button"
          onClick={() => setSection('proxy')}
          className={[
            'rounded-full px-4 py-2 text-sm font-medium transition',
            section === 'proxy'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
          ].join(' ')}
        >
          <span className="inline-flex items-center gap-2">
            <span>Proxy</span>
            {proxyPendingCount > 0 && (
              <span
                className={[
                  'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none',
                  section === 'proxy'
                    ? 'bg-white/20 text-white ring-1 ring-white/20'
                    : 'bg-blue-500 text-white',
                ].join(' ')}
              >
                {proxyPendingCount > 99 ? '99+' : proxyPendingCount}
              </span>
            )}
          </span>
        </button>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.34)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {section === 'discover'
                ? 'Discover'
                : section === 'proxy'
                  ? 'Proxy'
                  : `My ${selectedSport.display_name} Hood`}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {section === 'discover'
                ? `Browse ${selectedSport.display_name.toLowerCase()} people who are not yet in this hood.`
                : section === 'proxy'
                  ? 'Manage explicit Match Proxy relationships without treating Hoods like a notification center.'
                  : `People in your ${selectedSport.display_name.toLowerCase()} network, organized without crossing sports.`}
            </p>
          </div>
          {section !== 'proxy' && (
            <button
              type="button"
              onClick={() => navigateToNewMatch(null)}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Create Match
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {section === 'hood' ? (
            <div className="flex flex-wrap gap-2">
              {([
                ['all', 'All'],
                ['contacts', 'Contacts'],
                ['saved', 'Saved'],
                ['group', 'From Groups'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHoodFilter(value)}
                  className={[
                    'rounded-full px-3 py-1.5 text-sm font-medium transition',
                    hoodFilter === value
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : section === 'discover' ? (
            <>
              <div className="flex flex-wrap gap-2">
                {sportOptions.map((sport) => (
                  <button
                    key={sport.id}
                    type="button"
                    onClick={() => setSelectedSportCode(sport.code)}
                    className={[
                      'rounded-full px-3 py-1.5 text-sm font-medium transition',
                      selectedSport.code === sport.code
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    {sport.display_name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  ['club_members', 'Club Members'],
                  ['played_with', 'Played With'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDiscoverSource(value)}
                    className={[
                      'rounded-full px-3 py-1.5 text-sm font-medium transition',
                      discoverSource === value
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {section !== 'proxy' && (
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people"
              className="min-w-[220px] flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300"
            />
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {!error && clubDiscoverError && section === 'discover' && discoverSource === 'club_members' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Club Members discovery is temporarily unavailable: {clubDiscoverError}
        </div>
      )}

      {showContactTools && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.34)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Contact Tools</h3>
              <p className="mt-1 text-sm text-slate-500">
                Add or import contact people into your {selectedSport.display_name.toLowerCase()} hood, then manage them as person cards below.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setContactComposerMode((current) => current === 'manual' ? null : 'manual')
                  setError(null)
                }}
                className={[
                  'rounded-full px-4 py-2 text-sm font-medium transition',
                  contactComposerMode === 'manual'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                {contactComposerMode === 'manual' ? 'Close Add Contact' : 'Add Contact'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setContactComposerMode((current) => current === 'screenshot' ? null : 'screenshot')
                  setError(null)
                }}
                className={[
                  'rounded-full px-4 py-2 text-sm font-medium transition',
                  contactComposerMode === 'screenshot'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                {contactComposerMode === 'screenshot' ? 'Close Import' : 'Import from Screenshot'}
              </button>
            </div>
          </div>

          {contactComposerMode === 'manual' && (
            <form onSubmit={handleCreateContact} className="mt-4 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Add to {selectedSport.display_name}
                </div>
              </div>
              <label className="text-sm text-slate-600">
                <span className="mb-1 block">Name</span>
                <input
                  type="text"
                  value={contactDisplayName}
                  onChange={(event) => setContactDisplayName(event.target.value)}
                  placeholder="Display name"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                />
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-1 block">Notes</span>
                <input
                  type="text"
                  value={contactNotes}
                  onChange={(event) => setContactNotes(event.target.value)}
                  placeholder="Optional note"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                />
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-1 block">Email</span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                />
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-1 block">Phone</span>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="Phone"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                />
              </label>
              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  This contact will be added to your {selectedSport.display_name.toLowerCase()} hood.
                </p>
                <button
                  type="submit"
                  disabled={creatingContact}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
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

      {section === 'proxy' ? (
        <ProxyManagementPanel
          rows={proxyRows}
          loading={proxyLoading}
          error={proxyError}
          actingBindingId={proxyActionBindingId}
          onApprove={async (bindingId) => {
            const supabase = createSupabaseBrowserClient()
            setProxyActionBindingId(bindingId)
            setError(null)
            setMessage(null)
            try {
              await approveMatchProxyBinding(supabase, bindingId)
              setMessage('Proxy request approved.')
              await loadProxyRows()
              router.refresh()
            } catch (actionError) {
              setError((actionError as Error).message)
            } finally {
              setProxyActionBindingId(null)
            }
          }}
          onDecline={async (bindingId) => {
            const supabase = createSupabaseBrowserClient()
            setProxyActionBindingId(bindingId)
            setError(null)
            setMessage(null)
            try {
              await declineMatchProxyBinding(supabase, bindingId)
              setMessage('Proxy request declined.')
              await loadProxyRows()
              router.refresh()
            } catch (actionError) {
              setError((actionError as Error).message)
            } finally {
              setProxyActionBindingId(null)
            }
          }}
          onRevoke={async (bindingId) => {
            const supabase = createSupabaseBrowserClient()
            setProxyActionBindingId(bindingId)
            setError(null)
            setMessage(null)
            try {
              await revokeMatchProxyBindingSelf(supabase, bindingId)
              setMessage('Proxy binding revoked.')
              await loadProxyRows()
              router.refresh()
            } catch (actionError) {
              setError((actionError as Error).message)
            } finally {
              setProxyActionBindingId(null)
            }
          }}
        />
      ) : loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading hood...
        </div>
      ) : activePeople.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          {getPeopleEmptyState(section, hoodFilter, discoverSource, selectedSport.display_name)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activePeople.map((person) => (
            <HoodCard
              key={person.key}
              person={person}
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
      )}

      <HoodPersonDrawer
        open={Boolean(activeDrawerPerson)}
        person={activeDrawerPerson}
        sport={selectedSport}
        items={items}
        onClose={() => setActiveDrawerKey(null)}
        onSaveToggle={handleSaveToggle}
        onOpenAddToGroup={(person) => setGroupDialogPerson(person)}
        onOpenInvite={(person) => setActiveInviteKey(person.key)}
        onOpenProxyManager={() => {
          setSection('proxy')
          setActiveDrawerKey(null)
        }}
      />

      {groupDialogPerson && (
        <AddToGroupDialog
          groups={groups}
          person={groupDialogPerson}
          onClose={() => setGroupDialogPerson(null)}
          onConfirm={handleAddToGroup}
          pending={groupPending}
        />
      )}
    </div>
  )
}

