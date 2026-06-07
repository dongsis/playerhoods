'use client'

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MatchListItem } from '@/lib/api/matches'
import { acceptMatchInvite, userWithdraw } from '@/lib/api/matches'
import { ContactPlayerMark } from '@/app/components/ContactPlayerMark'
import { ParticipantDetailTrigger } from '@/app/components/ParticipantDetailTrigger'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatTimeWindow } from '@/lib/format-time'
import { getMatchParticipantRemovalCopy } from '@/lib/utils/match-participant-removal'
import { CreateMatchInline } from '@/app/matches/CreateMatchInline'
import type { UserPlayCity, VenueSport } from '@/lib/types/database'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'

const FALLBACK_COURT_STATE = {
  status: 'open',
  badgeLabel: 'Court TBD',
  detailLabel: 'Court TBD',
} as const

const FALLBACK_ROSTER_INSIGHT = {
  confirmedCount: 0,
  pendingCount: 0,
  waitingCount: 0,
  removedCount: 0,
  openSpots: 0,
  formatLabel: null,
  compositionLabel: null,
  neededLabel: null,
  summaryLabel: '',
  needsCompositionReview: false,
  genderCounts: {
    male: 0,
    female: 0,
    unspecified: 0,
  },
} as const

type StarterMatchFormat = 'singles' | 'doubles' | 'unknown'
type MobileMatchesMainTab = 'my-matches' | 'call-board'
type MatchBoardSection = 'action-needed' | 'my-matches' | 'looking-for' | 'history'
type MatchBoardWarningKind = 'needs-players' | 'time-conflict'
type MatchBoardCardWarning = {
  kind: MatchBoardWarningKind
  message: string
}
type MatchBoardIconKind = 'invite' | 'formed' | 'upcoming' | 'looking' | 'warning' | 'cancelled'

type FirstMatchStarterCardProps = {
  onAddContact?: () => void
  onDismiss: () => void
}

function FirstMatchStarterCard({
  onAddContact,
  onDismiss,
}: FirstMatchStarterCardProps) {
  return (
    <section className="relative rounded-[16px] border border-[#D8E6F6] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-[18px] font-light leading-none text-[#94A3B8] transition hover:bg-[#F1F5F9] hover:text-[#1E293B]"
        aria-label="Dismiss starter card"
      >
        x
      </button>
      <div className="min-w-0 pr-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-[16px] font-black tracking-[-0.01em] text-[#0F172A]">Get Started</h2>
          <button
            type="button"
            onClick={onAddContact}
            className="h-9 shrink-0 rounded-[10px] border border-[#D8E6F6] bg-white px-3 text-[12px] font-black text-[#0B2A5B] transition hover:border-[#B8CCE5] hover:bg-[#F8FBFF]"
          >
            Add My Contact
          </button>
        </div>
        <p className="mt-2 text-[13px] font-semibold leading-5 text-[#536783]">
          Add players you know, then create your first match.
        </p>
      </div>
    </section>
  )
}

