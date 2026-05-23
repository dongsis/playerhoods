'use client'

import { useCallback, useMemo, useState, useTransition, type ReactNode } from 'react'
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
  contactCount: number
  firstMatchCreated: boolean
  preferredFormat: StarterMatchFormat
  onPreferredFormatChange: (format: StarterMatchFormat) => void
  venueName?: string | null
  onAddContact?: () => void
  onStartMatch: () => void
  onDismiss: () => void
}

function StarterPlayingCircleIllustration({ count }: { count: number }) {
  const activeCount = Math.min(Math.max(count, 0), 4)
  return (
    <div className="relative h-28 w-28 shrink-0 rounded-[30px] border border-[#D7E6F7] bg-gradient-to-br from-[#F8FBFF] via-white to-[#EEF6FF] shadow-[0_18px_42px_rgba(37,99,235,0.10)]">
      <div className="absolute inset-x-5 bottom-5 h-10 rounded-[14px] border border-[#D8E6F6] bg-white/90 shadow-sm" />
      <div className="absolute inset-x-7 bottom-8 h-10 rounded-[14px] border border-[#D8E6F6] bg-white/95 shadow-sm" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#9BC2F4]" />
      {[
        'left-5 top-5',
        'right-5 top-5',
        'left-6 bottom-6',
        'right-6 bottom-6',
      ].map((position, index) => (
        <span
          key={position}
          className={[
            'absolute flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-black shadow-sm',
            position,
            index < activeCount ? 'bg-[#0d6efd] text-white' : 'bg-[#EAF2FC] text-[#8AA0BC]',
          ].join(' ')}
        >
          {index + 1}
        </span>
      ))}
      <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#D7F223] text-[#0B1F44] shadow-[0_10px_20px_rgba(215,242,35,0.28)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <path d="M7 8c3 1.8 7 1.8 10 0" />
          <path d="M7 16c3-1.8 7-1.8 10 0" />
        </svg>
      </span>
    </div>
  )
}

