'use client'

import { useState, useMemo } from 'react'
import type { PlayersData } from '@/lib/api/players'

interface Props {
  data: PlayersData
}

export function PlayersPanel({ data }: Props) {
  const [view, setView] = useState<'club' | 'all'>('club')
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()

  const filteredClubs = useMemo(
    () =>
      data.clubs
        .map(c => ({
          ...c,
          members: query
            ? c.members.filter(m => m.handle.toLowerCase().includes(query))
            : c.members,
        }))
        .filter(c => c.members.length > 0),
    [data.clubs, query]
  )

  const allPlayers = useMemo(() => {
    const rows: { label: string; sub: string }[] = []
    for (const c of data.clubs) {
      for (const m of c.members) {
        rows.push({ label: m.handle, sub: c.club.name })
      }
    }
    for (const p of data.noClub) {
      rows.push({ label: p.display_name, sub: '' })
    }
    rows.sort((a, b) => a.label.localeCompare(b.label))
    return rows
  }, [data])

  const filteredAll = useMemo(
    () => (query ? allPlayers.filter(r => r.label.toLowerCase().includes(query)) : allPlayers),
    [allPlayers, query]
  )

  const totalCount =
    data.clubs.reduce((s, c) => s + c.members.length, 0) + data.noClub.length

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white">
          <button
            onClick={() => setView('club')}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              view === 'club' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            By Club
          </button>
          <button
            onClick={() => setView('all')}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              view === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            All ({totalCount})
          </button>
        </div>
      </div>

      {view === 'club' && (
        <div className="space-y-5">
          {filteredClubs.length === 0 && (
            <p className="text-sm text-gray-400 italic">No players found.</p>
          )}
          {filteredClubs.map(({ club, members }) => (
            <section key={club.id}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {club.name}
                <span className="ml-2 text-gray-300 normal-case font-normal">{members.length}</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {members.map(m => (
                  <div
                    key={m.userId}
                    className="px-3 py-2 bg-white rounded-xl border border-gray-100 text-sm text-gray-700"
                  >
                    {m.handle}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {data.noClub.length > 0 && !query && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                No Club
                <span className="ml-2 text-gray-300 normal-case font-normal">
                  {data.noClub.length}
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.noClub.map(p => (
                  <div
                    key={p.id}
                    className="px-3 py-2 bg-white rounded-xl border border-gray-100 text-sm text-gray-500 italic"
                  >
                    {p.display_name}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {view === 'all' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {filteredAll.length === 0 && (
            <p className="col-span-3 text-sm text-gray-400 italic">No players found.</p>
          )}
          {filteredAll.map((r, i) => (
            <div
              key={i}
              className="px-3 py-2 bg-white rounded-xl border border-gray-100 text-sm"
            >
              <div className="text-gray-700">{r.label}</div>
              {r.sub && <div className="text-xs text-gray-400">{r.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
