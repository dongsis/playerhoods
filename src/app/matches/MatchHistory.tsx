'use client'

import { useMemo } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import { clubDateKey, formatDateHeading } from '@/lib/format-time'
import { MatchCard } from './MatchCard'

interface Props {
  items: MatchListItem[]
  userId: string | null
}

export function MatchHistory({ items, userId }: Props) {
  // Group by club-local date, newest first
  const groups = useMemo(() => {
    const map = new Map<string, MatchListItem[]>()
    for (const item of items) {
      const key = clubDateKey(
        item.match.start_at_utc,
        item.match.match_date,
        item.clubTimezone,
      )
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [items])

  if (groups.length === 0) {
    return (
      <p style={{ color: '#888', fontSize: '0.9rem', margin: '0.5rem 0' }}>
        No match history yet.
      </p>
    )
  }

  return (
    <div>
      {groups.map(([dateKey, groupItems]) => (
        <div key={dateKey} style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#aaa',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom: '0.4rem',
              paddingBottom: '0.25rem',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            {formatDateHeading(dateKey)}
          </div>
          {groupItems.map(item => (
            <MatchCard key={item.match.id} item={item} userId={userId} />
          ))}
        </div>
      ))}
    </div>
  )
}
