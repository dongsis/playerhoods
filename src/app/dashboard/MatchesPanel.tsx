'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MatchListItem } from '@/lib/api/matches'
import { acceptMatchInvite } from '@/lib/api/matches'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatTimeWindow } from '@/lib/format-time'
import { CreateMatchInline } from '@/app/matches/CreateMatchInline'

// ─── inbox split ─────────────────────────────────────────────────────────────

/** True when the match's start time is in the past (use as "past" check). */
function isPast(item: MatchListItem, nowIso: string): boolean {
  const { match } = item
  // Prefer precise UTC timestamp
  if (match.start_at_utc) return match.start_at_utc < nowIso
  // Fallback: compare date-only (for older matches where start_at_utc was not computed)
  if (match.match_date) return match.match_date < nowIso.slice(0, 10)
  return false   // no date info → not past
}

function isInboxItem(item: MatchListItem, nowIso: string): boolean {
  if (item.match.status !== 'active') return false
  return !isPast(item, nowIso)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function needsUserAction(item: MatchListItem): boolean {
  const mp = item.myParticipant
  if (!mp || mp.status !== 'pending') return false
  const hasUserAccepted =
    mp.participant_accepted_at != null
  const isInvited = mp.join_method === 'invited'
  const isNominated = mp.join_method === 'nominated'
  const isRequested = mp.join_method === 'requested'

  if ((isInvited || isNominated) && !hasUserAccepted) return true
  if (isRequested && mp.org_approved_at !== null && !hasUserAccepted) return true
  return false
}

// ─── MatchRow ─────────────────────────────────────────────────────────────────

function MatchRow({ item, onViewed }: { item: MatchListItem; onViewed?: (matchId: string) => void }) {
  const { match, confirmedCount, pendingCount, isFormed, participants, myParticipant, clubTimezone, clubName } = item
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const hasUserAccepted =
    myParticipant &&
    myParticipant.participant_accepted_at != null
  const isInvited =
    myParticipant?.status === 'pending' && myParticipant?.join_method === 'invited'
  const isNominated =
    myParticipant?.status === 'pending' && myParticipant?.join_method === 'nominated'
  const isRequested =
    myParticipant?.status === 'pending' && myParticipant?.join_method === 'requested'
  const needsReconfirmRequested =
    isRequested && myParticipant?.org_approved_at !== null && !hasUserAccepted
  const isRemoved = myParticipant?.status === 'removed'

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
  const need = Math.max(match.required_count - confirmedCount, 0)

  const names = confirmed.slice(0, 3).map(p => p.display_name)
  const overflow = confirmedCount > 3 ? ` +${confirmedCount - 3}` : ''
  const parts: string[] = []
  if (names.length > 0) parts.push(names.join(', ') + overflow)
  if (pendingCount > 0) parts.push(`⏳ ${pendingCount}`)
  if (!isFormed && need > 0) parts.push(`need ${need}`)
  const roster = parts.join(' · ') || '—'

  const timeStr = formatTimeWindow(
    match.start_at_utc,
    match.match_date,
    match.start_time,
    match.duration_minutes,
    clubTimezone ?? 'UTC',
  )

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
      <div className="text-xs text-gray-400 w-28 shrink-0 leading-snug">
        {timeStr || <span className="italic">No time set</span>}
        {clubName && <div className="text-gray-300 truncate">{clubName}</div>}
      </div>
      <div className="shrink-0">
        {isFormed ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            ✓ Formed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {confirmedCount}/{match.required_count}
          </span>
        )}
      </div>
      <div className="flex-1 text-sm text-gray-600 truncate">{roster}</div>
      {(isInvited || isNominated || needsReconfirmRequested) && (
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs text-blue-600 font-medium whitespace-nowrap">
            {isNominated
              ? 'Nominated'
              : isInvited
                ? 'Invited'
                : 'Needs confirm'}
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
      {isRequested && !needsReconfirmRequested && (
        <span className="shrink-0 text-xs text-amber-600 font-medium whitespace-nowrap">
          Awaiting approval
        </span>
      )}
      {isRemoved && (
        <span className="shrink-0 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded-full whitespace-nowrap">
          Removed
        </span>
      )}
      <Link
        href={`/matches/${match.id}`}
        onClick={() => onViewed?.(match.id)}
        className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
      >
        Details →
      </Link>
    </div>
  )
}

// ─── Expiry warning banner ────────────────────────────────────────────────────

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
        ⚠ Starts in <strong>{timeLabel}</strong> — still need {need} player{need !== 1 ? 's' : ''}
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

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</h3>
      <span className="text-xs text-gray-300">{count}</span>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

interface Props {
  items: MatchListItem[]
  userId: string
  onCancelMatch?: (matchId: string) => Promise<void>
  onViewedMatch?: (matchId: string) => void
}

export function MatchesPanel({ items, userId, onCancelMatch, onViewedMatch }: Props) {
  const [subTab, setSubTab] = useState<'upcoming' | 'history'>('upcoming')
  const [historyShown, setHistoryShown] = useState(PAGE_SIZE)

  const now = useMemo(() => new Date().toISOString(), [])

  const { incoming, lookingFor, removed, history } = useMemo(() => {
    const incoming: MatchListItem[] = []
    const lookingFor: MatchListItem[] = []
    const removed: MatchListItem[] = []
    const history: MatchListItem[] = []

    for (const item of items) {
      const status = item.myParticipant?.status
      if (status === 'confirmed') {
        if (isInboxItem(item, now)) incoming.push(item)
        else history.push(item)
      } else if (status === 'pending') {
        if (!isPast(item, now)) lookingFor.push(item)
      } else if (status === 'removed') {
        // Show removal notification only for upcoming active matches
        if (item.match.status === 'active' && !isPast(item, now)) removed.push(item)
      } else if (status == null) {
        if (item.match.status === 'active' && !isPast(item, now)) lookingFor.push(item)
      }
    }

    history.sort((a, b) =>
      (b.match.start_at_utc ?? '').localeCompare(a.match.start_at_utc ?? '')
    )

    return { incoming, lookingFor, removed, history }
  }, [items, now])

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
          {/* Notifications: pending invites/nominations/re-confirms + removed from match */}
          {(removed.length > 0 || lookingFor.some(needsUserAction)) && (
            <section>
              <SectionHeading
                label="Notifications"
                count={
                  removed.length +
                  lookingFor.filter(needsUserAction).length
                }
              />
              <div className="space-y-2">
                {lookingFor.filter(needsUserAction).map(item => (
                  <MatchRow key={item.match.id} item={item} onViewed={onViewedMatch} />
                ))}
                {removed.map(item => (
                  <MatchRow key={item.match.id} item={item} onViewed={onViewedMatch} />
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
                      <MatchRow item={item} onViewed={onViewedMatch} />
                      {expiring && onCancelMatch && (
                        <ExpiryBanner item={item} hoursLeft={hoursLeft!} onCancel={onCancelMatch} />
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

          {/* Create new match */}
          <section className="pt-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Create a Match
            </h3>
            <CreateMatchInline />
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
