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
    () => new Set(initialSavedPlayerIds),
  )
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSavedPlayerIds(new Set(initialSavedPlayerIds))
  }, [initialSavedPlayerIds])

  useEffect(() => {
    let cancelled = false
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (cancelled || userError) return
      setCurrentUserId(data.user?.id ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [])

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
    return <p className="text-sm text-gray-400">Loading venue members...</p>
  }

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Venue Members
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        Discover registered people at this venue and save them into your Hood before using them as Direct Invite Users or Request Scope Users.
      </p>
      <input
        type="text"
        placeholder="Search by name..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-3 w-full max-w-xs rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {members.length === 0 ? (
        <p className="text-sm italic text-gray-400">No members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
            >
              <PlayerProfileTrigger targetUserId={member.user_id} className="rounded-full">
                <Avatar
                  src={member.avatar_url}
                  displayName={member.display_name || '?'}
                  size="md"
                />
              </PlayerProfileTrigger>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-800">
                  {member.display_name || 'Unknown'}
                </span>
              </div>
              <SavedPlayerButton
                targetUserId={member.user_id}
                source="venue_member"
                currentUserId={currentUserId}
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