function FirstMatchStarterCard({
  contactCount,
  firstMatchCreated,
  onPreferredFormatChange,
  venueName,
  onAddContact,
  onStartMatch,
  onDismiss,
}: FirstMatchStarterCardProps) {
  const hasVenue = Boolean(venueName?.trim())
  const savedCount = Math.max(contactCount, 0)
  const progressTarget = savedCount >= 3 ? 3 : savedCount >= 1 ? 3 : 1
  const progress = Math.min(100, Math.round((Math.min(savedCount, progressTarget) / progressTarget) * 100))
  const state = savedCount >= 3 ? 'ready' : savedCount === 2 ? 'two' : savedCount === 1 ? 'one' : 'zero'

  const copy = (() => {
    if (firstMatchCreated) {
      return {
        kicker: 'Your local playing circle starts here.',
        title: 'Your first match is live',
        body: 'Keep inviting your saved players as your playing circle grows.',
        primary: 'Create Match',
        secondary: 'Add More Contacts',
        helper: 'Less chasing. More playing.',
      }
    }

    if (state === 'zero') {
      return {
        kicker: hasVenue ? `You're joining the ${venueName} playing community.` : "Glad you're here. Let's build your playing circle.",
        title: hasVenue ? `Welcome to your ${venueName} PlayerHood` : 'Welcome to PlayerHoods',
        body: hasVenue
          ? 'Start with someone you already play with here. Add them as a player card, then create your first match.'
          : 'Your PlayerHood starts with someone you already play with. Add one regular player as a player card to create your first match.',
        primary: '+ Add My Contact',
        secondary: 'Create Match',
        helper: hasVenue ? 'Private by default. You choose who to invite.' : 'Add 1 player for singles. Add 3 players for doubles.',
      }
    }

    if (state === 'one') {
      return {
        kicker: 'Your playing circle is taking shape.',
        title: 'Nice - your first player is saved',
        body: 'You can create a singles match now, or add two more players for doubles.',
        primary: 'Create Singles Match',
        secondary: 'Add 2 More for Doubles',
        helper: "You're always in control of who gets invited.",
      }
    }

    if (state === 'two') {
      return {
        kicker: 'Almost there.',
        title: 'Almost ready for doubles',
        body: 'Create a singles match now, or add one more player to start a doubles match.',
        primary: 'Create Singles Match',
        secondary: 'Add 1 More for Doubles',
        helper: "You're always in control of who gets invited.",
      }
    }

    return {
      kicker: 'Your playing circle is ready.',
      title: "You're ready to start playing",
      body: "Create a singles or doubles match from your saved players. We'll help handle invites and confirmations.",
      primary: 'Create Match',
      secondary: 'Add More Contacts',
      helper: 'Less chasing. More playing.',
    }
  })()

  const handlePrimary = () => {
    if (firstMatchCreated) {
      onStartMatch()
      return
    }
    if (state === 'zero') {
      onAddContact?.()
      return
    }
    if (state === 'one' || state === 'two') {
      onPreferredFormatChange('singles')
    }
    onStartMatch()
  }

  const handleSecondary = () => {
    onAddContact?.()
  }

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#D8E6F6] bg-white px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.06)] sm:px-7">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-full text-[22px] font-light leading-none text-[#94A3B8] transition hover:bg-[#F1F5F9] hover:text-[#1E293B]"
        aria-label="Dismiss starter card"
      >
        x
      </button>
      <div className="flex flex-col gap-5 pr-9 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7A8AA6]">{copy.kicker}</p>
          <h2 className="mt-2 text-h2 font-black tracking-[-0.03em] text-[#0F172A]">{copy.title}</h2>
          <p className="mt-2 max-w-2xl text-body-main leading-6 text-[#536783]">{copy.body}</p>

          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#7186A4]">
              <span>{Math.min(savedCount, progressTarget)} / {progressTarget} Player Card{progressTarget === 1 ? '' : 's'} Saved</span>
              {savedCount >= progressTarget ? <span className="text-[#16A34A]">Done</span> : null}
            </div>
            <div className="h-2 w-full max-w-[520px] overflow-hidden rounded-full bg-[#E7EEF7]">
              <div className="h-full rounded-full bg-[#22C55E]" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePrimary}
              className="rounded-[12px] bg-[#0B2A5B] px-5 py-3 text-body-main font-black text-white shadow-[0_12px_24px_rgba(11,42,91,0.18)] transition hover:bg-[#12386F]"
            >
              {copy.primary}
            </button>
            <button
              type="button"
              onClick={handleSecondary}
              disabled={state === 'zero' && !firstMatchCreated}
              className="rounded-[12px] border border-[#D8E6F6] bg-white px-5 py-3 text-body-main font-black text-[#536783] transition hover:border-[#B8CCE5] hover:text-[#0F172A] disabled:cursor-not-allowed disabled:bg-[#F8FBFF] disabled:text-[#AAB8CC]"
            >
              {copy.secondary}
            </button>
          </div>

          <p className="mt-3 text-body-sub font-semibold text-[#7A8AA6]">{copy.helper}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-4 sm:flex">
          <StarterPlayingCircleIllustration count={savedCount} />
        </div>
      </div>
    </section>
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
  variant?: 'default' | 'incoming' | 'history'
  showRosterNames?: boolean
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
  variant = 'default',
  showRosterNames = true,
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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmError, setConfirmError] = useState<string | null>(null)
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

  const hasUserAccepted = myParticipant?.participant_accepted_at != null
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
    const supabase = createSupabaseBrowserClient()
    startTransition(async () => {
      try {
        await acceptMatchInvite(supabase, match.id)
        router.refresh()
      } catch (err: unknown) {
        setConfirmError((err as { message?: string })?.message ?? 'Failed')
      }
    })
  }

  const rosterMeta = item.rosterInsight.summaryLabel ? item.rosterInsight.summaryLabel.split(' · ') : []

  const timeStr = formatTimeWindow(
    match.start_at_utc,
    match.match_date,
    match.start_time,
    match.duration_minutes,
    venueTimezone ?? 'UTC',
  )

  const statusBadge = isCancelled ? (
    <StatusBadge label="Match cancelled" tone="red" />
  ) : isHistoryRow && isPastMatch ? (
    <StatusBadge label={isFormed ? 'Played' : 'Past'} tone="slate" />
  ) : isFormed ? (
    <StatusBadge label="Formed" tone="green" />
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
        'flex items-center gap-3 bg-white transition-colors',
        variant !== 'default'
          ? 'rounded-[24px] border border-[#E2E8F0] px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-[#CBD5E1]'
          : 'rounded-[24px] border border-[#E2E8F0] px-4 py-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-[#CBD5E1]',
      ].join(' ')}
    >
      <div className={[variant !== 'default' ? 'w-40 text-body-main' : 'w-36 text-body-sub', 'shrink-0 leading-snug text-[#64748B]'].join(' ')}>
        {!showSportIcon && sportName ? (
          <div className="text-label mb-1 text-[#94A3B8]">
            {sportName}
          </div>
        ) : null}
        <div className="whitespace-nowrap">{timeStr || <span className="italic">No time set</span>}</div>
        {venueName ? <div className="truncate text-[#94A3B8]">{venueName}</div> : null}
      </div>

      {variant !== 'default' ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {showSportIcon ? <InlineSportBadge sportName={sportName} /> : null}
            {statusBadge}
            {courtBadge}
          </div>
          <ParticipantRosterSummary
            participants={participants}
            rosterMeta={visibleRosterMeta}
            confirmedCount={confirmedCount}
            organizerId={match.organizer_id}
            detailItems={detailItems}
            showMeta={isOrganizer}
          />
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

      <div className="shrink-0 flex items-center gap-3">
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
          onClick={() => onViewed?.(match.id)}
          className="text-body-sub font-semibold text-[#1E293B] hover:text-[#0d6efd] whitespace-nowrap"
        >
          Details →
        </Link>
      </div>
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
    return upcoming
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
                        className={[
                          'absolute left-1 right-1 overflow-hidden rounded-[11px] border px-1.5 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:z-10 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]',
                          entry.tone === 'green'
                            ? 'border-[#BBF7D0] bg-[#F0FDF4]'
                            : entry.tone === 'amber'
                              ? 'border-[#FED7AA] bg-[#eff6ff]'
                              : entry.tone === 'slate'
                                ? 'border-[#CBD5E1] bg-[#F8FAFC]'
                                : 'border-[#bfdbfe] bg-[#eff6ff]',
                        ].join(' ')}
                        style={{ top, height }}
                      >
                        <div className="flex items-center gap-1">
                          <SportGlyph sportKey={entry.sportKey} />
                          <p className="text-[10px] font-semibold leading-tight text-[#1E293B]">
                            {entry.organizerName}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[10px] leading-tight text-[#475569]">
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
  tone?: 'neutral' | 'orange' | 'green' | 'blue'
}) {
  const toneClass =
    tone === 'green'
      ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]'
      : tone === 'orange'
        ? 'border-[#F4C7B8] bg-[#eff6ff] text-[#0d6efd]'
        : tone === 'blue'
          ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#0d6efd]'
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
}: {
  item: MatchListItem
  userId: string
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
              <MobileStatusBadge label={item.isFormed ? 'Formed' : `${item.confirmedCount}/${item.match.required_count}`} tone={item.isFormed ? 'green' : 'orange'} />
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
  selectedMatchId?: string | null
  selectedMatchDetail?: ReactNode
  onCancelMatch?: (matchId: string) => Promise<void>
  onViewedMatch?: (matchId: string) => void
  dismissedAlertMatchIds?: Set<string>
  onDismissAlert?: (matchId: string) => void
  starterVenueName?: string | null
  starterCard?: {
    contactCount: number
    preferredFormat: StarterMatchFormat
    firstMatchCreated: boolean
    onPreferredFormatChange: (format: StarterMatchFormat) => void
    onDismiss: () => void
    onAddContact?: () => void
  } | null
}