function getProfileInitials(displayName?: string | null, firstName?: string | null, lastName?: string | null): string | null {
  const nameParts = [firstName, lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  if (nameParts.length > 0) {
    return nameParts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || null
  }

  const displayParts = (displayName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (displayParts.length === 0) return null

  return displayParts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || null
}

function MobileProfileAvatar({
  avatarUrl,
  displayName,
  firstName,
  lastName,
}: {
  avatarUrl?: string | null
  displayName?: string | null
  firstName?: string | null
  lastName?: string | null
}) {
  const initials = getProfileInitials(displayName, firstName, lastName)
  const profileLabel = displayName?.trim() || [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' ') || 'Profile'

  if (avatarUrl?.trim()) {
    return (
      <img
        src={avatarUrl.trim()}
        alt={profileLabel}
        className="h-10 w-10 rounded-full border border-[#E2E8F0] bg-white object-cover shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
      />
    )
  }

  if (initials) {
    return (
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D8E6F6] bg-white text-[14px] font-black text-[#0B2A5B] shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
        aria-label={profileLabel}
      >
        {initials}
      </span>
    )
  }

  return (
    <span
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D8E6F6] bg-white text-[#64748B] shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
      aria-label="Profile"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.8-4 5-6 8-6s6.2 2 8 6" />
      </svg>
    </span>
  )
}

function isPast(item: MatchListItem, nowIso: string): boolean {
  const { match } = item
  if (match.start_at_utc) return match.start_at_utc < nowIso
  if (match.match_date) return match.match_date < nowIso.slice(0, 10)
  return false
}

function isInboxItem(item: MatchListItem, nowIso: string): boolean {
  if (item.match.status !== 'active') return false
  return !isPast(item, nowIso)
}

function needsUserAction(item: MatchListItem): boolean {
  const mp = item.myParticipant
  if (!mp || mp.status !== 'pending') return false

  const hasUserAccepted = mp.participant_accepted_at != null
  const isInvited = mp.join_method === 'invited'
  const isParticipantInvite = mp.join_method === 'nominated'
  const isRequested = mp.join_method === 'requested'

  if ((isInvited || isParticipantInvite) && !hasUserAccepted) return true
  if (isRequested && mp.org_approved_at !== null && !hasUserAccepted) return true
  return false
}

function isDismissibleAlert(item: MatchListItem, nowIso: string): boolean {
  const status = item.myParticipant?.status
  const dismissedEligibleUpcoming = item.match.status === 'active' && !isPast(item, nowIso)
  return item.match.status === 'cancelled' || (status === 'removed' && dismissedEligibleUpcoming)
}

function shouldLiveInMyMatches(item: MatchListItem): boolean {
  const mp = item.myParticipant
  if (!mp) return false

  if (mp.status === 'confirmed' || mp.status === 'waiting_list') return true
  if (mp.status !== 'pending') return false
  if (needsUserAction(item)) return false
  return true
}

function isLookingForPlayersMatch(item: MatchListItem, nowIso: string): boolean {
  return (
    item.match.status === 'active'
    && !isPast(item, nowIso)
    && item.confirmedCount < item.match.required_count
  )
}

function getMatchDateKey(item: MatchListItem): string | null {
  if (item.match.match_date) return item.match.match_date
  if (item.match.start_at_utc) return toDateKey(new Date(item.match.start_at_utc))
  return null
}

function getHoursUntilStart(item: MatchListItem, nowMs: number): number | null {
  if (!item.match.start_at_utc) return null
  return (new Date(item.match.start_at_utc).getTime() - nowMs) / 3_600_000
}

function getNeededPlayerCount(item: MatchListItem): number {
  return Math.max(item.match.required_count - item.confirmedCount, 0)
}

function isSameDayMatch(item: MatchListItem, todayKey: string): boolean {
  return getMatchDateKey(item) === todayKey
}

function formatHoursUntilStart(hoursLeft: number): string {
  const totalMinutes = Math.max(1, Math.round(hoursLeft * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function isBoardRelevantMatch(item: MatchListItem, userId: string, nowIso: string): boolean {
  if (item.match.status !== 'active') return false
  if (isPast(item, nowIso)) return false
  if (item.myParticipant?.status === 'removed') return false
  return Boolean(item.myParticipant) || item.match.organizer_id === userId
}

function canEvaluateTimeConflict(item: MatchListItem): boolean {
  return Boolean(getMatchDateKey(item) && (item.match.start_time || item.match.start_at_utc))
}

function getBoardConflictIds(items: MatchListItem[], userId: string, nowIso: string): Set<string> {
  const conflictIds = new Set<string>()
  const byDate = new Map<string, MatchListItem[]>()

  for (const item of items) {
    if (!isBoardRelevantMatch(item, userId, nowIso)) continue
    if (!canEvaluateTimeConflict(item)) continue

    const dateKey = getMatchDateKey(item)
    if (!dateKey) continue

    const bucket = byDate.get(dateKey) ?? []
    bucket.push(item)
    byDate.set(dateKey, bucket)
  }

  for (const dayItems of byDate.values()) {
    for (let leftIndex = 0; leftIndex < dayItems.length; leftIndex += 1) {
      const left = dayItems[leftIndex]
      const leftTiming = getCalendarTiming(left)

      for (let rightIndex = leftIndex + 1; rightIndex < dayItems.length; rightIndex += 1) {
        const right = dayItems[rightIndex]
        const rightTiming = getCalendarTiming(right)

        if (leftTiming.startMinutes < rightTiming.endMinutes && rightTiming.startMinutes < leftTiming.endMinutes) {
          conflictIds.add(left.match.id)
          conflictIds.add(right.match.id)
        }
      }
    }
  }

  return conflictIds
}

function getMatchBoardWarningForItem(
  item: MatchListItem,
  userId: string,
  todayKey: string,
  nowMs: number,
  conflictIds: Set<string>,
): MatchBoardCardWarning | null {
  if (item.match.status !== 'active') return null

  const hoursLeft = getHoursUntilStart(item, nowMs)
  const isOrganizer = item.match.organizer_id === userId
  const neededPlayers = getNeededPlayerCount(item)
  const needsPlayersSoon =
    isOrganizer
    && isSameDayMatch(item, todayKey)
    && !item.isFormed
    && neededPlayers > 0
    && hoursLeft !== null
    && hoursLeft > 0
    && hoursLeft < 12

  if (needsPlayersSoon) {
    return {
      kind: 'needs-players',
      message: `Starts in ${formatHoursUntilStart(hoursLeft)} \u00b7 still need ${neededPlayers} player${neededPlayers === 1 ? '' : 's'}`,
    }
  }

  if (conflictIds.has(item.match.id) && isBoardRelevantMatch(item, userId, new Date(nowMs).toISOString())) {
    return {
      kind: 'time-conflict',
      message: 'Time conflict with another match',
    }
  }

  return null
}

type MatchRowProps = {
  item: MatchListItem
  userId?: string | null
  detailItems?: MatchListItem[]
  onViewed?: (matchId: string) => void
  onDismissAlert?: (matchId: string) => void
  showAcknowledge?: boolean
  cardWarning?: MatchBoardCardWarning | null
  showFindPlayersAction?: boolean
  showCancelMatchAction?: boolean
  onCancelMatch?: (matchId: string) => Promise<void>
  variant?: 'default' | 'incoming' | 'history'
  boardSection?: MatchBoardSection
  showRosterNames?: boolean
  isSelected?: boolean
  isLoadingDetail?: boolean
  onSelectMatch?: (matchId: string) => void
}

function getCompactRosterMeta(summaryLabel: string | null | undefined): string[] {
  if (!summaryLabel) return []

  return summaryLabel
    .split(/\s*[·Â]+\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/composition needs review/i.test(part))
}

function getSafeParticipants(item: Pick<MatchListItem, 'participants'>): MatchListItem['participants'] {
  return Array.isArray(item.participants) ? item.participants : []
}

function getParticipantPreview(participants: MatchListItem['participants'], organizerId: string): string | null {
  const confirmed = participants
    .filter((participant) => participant.status === 'confirmed')
    .sort((a, b) => {
      const aIsHost = a.user_id === organizerId
      const bIsHost = b.user_id === organizerId
      if (aIsHost === bIsHost) return 0
      return aIsHost ? -1 : 1
    })

  if (confirmed.length === 0) return null

  const visibleNames = confirmed.slice(0, 2).map((participant) => participant.display_name)
  const overflow = confirmed.length - visibleNames.length
  return overflow > 0 ? `${visibleNames.join(', ')} +${overflow}` : visibleNames.join(', ')
}

function getBoardCourtLabel(label: string | null | undefined): string | null {
  if (!label) return null
  if (/host will book it later/i.test(label)) return 'Court TBD'
  return label
}

function SportBadgeIcon({ sportName }: { sportName: string | null | undefined }) {
  const sportKey = (sportName ?? '').trim().toLowerCase()

  if (sportKey.includes('tennis')) {
    return (
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-[#26415E]" aria-hidden="true">
        <ellipse cx="11" cy="7.5" rx="4.6" ry="5.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.5 13.1 13.5 13.1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M7.6 10.4 14.4 10.4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M7.1 7.6 14.9 7.6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M7.4 4.9 14.6 4.9" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M8.5 2.7 8.5 12.3" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M11 2.1 11 13" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M13.5 2.7 13.5 12.3" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M11 13.1 11 16.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10.1 16.1 11.9 16.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10.1 17.4 11.9 17.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10.2 18.7 11.8 18.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9.8 13.4 9.8 20.2" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M12.2 13.4 12.2 20.2" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
    )
  }

  if (sportKey.includes('pickleball')) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#7C3AED]" aria-hidden="true">
        <path
          d="M8 4.5c0-1.1.9-2 2-2h2.3a3.2 3.2 0 0 1 3.2 3.2v7.5a4.5 4.5 0 1 1-9 0V6.8A2.3 2.3 0 0 1 8.8 4.5H8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="7.5" r="0.8" fill="currentColor" />
        <circle cx="13.8" cy="7.5" r="0.8" fill="currentColor" />
        <circle cx="11" cy="10.4" r="0.8" fill="currentColor" />
        <circle cx="13.8" cy="10.4" r="0.8" fill="currentColor" />
        <path d="M12 17.8v3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return null
}

function InlineSportBadge({ sportName }: { sportName: string | null | undefined }) {
  const sportKey = (sportName ?? '').trim().toLowerCase()

  if (sportKey.includes('tennis')) {
    return (
      <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden">
        <img
          src="/match-tennis-racket-icon.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain"
        />
      </span>
    )
  }

  if (sportKey.includes('pickleball')) {
    return (
      <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden">
        <img
          src="/match-pickleball-paddle-icon.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain"
        />
      </span>
    )
  }

  const icon = <SportBadgeIcon sportName={sportName} />

  if (!icon) return null

  return (
    <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-[#D7E1EE] bg-[#F3F7FC] text-[#5B718F] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className="scale-[1.05]">{icon}</span>
    </span>
  )
}

function ParticipantRosterSummary({
  participants,
  rosterMeta,
  confirmedCount,
  organizerId,
  detailItems,
  showMeta,
}: {
  participants: MatchListItem['participants']
  rosterMeta: string[]
  confirmedCount: number
  organizerId: string
  detailItems?: MatchListItem[]
  showMeta: boolean
}) {
  const confirmed = participants
    .filter((participant) => participant.status === 'confirmed')
    .sort((a, b) => {
      const aIsHost = a.user_id === organizerId
      const bIsHost = b.user_id === organizerId
      if (aIsHost === bIsHost) return 0
      return aIsHost ? -1 : 1
    })
  const visibleParticipants = confirmed.slice(0, 4)
  const overflow = confirmedCount > visibleParticipants.length ? `+${confirmedCount - visibleParticipants.length}` : ''
  const shouldShowMeta = false
  const metaLine = rosterMeta.join(' · ')

  return (
    <div className="min-w-0">
      <div className="text-title-main flex flex-wrap items-center gap-x-2 gap-y-1 text-[#1E293B]">
          {visibleParticipants.length > 0 ? (
            <>
              {visibleParticipants.map((participant) => (
                <span key={participant.id} className="inline-flex min-w-0 items-center gap-1">
                  <ParticipantDetailTrigger
                    participant={participant}
                    items={detailItems}
                    className="min-w-0 max-w-full text-left transition hover:text-[#0d6efd]"
                    label={`View details for ${participant.display_name}`}
                  >
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <span className="relative inline-flex min-w-0 max-w-full pr-3">
                        {!participant.user_id ? (
                          <span className="pointer-events-none absolute -right-0.5 -top-1.5 z-0">
                            <ContactPlayerMark className="h-[1.2rem] w-[1.2rem]" variant="badge" />
                          </span>
                        ) : null}
                        <span className="relative z-10 inline-flex min-w-0 items-center gap-1">
                        <span
                          className={
                            participant.user_id === organizerId
                              ? 'inline-flex items-center rounded-[10px] border border-[#D7DEE8] bg-[#F6F7F9] px-2.5 py-[0.2rem] text-[0.93em] font-semibold tracking-[-0.01em] text-[#1F2937] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'
                              : 'truncate'
                          }
                        >
                          {participant.display_name}
                        </span>
                        </span>
                      </span>
                    </span>
                  </ParticipantDetailTrigger>
                </span>
              ))}
              {overflow ? <span className="text-body-sub text-[#94A3B8]">{overflow}</span> : null}
            </>
          ) : (
            <span className="text-[#94A3B8]">No lineup players yet</span>
          )}
      </div>
      {shouldShowMeta && metaLine ? (
        <div className="text-body-sub mt-1 truncate text-[#64748B]">{metaLine}</div>
      ) : null}
    </div>
  )
}

function StatusBadge({
  label,
  tone,
  className,
}: {
  label: string
  tone: 'green' | 'amber' | 'blue' | 'red' | 'slate'
  className?: string
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-[#ECFDF5] text-[#22C55E] ring-[#DCFCE7]'
      : tone === 'blue'
        ? 'bg-[#eff6ff] text-[#0d6efd] ring-[#dbeafe]'
        : tone === 'red'
          ? 'bg-[#FEF2F2] text-[#EF4444] ring-[#FECACA]'
          : tone === 'slate'
            ? 'bg-[#F8FAFC] text-[#64748B] ring-[#E2E8F0]'
            : 'bg-[#eff6ff] text-[#F97316] ring-[#FFEDD5]'

  return (
    <span className={`text-label inline-flex items-center rounded-full px-2.5 py-1 ring-1 ${toneClass} ${className ?? ''}`}>
      {label}
    </span>
  )
}

function MatchBoardStatusIcon({
  kind,
  size = 'desktop',
}: {
  kind: MatchBoardIconKind
  size?: 'desktop' | 'mobile'
}) {
  const theme =
    kind === 'formed'
      ? 'bg-[#ECFDF5] text-[#16A34A] ring-[#BBF7D0]'
      : kind === 'looking'
        ? 'bg-[#FFF7ED] text-[#EA580C] ring-[#FED7AA]'
        : kind === 'warning' || kind === 'cancelled'
          ? 'bg-[#FEF2F2] text-[#F97316] ring-[#FED7AA]'
          : 'bg-[#EFF6FF] text-[#0d6efd] ring-[#BFDBFE]'
  const sizeClass = size === 'mobile' ? 'h-8 w-8' : 'h-9 w-9'
  const iconClass = size === 'mobile' ? 'h-4 w-4' : 'h-[18px] w-[18px]'

  return (
    <span
      className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-full ring-1 ${theme}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
      >
        {kind === 'invite' ? (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 7 9-7" />
          </>
        ) : kind === 'formed' ? (
          <>
            <rect x="4" y="5" width="16" height="17" rx="2" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
            <path d="M4 10h16" />
            <path d="m8 16 2.5 2.5L16 13" />
          </>
        ) : kind === 'looking' ? (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
            <circle cx="9.5" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        ) : kind === 'warning' || kind === 'cancelled' ? (
          <>
            <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v5" />
            <path d="M12 17h.01" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </>
        )}
      </svg>
    </span>
  )
}

function MatchRow({
  item,
  userId = null,
  detailItems,
  onViewed,
  onDismissAlert,
  showAcknowledge = false,
  cardWarning = null,
  showFindPlayersAction = false,
  showCancelMatchAction = false,
  onCancelMatch,
  variant = 'default',
  boardSection,
  showRosterNames = true,
  isSelected = false,
  isLoadingDetail = false,
  onSelectMatch,
}: MatchRowProps) {
  const {
    match,
    confirmedCount,
    pendingCount,
    isFormed,
    myParticipant,
    venueTimezone,
    venueName,
    sportName,
  } = item
  const participants = getSafeParticipants(item)
  const courtState = item.courtState ?? FALLBACK_COURT_STATE
  const rosterInsight = item.rosterInsight ?? FALLBACK_ROSTER_INSIGHT
  if (!item.rosterInsight) {
    ;(item as MatchListItem).rosterInsight = rosterInsight
  }
  const [isPending, startTransition] = useTransition()
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [optimisticAccepted, setOptimisticAccepted] = useState(false)
  const [optimisticDeclined, setOptimisticDeclined] = useState(false)
  const router = useRouter()
  const normalizedSportName = (sportName ?? '').trim().toLowerCase()
  const showSportIcon = normalizedSportName.includes('tennis') || normalizedSportName.includes('pickleball')
  const compactRosterMeta = getCompactRosterMeta(rosterInsight.summaryLabel)
  const isHistoryRow = variant === 'history'
  const isPastMatch = isPast(item, new Date().toISOString())
  const isOrganizer = userId === match.organizer_id
  const pendingRequestApprovals = participants.filter(
    (participant) =>
      participant.status === 'pending'
      && participant.participant_accepted_at !== null
      && participant.org_approved_at === null,
  )

  const hasUserAccepted = myParticipant?.participant_accepted_at != null || optimisticAccepted
  const isInvited = myParticipant?.status === 'pending' && myParticipant.join_method === 'invited'
  const isParticipantInvite = myParticipant?.status === 'pending' && myParticipant.join_method === 'nominated'
  const isRequested = myParticipant?.status === 'pending' && myParticipant.join_method === 'requested'
  const needsReconfirmRequested = isRequested && myParticipant?.org_approved_at !== null && !hasUserAccepted
  const isCancelled = match.status === 'cancelled'
  const visibleRosterMeta = isOrganizer ? compactRosterMeta : []
  const hostRequestCount =
    isOrganizer && !isHistoryRow && !isCancelled ? pendingRequestApprovals.length : 0
  const isRemoved = myParticipant?.status === 'removed'
  const wasConfirmedByOther =
    myParticipant?.status === 'confirmed'
    && !!myParticipant.manual_confirmed_by
    && myParticipant.manual_confirmed_by !== myParticipant.user_id
  const confirmerName = myParticipant?.manual_confirmed_by_name ?? 'someone'
  const removalCopy = myParticipant ? getMatchParticipantRemovalCopy(myParticipant) : null

  const handleConfirm = () => {
    setConfirmError(null)
    setOptimisticAccepted(true)
    const supabase = createSupabaseBrowserClient()
    startTransition(async () => {
      try {
        await acceptMatchInvite(supabase, match.id)
        router.refresh()
        window.dispatchEvent(new Event('playerhoods:dashboard-live-refresh'))
      } catch (err: unknown) {
        setOptimisticAccepted(false)
        setConfirmError((err as { message?: string })?.message ?? 'Failed')
      }
    })
  }

  const handleNotThisTime = () => {
    setConfirmError(null)
    setOptimisticDeclined(true)
    const supabase = createSupabaseBrowserClient()
    startTransition(async () => {
      try {
        await userWithdraw(supabase, match.id, 'Not this time')
        router.refresh()
        window.dispatchEvent(new Event('playerhoods:dashboard-live-refresh'))
      } catch (err: unknown) {
        setOptimisticDeclined(false)
        setConfirmError((err as { message?: string })?.message ?? 'Failed')
      }
    })
  }

  const handleCancelMatch = () => {
    if (!onCancelMatch) return
    setCancelError(null)
    startTransition(async () => {
      try {
        await onCancelMatch(match.id)
        router.refresh()
        window.dispatchEvent(new Event('playerhoods:dashboard-live-refresh'))
      } catch (err: unknown) {
        setCancelError((err as { message?: string })?.message ?? 'Failed')
      }
    })
  }

  const timeStr = formatTimeWindow(
    match.start_at_utc,
    match.match_date,
    match.start_time,
    match.duration_minutes,
    venueTimezone ?? 'UTC',
  )
  const playerCountLabel = `${confirmedCount}/${match.required_count}`
  const boardCourtLabel = getBoardCourtLabel(courtState.badgeLabel)
  const courtTbdBoardLabel = boardCourtLabel === 'Court TBD'
  const compactBoardCourtLabel = boardCourtLabel && !courtTbdBoardLabel
    ? boardCourtLabel.replace(/^court\s+/i, 'crt ')
    : null
  const boardStatusLabel = isCancelled
    ? 'Match cancelled'
    : courtTbdBoardLabel && !isFormed
      ? `Court TBD · ${playerCountLabel}`
      : isFormed
        ? `Formed · ${playerCountLabel}`
        : confirmedCount >= match.required_count
          ? `Ready · ${playerCountLabel}`
          : playerCountLabel
  const boardStatusTone: 'green' | 'amber' | 'blue' | 'red' | 'slate' = isCancelled
    ? 'red'
    : isFormed
        ? 'green'
        : confirmedCount >= match.required_count
          ? 'blue'
          : 'amber'
  const participantPreview = getParticipantPreview(participants, match.organizer_id)
  const compactBoardStatusLabel = isCancelled
    ? 'Match cancelled'
    : courtTbdBoardLabel && !isFormed
      ? 'Court TBD'
    : isHistoryRow && isPastMatch
      ? (isFormed ? 'Played' : 'Past')
      : isFormed
        ? 'Formed'
        : confirmedCount >= match.required_count
          ? 'Ready'
          : 'Open to Join'
  const handleDetailsClick = () => {
    onViewed?.(match.id)
    onSelectMatch?.(match.id)
  }
  const hasResponseAction = !isHistoryRow && !isCancelled && (
    isInvited || (isParticipantInvite && !hasUserAccepted) || needsReconfirmRequested
  )
  const isActionNeededRow = boardSection === 'action-needed' && hasResponseAction
  const responseStatusLabel = needsReconfirmRequested ? 'Needs confirm' : 'Invited'
  const hasBoardAccessory = Boolean(
    hasResponseAction
    || (!isHistoryRow && !isCancelled && isParticipantInvite && hasUserAccepted)
    || (!isHistoryRow && !isCancelled && isRequested && !needsReconfirmRequested)
    || (!isHistoryRow && !isCancelled && isRemoved)
    || (!isHistoryRow && !isCancelled && myParticipant?.status === 'waiting_list')
    || (!isHistoryRow && !isCancelled && wasConfirmedByOther)
    || hostRequestCount > 0
    || (showAcknowledge && onDismissAlert)
  )
  const hasInlineBoardAction = isActionNeededRow || showFindPlayersAction || showCancelMatchAction
  const useCompactBoardRow = variant !== 'default' && (!hasBoardAccessory || hasInlineBoardAction)
  const hasLeadingIcon = variant !== 'default' && variant !== 'history'
  const primaryCompactStatusLabel = isActionNeededRow
    ? responseStatusLabel
    : boardSection === 'my-matches' || boardSection === 'looking-for'
      ? courtTbdBoardLabel && !isFormed
        ? 'Court TBD'
        : null
      : compactBoardStatusLabel
  const compactBoardMeta = [
    primaryCompactStatusLabel,
    playerCountLabel,
    compactBoardCourtLabel,
    participantPreview ?? 'No lineup players yet',
  ].filter(Boolean)
  const boardIconKind: MatchBoardIconKind = isCancelled
    ? 'cancelled'
    : cardWarning
      ? 'warning'
      : isActionNeededRow
        ? 'invite'
        : boardSection === 'looking-for' || showFindPlayersAction
          ? 'looking'
          : isFormed
            ? 'formed'
            : 'upcoming'

  const statusBadge = isCancelled ? (
    <StatusBadge label="Match cancelled" tone="red" />
  ) : isHistoryRow && isPastMatch ? (
    <StatusBadge label={isFormed ? 'Played' : 'Past'} tone="slate" />
  ) : isFormed ? (
    <StatusBadge label="Formed" tone="green" />
  ) : confirmedCount >= match.required_count ? (
    <StatusBadge label="Ready" tone="blue" />
  ) : (
    <StatusBadge label={`${confirmedCount}/${match.required_count}`} tone="amber" />
  )

  const courtBadge = !isCancelled ? (
    <StatusBadge
      label={courtState.badgeLabel}
      tone={
        courtState.status === 'secured'
          ? 'green'
          : courtState.status === 'walk_in'
            ? 'blue'
            : 'amber'
      }
      className={courtState.status === 'secured' ? 'bg-[#F3FCF5] text-[#56B473] ring-[#DDF3E4]' : undefined}
    />
  ) : null

  return (
    <div
      className={[
        useCompactBoardRow
          ? hasLeadingIcon
            ? 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 bg-white transition-colors md:grid-cols-[auto_minmax(0,1fr)_auto]'
            : 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 bg-white transition-colors'
          : 'flex items-center gap-3 bg-white transition-colors',
        cardWarning
          ? 'rounded-[16px] border border-[#FED7AA] bg-[#FFF7ED] px-3 py-2.5 shadow-[0_8px_20px_rgba(249,115,22,0.08)] hover:border-[#FDBA74]'
          : isSelected
          ? 'rounded-[16px] border border-[#0d6efd] bg-[#eff6ff] px-3 py-2.5 shadow-[0_8px_20px_rgba(13,110,253,0.10)]'
          : variant !== 'default'
          ? 'rounded-[16px] border border-[#E2E8F0] px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.045)] hover:border-[#CBD5E1]'
          : 'rounded-[16px] border border-[#E2E8F0] px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.045)] hover:border-[#CBD5E1]',
      ].join(' ')}
    >
      {hasLeadingIcon ? (
        <div className={useCompactBoardRow ? 'col-start-1 row-span-4 row-start-1 self-center md:row-span-3' : 'shrink-0'}>
          <MatchBoardStatusIcon kind={boardIconKind} />
        </div>
      ) : null}

      <div className={[
        useCompactBoardRow
          ? hasLeadingIcon
            ? 'col-start-2 row-start-1 min-w-0 text-[12px] font-semibold leading-4 text-[#64748B] md:min-w-[15rem]'
            : 'col-span-2 min-w-0 text-[12px] font-semibold leading-4 text-[#64748B]'
          : variant !== 'default'
            ? 'w-40 shrink-0 text-body-main leading-snug text-[#64748B]'
            : 'w-36 shrink-0 text-body-sub leading-snug text-[#64748B]',
      ].join(' ')}>
        {useCompactBoardRow ? (
          <>
            <p className="flex min-w-0 items-center text-[#334155]">
              <span className="shrink-0 whitespace-nowrap">{timeStr || <span className="italic">No time set</span>}</span>
              {venueName ? (
                <>
                  <span className="px-1 text-[#CBD5E1]">&middot;</span>
                  <span className="min-w-0 truncate text-[#64748B]">{venueName}</span>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <>
            {!showSportIcon && sportName ? (
              <div className="text-label mb-1 text-[#94A3B8]">
                {sportName}
              </div>
            ) : null}
            <div className="whitespace-nowrap">{timeStr || <span className="italic">No time set</span>}</div>
            {venueName ? <div className="truncate text-[#94A3B8]">{venueName}</div> : null}
          </>
        )}
      </div>

      {variant !== 'default' ? (
        <div className={useCompactBoardRow ? hasLeadingIcon ? 'col-start-2 row-start-2 min-w-0 self-center' : 'min-w-0 self-center' : 'flex min-w-0 flex-1 flex-col gap-2'}>
          {useCompactBoardRow ? (
            <>
              <p className="truncate text-[11px] font-semibold leading-4 text-[#64748B]">
                {compactBoardMeta.map((label, index) => (
                  <span key={`${label}-${index}`}>
                    {index > 0 ? <span className="px-1 text-[#CBD5E1]">&middot;</span> : null}
                    <span>{label}</span>
                  </span>
                ))}
              </p>
              {cardWarning ? (
                <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-[#DC2626]">
                  <span>{cardWarning.message}</span>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {showSportIcon ? <InlineSportBadge sportName={sportName} /> : null}
                <StatusBadge label={boardStatusLabel} tone={boardStatusTone} />
                {!isCancelled && boardCourtLabel && !courtTbdBoardLabel ? (
                  <span className="text-body-sub font-semibold text-[#64748B]">
                    {boardCourtLabel}
                  </span>
                ) : null}
              </div>
              <p className="text-body-sub truncate font-semibold text-[#64748B]">
                {participantPreview ?? 'No lineup players yet'}
              </p>
              {cardWarning ? (
                <p className="text-body-sub font-semibold text-[#DC2626]">
                  {cardWarning.message}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {showSportIcon ? <InlineSportBadge sportName={sportName} /> : null}
          {statusBadge}
          {courtBadge}
          <div className="min-w-0 flex-1">
            {showRosterNames ? (
              <ParticipantRosterSummary
                participants={participants}
                rosterMeta={visibleRosterMeta}
                confirmedCount={confirmedCount}
                organizerId={match.organizer_id}
                detailItems={detailItems}
                showMeta={isOrganizer}
              />
            ) : visibleRosterMeta.length > 0 ? (
              <span className="text-body-sub truncate text-[#64748B]">
                {visibleRosterMeta.map((label, index) => (
                  <span key={label}>
                    {index > 0 ? <span className="px-1 text-[#CBD5E1]">&middot;</span> : null}
                    <span>{label}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-body-sub text-[#94A3B8]">-</span>
            )}
          </div>
        </div>
      )}

      {!isHistoryRow && !isCancelled && (isInvited || (isParticipantInvite && !hasUserAccepted) || needsReconfirmRequested) ? (
        <div className={useCompactBoardRow ? hasLeadingIcon ? 'col-start-2 row-start-3 flex flex-wrap items-center justify-end gap-2 self-center md:col-start-3 md:row-span-2 md:row-start-1' : 'row-start-2 col-start-2 flex flex-wrap items-center justify-end gap-2 self-center' : 'shrink-0 flex items-center gap-2'}>
          {!isActionNeededRow ? (
            <span className="text-label rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#0d6efd] ring-1 ring-[#dbeafe] whitespace-nowrap">
              {responseStatusLabel}
            </span>
          ) : null}
          <button
            onClick={handleConfirm}
            disabled={isPending || optimisticDeclined}
            className="whitespace-nowrap rounded-full bg-[#0d6efd] px-2.5 py-1 text-[11px] font-semibold leading-4 text-white hover:bg-[#0b5ed7] disabled:opacity-50"
          >
            Confirm
          </button>
          {isActionNeededRow ? (
            <button
              type="button"
              onClick={handleNotThisTime}
              disabled={isPending || optimisticDeclined}
              className="whitespace-nowrap rounded-full border border-[#D7DEE7] bg-white px-2.5 py-1 text-[11px] font-semibold leading-4 text-[#64748B] transition hover:border-[#CBD5E1] hover:text-[#1E293B] disabled:opacity-50"
            >
              Not this time
            </button>
          ) : null}
          {isActionNeededRow ? (
            <Link
              href={`/dashboard?matchId=${match.id}`}
              onClick={handleDetailsClick}
              aria-current={isSelected ? 'page' : undefined}
              className={[
                'inline-flex items-center justify-end whitespace-nowrap text-[11px] font-semibold leading-4 transition',
                isLoadingDetail
                  ? 'pointer-events-none text-[#0d6efd]'
                  : isSelected
                  ? 'text-[#0d6efd]'
                  : 'text-[#1E293B] hover:text-[#0d6efd]',
              ].join(' ')}
            >
              {isLoadingDetail ? 'Loading' : 'Details ->'}
            </Link>
          ) : null}
          {confirmError ? <span className="text-body-sub text-[#EF4444]">{confirmError}</span> : null}
        </div>
      ) : null}

      {!isHistoryRow && !isCancelled && isParticipantInvite && hasUserAccepted ? (
        <span className="text-label shrink-0 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#0d6efd] ring-1 ring-[#dbeafe] whitespace-nowrap">
          Waiting for host confirmation
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && isRequested && !needsReconfirmRequested ? (
        <span className="text-label shrink-0 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#F97316] ring-1 ring-[#FFEDD5] whitespace-nowrap">
          Request pending
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && isRemoved ? (
        <span className="text-label shrink-0 rounded-full bg-[#FEF2F2] px-2.5 py-1 text-[#EF4444] ring-1 ring-[#FECACA] whitespace-nowrap">
          {removalCopy?.badgeLabel ?? 'No longer invited'}
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && myParticipant?.status === 'waiting_list' ? (
        <span className="text-label shrink-0 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#F97316] ring-1 ring-[#FFEDD5] whitespace-nowrap">
          Waiting list
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && wasConfirmedByOther ? (
        <span className="text-label shrink-0 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[#22C55E] ring-1 ring-[#DCFCE7] whitespace-nowrap">
          You&apos;ve been confirmed by {confirmerName}
        </span>
      ) : null}

      {hostRequestCount > 0 ? (
        <span
          className={[
            'ph-request-glow text-label shrink-0 rounded-full bg-[#0d6efd] px-3 py-1.5 text-white ring-1 ring-[#93C5FD] whitespace-nowrap',
            useCompactBoardRow
              ? hasLeadingIcon
                ? 'col-start-2 row-start-3 justify-self-end self-center md:col-start-3 md:row-start-2'
                : 'row-start-2 col-start-2 justify-self-end self-center'
              : '',
          ].join(' ')}
          title={`${hostRequestCount} request${hostRequestCount === 1 ? '' : 's'} to review`}
        >
          Request
        </span>
      ) : null}

      {!isActionNeededRow ? (
        <div
          className={
            useCompactBoardRow
              ? hasLeadingIcon
                ? showFindPlayersAction || showCancelMatchAction || hostRequestCount > 0
                  ? 'col-start-2 row-start-4 flex flex-wrap items-center justify-end gap-2 self-center md:col-start-3 md:row-start-3'
                  : 'col-start-2 row-start-3 flex flex-wrap items-center justify-end gap-2 self-center md:col-start-3 md:row-start-2'
                : showFindPlayersAction && hostRequestCount > 0
                  ? 'col-span-2 row-start-3 flex items-center justify-end gap-2 self-center'
                  : 'row-start-2 col-start-2 flex items-center justify-end gap-2 self-center'
              : 'shrink-0 flex items-center gap-3'
          }
        >
        {showFindPlayersAction ? (
          <Link
            href={`/dashboard?matchId=${match.id}`}
            onClick={handleDetailsClick}
            className="whitespace-nowrap rounded-full bg-[#0d6efd] px-2.5 py-1 text-[11px] font-semibold leading-4 text-white transition hover:bg-[#0b5ed7]"
          >
            Find Players
          </Link>
        ) : null}
        {showCancelMatchAction && onCancelMatch ? (
          confirmingCancel ? (
            <>
              <button
                type="button"
                onClick={handleCancelMatch}
                disabled={isPending}
                className="whitespace-nowrap rounded-full border border-[#FCA5A5] bg-white px-2.5 py-1 text-[11px] font-semibold leading-4 text-[#DC2626] transition hover:bg-[#FEF2F2] disabled:opacity-50"
              >
                Cancel match
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={isPending}
                className="whitespace-nowrap rounded-full border border-[#D7DEE7] bg-white px-2.5 py-1 text-[11px] font-semibold leading-4 text-[#64748B] transition hover:border-[#CBD5E1] hover:text-[#1E293B] disabled:opacity-50"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="whitespace-nowrap text-[11px] font-semibold leading-4 text-[#1E293B] transition hover:text-[#DC2626]"
            >
              Cancel match
            </button>
          )
        ) : null}
        {showAcknowledge && onDismissAlert ? (
          <button
            onClick={() => onDismissAlert(match.id)}
            className="text-body-sub font-medium text-[#64748B] hover:text-[#1E293B] whitespace-nowrap"
          >
            Dismiss
          </button>
        ) : null}
        <Link
          href={`/dashboard?matchId=${match.id}`}
          onClick={handleDetailsClick}
          aria-current={isSelected ? 'page' : undefined}
          className={[
            'inline-flex min-w-[4.5rem] items-center justify-end gap-1.5 whitespace-nowrap text-[11px] font-semibold leading-4 transition',
            isLoadingDetail
              ? 'pointer-events-none text-[#0d6efd]'
              : isSelected
              ? 'text-[#0d6efd]'
              : 'text-[#1E293B] hover:text-[#0d6efd]',
          ].join(' ')}
        >
          {isLoadingDetail ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#BFDBFE] border-t-[#0d6efd]" aria-hidden="true" />
              Loading
            </>
          ) : (
            'Details ->'
          )}
        </Link>
        {cancelError ? <span className="text-body-sub text-[#EF4444]">{cancelError}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

function MatchDetailSkeleton() {
  return (
    <div className="space-y-5" aria-live="polite" aria-busy="true">
      <div className="rounded-[24px] border border-[#D8E6F6] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <p className="text-label text-[#0d6efd]">Opening match</p>
        <h2 className="mt-2 text-h2 font-black text-[#1E293B]">Loading selected match...</h2>
        <p className="mt-2 text-body-main text-[#64748B]">
          We are getting the latest lineup and match actions.
        </p>
      </div>
    </div>
  )
}

function SelectedMatchLoadingFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative" aria-busy="true" aria-live="polite">
      {children}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex justify-center sm:inset-x-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#BFDBFE] bg-white/95 px-4 py-2 text-body-sub font-black text-[#0d6efd] shadow-[0_12px_28px_rgba(13,110,253,0.16)] backdrop-blur">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#BFDBFE] border-t-[#0d6efd]" aria-hidden="true" />
          Loading selected match...
        </div>
      </div>
    </div>
  )
}

function ProvisionalMatchDetailSummary({ item }: { item: MatchListItem }) {
  const timeLabel = formatTimeWindow(
    item.match.start_at_utc,
    item.match.match_date,
    item.match.start_time,
    item.match.duration_minutes,
    item.venueTimezone ?? 'UTC',
  )
  const gameType = item.match.game_type
    ? item.match.game_type.charAt(0).toUpperCase() + item.match.game_type.slice(1)
    : 'Match'
  const confirmedParticipants = getSafeParticipants(item).filter((participant) => participant.status === 'confirmed')
  const pendingParticipants = getSafeParticipants(item).filter((participant) => participant.status === 'pending')

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-[#D8E6F6] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <p className="text-label text-[#0d6efd]">Selected match</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h1 text-[#1E293B]">
              {item.sportName ?? 'Match'} <span className="text-[#94A3B8]">&middot;</span> {gameType}
            </h2>
            <p className="mt-2 text-body-main font-semibold text-[#64748B]">
              {timeLabel || 'Time TBD'}
            </p>
            {item.venueName ? (
              <p className="mt-1 text-body-main font-bold text-[#1E293B]">{item.venueName}</p>
            ) : null}
          </div>
          <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-body-sub font-black text-[#0d6efd]">
            {item.confirmedCount} / {item.match.required_count} players
          </span>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <p className="text-label text-[#64748B]">Lineup preview</p>
        <div className="mt-4 space-y-3">
          {confirmedParticipants.length > 0 ? confirmedParticipants.slice(0, 4).map((participant) => (
            <div key={participant.id} className="flex items-center gap-3 rounded-[18px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d6efd] text-sm font-black text-white">
                {participant.display_name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-body-main font-black text-[#1E293B]">{participant.display_name}</p>
                <p className="text-body-sub text-[#64748B]">Confirmed</p>
              </div>
            </div>
          )) : (
            <p className="rounded-[18px] border border-dashed border-[#D7E1EE] bg-[#F8FAFC] px-4 py-4 text-body-main font-semibold text-[#94A3B8]">
              No confirmed players yet.
            </p>
          )}
        </div>
        {pendingParticipants.length > 0 ? (
          <p className="mt-4 text-body-sub font-semibold text-[#64748B]">
            {pendingParticipants.length} waiting for player response.
          </p>
        ) : null}
      </section>
    </div>
  )
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8] sm:text-[12px]">
        {label}
      </h3>
      <span className="text-[11px] font-medium text-[#CBD5E1] sm:text-[12px]">{count}</span>
      <span className="h-px flex-1 bg-[#E2E8F0]" />
    </div>
  )
}

type CalendarEntry = {
  id: string
  dateKey: string
  timeLabel: string
  sortStamp: string
  sportLabel: string
  sportKey: string
  organizerName: string
  startMinutes: number
  endMinutes: number
  tone: 'green' | 'amber' | 'blue' | 'slate'
  hasConflict?: boolean
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function startOfWeek(date: Date): Date {
  const next = new Date(date)
  const day = next.getDay()
  next.setHours(12, 0, 0, 0)
  next.setDate(next.getDate() - day)
  return next
}

function startOfCalendarDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(12, 0, 0, 0)
  return next
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCalendarHeading(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatCalendarRangeHeading(days: Date[]): string {
  const start = days[0]
  const end = days[days.length - 1]
  if (!start || !end) return ''

  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(start)
    return `${month} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`
  }

  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (start.getFullYear() === end.getFullYear()) {
    return `${monthDay.format(start)}-${monthDayYear.format(end)}`
  }

  return `${monthDayYear.format(start)}-${monthDayYear.format(end)}`
}

function formatCalendarDayLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
  }).format(date)
}

function formatCalendarDayNumber(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
  }).format(date)
}

function getCalendarSportKey(label: string | null | undefined): string {
  return (label ?? '').trim().toLowerCase()
}

function SportGlyph({ sportKey }: { sportKey: string }) {
  if (sportKey.includes('tennis')) {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true">
        <circle cx="10" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.2 5.2l5.6 5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12.8 10.8l5.3 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17.1 15.1l1.7 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  if (sportKey.includes('pickleball')) {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true">
        <path
          d="M8 4.5c0-1.1.9-2 2-2h2.3a3.2 3.2 0 0 1 3.2 3.2v7.5a4.5 4.5 0 1 1-9 0V6.8A2.3 2.3 0 0 1 8.8 4.5H8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="7.5" r="0.8" fill="currentColor" />
        <circle cx="13.8" cy="7.5" r="0.8" fill="currentColor" />
        <circle cx="11" cy="10.4" r="0.8" fill="currentColor" />
        <circle cx="13.8" cy="10.4" r="0.8" fill="currentColor" />
        <path d="M12 17.8v3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return <span className="inline-block h-2 w-2 rounded-full bg-[#94A3B8]" aria-hidden="true" />
}

function formatEventTimeLabel(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  if (minutes === 0) return `${hours12} ${suffix}`
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function formatCalendarRangeLabel(startMinutes: number, endMinutes: number): string {
  const startFull = formatEventTimeLabel(startMinutes)
  const endFull = formatEventTimeLabel(endMinutes)
  const startSuffix = startFull.endsWith('PM') ? 'PM' : 'AM'
  const endSuffix = endFull.endsWith('PM') ? 'PM' : 'AM'

  if (startSuffix === endSuffix) {
    return `${startFull.replace(/ (AM|PM)$/, '')}-${endFull}`
  }

  return `${startFull}-${endFull}`
}

function getCalendarTiming(item: MatchListItem): { startMinutes: number; endMinutes: number; timeLabel: string } {
  const durationMinutes = Math.max(item.match.duration_minutes ?? 60, 30)

  if (item.match.start_time) {
    const [hour, minute] = item.match.start_time.slice(0, 5).split(':').map(Number)
    const startMinutes = Math.max(0, hour * 60 + minute)
    const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60)
    return {
      startMinutes,
      endMinutes,
      timeLabel: formatCalendarRangeLabel(startMinutes, endMinutes),
    }
  }

  if (item.match.start_at_utc) {
    const startDate = new Date(item.match.start_at_utc)
    const startMinutes = Math.max(0, startDate.getHours() * 60 + startDate.getMinutes())
    const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60)
    return {
      startMinutes,
      endMinutes,
      timeLabel: formatCalendarRangeLabel(startMinutes, endMinutes),
    }
  }

  return {
    startMinutes: 0,
    endMinutes: durationMinutes,
    timeLabel: 'Time TBD',
  }
}

function markCalendarConflicts(entries: CalendarEntry[]): CalendarEntry[] {
  const conflictIds = new Set<string>()
  const byDate = new Map<string, CalendarEntry[]>()

  for (const entry of entries) {
    const bucket = byDate.get(entry.dateKey) ?? []
    bucket.push(entry)
    byDate.set(entry.dateKey, bucket)
  }

  for (const dayEntries of byDate.values()) {
    for (let leftIndex = 0; leftIndex < dayEntries.length; leftIndex += 1) {
      const left = dayEntries[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < dayEntries.length; rightIndex += 1) {
        const right = dayEntries[rightIndex]
        if (left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes) {
          conflictIds.add(left.id)
          conflictIds.add(right.id)
        }
      }
    }
  }

  return entries.map((entry) => ({
    ...entry,
    hasConflict: conflictIds.has(entry.id),
  }))
}

function WeeklyCalendar({
  items,
  userId,
  rangeMode = 'week',
  hourHeight = 34,
  compact = false,
}: {
  items: MatchListItem[]
  userId: string
  rangeMode?: 'week' | 'rolling8'
  hourHeight?: number
  compact?: boolean
}) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()))
  const rollingAnchor = useMemo(() => startOfCalendarDay(new Date()), [])
  const nowIso = useMemo(() => new Date().toISOString(), [])
  const calendarStart = rangeMode === 'rolling8' ? rollingAnchor : weekAnchor
  const visibleDayCount = rangeMode === 'rolling8' ? 8 : 7

  const calendarDays = useMemo(
    () => Array.from({ length: visibleDayCount }, (_, index) => addDays(calendarStart, index)),
    [calendarStart, visibleDayCount],
  )

  const entries = useMemo(() => {
    const upcoming = items
      .filter((item) => {
        if (item.match.status === 'cancelled') return false
        if (item.myParticipant?.status === 'removed') return false

        const past = isPast(item, nowIso)
        if (past && !item.isFormed) return false

        if (item.myParticipant) return true
        return item.match.organizer_id === userId
      })
      .map((item): CalendarEntry | null => {
        const matchDate = item.match.match_date
          ? parseDateOnly(item.match.match_date)
          : item.match.start_at_utc
            ? new Date(item.match.start_at_utc)
            : null
        if (!matchDate) return null

        const timing = getCalendarTiming(item)
        const participants = getSafeParticipants(item)
        const organizerParticipant =
          participants.find((participant) => participant.user_id === item.match.organizer_id)
          ?? participants[0]
        const tone: CalendarEntry['tone'] = isPast(item, nowIso)
          ? 'slate'
          : item.myParticipant?.status === 'pending'
            ? 'amber'
            : item.isFormed
              ? 'green'
              : 'blue'

        return {
          id: item.match.id,
          dateKey: item.match.match_date ?? toDateKey(matchDate),
          timeLabel: timing.timeLabel,
          sortStamp: item.match.start_at_utc ?? `${item.match.match_date ?? toDateKey(matchDate)}T${item.match.start_time ?? '23:59:59'}`,
          sportLabel: item.sportName ?? 'Match',
          sportKey: getCalendarSportKey(item.sportName),
          organizerName: organizerParticipant?.display_name ?? 'Host',
          startMinutes: timing.startMinutes,
          endMinutes: timing.endMinutes,
          tone,
        }
      })
      .filter((entry): entry is CalendarEntry => Boolean(entry))

    upcoming.sort((left, right) => left.sortStamp.localeCompare(right.sortStamp))
    return markCalendarConflicts(upcoming)
  }, [items, nowIso, userId])

  const entryMap = useMemo(() => {
    const next = new Map<string, CalendarEntry[]>()
    for (const entry of entries) {
      const bucket = next.get(entry.dateKey) ?? []
      bucket.push(entry)
      next.set(entry.dateKey, bucket)
    }
    return next
  }, [entries])

  const heading = rangeMode === 'rolling8'
    ? formatCalendarRangeHeading(calendarDays)
    : formatCalendarHeading(weekAnchor)
  const todayKey = toDateKey(new Date())
  const visibleStartMinutes = 7 * 60
  const visibleEndMinutes = 22 * 60
  const visibleHourCount = (visibleEndMinutes - visibleStartMinutes) / 60
  const hourTicks = Array.from({ length: visibleHourCount + 1 }, (_, index) => visibleStartMinutes + index * 60)
  const calendarHeight = hourHeight * visibleHourCount
  const timeColumnWidth = compact ? 42 : 52
  const calendarGridTemplate = `${timeColumnWidth}px repeat(${calendarDays.length}, minmax(0, 1fr))`

  return (
    <section
      className={
        compact
          ? 'rounded-[22px] border border-[#E2E8F0] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)]'
          : 'rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-label text-[#94A3B8]">Match Calendar</p>
          <h3 className="text-h2 mt-2 tracking-tight text-[#1E293B]">{heading}</h3>
        </div>
        {rangeMode === 'week' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekAnchor(startOfWeek(new Date()))}
              className="text-body-sub rounded-full border border-[#D7DEE7] bg-white px-4 py-2 font-semibold text-[#1E293B] transition hover:border-[#0d6efd] hover:text-[#0d6efd]"
            >
              Today
            </button>
            <button
              onClick={() => setWeekAnchor((current) => addDays(current, -7))}
              className="text-body-sub rounded-full border border-[#D7DEE7] bg-white px-3 py-2 font-semibold text-[#64748B] transition hover:border-[#0d6efd] hover:text-[#0d6efd]"
              aria-label="Previous week"
            >
              {'<'}
            </button>
            <button
              onClick={() => setWeekAnchor((current) => addDays(current, 7))}
              className="text-body-sub rounded-full border border-[#D7DEE7] bg-white px-3 py-2 font-semibold text-[#64748B] transition hover:border-[#0d6efd] hover:text-[#0d6efd]"
              aria-label="Next week"
            >
              {'>'}
            </button>
          </div>
        ) : null}
      </div>

      <div className={compact ? 'mt-4 w-full overflow-hidden' : 'mt-5 w-full overflow-hidden'}>
        <div className="w-full min-w-0">
          <div className="grid border-b border-[#E2E8F0]" style={{ gridTemplateColumns: calendarGridTemplate }}>
            <div className="border-r border-[#E2E8F0]" />
            {calendarDays.map((day) => {
              const dayKey = toDateKey(day)
              const isToday = dayKey === todayKey

              return (
                <div
                  key={dayKey}
                  className={compact ? 'border-r border-[#E2E8F0] px-1 pb-2 text-center' : 'border-r border-[#E2E8F0] px-2 pb-3'}
                >
                  <p className={compact ? 'text-[9px] font-bold uppercase leading-tight text-[#94A3B8]' : 'text-label text-[#94A3B8]'}>
                    {formatCalendarDayLabel(day)}
                  </p>
                  <div className={compact ? 'mt-1 flex justify-center' : 'mt-1'}>
                    <span
                      className={[
                        compact
                          ? 'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[13px] font-black leading-none'
                          : 'text-h2 inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2',
                        isToday ? 'bg-[#0d6efd] text-white' : 'text-[#1E293B]',
                      ].join(' ')}
                    >
                      {formatCalendarDayNumber(day)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid" style={{ gridTemplateColumns: calendarGridTemplate }}>
            <div className="relative border-r border-[#E2E8F0]" style={{ height: calendarHeight }}>
              {hourTicks.map((minutes, index) => (
                <div
                  key={minutes}
                  className={
                    compact
                      ? 'absolute inset-x-0 flex -translate-y-1/2 justify-end pr-1.5 text-[9px] font-bold leading-none text-[#94A3B8]'
                      : 'text-label absolute inset-x-0 flex -translate-y-1/2 justify-end pr-2 text-[#94A3B8]'
                  }
                  style={{ top: index * hourHeight }}
                >
                  {formatEventTimeLabel(minutes)}
                </div>
              ))}
            </div>

            {calendarDays.map((day) => {
              const dayKey = toDateKey(day)
              const dayEntries = entryMap.get(dayKey) ?? []

              return (
                <div key={dayKey} className="relative border-r border-[#E2E8F0]" style={{ height: calendarHeight }}>
                  {hourTicks.map((minutes) => (
                    <div
                      key={`${dayKey}-${minutes}`}
                      className="absolute inset-x-0 border-t border-[#EEF2F7]"
                      style={{ top: ((minutes - visibleStartMinutes) / 60) * hourHeight }}
                    />
                  ))}

                  {dayEntries.map((entry) => {
                    const clampedStart = Math.max(entry.startMinutes, visibleStartMinutes)
                    const clampedEnd = Math.min(entry.endMinutes, visibleEndMinutes)

                    if (clampedEnd <= clampedStart) {
                      return null
                    }

                    const top = ((clampedStart - visibleStartMinutes) / 60) * hourHeight
                    const height = Math.max(((clampedEnd - clampedStart) / 60) * hourHeight, 20)

                    return (
                      <Link
                        key={entry.id}
                        href={`/dashboard?matchId=${entry.id}`}
                        title={entry.hasConflict ? 'Time conflict with another match' : undefined}
                        className={[
                          compact
                            ? 'absolute left-0.5 right-0.5 overflow-hidden rounded-[9px] border px-1 py-0.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:z-10 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]'
                            : 'absolute left-1 right-1 overflow-hidden rounded-[11px] border px-1.5 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:z-10 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]',
                          entry.hasConflict
                            ? 'border-[#FCA5A5] bg-[#FFF1F2]'
                            : entry.tone === 'green'
                              ? 'border-[#BBF7D0] bg-[#F0FDF4]'
                              : entry.tone === 'amber'
                                ? 'border-[#FED7AA] bg-[#eff6ff]'
                                : entry.tone === 'slate'
                                  ? 'border-[#CBD5E1] bg-[#F8FAFC]'
                                  : 'border-[#bfdbfe] bg-[#eff6ff]',
                        ].join(' ')}
                        style={{ top, height }}
                      >
                        {entry.hasConflict ? (
                          <>
                            <span className="absolute inset-y-0 left-0 w-1 bg-[#DC2626]" aria-hidden="true" />
                            <span
                              className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#DC2626] text-[10px] font-black leading-none text-white"
                              aria-label="Time conflict"
                            >
                              !
                            </span>
                          </>
                        ) : null}
                        <div className="flex min-w-0 items-center gap-1">
                          <SportGlyph sportKey={entry.sportKey} />
                          <p className={[
                            compact
                              ? 'truncate text-[9px] font-medium leading-tight text-[#475569] sm:text-[10px] sm:font-semibold'
                              : 'truncate text-[10px] font-semibold leading-tight text-[#1E293B]',
                            entry.hasConflict ? 'pr-4' : '',
                          ].join(' ')}>
                            {entry.organizerName}
                          </p>
                        </div>
                        <p className={[
                          'mt-0.5 leading-tight',
                          compact ? 'text-[9px] sm:text-[10px]' : 'text-[10px]',
                          entry.hasConflict ? 'font-semibold text-[#B91C1C]' : 'text-[#475569]',
                        ].join(' ')}>
                          {entry.timeLabel}
                        </p>
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

const PAGE_SIZE = 20

function getMobileDateParts(item: MatchListItem, venueTimezone?: string | null) {
  const dateSource = item.match.start_at_utc
    ? new Date(item.match.start_at_utc)
    : item.match.match_date
      ? new Date(`${item.match.match_date}T${item.match.start_time || '12:00'}:00`)
      : null

  if (!dateSource || Number.isNaN(dateSource.getTime())) {
    return { weekday: 'TBD', month: '', day: '' }
  }

  const weekday = new Intl.DateTimeFormat('en-CA', { weekday: 'short', timeZone: venueTimezone ?? 'UTC' }).format(dateSource).toUpperCase()
  const month = new Intl.DateTimeFormat('en-CA', { month: 'short', timeZone: venueTimezone ?? 'UTC' }).format(dateSource).toUpperCase()
  const day = new Intl.DateTimeFormat('en-CA', { day: 'numeric', timeZone: venueTimezone ?? 'UTC' }).format(dateSource)
  return { weekday, month, day }
}

function getMobileDateLabel(item: MatchListItem, venueTimezone?: string | null) {
  const { weekday, month, day } = getMobileDateParts(item, venueTimezone)
  if (weekday === 'TBD') return 'Date TBD'
  const formatPart = (value: string) => value ? `${value.charAt(0)}${value.slice(1).toLowerCase()}` : ''
  return [formatPart(weekday), formatPart(month), day].filter(Boolean).join(' ')
}

function getMobileTimeLabel(item: MatchListItem) {
  const raw = formatTimeWindow(
    item.match.start_at_utc,
    item.match.match_date,
    item.match.start_time,
    item.match.duration_minutes,
    item.venueTimezone ?? 'UTC',
  )

  if (!raw) return 'Time TBD'
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 1] : raw
}

function getOrganizerLabel(item: MatchListItem) {
  const organizer = getSafeParticipants(item).find((participant) => participant.user_id === item.match.organizer_id)
  return organizer?.display_name ?? 'Host'
}

function getMobileCompactCourtLabel(label: string | null | undefined) {
  const boardLabel = getBoardCourtLabel(label)
  if (!boardLabel || boardLabel === 'Court TBD') return null
  return boardLabel.replace(/^court\s+/i, 'CRT ')
}

function getMobileCompactStatusLabel(item: MatchListItem) {
  if (item.match.status === 'cancelled') return 'Cancelled'
  if (item.isFormed) return 'Formed'
  if (item.confirmedCount >= item.match.required_count) return 'Ready'
  return 'Open to Join'
}

function MobileMatchCard({
  item,
  cardWarning = null,
  primaryActionLabel,
  boardSection,
  showLeadingIcon = true,
  onViewed,
  onSelectMatch,
  isLoadingDetail = false,
}: {
  item: MatchListItem
  cardWarning?: MatchBoardCardWarning | null
  primaryActionLabel?: 'Find Players'
  boardSection?: MatchBoardSection
  showLeadingIcon?: boolean
  onViewed?: (matchId: string) => void
  onSelectMatch?: (matchId: string) => void
  isLoadingDetail?: boolean
}) {
  const hostLabel = getOrganizerLabel(item)
  const dateLabel = getMobileDateLabel(item, item.venueTimezone)
  const timeLabel = getMobileTimeLabel(item)
  const summaryCount = Math.max(item.confirmedCount - 1, 0)
  const compactCourtLabel = getMobileCompactCourtLabel(item.courtState.badgeLabel)
  const whenLabel = [dateLabel, timeLabel].filter(Boolean).join(' \u00b7 ')
  const venueLabel = item.venueName ?? 'Venue TBD'
  const statusLabel = boardSection === 'history' ? getMobileCompactStatusLabel(item) : null
  const statusLine = [
    statusLabel,
    `${item.confirmedCount}/${item.match.required_count}`,
    item.courtState.badgeLabel === 'Court TBD' ? 'Court TBD' : null,
    compactCourtLabel,
    `Host ${hostLabel}`,
    summaryCount > 0 ? `+${summaryCount}` : null,
  ].filter(Boolean).join(' \u00b7 ')
  const iconKind: MatchBoardIconKind = item.match.status === 'cancelled'
    ? 'cancelled'
    : cardWarning
      ? 'warning'
      : boardSection === 'looking-for' || primaryActionLabel
        ? 'looking'
        : item.isFormed
          ? 'formed'
          : 'upcoming'
  const detailsHref = `/dashboard?matchId=${item.match.id}`

  const handleSelect = () => {
    onViewed?.(item.match.id)
    onSelectMatch?.(item.match.id)
  }

  return (
    <article
      aria-busy={isLoadingDetail ? 'true' : undefined}
      className={[
        'min-h-[64px] rounded-[14px] border bg-white px-3 py-2 shadow-[0_7px_18px_rgba(15,23,42,0.045)] transition hover:border-[#D6DEE9]',
        isLoadingDetail
          ? 'border-[#0d6efd] ring-2 ring-[#BFDBFE]'
          : cardWarning
            ? 'border-[#FED7AA] bg-[#FFF7ED]'
            : 'border-[#E2E8F0]',
      ].join(' ')}
    >
      <div className="flex min-w-0 gap-2.5">
        {showLeadingIcon ? <MatchBoardStatusIcon kind={iconKind} size="mobile" /> : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex min-w-0 items-center text-[12px] font-black leading-4 text-[#1E293B]">
            <span className="shrink-0 whitespace-nowrap">{whenLabel}</span>
            <span className="px-1 text-[#CBD5E1]">&middot;</span>
            <span className="min-w-0 truncate text-[#334155]">{venueLabel}</span>
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[11px] font-extrabold leading-4 text-[#64748B]">{statusLine}</p>
            {!primaryActionLabel && !cardWarning ? (
              <Link
                href={detailsHref}
                onClick={handleSelect}
                className="shrink-0 text-[11px] font-extrabold leading-4 text-[#0d6efd]"
              >
                {isLoadingDetail ? 'Opening...' : 'Details ->'}
              </Link>
            ) : null}
          </div>
          {cardWarning ? (
            <p className="text-[11px] font-extrabold leading-4 text-[#DC2626]">
              {cardWarning.message}
            </p>
          ) : null}
        </div>
      </div>
      {primaryActionLabel || cardWarning ? (
        <div className={showLeadingIcon ? 'mt-1.5 flex flex-wrap items-center justify-end gap-2.5 pl-[42px]' : 'mt-1.5 flex flex-wrap items-center justify-end gap-2.5'}>
        {primaryActionLabel ? (
          <Link
            href={detailsHref}
            onClick={handleSelect}
            className="rounded-full bg-[#0d6efd] px-2.5 py-1 text-[11px] font-extrabold leading-4 text-white shadow-[0_6px_14px_rgba(13,110,253,0.16)]"
          >
            {primaryActionLabel}
          </Link>
        ) : null}
        <Link
          href={detailsHref}
          onClick={handleSelect}
          className="text-[11px] font-extrabold leading-4 text-[#0d6efd]"
        >
          {isLoadingDetail ? 'Opening...' : 'Details ->'}
        </Link>
        </div>
      ) : null}
    </article>
  )
}

interface Props {
  items: MatchListItem[]
  userId: string
  defaultVenueId?: string
  myPlayCities?: UserPlayCity[]
  venueSports?: VenueSport[]
  selectedMatchId?: string | null
  selectedMatchDetail?: ReactNode
  onCancelMatch?: (matchId: string) => Promise<void>
  onViewedMatch?: (matchId: string) => void
  dismissedAlertMatchIds?: Set<string>
  onDismissAlert?: (matchId: string) => void
  profileAvatarUrl?: string | null
  profileDisplayName?: string | null
  profileFirstName?: string | null
  profileLastName?: string | null
  starterCard?: {
    contactCount: number
    preferredFormat: StarterMatchFormat
    firstMatchCreated: boolean
    onPreferredFormatChange: (format: StarterMatchFormat) => void
    onDismiss: () => void
    onAddContact?: () => void
  } | null
  onParseScreenshots?: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts?: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
}

export function MatchesPanel({
  items,
  userId,
  defaultVenueId,
  myPlayCities = [],
  venueSports = [],
  selectedMatchId,
  selectedMatchDetail,
  onCancelMatch,
  onViewedMatch,
  dismissedAlertMatchIds,
  onDismissAlert,
  profileAvatarUrl,
  profileDisplayName,
  profileFirstName,
  profileLastName,
  starterCard,
  onParseScreenshots,
  onImportScreenshotContacts,
}: Props) {
  const [subTab, setSubTab] = useState<'upcoming' | 'calendar' | 'history'>('upcoming')
  const [mobileMainTab, setMobileMainTab] = useState<MobileMatchesMainTab>('my-matches')
  const [historyShown, setHistoryShown] = useState(PAGE_SIZE)
  const [createMatchExpanded, setCreateMatchExpanded] = useState(false)
  const [mobileCreateMounted, setMobileCreateMounted] = useState(false)
  const [mobileCreateExpandSignal, setMobileCreateExpandSignal] = useState(0)
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null)
  const effectiveSelectedMatchId = pendingMatchId ?? selectedMatchId ?? null
  const isMatchDetailLoading = Boolean(pendingMatchId)
  const hasActiveMatchSelection = Boolean(effectiveSelectedMatchId)
  const hasSelectedMatchDetail = Boolean(selectedMatchId && selectedMatchDetail)
  const pendingMatchItem = useMemo(
    () => pendingMatchId ? items.find((item) => item.match.id === pendingMatchId) ?? null : null,
    [items, pendingMatchId],
  )

  useEffect(() => {
    if (pendingMatchId && selectedMatchId === pendingMatchId && selectedMatchDetail) {
      setPendingMatchId(null)
    }
  }, [pendingMatchId, selectedMatchDetail, selectedMatchId])

  useEffect(() => {
    if (!pendingMatchId) return
    const timeoutId = window.setTimeout(() => {
      setPendingMatchId((current) => current === pendingMatchId ? null : current)
    }, 15000)
    return () => window.clearTimeout(timeoutId)
  }, [pendingMatchId])

  const handleSelectMatch = useCallback((matchId: string) => {
    if (matchId === selectedMatchId && selectedMatchDetail) return
    setPendingMatchId(matchId)
  }, [selectedMatchDetail, selectedMatchId])

  const handleCreateMatchAction = useCallback(() => {
    setMobileCreateMounted(true)
    setMobileCreateExpandSignal((value) => value + 1)
    window.setTimeout(() => {
      document.getElementById('mobile-create-match-inline')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }, [])

  const nowDate = useMemo(() => new Date(), [])
  const now = useMemo(() => nowDate.toISOString(), [nowDate])
  const nowMs = nowDate.getTime()
  const todayKey = useMemo(() => toDateKey(nowDate), [nowDate])
  const boardConflictIds = useMemo(() => getBoardConflictIds(items, userId, now), [items, now, userId])

  const { actionNeeded, incoming, lookingFor, removed, cancelled, history } = useMemo(() => {
    const actionNeeded: MatchListItem[] = []
    const incoming: MatchListItem[] = []
    const lookingFor: MatchListItem[] = []
    const removed: MatchListItem[] = []
    const cancelled: MatchListItem[] = []
    const history: MatchListItem[] = []

    for (const item of items) {
      const status = item.myParticipant?.status
      const isOrganizer = item.match.organizer_id === userId
      const dismissed = dismissedAlertMatchIds?.has(item.match.id) ?? false
      const cardWarning = getMatchBoardWarningForItem(item, userId, todayKey, nowMs, boardConflictIds)

      if (item.match.status === 'cancelled') {
        if (status && !isPast(item, now) && !dismissed) cancelled.push(item)
        else history.push(item)
      } else if (needsUserAction(item)) {
        if (item.match.status === 'active' && !isPast(item, now)) actionNeeded.push(item)
        else history.push(item)
      } else if (cardWarning || shouldLiveInMyMatches(item)) {
        if (isInboxItem(item, now)) incoming.push(item)
        else history.push(item)
      } else if (isOrganizer && isLookingForPlayersMatch(item, now)) {
        lookingFor.push(item)
      } else if (status === 'pending') {
        history.push(item)
      } else if (status === 'removed') {
        if (item.match.status === 'active' && !isPast(item, now) && !dismissed) removed.push(item)
        else history.push(item)
      } else if (status == null) {
        if (item.match.status === 'active' && !isPast(item, now)) {
          if (isOrganizer) incoming.push(item)
        }
      } else {
        history.push(item)
      }
    }

    history.sort((a, b) => (b.match.start_at_utc ?? '').localeCompare(a.match.start_at_utc ?? ''))

    return { actionNeeded, incoming, lookingFor, removed, cancelled, history }
  }, [boardConflictIds, dismissedAlertMatchIds, items, now, nowMs, todayKey, userId])

  const visibleCancelled = cancelled
  const visibleRemoved = removed
  const visibleActionNeeded = actionNeeded
  const visibleActionNeededCount = visibleActionNeeded.length + visibleCancelled.length + visibleRemoved.length
  const getCardWarning = useCallback(
    (item: MatchListItem) => getMatchBoardWarningForItem(item, userId, todayKey, nowMs, boardConflictIds),
    [boardConflictIds, nowMs, todayKey, userId],
  )
  const upcomingCount = visibleActionNeededCount + incoming.length + lookingFor.length

  const mobileMainTabBtn = (key: MobileMatchesMainTab, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setMobileMainTab(key)}
      className={[
        'min-h-11 min-w-0 rounded-[14px] border px-2 py-2 text-center text-[12px] font-black leading-tight transition',
        mobileMainTab === key
          ? 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd] shadow-[0_8px_18px_rgba(13,110,253,0.13)]'
          : 'border-[#E2E8F0] bg-white text-[#536783] hover:border-[#B8CCE5] hover:text-[#0F172A]',
      ].join(' ')}
      aria-pressed={mobileMainTab === key}
    >
      <span>{label}</span>
      <span className={mobileMainTab === key ? 'ml-1 text-[#0d6efd]/70' : 'ml-1 text-[#94A3B8]'}>
        {count}
      </span>
    </button>
  )

  const subTabBtn = (key: 'upcoming' | 'calendar' | 'history', label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setSubTab(key)}
      className={[
        'h-8 min-w-0 rounded-full px-2 text-[12px] font-bold transition sm:h-9 sm:px-3 sm:text-[13px]',
        subTab === key
          ? 'bg-[#0d6efd] text-white shadow-[0_8px_18px_rgba(13, 110, 253, 0.24)]'
          : 'text-[#64748B] hover:text-[#1E293B]',
      ].join(' ')}
    >
      {label}
      {typeof count === 'number' ? (
        <span className={subTab === key ? 'ml-1.5 text-white/70' : 'ml-1.5 text-[#94A3B8]'}>
          {count}
        </span>
      ) : null}
    </button>
  )

  const mobileSubTabs = mobileMainTab === 'my-matches' && !createMatchExpanded ? (
    <div className="sticky top-2 z-20 grid w-full grid-cols-3 rounded-full border border-[#E2E8F0] bg-white/95 p-1 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
      {subTabBtn('upcoming', 'Upcoming', upcomingCount)}
      {subTabBtn('calendar', 'Calendar')}
      {subTabBtn('history', 'History', history.length)}
    </div>
  ) : null

  const handleCreateExpandedChange = useCallback((expanded: boolean) => {
    setCreateMatchExpanded(expanded)
  }, [])

  const shouldRenderStarterCard = Boolean(
    starterCard
    && !hasActiveMatchSelection
    && starterCard.contactCount === 0
    && !starterCard.firstMatchCreated
    && items.length === 0,
  )
  const renderStarterCard = () => shouldRenderStarterCard && starterCard ? (
    <FirstMatchStarterCard
      onAddContact={starterCard.onAddContact}
      onDismiss={starterCard.onDismiss}
    />
  ) : null

  const selectedMatchContent = isMatchDetailLoading ? (
    hasSelectedMatchDetail ? (
      <SelectedMatchLoadingFrame>{selectedMatchDetail}</SelectedMatchLoadingFrame>
    ) : pendingMatchItem ? (
      <SelectedMatchLoadingFrame>
        <ProvisionalMatchDetailSummary item={pendingMatchItem} />
      </SelectedMatchLoadingFrame>
    ) : (
      <MatchDetailSkeleton />
    )
  ) : hasSelectedMatchDetail ? (
    selectedMatchDetail
  ) : null

  return (
    <div className="space-y-8">
      <div className="space-y-5 md:hidden">
        {!hasActiveMatchSelection ? (
          <>
            <section className="rounded-[20px] border border-[#E2E8F0] bg-white px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src="/playerhoods-brand-horizontal-cropped.png"
                    alt="PlayerHoods"
                    className="h-10 w-auto max-w-[170px] object-contain"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 17H9" />
                      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    </svg>
                    {visibleActionNeededCount > 0 ? (
                      <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#F97316]" />
                    ) : null}
                  </span>
                  <MobileProfileAvatar
                    avatarUrl={profileAvatarUrl}
                    displayName={profileDisplayName}
                    firstName={profileFirstName}
                    lastName={profileLastName}
                  />
                </div>
              </div>
            </section>

            {renderStarterCard()}

            <section className="rounded-[24px] border border-[#E2E8F0] bg-white px-4 py-4 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
              <h1 className="text-h1 text-[#1E293B]">Matches</h1>

              <div className="mt-4 grid w-full grid-cols-[1.12fr_1fr_1fr] gap-2">
                <button
                  type="button"
                  onClick={handleCreateMatchAction}
                  className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[14px] border border-[#86EFAC] bg-[#ECFDF5]/90 px-2 py-2 text-center text-[12px] font-black leading-tight text-[#047857] shadow-[0_12px_24px_rgba(4,120,87,0.12)] transition hover:bg-[#D1FAE5]"
                >
                  <span className="text-[17px] leading-none">+</span>
                  <span>Create Match</span>
                </button>
                {mobileMainTabBtn('my-matches', 'My Matches', upcomingCount)}
                {mobileMainTabBtn('call-board', 'Call Board', lookingFor.length)}
              </div>

            </section>
            {mobileSubTabs}
          </>
        ) : null}

        {selectedMatchContent ? (
          <section className="space-y-4">
            {selectedMatchContent}
          </section>
        ) : mobileMainTab === 'call-board' ? (
          <section className="space-y-4">
            <SectionHeading label="Call Board" count={lookingFor.length} />
            {lookingFor.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[#D7E1EE] bg-white px-5 py-8 text-center text-body-main text-[#94A3B8]">
                No player calls right now.
              </div>
            ) : (
              <div className="space-y-4">
                {lookingFor.map((item) => (
                  <MobileMatchCard
                    key={`mobile-call-board-${item.match.id}`}
                    item={item}
                    cardWarning={getCardWarning(item)}
                    primaryActionLabel="Find Players"
                    boardSection="looking-for"
                    onViewed={onViewedMatch}
                    onSelectMatch={handleSelectMatch}
                    isLoadingDetail={pendingMatchId === item.match.id}
                  />
                ))}
              </div>
            )}
          </section>
        ) : subTab === 'upcoming' ? (
          <>
            {visibleActionNeededCount > 0 ? (
              <section className="space-y-2">
                <SectionHeading label="Action Needed" count={visibleActionNeededCount} />
                <div className="space-y-1.5">
                  {visibleActionNeeded.map((item) => (
                    <MatchRow
                      key={`mobile-action-${item.match.id}`}
                      item={item}
                      userId={userId}
                      detailItems={items}
                      onViewed={onViewedMatch}
                      onSelectMatch={handleSelectMatch}
                      variant="incoming"
                      boardSection="action-needed"
                      isSelected={effectiveSelectedMatchId === item.match.id}
                      isLoadingDetail={pendingMatchId === item.match.id}
                    />
                  ))}
                  {visibleCancelled.map((item) => (
                    <MatchRow
                      key={`mobile-cancelled-${item.match.id}`}
                      item={item}
                      userId={userId}
                      detailItems={items}
                      onViewed={onViewedMatch}
                      onSelectMatch={handleSelectMatch}
                      onDismissAlert={onDismissAlert}
                      showAcknowledge={isDismissibleAlert(item, now)}
                      variant="incoming"
                      boardSection="action-needed"
                      isSelected={effectiveSelectedMatchId === item.match.id}
                      isLoadingDetail={pendingMatchId === item.match.id}
                    />
                  ))}
                  {visibleRemoved.map((item) => (
                    <MatchRow
                      key={`mobile-removed-${item.match.id}`}
                      item={item}
                      userId={userId}
                      detailItems={items}
                      onViewed={onViewedMatch}
                      onSelectMatch={handleSelectMatch}
                      onDismissAlert={onDismissAlert}
                      showAcknowledge={isDismissibleAlert(item, now)}
                      variant="incoming"
                      boardSection="action-needed"
                      isSelected={effectiveSelectedMatchId === item.match.id}
                      isLoadingDetail={pendingMatchId === item.match.id}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <SectionHeading label="My Matches" count={incoming.length} />
                {incoming.length > 0 ? <span className="text-body-main font-bold text-[#0d6efd]">View all -&gt;</span> : null}
              </div>
              {incoming.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#D7E1EE] bg-white px-3 py-2.5 text-center text-[12px] font-semibold leading-4 text-[#94A3B8]">
                  No upcoming matches.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {incoming.map((item) => {
                    const cardWarning = getCardWarning(item)

                    return (
                      <MobileMatchCard
                        key={`mobile-incoming-${item.match.id}`}
                        item={item}
                        cardWarning={cardWarning}
                        primaryActionLabel={cardWarning?.kind === 'needs-players' ? 'Find Players' : undefined}
                        boardSection="my-matches"
                        onViewed={onViewedMatch}
                        onSelectMatch={handleSelectMatch}
                        isLoadingDetail={pendingMatchId === item.match.id}
                      />
                    )
                  })}
                </div>
              )}
            </section>

            {lookingFor.length > 0 ? (
              <section className="space-y-2">
                <SectionHeading label="Looking for Players" count={lookingFor.length} />
                <div className="space-y-1.5">
                  {lookingFor.map((item) => (
                    <MobileMatchCard
                      key={`mobile-looking-${item.match.id}`}
                      item={item}
                      cardWarning={getCardWarning(item)}
                      primaryActionLabel="Find Players"
                      boardSection="looking-for"
                      onViewed={onViewedMatch}
                      onSelectMatch={handleSelectMatch}
                      isLoadingDetail={pendingMatchId === item.match.id}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : subTab === 'calendar' ? (
          <section className="space-y-4">
            <WeeklyCalendar items={items} userId={userId} rangeMode="rolling8" hourHeight={28} compact />
          </section>
        ) : (
          <section className="space-y-4">
            <SectionHeading label="History" count={history.length} />
            {history.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[#D7E1EE] bg-white px-5 py-8 text-center text-body-main text-[#94A3B8]">
                No match history.
              </div>
            ) : (
              <div className="space-y-4">
                {history.slice(0, historyShown).map((item) => (
                  <MobileMatchCard
                    key={`mobile-history-${item.match.id}`}
                    item={item}
                    boardSection="history"
                    showLeadingIcon={false}
                    onViewed={onViewedMatch}
                    onSelectMatch={handleSelectMatch}
                    isLoadingDetail={pendingMatchId === item.match.id}
                  />
                ))}
                {historyShown < history.length ? (
                  <button
                    onClick={() => setHistoryShown((n) => n + PAGE_SIZE)}
                    className="text-body-main w-full rounded-full border border-[#E2E8F0] bg-white py-3 font-semibold text-[#64748B]"
                  >
                    Load more
                  </button>
                ) : null}
              </div>
            )}
          </section>
        )}

      </div>

      <div className="hidden space-y-8 md:block">
        {renderStarterCard()}
        <div
          className={[
            'grid items-start gap-6 transition-[grid-template-columns] duration-300',
              hasActiveMatchSelection
                ? 'lg:grid-cols-[minmax(720px,1.25fr)_minmax(500px,0.86fr)] xl:grid-cols-[minmax(820px,1.32fr)_minmax(520px,0.82fr)]'
                : createMatchExpanded
                ? 'lg:grid-cols-[minmax(520px,1fr)_minmax(400px,420px)] xl:grid-cols-[minmax(540px,1fr)_minmax(420px,440px)] 2xl:grid-cols-[minmax(640px,720px)_minmax(460px,520px)]'
                : 'lg:grid-cols-[minmax(430px,640px)_minmax(520px,1fr)]',
            ].join(' ')}
        >
          <section className="min-w-0">
            {isMatchDetailLoading ? (
              hasSelectedMatchDetail ? (
                <SelectedMatchLoadingFrame>{selectedMatchDetail}</SelectedMatchLoadingFrame>
              ) : pendingMatchItem ? (
                <SelectedMatchLoadingFrame>
                  <ProvisionalMatchDetailSummary item={pendingMatchItem} />
                </SelectedMatchLoadingFrame>
              ) : (
                <MatchDetailSkeleton />
              )
            ) : hasSelectedMatchDetail ? (
              selectedMatchDetail
            ) : (
            <CreateMatchInline
              defaultVenueId={defaultVenueId}
              onExpandedChange={handleCreateExpandedChange}
              myPlayCities={myPlayCities}
              venueSports={venueSports}
              onParseScreenshots={onParseScreenshots}
              onImportScreenshotContacts={onImportScreenshotContacts}
            />
            )}
          </section>

          <section className="min-w-0 rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-3">
              <div>
                <h2 className="text-h2 font-semibold tracking-tight text-[#0F172A]">Match Board</h2>
              </div>
              {!createMatchExpanded ? (
                <div className="grid grid-cols-3 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                  {subTabBtn('upcoming', 'Upcoming', upcomingCount)}
                  {subTabBtn('calendar', 'Calendar')}
                  {subTabBtn('history', 'History', history.length)}
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-5">
              {subTab === 'upcoming' ? (
                <>
                  {visibleActionNeededCount > 0 ? (
                    <section>
                      <SectionHeading label="Action Needed" count={visibleActionNeededCount} />
                      <div className="space-y-1">
                        {visibleActionNeeded.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onSelectMatch={handleSelectMatch}
                            variant="incoming"
                            boardSection="action-needed"
                            isSelected={effectiveSelectedMatchId === item.match.id}
                            isLoadingDetail={pendingMatchId === item.match.id}
                          />
                        ))}
                        {visibleCancelled.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onSelectMatch={handleSelectMatch}
                            onDismissAlert={onDismissAlert}
                            showAcknowledge={isDismissibleAlert(item, now)}
                            variant="incoming"
                            boardSection="action-needed"
                            isSelected={effectiveSelectedMatchId === item.match.id}
                            isLoadingDetail={pendingMatchId === item.match.id}
                          />
                        ))}
                        {visibleRemoved.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onSelectMatch={handleSelectMatch}
                            onDismissAlert={onDismissAlert}
                            showAcknowledge={isDismissibleAlert(item, now)}
                            variant="incoming"
                            boardSection="action-needed"
                            isSelected={effectiveSelectedMatchId === item.match.id}
                            isLoadingDetail={pendingMatchId === item.match.id}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section>
                    <SectionHeading label="My Matches" count={incoming.length} />
                    {incoming.length === 0 ? (
                      <div className="rounded-[14px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[12px] font-semibold leading-4 text-[#94A3B8]">
                        No upcoming matches.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {incoming.map((item) => {
                          const cardWarning = getCardWarning(item)
                          const isNeedsPlayersWarning = cardWarning?.kind === 'needs-players'

                          return (
                            <MatchRow
                              key={item.match.id}
                              item={item}
                              userId={userId}
                              detailItems={items}
                              onViewed={onViewedMatch}
                              onSelectMatch={handleSelectMatch}
                              variant="incoming"
                              boardSection="my-matches"
                              cardWarning={cardWarning}
                              showFindPlayersAction={isNeedsPlayersWarning}
                              showCancelMatchAction={isNeedsPlayersWarning && Boolean(onCancelMatch)}
                              onCancelMatch={onCancelMatch}
                              isSelected={effectiveSelectedMatchId === item.match.id}
                              isLoadingDetail={pendingMatchId === item.match.id}
                            />
                          )
                        })}
                      </div>
                    )}
                  </section>

                  {lookingFor.length > 0 ? (
                    <section>
                      <SectionHeading label="Looking for Players" count={lookingFor.length} />
                      <div className="space-y-1">
                        {lookingFor.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onSelectMatch={handleSelectMatch}
                            variant="incoming"
                            boardSection="looking-for"
                            showFindPlayersAction
                            cardWarning={getCardWarning(item)}
                            isSelected={effectiveSelectedMatchId === item.match.id}
                            isLoadingDetail={pendingMatchId === item.match.id}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : subTab === 'calendar' ? (
                <WeeklyCalendar items={items} userId={userId} />
              ) : (
                <section>
                  <SectionHeading label="History" count={history.length} />
                  {history.length === 0 ? (
                    <div className="text-body-main rounded-[20px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-5 text-[#94A3B8]">
                      No match history.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {history.slice(0, historyShown).map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onSelectMatch={handleSelectMatch}
                            variant="history"
                            isSelected={effectiveSelectedMatchId === item.match.id}
                            isLoadingDetail={pendingMatchId === item.match.id}
                          />
                        ))}
                      </div>
                      {historyShown < history.length ? (
                        <button
                          onClick={() => setHistoryShown((n) => n + PAGE_SIZE)}
                          className="text-body-main mt-4 w-full rounded-full border border-[#E2E8F0] py-2.5 font-semibold text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
                        >
                          Load more ({history.length - historyShown} remaining)
                        </button>
                      ) : null}
                    </>
                  )}
                </section>
              )}
            </div>
          </section>
        </div>
      </div>

      {!hasActiveMatchSelection && mobileCreateMounted ? (
        <div
          id="mobile-create-match-inline"
          className={createMatchExpanded ? 'md:hidden' : 'hidden'}
        >
          <CreateMatchInline
            defaultVenueId={defaultVenueId}
            expandSignal={mobileCreateExpandSignal}
            onExpandedChange={handleCreateExpandedChange}
            myPlayCities={myPlayCities}
            venueSports={venueSports}
            onParseScreenshots={onParseScreenshots}
            onImportScreenshotContacts={onImportScreenshotContacts}
          />
        </div>
      ) : null}
    </div>
  )
}
