'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Club } from '@/lib/types/database'

type Filter = 'all' | 'my-clubs' | 'saved'

interface Props {
  venues: Club[]
  myClubIds: string[]   // venues where user has a handle
  mySavedIds: string[]  // venues in secondary_club_ids
}

export function VenueSearch({ venues, myClubIds, mySavedIds }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const hasMyClubs = myClubIds.length > 0
  const hasSaved   = mySavedIds.length > 0

  const filtered = venues.filter(v => {
    // text search
    if (query) {
      const q = query.toLowerCase()
      const match = v.name.toLowerCase().includes(q) || v.location_text?.toLowerCase().includes(q)
      if (!match) return false
    }
    // filter tab
    if (filter === 'my-clubs') return myClubIds.includes(v.id)
    if (filter === 'saved')    return mySavedIds.includes(v.id)
    return true
  })

  const filterBtn = (key: Filter, label: string, shown: boolean) => {
    if (!shown) return null
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        className={[
          'px-3 py-1 rounded-full text-xs font-medium transition-colors',
          filter === key
            ? 'bg-gray-900 text-white'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
        ].join(' ')}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by name or location…"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
      />

      {/* Filter chips — only show when user has data to filter on */}
      {(hasMyClubs || hasSaved) && (
        <div className="flex gap-2 flex-wrap">
          {filterBtn('all', 'All', true)}
          {filterBtn('my-clubs', 'My Clubs', hasMyClubs)}
          {filterBtn('saved', 'Saved', hasSaved)}
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 italic text-center py-8">No venues match.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => {
            const isMember = myClubIds.includes(v.id)
            const isSaved  = mySavedIds.includes(v.id) && !isMember
            return (
              <Link
                key={v.id}
                href={`/venues/${v.id}`}
                className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors group"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
                    {v.name}
                  </span>
                  {isMember && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">member</span>
                  )}
                  {isSaved && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">★ saved</span>
                  )}
                  {(v.location_text || v.timezone) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {[v.location_text, v.timezone].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-300 group-hover:text-gray-400">→</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