export function MatchesPanel({
  items,
  userId,
  defaultVenueId,
  selectedMatchId,
  selectedMatchDetail,
  onCancelMatch,
  onViewedMatch,
  dismissedAlertMatchIds,
  onDismissAlert,
  starterVenueName,
  starterCard,
}: Props) {
  const [subTab, setSubTab] = useState<'upcoming' | 'calendar' | 'history'>('upcoming')
  const [historyShown, setHistoryShown] = useState(PAGE_SIZE)
  const [mobileCreateExpandSignal, setMobileCreateExpandSignal] = useState(0)
  const [desktopCreateExpanded, setDesktopCreateExpanded] = useState(false)
  const hasSelectedMatchDetail = Boolean(selectedMatchId && selectedMatchDetail)

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
  const mobileInitials = userId.slice(0, 2).toUpperCase()

  const subTabBtn = (key: 'upcoming' | 'calendar' | 'history', label: string, count?: number) => (
    <button
      onClick={() => setSubTab(key)}
      className={[
        'text-body-main rounded-full px-4 py-2 font-semibold transition',
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

  const openCreateMatch = () => {
    setMobileCreateExpandSignal((value) => value + 1)
    window.setTimeout(() => {
      document.getElementById('create-match-inline')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }
  const handleCreateExpandedChange = useCallback((expanded: boolean) => {
    setDesktopCreateExpanded(expanded)
  }, [])

  const renderStarterCard = () => starterCard ? (
    <FirstMatchStarterCard
      contactCount={starterCard.contactCount}
      firstMatchCreated={starterCard.firstMatchCreated}
      preferredFormat={starterCard.preferredFormat}
      onPreferredFormatChange={starterCard.onPreferredFormatChange}
      venueName={starterVenueName}
      onAddContact={starterCard.onAddContact}
      onStartMatch={openCreateMatch}
      onDismiss={starterCard.onDismiss}
    />
  ) : null

  return (
    <div className="space-y-8">
      <div className="space-y-6 md:hidden">
        <section className="rounded-[32px] border border-[#E2E8F0] bg-white px-5 pb-5 pt-4 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img
                src="/playerhoods-brand-stacked-cropped.png"
                alt="PlayerHoods"
                className="h-10 w-36 object-contain"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 17H9" />
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                </svg>
                {(visibleActionNeeded.length + visibleCancelled.length + visibleRemoved.length) > 0 ? (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#F97316]" />
                ) : null}
              </span>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1E3A6D] text-[18px] font-black text-white">
                {mobileInitials}
              </span>
            </div>
          </div>

          <h1 className="text-h1 text-[#1E293B]">Matches</h1>

          <div className="mt-5 inline-flex w-full rounded-full border border-[#E2E8F0] bg-white p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            {subTabBtn('upcoming', 'Upcoming', incoming.length)}
            {subTabBtn('calendar', 'Calendar')}
            {subTabBtn('history', 'History', history.length)}
          </div>
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

            <section className="space-y-4">
              <SectionHeading label="Looking for Players" count={lookingFor.length} />
              {lookingFor.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-[#D7E1EE] bg-white px-6 py-10 text-center shadow-[0_12px_30px_rgba(15,23,42,0.03)]">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC] text-[#94A3B8]">
                    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="9" cy="9" r="2.5" />
                      <circle cx="16.5" cy="10" r="2" />
                      <path d="M4.5 17c.8-2.4 2.7-3.5 4.5-3.5s3.7 1.1 4.5 3.5" />
                      <path d="M14 16.5c.5-1.7 1.8-2.5 3.3-2.5 1.2 0 2.3.5 3.2 1.6" />
                    </svg>
                  </div>
                  <p className="text-title-main text-[#1E293B]">No open matches right now.</p>
                  <p className="mt-2 text-body-main text-[#94A3B8]">Create a match or check back later.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lookingFor.map((item) => (
                    <MobileMatchCard key={`mobile-looking-${item.match.id}`} item={item} userId={userId} />
                  ))}
                </div>
              )}
            </section>
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

        <div className="sticky bottom-[5.3rem] z-20 px-1">
          <button
            type="button"
            onClick={openCreateMatch}
            className="flex w-full items-center justify-center gap-4 rounded-full bg-[#0d6efd] px-6 py-4 text-[17px] font-black uppercase tracking-[0.12em] text-white shadow-[0_24px_40px_rgba(13, 110, 253, 0.28)]"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[28px] font-medium leading-none text-[#0d6efd]">+</span>
            Create Match
          </button>
        </div>
      </div>

      <div className="hidden space-y-8 md:block">
        {renderStarterCard()}
        <div
          className={[
            'grid items-start gap-6 transition-[grid-template-columns] duration-300',
            hasSelectedMatchDetail
              ? 'lg:grid-cols-[minmax(720px,1.25fr)_minmax(500px,0.86fr)] xl:grid-cols-[minmax(820px,1.32fr)_minmax(520px,0.82fr)]'
              : desktopCreateExpanded
              ? 'lg:grid-cols-[minmax(680px,1.2fr)_minmax(430px,0.86fr)] xl:grid-cols-[minmax(760px,1.25fr)_minmax(500px,0.86fr)]'
              : 'lg:grid-cols-[minmax(430px,640px)_minmax(520px,1fr)]',
          ].join(' ')}
        >
          <section className="min-w-0">
            {hasSelectedMatchDetail ? (
              selectedMatchDetail
            ) : (
            <CreateMatchInline
              defaultVenueId={defaultVenueId}
              expandSignal={mobileCreateExpandSignal}
              onExpandedChange={handleCreateExpandedChange}
            />
            )}
          </section>

          <section className="min-w-0 rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
              <div>
                <h2 className="text-h2 font-semibold tracking-tight text-[#0F172A]">Match Board</h2>
              </div>
              <div className="inline-flex rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                {subTabBtn('upcoming', 'Upcoming', incoming.length)}
                {subTabBtn('calendar', 'Calendar')}
                {subTabBtn('history', 'History', history.length)}
              </div>
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
                            variant="incoming"
                          />
                        ))}
                        {visibleCancelled.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onDismissAlert={onDismissAlert}
                            showAcknowledge={isDismissibleAlert(item, now)}
                            variant="incoming"
                          />
                        ))}
                        {visibleRemoved.map((item) => (
                          <MatchRow
                            key={item.match.id}
                            item={item}
                            userId={userId}
                            detailItems={items}
                            onViewed={onViewedMatch}
                            onDismissAlert={onDismissAlert}
                            showAcknowledge={isDismissibleAlert(item, now)}
                            variant="incoming"
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
                              <MatchRow item={item} userId={userId} detailItems={items} onViewed={onViewedMatch} variant="incoming" />
                              {expiring && onCancelMatch ? (
                                <ExpiryBanner item={item} hoursLeft={hoursLeft} onCancel={onCancelMatch} />
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>

                  <section>
                    <SectionHeading label="Looking for Players" count={lookingFor.length} />
                    {lookingFor.length === 0 ? (
                      <div className="text-body-main rounded-[20px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-5 text-[#94A3B8]">
                        No open matches right now.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {lookingFor.map((item) => (
                          <MatchRow key={item.match.id} item={item} userId={userId} detailItems={items} variant="incoming" />
                        ))}
                      </div>
                    )}
                  </section>
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
                          <MatchRow key={item.match.id} item={item} userId={userId} detailItems={items} onViewed={onViewedMatch} variant="history" />
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
        <CreateMatchInline defaultVenueId={defaultVenueId} expandSignal={mobileCreateExpandSignal} />
      </div>
    </div>
  )
}
