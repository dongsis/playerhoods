'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PlayersData, PendingGroupInvite } from '@/lib/api/players'
import { acceptGroupInvite, inviteUserToGroup, createGroup, leaveGroup } from '@/lib/api/groups'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Group } from '@/lib/types/database'

type InvitableUser = { id: string; display_name: string }

interface Props {
  data: PlayersData
  userId?: string
}

/** Compute invitable users for a group from already-loaded PlayersData.
 *  Uses club_identities data (open RLS) — no extra server call needed. */
function getInvitableForGroup(data: PlayersData, groupId: string): InvitableUser[] {
  const existingIds = new Set(
    (data.groups.find(g => g.group.id === groupId)?.members ?? []).map(m => m.userId)
  )
  const seen = new Set<string>()
  const result: InvitableUser[] = []
  for (const { members } of data.clubs) {
    for (const m of members) {
      if (!seen.has(m.userId) && !existingIds.has(m.userId)) {
        seen.add(m.userId)
        result.push({ id: m.userId, display_name: m.handle })
      }
    }
  }
  for (const p of data.noClub) {
    if (!seen.has(p.id) && !existingIds.has(p.id)) {
      seen.add(p.id)
      result.push({ id: p.id, display_name: p.display_name })
    }
  }
  return result.sort((a, b) => a.display_name.localeCompare(b.display_name))
}

/** All platform players (excluding self) as InvitableUser[], for group creation. */
function getAllCandidates(data: PlayersData, excludeUserId?: string): InvitableUser[] {
  const seen = new Set<string>()
  const result: InvitableUser[] = []
  for (const { members } of data.clubs) {
    for (const m of members) {
      if (!seen.has(m.userId) && m.userId !== excludeUserId) {
        seen.add(m.userId)
        result.push({ id: m.userId, display_name: m.handle })
      }
    }
  }
  for (const p of data.noClub) {
    if (!seen.has(p.id) && p.id !== excludeUserId) {
      seen.add(p.id)
      result.push({ id: p.id, display_name: p.display_name ?? '' })
    }
  }
  return result.sort((a, b) => a.display_name.localeCompare(b.display_name))
}

type View = 'club' | 'group' | 'all'

// ─── Create group panel ───────────────────────────────────────────────────────

