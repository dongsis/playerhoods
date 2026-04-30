'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MatchListItem } from '@/lib/api/matches'
import { acceptMatchInvite } from '@/lib/api/matches'
import { ContactPlayerMark } from '@/app/components/ContactPlayerMark'
import { HostPlayerMark } from '@/app/components/HostPlayerMark'
import { ParticipantDetailTrigger } from '@/app/components/ParticipantDetailTrigger'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatTimeWindow } from '@/lib/format-time'
import { getMatchParticipantRemovalCopy } from '@/lib/utils/match-participant-removal'
import { CreateMatchInline } from '@/app/matches/CreateMatchInline'

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
  const isNominated = mp.join_method === 'nominated'
  const isRequested = mp.join_method === 'requested'

  if ((isInvited || isNominated) && !hasUserAccepted) return true
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
                    className="min-w-0 max-w-full text-left transition hover:text-[#C25E46]"
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
                        <span className={participant.user_id === organizerId ? 'truncate font-semibold text-[#0F172A]' : 'truncate'}>
                          {participant.display_name}
                        </span>
                        {participant.user_id === organizerId ? (
                          <HostPlayerMark className="h-6 w-6 shrink-0 text-[11px]" />
                        ) : null}
                        </span>
                      </span>
                    </span>
                  </ParticipantDetailTrigger>
                </span>
              ))}
              {overflow ? <span className="text-body-sub text-[#94A3B8]">{overflow}</span> : null}
            </>
          ) : (
            <span className="text-[#94A3B8]">No confirmed players yet</span>
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
}: {
  label: string
  tone: 'green' | 'amber' | 'blue' | 'red' | 'slate'
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-[#ECFDF5] text-[#22C55E] ring-[#DCFCE7]'
      : tone === 'blue'
        ? 'bg-[#EFF6FF] text-[#3B82F6] ring-[#DBEAFE]'
        : tone === 'red'
          ? 'bg-[#FEF2F2] text-[#EF4444] ring-[#FECACA]'
          : tone === 'slate'
            ? 'bg-[#F8FAFC] text-[#64748B] ring-[#E2E8F0]'
            : 'bg-[#FFF7ED] text-[#F97316] ring-[#FFEDD5]'

  return (
    <span className={`text-label inline-flex items-center rounded-full px-2.5 py-1 ring-1 ${toneClass}`}>
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
    participants,
    myParticipant,
    venueTimezone,
    venueName,
    sportName,
    courtState,
  } = item
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const normalizedSportName = (sportName ?? '').trim().toLowerCase()
  const showSportIcon = normalizedSportName.includes('tennis') || normalizedSportName.includes('pickleball')
  const compactRosterMeta = getCompactRosterMeta(item.rosterInsight.summaryLabel)
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
  const isNominated = myParticipant?.status === 'pending' && myParticipant.join_method === 'nominated'
  const isRequested = myParticipant?.status === 'pending' && myParticipant.join_method === 'requested'
  const needsReconfirmRequested = isRequested && myParticipant?.org_approved_at !== null && !hasUserAccepted
  const isCancelled = match.status === 'cancelled'
  const visibleRosterMeta = isOrganizer ? compactRosterMeta : []
  const hostRequestPrompt =
    isOrganizer && !isHistoryRow && !isCancelled && pendingRequestApprovals.length > 0
      ? `${pendingRequestApprovals.length} request${pendingRequestApprovals.length === 1 ? '' : 's'} to review`
      : null
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

      {!isHistoryRow && !isCancelled && (isInvited || (isNominated && !hasUserAccepted) || needsReconfirmRequested) ? (
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-label rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[#3B82F6] ring-1 ring-[#DBEAFE] whitespace-nowrap">
            {isNominated ? 'Invited' : isInvited ? 'Invited' : 'Needs confirm'}
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="text-body-sub whitespace-nowrap rounded-full bg-[#C25E46] px-3 py-1.5 font-semibold text-white hover:bg-[#aa503a] disabled:opacity-50"
          >
            {isPending ? '...' : 'Confirm'}
          </button>
          {confirmError ? <span className="text-body-sub text-[#EF4444]">{confirmError}</span> : null}
        </div>
      ) : null}

      {!isHistoryRow && !isCancelled && isNominated && hasUserAccepted ? (
        <span className="text-label shrink-0 rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[#3B82F6] ring-1 ring-[#DBEAFE] whitespace-nowrap">
          Invited and waiting for approval
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && isRequested && !needsReconfirmRequested ? (
        <span className="text-label shrink-0 rounded-full bg-[#FFF7ED] px-2.5 py-1 text-[#F97316] ring-1 ring-[#FFEDD5] whitespace-nowrap">
          Request pending
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && isRemoved ? (
        <span className="text-label shrink-0 rounded-full bg-[#FEF2F2] px-2.5 py-1 text-[#EF4444] ring-1 ring-[#FECACA] whitespace-nowrap">
          {removalCopy?.badgeLabel ?? 'No longer invited'}
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && myParticipant?.status === 'waiting_list' ? (
        <span className="text-label shrink-0 rounded-full bg-[#FFF7ED] px-2.5 py-1 text-[#F97316] ring-1 ring-[#FFEDD5] whitespace-nowrap">
          Waiting list
        </span>
      ) : null}

      {!isHistoryRow && !isCancelled && wasConfirmedByOther ? (
        <span className="text-label shrink-0 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[#22C55E] ring-1 ring-[#DCFCE7] whitespace-nowrap">
          You&apos;ve been confirmed by {confirmerName}
        </span>
      ) : null}

      {hostRequestPrompt ? (
        <span className="text-label shrink-0 rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[#2563EB] ring-1 ring-[#BFDBFE] whitespace-nowrap">
          {hostRequestPrompt}
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
          href={`/matches/${match.id}`}
          onClick={() => onViewed?.(match.id)}
          className="text-body-sub font-semibold text-[#1E293B] hover:text-[#C25E46] whitespace-nowrap"
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
      <h3 className="text-label text-[#94A3B8]">{label}</h3>
      <span className="text-body-sub text-[#CBD5E1]">{count}</span>
      <span className="h-px flex-1 bg-[#E2E8F0]" />
    </div>
  )
}

type CalendarEntry = {
  id: string
  dateKey: string
  startLabel: string
  sortStamp: string
  sportLabel: string
  sportKey: string
  organizerName: string
  organizerAvatarUrl: string | null
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

function CalendarHostAvatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  const initial = name.charAt(0).toUpperCase() || '?'

  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-white bg-[#5ca0a0] text-[8px] font-bold text-white shadow-sm"
      title={name}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  )
}

function formatEventStartLabel(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  if (minutes === 0) return `${hours12} ${suffix}`
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function getCalendarTiming(item: MatchListItem): { startMinutes: number; endMinutes: number; startLabel: string } {
  const durationMinutes = Math.max(item.match.duration_minutes ?? 60, 30)

  if (item.match.start_time) {
    const [hour, minute] = item.match.start_time.slice(0, 5).split(':').map(Number)
    const startMinutes = Math.max(0, hour * 60 + minute)
    const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60)
    return {
      startMinutes,
      endMinutes,
      startLabel: formatEventStartLabel(startMinutes),
    }
  }

  if (item.match.start_at_utc) {
    const startDate = new Date(item.match.start_at_utc)
    const startMinutes = Math.max(0, startDate.getHours() * 60 + startDate.getMinutes())
    const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60)
    return {
      startMinutes,
      endMinutes,
      startLabel: formatEventStartLabel(startMinutes),
    }
  }

  return {
    startMinutes: 0,
    endMinutes: durationMinutes,
    startLabel: 'TBD',
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
        const organizerParticipant =
          item.participants.find((participant) => participant.user_id === item.match.organizer_id)
          ?? item.participants[0]
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
          startLabel: timing.startLabel,
          sortStamp: item.match.start_at_utc ?? `${item.match.match_date ?? toDateKey(matchDate)}T${item.match.start_time ?? '23:59:59'}`,
          sportLabel: item.sportName ?? 'Match',
          sportKey: getCalendarSportKey(item.sportName),
          organizerName: organizerParticipant?.display_name ?? 'Host',
          organizerAvatarUrl: organizerParticipant?.avatar_url ?? null,
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
            className="text-body-sub rounded-full border border-[#D7DEE7] bg-white px-4 py-2 font-semibold text-[#1E293B] transition hover:border-[#C25E46] hover:text-[#C25E46]"
          >
            Today
          </button>
          <button
            onClick={() => setWeekAnchor((current) => addDays(current, -7))}
            className="text-body-sub rounded-full border border-[#D7DEE7] bg-white px-3 py-2 font-semibold text-[#64748B] transition hover:border-[#C25E46] hover:text-[#C25E46]"
            aria-label="Previous week"
          >
            {'<'}
          </button>
          <button
            onClick={() => setWeekAnchor((current) => addDays(current, 7))}
            className="text-body-sub rounded-full border border-[#D7DEE7] bg-white px-3 py-2 font-semibold text-[#64748B] transition hover:border-[#C25E46] hover:text-[#C25E46]"
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
                        isToday ? 'bg-[#2563EB] text-white' : 'text-[#1E293B]',
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
                  {formatEventStartLabel(minutes)}
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
                        href={`/matches/${entry.id}`}
                        className={[
                          'absolute left-1 right-1 overflow-hidden rounded-[11px] border px-1.5 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:z-10 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]',
                          entry.tone === 'green'
                            ? 'border-[#BBF7D0] bg-[#F0FDF4]'
                            : entry.tone === 'amber'
                              ? 'border-[#FED7AA] bg-[#FFF7ED]'
                              : entry.tone === 'slate'
                                ? 'border-[#CBD5E1] bg-[#F8FAFC]'
                                : 'border-[#BFDBFE] bg-[#EFF6FF]',
                        ].join(' ')}
                        style={{ top, height }}
                      >
                        <div className="flex items-center gap-1">
                          <SportGlyph sportKey={entry.sportKey} />
                          <CalendarHostAvatar name={entry.organizerName} avatarUrl={entry.organizerAvatarUrl} />
                        </div>
                        <p className="text-body-sub mt-0.5 text-[#475569]">
                          {entry.startLabel}
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

interface Props {
  items: MatchListItem[]
  userId: string
  defaultVenueId?: string
  onCancelMatch?: (matchId: string) => Promise<void>
  onViewedMatch?: (matchId: string) => void
  dismissedAlertMatchIds?: Set<string>
  onDismissAlert?: (matchId: string) => void
}

export function MatchesPanel({
  items,
  userId,
  defaultVenueId,
  onCancelMatch,
  onViewedMatch,
  dismissedAlertMatchIds,
  onDismissAlert,
}: Props) {
  const [subTab, setSubTab] = useState<'upcoming' | 'calendar' | 'history'>('upcoming')
  const [historyShown, setHistoryShown] = useState(PAGE_SIZE)

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
      onClick={() => setSubTab(key)}
      className={[
        'text-body-main rounded-full px-4 py-2 font-semibold transition',
        subTab === key
          ? 'bg-[#C25E46] text-white shadow-[0_8px_18px_rgba(194,94,70,0.24)]'
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

  return (
    <div className="space-y-8">
      <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div>
            <p className="text-label text-[#94A3B8]">Match Board</p>
            <h2 className="text-h2 mt-2 tracking-tight text-[#1E293B]">Upcoming, calendar and history</h2>
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

      <section className="pt-1">
        <CreateMatchInline defaultVenueId={defaultVenueId} />
      </section>

    </div>
  )
}
