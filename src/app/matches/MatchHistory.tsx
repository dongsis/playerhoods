'use client'

import { useMemo } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import { venueDateKey, formatDateHeading } from '@/lib/format-time'
import { MatchCard } from './MatchCard'

interface Props {
  items: MatchListItem[]
  userId: string | null
}

export function MatchHistory({ items, userId }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, MatchListItem[]>()
    for (const item of items) {
      const key = venueDateKey(
        item.match.start_at_utc,
        item.match.match_date,
        item.venueTimezone,
      )
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [items])

  if (groups.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6 text-[12px] font-medium text-[#94A3B8]">
        No match history yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(([dateKey, groupItems]) => (
        <section key={dateKey}>
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">
              {formatDateHeading(dateKey)}
            </span>
            <span className="h-px flex-1 bg-[#E2E8F0]" />
          </div>
          <div className="space-y-3">
            {groupItems.map((item) => (
              <MatchCard key={item.match.id} item={item} userId={userId} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
