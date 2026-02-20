'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { PlayersData } from '@/lib/api/players'
import type { Group } from '@/lib/types/database'

type InvitableUser = { id: string; display_name: string }

interface Props {
  data: PlayersData
  userId?: string
  onGetInvitableUsers?: (groupId: string) => Promise<InvitableUser[]>
  onInviteToGroup?: (groupId: string, userId: string) => Promise<void>
}

type View = 'club' | 'group' | 'all'

// ─── Inline invite panel for group boundary keeper ────────────────────────────

function GroupInvitePanel({
  group,
  onGetUsers,
  onInvite,
  onClose,
}: {
  group: Group
  onGetUsers: (groupId: string) => Promise<InvitableUser[]>
  onInvite: (groupId: string, userId: string) => Promise<void>
  onClose: () => void
}) {
  const router = useRouter()
  const [users, setUsers] = useState<InvitableUser[] | null>(null)
  const [inviting, setInviting] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startTransition(async () => {
      try {
        const u = await onGetUsers(group.id)
        setUsers(u)
      } catch {
        setError('Failed to load users')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id])

  const handleInvite = (userId: string) => {
    setInviting(userId)
    setError(null)
    startTransition(async () => {
      try {
        await onInvite(group.id, userId)
        setUsers(prev => prev?.filter(u => u.id !== userId) ?? prev)
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Invite failed')
      } finally {
        setInviting(null)
      }
    })
  }

  return (
    <div className="mt-2 mb-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
        <span className="text-xs font-semibold text-gray-600">Invite to {group.name}</span>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-500 text-base leading-none"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 max-h-60 overflow-y-auto">
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        {users === null && isPending && (
          <p className="text-xs text-gray-400 italic">Loading…</p>
        )}

        {users !== null && users.length === 0 && (
          <p className="text-xs text-gray-400 italic">Everyone is already a member.</p>
        )}

        {users !== null && users.length > 0 && (
          <div className="space-y-1.5">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-700">
                  {u.display_name || '(unnamed)'}
                </span>
                <button
                  onClick={() => handleInvite(u.id)}
                  disabled={isPending || inviting === u.id}
                  className="px-2.5 py-0.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {inviting === u.id ? '…' : 'Invite'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PlayersPanel({ data, userId, onGetInvitableUsers, onInviteToGroup }: Props) {
  const [view, setView] = useState<View>('club')
  const [search, setSearch] = useState('')
  const [openInviteGroupId, setOpenInviteGroupId] = useState<string | null>(null)

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

  const filteredGroups = useMemo(
    () =>
      data.groups
        .map(g => ({
          ...g,
          members: query
            ? g.members.filter(m => (m.displayName ?? '').toLowerCase().includes(query))
            : g.members,
        }))
        .filter(g => g.members.length > 0),
    [data.groups, query]
  )

  const allPlayers = useMemo(() => {
    const rows: { label: string; sub: string }[] = []
    for (const c of data.clubs) {
      for (const m of c.members) {
        rows.push({ label: m.handle, sub: c.club.name })
      }
    }
    for (const p of data.noClub) {
      rows.push({ label: p.display_name ?? '', sub: '' })
    }
    rows.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
    return rows
  }, [data])

  const filteredAll = useMemo(
    () => (query ? allPlayers.filter(r => r.label.toLowerCase().includes(query)) : allPlayers),
    [allPlayers, query]
  )

  const totalCount =
    data.clubs.reduce((s, c) => s + c.members.length, 0) + data.noClub.length

  const btnClass = (v: View) =>
    `px-3 py-2 text-xs font-medium transition-colors ${
      view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
    }`

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
          <button onClick={() => setView('club')} className={btnClass('club')}>
            By Club
          </button>
          <button onClick={() => setView('group')} className={btnClass('group')}>
            By Group
          </button>
          <button onClick={() => setView('all')} className={btnClass('all')}>
            All ({totalCount})
          </button>
        </div>
      </div>

      {/* By Club */}
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
                    {p.display_name ?? '(unnamed)'}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* By Group */}
      {view === 'group' && (
        <div className="space-y-5">
          {filteredGroups.length === 0 && (
            <p className="text-sm text-gray-400 italic">No groups found.</p>
          )}
          {filteredGroups.map(({ group, members }) => {
            const isOrganizer = userId && group.boundary_keeper_id === userId
            const inviteOpen = openInviteGroupId === group.id

            return (
              <section key={group.id}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {group.name}
                  </h3>
                  <span className="text-xs text-gray-300 font-normal">{members.length}</span>
                  {isOrganizer && onGetInvitableUsers && onInviteToGroup && (
                    <button
                      onClick={() =>
                        setOpenInviteGroupId(inviteOpen ? null : group.id)
                      }
                      className={`ml-1 px-2 py-0.5 text-xs rounded-lg border transition-colors ${
                        inviteOpen
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                      }`}
                    >
                      + Add
                    </button>
                  )}
                </div>

                {/* Invite panel */}
                {inviteOpen && onGetInvitableUsers && onInviteToGroup && (
                  <GroupInvitePanel
                    group={group}
                    onGetUsers={onGetInvitableUsers}
                    onInvite={onInviteToGroup}
                    onClose={() => setOpenInviteGroupId(null)}
                  />
                )}

                {/* Member grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {members.map(m => (
                    <div
                      key={m.userId}
                      className="px-3 py-2 bg-white rounded-xl border border-gray-100 text-sm text-gray-700"
                    >
                      {m.displayName || '(unnamed)'}
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* All */}
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
              <div className="text-gray-700">{r.label || '(unnamed)'}</div>
              {r.sub && <div className="text-xs text-gray-400">{r.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
