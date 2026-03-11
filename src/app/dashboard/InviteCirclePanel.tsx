'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getInviteCircleList, removeFromInviteCircle } from '@/lib/api/play-network'
import type { InviteCircleRow } from '@/lib/api/play-network'
import { Avatar } from '@/app/components/Avatar'

interface Props {
  onRefresh?: () => void
}

export function InviteCirclePanel({ onRefresh }: Props) {
  const [items, setItems] = useState<InviteCircleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    getInviteCircleList(supabase)
      .then(setItems)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleRemove = async (targetUserId: string) => {
    setRemovingId(targetUserId)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      await removeFromInviteCircle(supabase, targetUserId)
      setItems(prev => prev.filter(i => i.target_user_id !== targetUserId))
      onRefresh?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRemovingId(null)
    }
  }

  if (loading && items.length === 0) {
    return <p className="text-sm text-gray-400">Loading Invite Circle…</p>
  }

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Invite Circle</h3>
      <p className="text-xs text-gray-500 mb-3">
        Your saved people — a personal shortlist. Saving does not send any invitation. Use when inviting people to a match.
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No one saved yet. Discover people in Club Members on a venue page, then save them here.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100"
            >
              <Avatar src={item.target_avatar_url} displayName={item.target_display_name || '?'} size="md" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800 truncate block">
                  {item.target_display_name || 'Unknown'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(item.target_user_id)}
                disabled={!!removingId}
                className="shrink-0 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                {removingId === item.target_user_id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
