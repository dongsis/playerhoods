'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getClubMembersDiscovery, saveToInviteCircle } from '@/lib/api/play-network'
import type { ClubMemberDiscoveryRow } from '@/lib/api/play-network'
import { Avatar } from '@/app/components/Avatar'

interface Props {
  clubId: string
}

export function ClubMembersSection({ clubId }: Props) {
  const [members, setMembers] = useState<ClubMemberDiscoveryRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    getClubMembersDiscovery(supabase, clubId, search || null)
      .then(data => { if (!cancelled) setMembers(data) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clubId, search])

  const handleSave = async (userId: string) => {
    setSavingId(userId)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      await saveToInviteCircle(supabase, userId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  if (loading && members.length === 0) {
    return <p className="text-sm text-gray-400">Loading club members…</p>
  }

  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Club Members
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        Discovery list — people you can save to your Invite Circle, then invite when creating or editing a match.
      </p>
      <input
        type="text"
        placeholder="Search by name or handle…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-xl mb-3"
      />
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {members.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div
              key={m.user_id}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100"
            >
              <Avatar src={m.avatar_url} displayName={m.display_name || m.club_handle || '?'} size="md" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800 truncate block">
                  {m.display_name || m.club_handle || 'Unknown'}
                </span>
                {m.club_handle && (
                  <span className="text-xs text-gray-400">@{m.club_handle}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSave(m.user_id)}
                disabled={!!savingId}
                className="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              >
                {savingId === m.user_id ? 'Saving…' : 'Save to Invite Circle'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
