'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MatchListItem } from '@/lib/api/matches'
import { acceptMatchInvite } from '@/lib/api/matches'
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

function shouldLiveInMyMatches(item: MatchListItem): boolean {
  const mp = item.myParticipant
  if (!mp) return false

  if (mp.status === 'confirmed' || mp.status === 'waiting_list') {
    return true
  }

  if (mp.status !== 'pending') {
    return false
  }

  if (needsUserAction(item)) {
    return false
  }

  return true
}

type MatchRowProps = {
  item: MatchListItem
  onViewed?: (matchId: string) => void
  onDismissAlert?: (matchId: string) => void
  showAcknowledge?: boolean
  variant?: 'default' | 'incoming'
  showRosterNames?: boolean
}

function toSportLabel(sportName: string | null): string | null {
  if (!sportName) return null
  return sportName
}

function ParticipantPreviewAvatar({
  displayName,
  avatarUrl,
  registered,
  zIndex,
}: {
  displayName: string
  avatarUrl: string | null
  registered: boolean
  zIndex: number
}) {
  const initial = displayName.charAt(0).toUpperCase() || '?'

  return (
    <div
      className={[
        'relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white text-[11px] font-bold shadow-sm',
        registered
          ? 'bg-[#5ca0a0] text-white'
          : 'border-dashed border-slate-300 bg-slate-100 text-slate-500',
      ].join(' ')}
      style={{ zIndex }}
      title={displayName}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}

function ParticipantRosterSummary({
  participants,
  rosterMeta,
  confirmedCount,
}: {
  participants: MatchListItem['participants']
  rosterMeta: string[]
  confirmedCount: number
}) {
  const confirmed = participants.filter((participant) => participant.status === 'confirmed')
  const visibleParticipants = confirmed.slice(0, 4)
  const overflow = confirmedCount > visibleParticipants.length ? ` +${confirmedCount - visibleParticipants.length}` : ''
  const metaLine = rosterMeta.join(' · ')

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex shrink-0 -space-x-2">
        {visibleParticipants.map((participant, index) => (
          <ParticipantPreviewAvatar
            key={participant.id}
            displayName={participant.display_name}
            avatarUrl={participant.avatar_url ?? null}
            registered={Boolean(participant.user_id)}
            zIndex={10 - index}
          />
        ))}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-700">
          {visibleParticipants.length > 0 ? (
            <>
              {visibleParticipants.map((participant) => (
                <span key={participant.id} className="inline-flex min-w-0 items-center gap-1">
                  <span className="truncate">{participant.display_name}</span>
                  {!participant.user_id ? (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Contact
                    </span>
                  ) : null}
                </span>
              ))}
              {overflow ? <span className="text-slate-400">{overflow}</span> : null}
            </>
          ) : (
            <span className="text-slate-400">No confirmed players yet</span>
          )}
        </div>
        {metaLine ? (
          <div className="truncate text-xs text-slate-400">{metaLine}</div>
        ) : null}
      </div>
    </div>
  )
}

