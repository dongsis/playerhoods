'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { MatchListItem } from '@/lib/api/matches'
import { formatTimeWindow } from '@/lib/format-time'

// ─── inbox split (same logic as MatchesShell) ───────────────────────────────

function isInboxItem(item: MatchListItem, nowIso: string): boolean {
  const { match, confirmedCount, isFormed } = item
  if (match.status !== 'active') return false
  if (!match.start_at_utc) return true
  if (match.start_at_utc >= nowIso) return true
  if (confirmedCount > 0 && !isFormed) return true
  return false
}

// ─── MatchRow ────────────────────────────────────────────────────────────────

function MatchRow({ item }: { item: MatchListItem }) {
  const { match, confirmedCount, pendingCount, isFormed, participants, clubTimezone, clubName } = item

  const confirmed = participants.filter(p => p.status === 'confirmed')
  const need = Math.max(match.required_count - confirmedCount, 0)

  // Roster summary
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
      {/* Time */}
      <div className="text-xs text-gray-400 w-28 shrink-0 leading-snug">
        {timeStr || <span className="italic">No time set</span>}
        {clubName && <div className="text-gray-300 truncate">{clubName}</div>}
      </div>

      {/* Formed badge */}
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

      {/* Roster */}
      <div className="flex-1 text-sm text-gray-600 truncate">{roster}</div>

      {/* Details */}
      <Link
        href={`/matches/${match.id}`}
        className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
      >
        Details →
      </Link>
    </div>
  )
}

// ─── Section heading ─────────────────────────────────────────────────────────

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</h3>
      <span className="text-xs text-gray-300">{count}</span>
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

interface Props {
  items: MatchListItem[]
  userId: string
}

export function MatchesPanel({ items, userId }: Props) {
  const [subTab, setSubTab] = useState<'upcoming' | 'history'>('upcoming')
  const [historyShown, setHistoryShown] = useState(PAGE_SIZE)

  const now = useMemo(() => new Date().toISOString(), [])

  const { incoming, lookingFor, history } = useMemo(() => {
    const incoming: MatchListItem[] = []
    const lookingFor: MatchListItem[] = []
    const history: MatchListItem[] = []

    for (const item of items) {
      const status = item.myParticipant?.status
      if (status === 'confirmed') {
        if (isInboxItem(item, now)) incoming.push(item)
        else history.push(item)
      } else if (status === 'pending') {
        lookingFor.push(item)
      } else if (status == null) {
        // Open match I haven't joined — show in Looking for Players
        if (item.match.status === 'active') lookingFor.push(item)
      }
    }

    // history: newest first
    history.sort((a, b) =>
      (b.match.start_at_utc ?? '').localeCompare(a.match.start_at_utc ?? '')
    )

    return { incoming, lookingFor, history }
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
      {/* Sub-tab bar */}
      <div className="flex gap-6 border-b border-gray-200">
        {subTabBtn('upcoming', 'Upcoming', incoming.length)}
        {subTabBtn('history', 'History', history.length)}
      </div>

      {subTab === 'upcoming' && (
        <>
          {/* Incoming confirmed matches */}
          <section>
            <SectionHeading label="My Matches" count={incoming.length} />
            {incoming.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No upcoming matches.</p>
            ) : (
              <div className="space-y-2">
                {incoming.map(item => (
                  <MatchRow key={item.match.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* Looking for Players */}
          {lookingFor.length > 0 && (
            <section>
              <SectionHeading label="Looking for Players" count={lookingFor.length} />
              <div className="space-y-2">
                {lookingFor.map(item => (
                  <div key={item.match.id} className="relative">
                    <MatchRow item={item} />
                    {item.myParticipant?.status === 'pending' && (
                      <span className="absolute top-3 right-20 text-xs text-amber-600 font-medium">
                        Pending
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
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
                  <MatchRow key={item.match.id} item={item} />
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
