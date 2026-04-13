'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getVenueMembersDiscovery } from '@/lib/api/play-network'
import type { VenueMemberDiscoveryRow } from '@/lib/api/play-network'
import { Avatar } from '@/app/components/Avatar'
import { SavedPlayerButton } from '@/app/components/SavedPlayerButton'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'

interface Props {
  venueId: string
  initialSavedPlayerIds: string[]
}

export function VenueMembersSection({ venueId, initialSavedPlayerIds }: Props) {
  const [members, setMembers] = useState<VenueMemberDiscoveryRow[]>([])
  const [savedPlayerIds, setSavedPlayerIds] = useState<Set<string>>(
    () => new Set(initialSavedPlayerIds)
  )
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSavedPlayerIds(new Set(initialSavedPlayerIds))
  }, [initialSavedPlayerIds])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    getVenueMembersDiscovery(supabase, venueId, search || null)
      .then((data) => {
        if (!cancelled) setMembers(data)
      })
      .catch((loadError) => {
        if (!cancelled) setError((loadError as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [venueId, search])

  const handleSavedPlayerChange = (targetUserId: string, saved: boolean) => {
    setSavedPlayerIds((prev) => {
      const next = new Set(prev)
      if (saved) next.add(targetUserId)
      else next.delete(targetUserId)
      return next
    })
  }

  if (loading && members.length === 0) {
    return <p className="text-sm text-gray-400">Loading venue members…</p>
  }

  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Venue Members
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        Discover registered players at this venue and save them to your private Saved Players list for future match invites.
      </p>
      <input
        type="text"
        placeholder="Search by name or handle…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-xl mb-3"
      />
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {members.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100"
            >
              <PlayerProfileTrigger targetUserId={member.user_id} className="rounded-full">
                <Avatar
                  src={member.avatar_url}
                  displayName={member.display_name || member.venue_handle || '?'}
                  size="md"
                />
              </PlayerProfileTrigger>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800 truncate block">
                  {member.display_name || member.venue_handle || 'Unknown'}
                </span>
                {member.venue_handle && (
                  <span className="mt-1 block text-xs text-gray-400">@{member.venue_handle}</span>
                )}
              </div>
              <SavedPlayerButton
                targetUserId={member.user_id}
                source="venue_member"
                initialSaved={savedPlayerIds.has(member.user_id)}
                onChange={handleSavedPlayerChange}
                savedLabel="Saved"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