function MatchRow({
  item,
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

  const hasUserAccepted = myParticipant?.participant_accepted_at != null
  const isInvited = myParticipant?.status === 'pending' && myParticipant.join_method === 'invited'
  const isNominated = myParticipant?.status === 'pending' && myParticipant.join_method === 'nominated'
  const isRequested = myParticipant?.status === 'pending' && myParticipant.join_method === 'requested'
  const needsReconfirmRequested = isRequested && myParticipant?.org_approved_at !== null && !hasUserAccepted
  const isCancelled = match.status === 'cancelled'
  const isRemoved = myParticipant?.status === 'removed'
  const wasConfirmedByOther =
    myParticipant?.status === 'confirmed' &&
    !!myParticipant.manual_confirmed_by &&
    myParticipant.manual_confirmed_by !== myParticipant.user_id
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

  const confirmed = participants.filter(p => p.status === 'confirmed')
  const names = confirmed.slice(0, 4).map(p => p.display_name)
  const overflow = confirmedCount > 4 ? ` +${confirmedCount - 4}` : ''
  const rosterMeta: string[] = item.rosterInsight.summaryLabel ? item.rosterInsight.summaryLabel.split(' · ') : []
  const parts: string[] = []
  if (names.length > 0) parts.push(names.join(', ') + overflow)
  if (item.rosterInsight.summaryLabel) parts.push(item.rosterInsight.summaryLabel)
  const roster = parts.join(' · ') || '—'
  const rosterPeopleLine = names.length > 0 ? names.join(', ') + overflow : 'No confirmed players yet'
  const rosterNeedLine = item.rosterInsight.neededLabel
  const rosterDetailLine = rosterNeedLine ? `${rosterPeopleLine} · ${rosterNeedLine}` : rosterPeopleLine

  const timeStr = formatTimeWindow(
    match.start_at_utc,
    match.match_date,
    match.start_time,
    match.duration_minutes,
    venueTimezone ?? 'UTC',
  )
  const sportLabel = toSportLabel(sportName)

  const statusBadge = isCancelled ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      Match cancelled
    </span>
  ) : isFormed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Formed
    </span>
  ) : (
    <span
      className={[
        'inline-flex items-center rounded-full bg-amber-100 text-amber-700',
        variant === 'incoming' ? 'px-2.5 py-0.5 text-[13px] font-semibold' : 'px-2 py-0.5 text-xs font-medium',
      ].join(' ')}
    >
      {confirmedCount}/{match.required_count}
    </span>
  )

  const courtBadge = !isCancelled ? (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        courtState.status === 'secured'
          ? 'bg-emerald-100 text-emerald-700'
          : courtState.status === 'walk_in'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-amber-100 text-amber-700',
      ].join(' ')}
    >
      {courtState.badgeLabel}
    </span>
  ) : null

  return (
    <div
      className={[
        'flex items-center gap-3 bg-white transition-colors',
        variant === 'incoming'
          ? 'rounded-[22px] border border-slate-200 px-4 py-3.5 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.32)] hover:border-slate-300'
          : 'rounded-2xl border border-gray-100 px-4 py-3 hover:border-gray-200',
      ].join(' ')}
    >
      <div
        className={[
          'shrink-0 leading-snug',
          variant === 'incoming' ? 'w-32 text-[13px] text-slate-500' : 'w-28 text-xs text-gray-400',
        ].join(' ')}
      >
        {sportLabel && (
          <div className={variant === 'incoming' ? 'mb-1 font-medium text-slate-700' : 'mb-1 font-medium text-gray-600'}>
            {sportLabel}
          </div>
        )}
        {timeStr || <span className="italic">No time set</span>}
        {venueName && (
          <div className={variant === 'incoming' ? 'truncate text-slate-300' : 'truncate text-gray-300'}>
            {venueName}
          </div>
        )}
      </div>

      {variant === 'incoming' ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
            {courtBadge}
          </div>
          <ParticipantRosterSummary
            participants={participants}
            rosterMeta={rosterMeta}
            confirmedCount={confirmedCount}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {statusBadge}
          {courtBadge}
          <div className="min-w-0 flex-1">
            {showRosterNames ? (
              <ParticipantRosterSummary
                participants={participants}
                rosterMeta={rosterMeta}
                confirmedCount={confirmedCount}
              />
            ) : rosterMeta.length > 0 ? (
              <span className="truncate text-sm text-gray-600">
                {rosterMeta.map((label, index) => (
                  <Fragment key={label}>
                    {index > 0 && <span className="px-1 text-gray-300">&middot;</span>}
                    <span>{label}</span>
                  </Fragment>
                ))}
              </span>
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
          </div>
        </div>
      )}

      {!isCancelled && (isInvited || (isNominated && !hasUserAccepted) || needsReconfirmRequested) && (
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs text-blue-600 font-medium whitespace-nowrap">
            {isNominated ? 'Invited' : isInvited ? 'Invited' : 'Needs confirm'}
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="px-2.5 py-0.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {isPending ? '...' : 'Confirm'}
          </button>
          {confirmError && <span className="text-xs text-red-500">{confirmError}</span>}
        </div>
      )}

      {!isCancelled && isNominated && hasUserAccepted && (
        <span className="shrink-0 text-xs text-blue-600 font-medium whitespace-nowrap">
          Invited and waiting for approval
        </span>
      )}

      {!isCancelled && isRequested && !needsReconfirmRequested && (
        <span className="shrink-0 text-xs text-amber-600 font-medium whitespace-nowrap">
          Awaiting approval
        </span>
      )}

      {!isCancelled && isRemoved && (
        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 whitespace-nowrap">
          {removalCopy?.badgeLabel ?? 'No longer invited'}
        </span>
      )}

      {!isCancelled && myParticipant?.status === 'waiting_list' && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          Waiting list
        </span>
      )}

      {!isCancelled && wasConfirmedByOther && (
        <span className="shrink-0 text-xs font-medium text-emerald-700 whitespace-nowrap">
          You&apos;ve been confirmed by {confirmerName}
        </span>
      )}

      <div className="shrink-0 flex items-center gap-3">
        {showAcknowledge && onDismissAlert && (
          <button
            onClick={() => onDismissAlert(match.id)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap"
          >
            Dismiss
          </button>
        )}
        <Link
          href={`/matches/${match.id}`}
          onClick={() => onViewed?.(match.id)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
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
    <div className="mx-1 flex items-center justify-between gap-3 rounded-b-2xl border-x border-b border-red-100 bg-red-50 px-4 py-2">
      <span className="text-xs text-red-600">
        Starts in <strong>{timeLabel}</strong> - still need {need} player{need !== 1 ? 's' : ''}
      </span>
      {confirming ? (
        <span className="flex items-center gap-2">
          <span className="text-xs font-medium text-red-700">Cancel this match?</span>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? '...' : 'Yes, cancel'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-red-600 hover:text-red-800 whitespace-nowrap"
        >
          Cancel match
        </button>
      )}
    </div>
  )
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</h3>
      <span className="text-xs text-gray-300">{count}</span>
    </div>
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
  const [subTab, setSubTab] = useState<'upcoming' | 'history'>('upcoming')
  const [historyShown, setHistoryShown] = useState(PAGE_SIZE)

  const now = useMemo(() => new Date().toISOString(), [])

  const { incoming, lookingFor, removed, cancelled, history } = useMemo(() => {
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
      } else if (shouldLiveInMyMatches(item)) {
        if (isInboxItem(item, now)) incoming.push(item)
        else history.push(item)
      } else if (status === 'pending') {
        if (item.match.status === 'active' && !isPast(item, now)) lookingFor.push(item)
        else history.push(item)
      } else if (status === 'removed') {
        if (item.match.status === 'active' && !isPast(item, now) && !dismissed) removed.push(item)
        else history.push(item)
      } else if (status == null) {
        if (item.match.status === 'active' && !isPast(item, now)) {
          if (isOrganizer) incoming.push(item)
          else lookingFor.push(item)
        }
      }
    }

    history.sort((a, b) => (b.match.start_at_utc ?? '').localeCompare(a.match.start_at_utc ?? ''))

    return { incoming, lookingFor, removed, cancelled, history }
  }, [dismissedAlertMatchIds, items, now])

  const visibleCancelled = cancelled
  const visibleRemoved = removed
  const subTabBtn = (key: 'upcoming' | 'history', label: string, count: number) => (
    <button
      onClick={() => setSubTab(key)}
      className={[
        'border-b-2 pb-2 text-sm font-medium transition-colors',
        subTab === key
          ? 'border-gray-900 text-gray-900'
          : 'border-transparent text-gray-400 hover:text-gray-700',
      ].join(' ')}
    >
      {label}
      <span className={`ml-1.5 text-xs ${subTab === key ? 'text-gray-500' : 'text-gray-300'}`}>
        {count}
      </span>
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex gap-6 border-b border-gray-200">
        {subTabBtn('upcoming', 'Upcoming', incoming.length)}
        {subTabBtn('history', 'History', history.length)}
      </div>

      {subTab === 'upcoming' && (
        <>
          {(visibleCancelled.length > 0 || visibleRemoved.length > 0 || lookingFor.some(needsUserAction)) && (
            <section>
              <SectionHeading
                label="Action Needed"
                count={
                  visibleCancelled.length +
                  visibleRemoved.length +
                  lookingFor.filter(needsUserAction).length
                }
              />
              <div className="space-y-2">
                {lookingFor.filter(needsUserAction).map(item => (
                  <MatchRow key={item.match.id} item={item} onViewed={onViewedMatch} showRosterNames={false} />
                ))}
                {visibleCancelled.map(item => (
                  <MatchRow
                    key={item.match.id}
                    item={item}
                    onViewed={onViewedMatch}
                    onDismissAlert={onDismissAlert}
                    showAcknowledge
                    showRosterNames={false}
                  />
                ))}
                {visibleRemoved.map(item => (
                  <MatchRow
                    key={item.match.id}
                    item={item}
                    onViewed={onViewedMatch}
                    onDismissAlert={onDismissAlert}
                    showAcknowledge
                    showRosterNames={false}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading label="My Matches" count={incoming.length} />
            {incoming.length === 0 ? (
              <p className="text-sm italic text-gray-400">No upcoming matches.</p>
            ) : (
              <div>
                {incoming.map(item => {
                  const isOrg = item.match.organizer_id === userId
                  const hoursLeft = item.match.start_at_utc
                    ? (new Date(item.match.start_at_utc).getTime() - Date.now()) / 3_600_000
                    : null
                  const expiring =
                    isOrg &&
                    !item.isFormed &&
                    hoursLeft !== null &&
                    hoursLeft > 0 &&
                    hoursLeft < 12

                  return (
                    <div key={item.match.id} className="mb-2">
                      <MatchRow item={item} onViewed={onViewedMatch} variant="incoming" />
                      {expiring && onCancelMatch && (
                        <ExpiryBanner item={item} hoursLeft={hoursLeft} onCancel={onCancelMatch} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {lookingFor.filter(i => !needsUserAction(i)).length > 0 && (
            <section>
              <SectionHeading
                label="Looking for Players"
                count={lookingFor.filter(i => !needsUserAction(i)).length}
              />
              <div className="space-y-2">
                {lookingFor.filter(i => !needsUserAction(i)).map(item => (
                  <MatchRow key={item.match.id} item={item} />
                ))}
              </div>
            </section>
          )}

          <section className="pt-2">
            <CreateMatchInline defaultVenueId={defaultVenueId} />
          </section>
        </>
      )}

      {subTab === 'history' && (
        <section>
          {history.length === 0 ? (
            <p className="text-sm italic text-gray-400">No match history.</p>
          ) : (
            <>
              <div className="space-y-2">
                {history.slice(0, historyShown).map(item => (
                  <MatchRow key={item.match.id} item={item} onViewed={onViewedMatch} />
                ))}
              </div>
              {historyShown < history.length && (
                <button
                  onClick={() => setHistoryShown(n => n + PAGE_SIZE)}
                  className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50"
                >
                  Load more ({history.length - historyShown} remaining)
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
