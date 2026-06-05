'use client'

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MatchListItem } from '@/lib/api/matches'
import { acceptMatchInvite } from '@/lib/api/matches'
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
        <h2 className="text-[16px] font-black tracking-[-0.01em] text-[#0F172A]">Welcome to PlayerHoods</h2>
        <p className="mt-1 text-[13px] font-semibold leading-5 text-[#536783]">
          Add players you know, then create your first match.
        </p>

        <div className="mt-4">
          <button
            type="button"
            onClick={onAddContact}
            className="h-10 rounded-[10px] border border-[#D8E6F6] bg-white px-3 text-[13px] font-black text-[#0B2A5B] transition hover:border-[#B8CCE5] hover:bg-[#F8FBFF]"
          >
            + Add My Contact
          </button>
        </div>
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

type MatchRowProps = {
  item: MatchListItem
  userId?: string | null
  detailItems?: MatchListItem[]
  onViewed?: (matchId: string) => void
  onDismissAlert?: (matchId: string) => void
  showAcknowledge?: boolean
  showOverlapWarning?: boolean
  variant?: 'default' | 'incoming' | 'history'
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

function hasTimeConflictWithItems(item: MatchListItem, items: MatchListItem[] | undefined): boolean {
  if (!items || item.match.status === 'cancelled') return false
  const itemDate = item.match.match_date
  if (!itemDate) return false
  const itemTiming = getCalendarTiming(item)

  return items.some((other) => {
    if (other.match.id === item.match.id || other.match.status === 'cancelled') return false
    if (other.myParticipant?.status === 'removed') return false
    if (other.match.match_date !== itemDate) return false

    const otherTiming = getCalendarTiming(other)
    return itemTiming.startMinutes < otherTiming.endMinutes && otherTiming.startMinutes < itemTiming.endMinutes
  })
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

function MatchRow({
  item,
  userId = null,
  detailItems,
  onViewed,
  onDismissAlert,
  showAcknowledge = false,
  showOverlapWarning = false,
  variant = 'default',
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
  const [optimisticAccepted, setOptimisticAccepted] = useState(false)
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
      } catch (err: unknown) {
        setOptimisticAccepted(false)
        setConfirmError((err as { message?: string })?.message ?? 'Failed')
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
  const useCompactBoardRow = variant !== 'default' && !hasBoardAccessory
  const compactBoardMeta = [
    showOverlapWarning ? 'Overlaps' : null,
    compactBoardStatusLabel,
    playerCountLabel,
    compactBoardCourtLabel,
    participantPreview ?? 'No lineup players yet',
  ].filter(Boolean)

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
          ? 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 bg-white transition-colors'
          : 'flex items-center gap-3 bg-white transition-colors',
        isSelected
          ? 'rounded-[24px] border border-[#0d6efd] bg-[#eff6ff] px-4 py-4 shadow-[0_12px_30px_rgba(13,110,253,0.10)]'
          : variant !== 'default'
          ? 'rounded-[24px] border border-[#E2E8F0] px-4 py-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-[#CBD5E1]'
          : 'rounded-[24px] border border-[#E2E8F0] px-4 py-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-[#CBD5E1]',
      ].join(' ')}
    >
      <div className={[
        useCompactBoardRow
          ? 'col-span-2 min-w-0 text-body-sub font-semibold leading-snug text-[#64748B]'
          : variant !== 'default'
            ? 'w-40 shrink-0 text-body-main leading-snug text-[#64748B]'
            : 'w-36 shrink-0 text-body-sub leading-snug text-[#64748B]',
      ].join(' ')}>
        {useCompactBoardRow ? (
          <p className="truncate">
            {timeStr || <span className="italic">No time set</span>}
            {venueName ? (
              <>
                <span className="px-1 text-[#CBD5E1]">&middot;</span>
                <span>{venueName}</span>
              </>
            ) : null}
          </p>
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
        <div className={useCompactBoardRow ? 'min-w-0 self-center' : 'flex min-w-0 flex-1 flex-col gap-2'}>
          {useCompactBoardRow ? (
            <p className="truncate text-body-sub font-semibold text-[#64748B]">
              {compactBoardMeta.map((label, index) => (
                <span key={`${label}-${index}`}>
                  {index > 0 ? <span className="px-1 text-[#CBD5E1]">&middot;</span> : null}
                  <span>{label}</span>
                </span>
              ))}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {showSportIcon ? <InlineSportBadge sportName={sportName} /> : null}
                {showOverlapWarning ? <StatusBadge label="OVERLAPS" tone="red" /> : null}
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
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-label rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#0d6efd] ring-1 ring-[#dbeafe] whitespace-nowrap">
            {isParticipantInvite ? 'Invited' : isInvited ? 'Invited' : 'Needs confirm'}
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="text-body-sub whitespace-nowrap rounded-full bg-[#0d6efd] px-3 py-1.5 font-semibold text-white hover:bg-[#0b5ed7] disabled:opacity-50"
          >
            {isPending ? '...' : 'Confirm'}
          </button>
          {confirmError ? <span className="text-body-sub text-[#EF4444]">{confirmError}</span> : null}
        </div>
      ) : null}

      {!isHistoryRow && !isCancelled && isParticipantInvite && hasUserAccepted ? (
        <span className="text-label shrink-0 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#0d6efd] ring-1 ring-[#dbeafe] whitespace-nowrap">
          Invited and waiting for approval
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
          className="ph-request-glow text-label shrink-0 rounded-full bg-[#0d6efd] px-3 py-1.5 text-white ring-1 ring-[#93C5FD] whitespace-nowrap"
          title={`${hostRequestCount} request${hostRequestCount === 1 ? '' : 's'} to review`}
        >
          Request
        </span>
      ) : null}

      <div className={useCompactBoardRow ? 'row-start-2 col-start-2 flex items-center justify-end gap-3 self-center' : 'shrink-0 flex items-center gap-3'}>
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
            'text-body-sub inline-flex min-w-[5.4rem] items-center justify-end gap-1.5 whitespace-nowrap font-semibold transition',
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
      </div>
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

function ExpiryBanner({
  item,
  hoursLeft,
  onCancel,
}: {
  item: MatchListItem
  hoursLeft: number
  onCancel: (matchId: string) => Promise<void>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const { match, confirmedCount } = item
  const need = match.required_count - confirmedCount
  const h = Math.floor(hoursLeft)
  const m = Math.round((hoursLeft - h) * 60)
  const timeLabel = h > 0 ? `${h}h ${m}m` : `${m}m`

  const handleCancel = () => {
    startTransition(async () => {
      await onCancel(match.id)
      router.refresh()
    })
  }

  return (
    <div className="mx-1 flex items-center justify-between gap-3 rounded-b-[24px] border-x border-b border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5">
      <span className="text-body-sub text-[#EF4444]">
        Starts in <strong>{timeLabel}</strong> - still need {need} player{need !== 1 ? 's' : ''}
      </span>
      {confirming ? (
        <span className="flex items-center gap-2">
          <span className="text-body-sub font-medium text-[#b91c1c]">Cancel this match?</span>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="text-body-sub rounded-full bg-[#EF4444] px-3 py-1 font-semibold text-white hover:bg-[#dc2626] disabled:opacity-50"
          >
            {isPending ? '...' : 'Yes, cancel'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-body-sub rounded-full border border-[#E2E8F0] px-3 py-1 font-semibold text-[#64748B] hover:bg-white"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-body-sub font-semibold text-[#EF4444] hover:text-[#b91c1c] whitespace-nowrap"
        >
          Cancel match
        </button>
      )}
    </div>
  )
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
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
}: {
  items: MatchListItem[]
  userId: string
}) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()))
  const nowIso = useMemo(() => new Date().toISOString(), [])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekAnchor, index)),
    [weekAnchor],
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

  const heading = formatCalendarHeading(weekAnchor)
  const todayKey = toDateKey(new Date())
  const visibleStartMinutes = 7 * 60
  const visibleEndMinutes = 22 * 60
  const visibleHourCount = (visibleEndMinutes - visibleStartMinutes) / 60
  const hourTicks = Array.from({ length: visibleHourCount + 1 }, (_, index) => visibleStartMinutes + index * 60)
  const hourHeight = 34
  const calendarHeight = hourHeight * visibleHourCount

  return (
    <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-label text-[#94A3B8]">Match Calendar</p>
          <h3 className="text-h2 mt-2 tracking-tight text-[#1E293B]">{heading}</h3>
        </div>
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
      </div>

      <div className="mt-5 w-full overflow-hidden">
        <div className="w-full min-w-0">
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-[#E2E8F0]">
            <div className="border-r border-[#E2E8F0]" />
            {weekDays.map((day) => {
              const dayKey = toDateKey(day)
              const isToday = dayKey === todayKey

              return (
                <div key={dayKey} className="border-r border-[#E2E8F0] px-2 pb-3">
                  <p className="text-label text-[#94A3B8]">
                    {formatCalendarDayLabel(day)}
                  </p>
                  <div className="mt-1">
                    <span
                      className={[
                        'text-h2 inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2',
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

          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
            <div className="relative border-r border-[#E2E8F0]" style={{ height: calendarHeight }}>
              {hourTicks.map((minutes, index) => (
                <div
                  key={minutes}
                  className="text-label absolute inset-x-0 flex -translate-y-1/2 justify-end pr-2 text-[#94A3B8]"
                  style={{ top: index * hourHeight }}
                >
                  {formatEventTimeLabel(minutes)}
                </div>
              ))}
            </div>

            {weekDays.map((day) => {
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
                          'absolute left-1 right-1 overflow-hidden rounded-[11px] border px-1.5 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:z-10 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]',
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
                        <div className="flex items-center gap-1">
                          <SportGlyph sportKey={entry.sportKey} />
                          <p className={['text-[10px] font-semibold leading-tight text-[#1E293B]', entry.hasConflict ? 'pr-4' : ''].join(' ')}>
                            {entry.organizerName}
                          </p>
                        </div>
                        <p className={['mt-0.5 text-[10px] leading-tight', entry.hasConflict ? 'font-semibold text-[#B91C1C]' : 'text-[#475569]'].join(' ')}>
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

function MobileStatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'orange' | 'green' | 'blue' | 'red'
}) {
  const toneClass =
    tone === 'green'
      ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]'
      : tone === 'orange'
        ? 'border-[#F4C7B8] bg-[#eff6ff] text-[#0d6efd]'
        : tone === 'blue'
          ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#0d6efd]'
          : tone === 'red'
            ? 'border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]'
          : 'border-[#D7E1EE] bg-white text-[#64748B]'

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${toneClass}`}>
      {label}
    </span>
  )
}

function MobileMatchCard({
  item,
  userId,
  showOverlapWarning = false,
}: {
  item: MatchListItem
  userId: string
  showOverlapWarning?: boolean
}) {
  const { weekday, month, day } = getMobileDateParts(item, item.venueTimezone)
  const hostLabel = getOrganizerLabel(item)
  const timeLabel = getMobileTimeLabel(item)
  const courtBadgeTone =
    item.courtState.status === 'secured'
      ? 'green'
      : item.courtState.status === 'walk_in'
        ? 'blue'
        : 'orange'
  const summaryCount = Math.max(item.confirmedCount - 1, 0)
  const hostIsYou = item.match.organizer_id === userId

  return (
    <Link
      href={`/dashboard?matchId=${item.match.id}`}
      className="block rounded-[28px] border border-[#E2E8F0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition hover:border-[#D6DEE9]"
    >
      <div className="flex gap-4">
        <div className="flex h-[104px] w-[86px] shrink-0 flex-col items-center justify-center rounded-[24px] bg-[#F8FAFC] text-center">
          <span className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0d6efd]">{weekday}</span>
          <span className="mt-1 text-[14px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{month}</span>
          <span className="mt-1 text-[34px] font-black leading-none text-[#1E293B]">{day}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[28px] font-black leading-none tracking-[-0.03em] text-[#1E293B]">
                {item.sportName ?? 'Match'}
                {item.match.game_type ? (
                  <>
                    {' '}
                    <span className="font-black text-[#1E293B]">&middot;</span>{' '}
                    {item.match.game_type.charAt(0).toUpperCase() + item.match.game_type.slice(1)}
                  </>
                ) : null}
              </p>
              <p className="mt-2 text-[15px] font-bold tracking-[-0.02em] text-[#1E293B]">{timeLabel}</p>
              {item.venueName ? <p className="mt-1 text-body-main text-[#1E293B]">{item.venueName}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {showOverlapWarning ? <MobileStatusBadge label="OVERLAPS" tone="red" /> : null}
              <MobileStatusBadge
                label={item.isFormed ? 'Formed' : item.confirmedCount >= item.match.required_count ? 'Ready' : `${item.confirmedCount}/${item.match.required_count}`}
                tone={item.isFormed ? 'green' : item.confirmedCount >= item.match.required_count ? 'blue' : 'orange'}
              />
              <MobileStatusBadge label={item.courtState.badgeLabel} tone={courtBadgeTone} />
            </div>
          </div>

          <div className="mt-4 border-t border-[#E2E8F0] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#D7E1EE] bg-[#F8FAFC] text-[22px] font-medium text-[#5B718F]">
                    {hostLabel.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-title-main text-[#1E293B]">{hostLabel}</p>
                    <p className="mt-1 text-body-sub text-[#64748B]">
                      {hostIsYou ? 'Host' : 'Host'} ✓ {summaryCount > 0 ? ` | +${summaryCount} players` : ''}
                    </p>
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-[15px] font-extrabold tracking-[-0.02em] text-[#0d6efd]">
                {'Details ->'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
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
  const [historyShown, setHistoryShown] = useState(PAGE_SIZE)
  const [createMatchExpanded, setCreateMatchExpanded] = useState(false)
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

  const now = useMemo(() => new Date().toISOString(), [])

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

      if (item.match.status === 'cancelled') {
        if (status && !isPast(item, now) && !dismissed) cancelled.push(item)
        else history.push(item)
      } else if (needsUserAction(item)) {
        if (item.match.status === 'active' && !isPast(item, now)) actionNeeded.push(item)
        else history.push(item)
      } else if (shouldLiveInMyMatches(item)) {
        if (isInboxItem(item, now)) incoming.push(item)
        else history.push(item)
      } else if (status === 'pending') {
        if (isLookingForPlayersMatch(item, now)) lookingFor.push(item)
        else history.push(item)
      } else if (status === 'removed') {
        if (item.match.status === 'active' && !isPast(item, now) && !dismissed) removed.push(item)
        else history.push(item)
      } else if (status == null) {
        if (item.match.status === 'active' && !isPast(item, now)) {
          if (isOrganizer) incoming.push(item)
          else if (isLookingForPlayersMatch(item, now)) lookingFor.push(item)
        }
      } else if (isLookingForPlayersMatch(item, now)) {
        lookingFor.push(item)
      } else {
        history.push(item)
      }
    }

    history.sort((a, b) => (b.match.start_at_utc ?? '').localeCompare(a.match.start_at_utc ?? ''))

    return { actionNeeded, incoming, lookingFor, removed, cancelled, history }
  }, [dismissedAlertMatchIds, items, now, userId])

  const visibleCancelled = cancelled
  const visibleRemoved = removed
  const visibleActionNeeded = actionNeeded

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

  return (
    <div className="space-y-8">
      <div className="space-y-6 md:hidden">
        <section className="rounded-[24px] border border-[#E2E8F0] bg-white px-4 pb-4 pt-3 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img
                src="/playerhoods-brand-stacked-cropped.png"
                alt="PlayerHoods"
                className="h-8 w-32 object-contain"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 17H9" />
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                </svg>
                {(visibleActionNeeded.length + visibleCancelled.length + visibleRemoved.length) > 0 ? (
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

          <h1 className="text-h1 text-[#1E293B]">Matches</h1>

          {!createMatchExpanded ? (
            <div className="mt-4 grid w-full grid-cols-3 rounded-full border border-[#E2E8F0] bg-white p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              {subTabBtn('upcoming', 'Upcoming', incoming.length)}
              {subTabBtn('calendar', 'Calendar')}
              {subTabBtn('history', 'History', history.length)}
            </div>
          ) : null}
        </section>

        {renderStarterCard()}

        {subTab === 'upcoming' ? (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <SectionHeading label="My Matches" count={incoming.length} />
                {incoming.length > 0 ? <span className="text-body-main font-bold text-[#0d6efd]">View all -&gt;</span> : null}
              </div>
              {incoming.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-[#D7E1EE] bg-white px-5 py-8 text-center text-body-main text-[#94A3B8]">
                  No upcoming matches.
                </div>
              ) : (
                <div className="space-y-4">
                  {incoming.map((item) => (
                    <MobileMatchCard key={`mobile-incoming-${item.match.id}`} item={item} userId={userId} />
                  ))}
                </div>
              )}
            </section>

            {lookingFor.length > 0 ? (
              <section className="space-y-4">
                <SectionHeading label="Looking for Players" count={lookingFor.length} />
                <div className="space-y-4">
                  {lookingFor.map((item) => (
                    <MobileMatchCard key={`mobile-looking-${item.match.id}`} item={item} userId={userId} showOverlapWarning={hasTimeConflictWithItems(item, incoming)} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : subTab === 'calendar' ? (
          <section className="rounded-[28px] border border-[#E2E8F0] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <WeeklyCalendar items={items} userId={userId} />
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
                  <MobileMatchCard key={`mobile-history-${item.match.id}`} item={item} userId={userId} />
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
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
              <div>
                <h2 className="text-h2 font-semibold tracking-tight text-[#0F172A]">Match Board</h2>
              </div>
              {!createMatchExpanded ? (
                <div className="grid grid-cols-3 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                  {subTabBtn('upcoming', 'Upcoming', incoming.length)}
                  {subTabBtn('calendar', 'Calendar')}
                  {subTabBtn('history', 'History', history.length)}
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-8">
              {subTab === 'upcoming' ? (
                <>
                  {(visibleActionNeeded.length > 0 || visibleCancelled.length > 0 || visibleRemoved.length > 0) ? (
                    <section>
                      <SectionHeading
                        label="Action Needed"
                        count={
                          visibleActionNeeded.length
                          + visibleCancelled.length
                          + visibleRemoved.length
                        }
                      />
                      <div className="space-y-2">
                        {visibleActionNeeded.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onSelectMatch={handleSelectMatch}
                            variant="incoming"
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
                      <div className="text-body-main rounded-[20px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-5 text-[#94A3B8]">
                        No upcoming matches.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {incoming.map((item) => {
                          const isOrg = item.match.organizer_id === userId
                          const hoursLeft = item.match.start_at_utc
                            ? (new Date(item.match.start_at_utc).getTime() - Date.now()) / 3_600_000
                            : null
                          const expiring =
                            isOrg
                            && !item.isFormed
                            && hoursLeft !== null
                            && hoursLeft > 0
                            && hoursLeft < 12

                          return (
                            <div key={item.match.id}>
                              <MatchRow
                                item={item}
                                userId={userId}
                                detailItems={items}
                                onViewed={onViewedMatch}
                                onSelectMatch={handleSelectMatch}
                                variant="incoming"
                                isSelected={effectiveSelectedMatchId === item.match.id}
                                isLoadingDetail={pendingMatchId === item.match.id}
                              />
                              {expiring && onCancelMatch ? (
                                <ExpiryBanner item={item} hoursLeft={hoursLeft} onCancel={onCancelMatch} />
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>

                  {lookingFor.length > 0 ? (
                    <section>
                      <SectionHeading label="Looking for Players" count={lookingFor.length} />
                      <div className="space-y-2">
                        {lookingFor.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onSelectMatch={handleSelectMatch}
                            variant="incoming"
                            showOverlapWarning={hasTimeConflictWithItems(item, incoming)}
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

      <div className="md:hidden">
        <CreateMatchInline
          defaultVenueId={defaultVenueId}
          onExpandedChange={handleCreateExpandedChange}
          myPlayCities={myPlayCities}
          venueSports={venueSports}
          onParseScreenshots={onParseScreenshots}
          onImportScreenshotContacts={onImportScreenshotContacts}
        />
      </div>
    </div>
  )
}
