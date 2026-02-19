'use client'

import { useState, useMemo } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import { MatchInbox } from './MatchInbox'
import { MatchHistory } from './MatchHistory'

interface Props {
  items: MatchListItem[]
  userId: string | null
}

function isInboxItem(item: MatchListItem, nowIso: string): boolean {
  const { match, confirmedCount, isFormed } = item
  if (match.status !== 'active') return false
  if (!match.start_at_utc) return true           // no time set → always inbox
  if (match.start_at_utc >= nowIso) return true  // upcoming
  // Past but active: keep if some confirmed and not yet formed
  if (confirmedCount > 0 && !isFormed) return true
  return false
}

export function MatchesShell({ items, userId }: Props) {
  const [tab, setTab] = useState<'inbox' | 'history'>('inbox')

  // Stable "now" for the lifetime of this render tree
  const nowIso = useMemo(() => new Date().toISOString(), [])

  const { inbox, history } = useMemo(() => {
    const inbox: MatchListItem[] = []
    const history: MatchListItem[] = []

    for (const item of items) {
      if (isInboxItem(item, nowIso)) {
        inbox.push(item)
      } else {
        history.push(item)
      }
    }

    const timeKey = (item: MatchListItem) =>
      item.match.start_at_utc ??
      `${item.match.match_date ?? ''}T${item.match.start_time ?? '00:00'}`

    inbox.sort((a, b) => timeKey(a).localeCompare(timeKey(b)))
    history.sort((a, b) => timeKey(b).localeCompare(timeKey(a)))

    return { inbox, history }
  }, [items, nowIso])

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1.1rem',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #2d8a4e' : '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    color: active ? '#2d8a4e' : '#666',
    fontSize: '0.9rem',
  })

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e8e8e8', marginBottom: '1rem' }}>
        <button onClick={() => setTab('inbox')} style={tabStyle(tab === 'inbox')}>
          Upcoming ({inbox.length})
        </button>
        <button onClick={() => setTab('history')} style={tabStyle(tab === 'history')}>
          History ({history.length})
        </button>
      </div>

      {tab === 'inbox'
        ? <MatchInbox items={inbox} userId={userId} />
        : <MatchHistory items={history} userId={userId} />
      }
    </div>
  )
}
