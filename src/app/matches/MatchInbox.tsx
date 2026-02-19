'use client'

import type { MatchListItem } from '@/lib/api/matches'
import { MatchCard } from './MatchCard'

interface Props {
  items: MatchListItem[]
  userId: string | null
}

export function MatchInbox({ items, userId }: Props) {
  if (items.length === 0) {
    return (
      <p style={{ color: '#888', fontSize: '0.9rem', margin: '0.5rem 0' }}>
        No upcoming matches or pending actions.
      </p>
    )
  }

  return (
    <div>
      {items.map(item => (
        <MatchCard key={item.match.id} item={item} userId={userId} />
      ))}
    </div>
  )
}