function CreateGroupPanel({
  candidates,
  onClose,
}: {
  candidates: InvitableUser[]
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [memberSearch, setMemberSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const visible = memberSearch.trim()
    ? candidates.filter(c =>
        c.display_name.toLowerCase().includes(memberSearch.trim().toLowerCase())
      )
    : candidates

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const group = await createGroup(supabase, { name: name.trim() })
      for (const userId of selected) {
        await inviteUserToGroup(supabase, group.id, userId)
      }
      router.refresh()
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to create group')
      setLoading(false)
    }
  }

  return (
    <div className="mb-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
        <span className="text-xs font-semibold text-gray-600">New Group</span>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-500 text-base leading-none"
        >
          ×
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {error && <p className="text-xs text-red-500">{error}</p>}
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Group name…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
        {candidates.length > 0 && (
          <>
            <input
              type="text"
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search players to invite…"
              className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <div className="max-h-44 overflow-y-auto space-y-1">
              {visible.map(u => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggle(u.id)}
                    className="accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{u.display_name || '(unnamed)'}</span>
                </label>
              ))}
              {visible.length === 0 && (
                <p className="text-xs text-gray-400 italic px-1">No players match.</p>
              )}
            </div>
          </>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="px-4 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {loading
              ? 'Creating…'
              : selected.size > 0
              ? `Create & invite ${selected.size}`
              : 'Create'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Leave group button ───────────────────────────────────────────────────────

function LeaveGroupButton({ groupId, onLeft }: { groupId: string; onLeft: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleLeave = () => {
    setError(null)
    const supabase = createSupabaseBrowserClient()
    startTransition(async () => {
      try {
        await leaveGroup(supabase, groupId)
        onLeft()
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Failed to leave')
        setConfirmOpen(false)
      }
    })
  }

  if (error) {
    return <span className="text-xs text-red-500 ml-auto">{error}</span>
  }

  if (confirmOpen) {
    return (
      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={handleLeave}
          disabled={isPending}
          className="px-2 py-0.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? '…' : 'Confirm leave'}
        </button>
        <button
          onClick={() => setConfirmOpen(false)}
          className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmOpen(true)}
      className="ml-auto px-2 py-0.5 text-xs text-gray-400 border border-gray-200 rounded-lg hover:border-red-300 hover:text-red-500 transition-colors"
    >
      Leave
    </button>
  )
}

// ─── Inline invite panel for group boundary keeper ────────────────────────────

function GroupInvitePanel({
  group,
  initialUsers,
  onClose,
}: {
  group: Group
  initialUsers: InvitableUser[]
  onClose: () => void
}) {
  const router = useRouter()
  const [users] = useState<InvitableUser[]>(initialUsers)
  const [inviting, setInviting] = useState<string | null>(null)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const handleInvite = async (userId: string) => {
    setInviting(userId)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      await inviteUserToGroup(supabase, group.id, userId)
      setSentIds(prev => new Set([...prev, userId]))
      router.refresh()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Invite failed')
    } finally {
      setInviting(null)
    }
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

        {users.length === 0 && (
          <p className="text-xs text-gray-400 italic">Everyone is already a member.</p>
        )}

        {users.length > 0 && (
          <div className="space-y-1.5">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-700">
                  {u.display_name || '(unnamed)'}
                </span>
                {sentIds.has(u.id) ? (
                  <span className="px-2.5 py-0.5 text-xs text-gray-400 whitespace-nowrap">
                    Sent
                  </span>
                ) : (
                  <button
                    onClick={() => handleInvite(u.id)}
                    disabled={inviting !== null}
                    className="px-2.5 py-0.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {inviting === u.id ? '…' : 'Invite'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Pending group invite banner ──────────────────────────────────────────────

function GroupInviteBanner({
  invite,
  onAccepted,
}: {
  invite: PendingGroupInvite
  onAccepted: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleAccept = () => {
    setError(null)
    const supabase = createSupabaseBrowserClient()
    startTransition(async () => {
      try {
        await acceptGroupInvite(supabase, invite.groupId)
        onAccepted()
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Failed to accept')
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl">
      <div>
        <span className="text-sm font-medium text-blue-800">
          You&apos;re invited to <span className="font-semibold">{invite.groupName}</span>
        </span>
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="shrink-0 px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '…' : 'Join group'}
      </button>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PlayersPanel({ data, userId }: Props) {
  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')
  const [openInviteGroupId, setOpenInviteGroupId] = useState<string | null>(null)
  const [dismissedInvites, setDismissedInvites] = useState<Set<string>>(new Set())
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [leftGroupIds, setLeftGroupIds] = useState<Set<string>>(new Set())

  const pendingInvites = data.pendingGroupInvites.filter(
    inv => !dismissedInvites.has(inv.groupId)
  )

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
    // Build userId → group names map
    const userGroupNames = new Map<string, string[]>()
    for (const { group, members } of data.groups) {
      for (const m of members) {
        const list = userGroupNames.get(m.userId) ?? []
        list.push(group.name)
        userGroupNames.set(m.userId, list)
      }
    }

    const rows: { label: string; userId: string; groups: string[] }[] = []
    for (const c of data.clubs) {
      for (const m of c.members) {
        rows.push({
          label: m.handle,
          userId: m.userId,
          groups: userGroupNames.get(m.userId) ?? [],
        })
      }
    }
    for (const p of data.noClub) {
      rows.push({
        label: p.display_name ?? '',
        userId: p.id,
        groups: userGroupNames.get(p.id) ?? [],
      })
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
          <button onClick={() => setView('all')} className={btnClass('all')}>
            All ({totalCount})
          </button>
          <button onClick={() => setView('group')} className={btnClass('group')}>
            By Group
          </button>
          <button onClick={() => setView('club')} className={btnClass('club')}>
            By Club
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
          {/* Pending group invite banners — always at the top */}
          {pendingInvites.map(inv => (
            <GroupInviteBanner
              key={inv.groupId}
              invite={inv}
              onAccepted={() => setDismissedInvites(prev => new Set([...prev, inv.groupId]))}
            />
          ))}

          {/* Create group button / panel */}
          {userId && !showCreateGroup && (
            <div>
              <button
                onClick={() => setShowCreateGroup(true)}
                className="px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 text-gray-500 rounded-xl hover:border-gray-400 hover:text-gray-700 transition-colors"
              >
                + New Group
              </button>
            </div>
          )}
          {userId && showCreateGroup && (
            <CreateGroupPanel
              candidates={getAllCandidates(data, userId)}
              onClose={() => setShowCreateGroup(false)}
            />
          )}

          {filteredGroups.filter(g => !leftGroupIds.has(g.group.id)).length === 0 &&
            pendingInvites.length === 0 && (
              <p className="text-sm text-gray-400 italic">No groups found.</p>
            )}
          {filteredGroups
            .filter(g => !leftGroupIds.has(g.group.id))
            .map(({ group, members }) => {
              const isBoundaryKeeper = userId && group.boundary_keeper_id === userId
              const inviteOpen = openInviteGroupId === group.id
              const myMembership = userId
                ? members.find(m => m.userId === userId && m.status === 'active')
                : undefined
              const canLeave = !!myMembership && !isBoundaryKeeper

              return (
                <section key={group.id}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {group.name}
                    </h3>
                    <span className="text-xs text-gray-300 font-normal">{members.length}</span>
                    {isBoundaryKeeper && (
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
                    {canLeave && (
                      <LeaveGroupButton
                        groupId={group.id}
                        onLeft={() =>
                          setLeftGroupIds(prev => new Set([...prev, group.id]))
                        }
                      />
                    )}
                  </div>

                  {/* Invite panel */}
                  {inviteOpen && (
                    <GroupInvitePanel
                      group={group}
                      initialUsers={getInvitableForGroup(data, group.id)}
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
              {r.groups.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.groups.map(g => (
                    <span
                      key={g}
                      className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
