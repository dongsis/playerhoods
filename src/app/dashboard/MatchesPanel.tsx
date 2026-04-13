'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MatchListItem } from '@/lib/api/matches'
import { acceptMatchInvite } from '@/lib/api/matches'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatTimeWindow } from '@/lib/format-time'
import { CreateMatchInline } from '@/app/matches/CreateMatchInline'
import { Avatar } from '@/app/components/Avatar'

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

function MatchRow({
  item,
  onViewed,
  onDismissAlert,
  showAcknowledge = false,
  variant = 'default',
  showRosterNames = true,
}: MatchRowProps) {
  const { match, confirmedCount, pendingCount, isFormed, participants, myParticipant, venueTimezone, venueName, sportName, courtState } = item
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
  const removalNote = (myParticipant?.removal_note ?? '').toLowerCase()
  const isSelfWithdraw =
    Boolean(
      myParticipant?.removed_by &&
      myParticipant?.user_id &&
      myParticipant.removed_by === myParticipant.user_id,
    ) ||
    removalNote.includes('declined') ||
    removalNote.includes('withdraw')

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
  const names = confirmed.slice(0, 3).map(p => p.display_name)
  const overflow = confirmedCount > 3 ? ` +${confirmedCount - 3}` : ''
  const rosterMeta: string[] = item.rosterInsight.summaryLabel ? item.rosterInsight.summaryLabel.split(' · ') : []
  const parts: string[] = []
  if (names.length > 0) parts.push(names.join(', ') + overflow)
  if (item.rosterInsight.summaryLabel) parts.push(item.rosterInsight.summaryLabel)
  const roster = parts.join(' · ') || '—'

  const timeStr = formatTimeWindow(
    match.start_at_utc,
    match.match_date,
    match.start_time,
    match.duration_minutes,
    venueTimezone ?? 'UTC',
  )
  const sportLabel = toSportLabel(sportName)

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
      <div className="shrink-0">
        {isCancelled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Match cancelled
          </span>
        ) : isFormed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            ✓ Formed
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
        )}
      </div>
      {!isCancelled && (
        <div className="shrink-0">
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
        </div>
      )}
      {variant === 'incoming' ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center">
            {confirmed.slice(0, 3).map(p => (
              <Avatar
                key={p.id}
                src={p.avatar_url}
                displayName={p.display_name}
                size="md"
                className="-ml-1 first:ml-0 ring-2 ring-white"
              />
            ))}
          </div>
          {rosterMeta.length > 0 && (
            <div className="flex min-w-0 items-center">
              <span className="shrink-0 whitespace-nowrap text-sm text-slate-500">
                {rosterMeta.map((label, index) => (
                  <Fragment key={label}>
                    {index > 0 && <span className="px-1 text-slate-300">&middot;</span>}
                    <span>{label}</span>
                  </Fragment>
                ))}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="flex shrink-0 gap-0.5">
            {confirmed.slice(0, 3).map(p => (
              <Avatar key={p.id} src={p.avatar_url} displayName={p.display_name} size="sm" />
            ))}
          </div>
          <span className="text-sm text-gray-600 truncate">
            {showRosterNames ? (
              roster
            ) : rosterMeta.length > 0 ? (
              <>
                {rosterMeta.map((label, index) => (
                  <Fragment key={label}>
                    {index > 0 && <span className="px-1 text-gray-300">&middot;</span>}
                    <span>{label}</span>
                  </Fragment>
                ))}
              </>
            ) : (
              '-'
            )}
          </span>
        </div>
      )}

      {!isCancelled && (isInvited || (isNominated && !hasUserAccepted) || needsReconfirmRequested) && (
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs text-blue-600 font-medium whitespace-nowrap">
            {isNominated ? 'Nominated' : isInvited ? 'Invited' : 'Needs confirm'}
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="px-2.5 py-0.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {isPending ? '…' : 'Confirm'}
          </button>
          {confirmError && <span className="text-xs text-red-500">{confirmError}</span>}
        </div>
      )}

      {!isCancelled && isNominated && hasUserAccepted && (
        <span className="shrink-0 text-xs text-blue-600 font-medium whitespace-nowrap">
          Nominated ✓ · Awaiting approval
        </span>
      )}

      {!isCancelled && isRequested && !needsReconfirmRequested && (
        <span className="shrink-0 text-xs text-amber-600 font-medium whitespace-nowrap">
          Awaiting approval
        </span>
      )}

      {!isCancelled && isRemoved && (
        <span className="shrink-0 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded-full whitespace-nowrap">
          {isSelfWithdraw ? 'Withdrawn' : 'No longer invited'}
        </span>
      )}

      {!isCancelled && myParticipant?.status === 'waiting_list' && (
        <span className="shrink-0 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full whitespace-nowrap">
          Waiting list
        </span>
      )}

      {!isCancelled && wasConfirmedByOther && (
        <span className="shrink-0 text-xs text-emerald-700 font-medium whitespace-nowrap">
          You&apos;ve been confirmed by {confirmerName}
        </span>
      )}

      <div className="shrink-0 flex items-center gap-3">
        {showAcknowledge && onDismissAlert && (
      <button
        onClick={() => onDismissAlert(match.id)}
        className="text-xs text-gray-500 hover:text-gray-700 font-medium whitespace-nowrap"
      >
        Dismiss
      </button>
    )}
        <Link
          href={`/matches/${match.id}`}
          onClick={() => onViewed?.(match.id)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
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
    <div className="mx-1 px-4 py-2 bg-red-50 border-x border-b border-red-100 rounded-b-2xl flex items-center justify-between gap-3">
      <span className="text-xs text-red-600">
        Starts in <strong>{timeLabel}</strong> - still need {need} player{need !== 1 ? 's' : ''}
      </span>
      {confirming ? (
        <span className="flex items-center gap-2">
          <span className="text-xs text-red-700 font-medium">Cancel this match?</span>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="px-2 py-0.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? '…' : 'Yes, cancel'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-2 py-0.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs text-red-600 hover:text-red-800 font-medium whitespace-nowrap"
        >
          Cancel match
        </button>
      )}
    </div>
  )
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</h3>
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
      if (item.match.status === 'cancelled') {
        if (status && !isPast(item, now)) cancelled.push(item)
      } else if (status === 'confirmed' || status === 'pending' || status === 'waiting_list') {
        if (isInboxItem(item, now)) incoming.push(item)
        else history.push(item)
      } else if (status === 'removed') {
        if (item.match.status === 'active' && !isPast(item, now)) removed.push(item)
      } else if (status == null) {
        if (item.match.status === 'active' && !isPast(item, now)) lookingFor.push(item)
      }
    }

    history.sort((a, b) => (b.match.start_at_utc ?? '').localeCompare(a.match.start_at_utc ?? ''))

    return { incoming, lookingFor, removed, cancelled, history }
  }, [items, now])

  const visibleCancelled = cancelled.filter(item => !dismissedAlertMatchIds?.has(item.match.id))
  const visibleRemoved = removed.filter(item => !dismissedAlertMatchIds?.has(item.match.id))
  const subTabBtn = (key: 'upcoming' | 'history', label: string, count: number) => (
    <button
      onClick={() => setSubTab(key)}
      className={[
        'pb-2 text-sm font-medium border-b-2 transition-colors',
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
                  visibleCancelled.length
                  + visibleRemoved.length
                  + lookingFor.filter(needsUserAction).length
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
              <p className="text-sm text-gray-400 italic">No upcoming matches.</p>
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
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)]">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Create a Match
              </h3>
              <CreateMatchInline defaultVenueId={defaultVenueId} />
            </div>
          </section>
        </>
      )}

      {subTab === 'history' && (
        <section>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No match history.</p>
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
                  className="mt-4 w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
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
