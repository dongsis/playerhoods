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
      <div className="rounded-[24px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6 text-[12px] font-medium text-[#94A3B8]">
        No upcoming matches or pending actions.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MatchCard key={item.match.id} item={item} userId={userId} />
      ))}
    </div>
  )
}
