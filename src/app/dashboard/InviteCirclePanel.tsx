'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  getInviteCircleList,
  getInviteCircleSourceLabel,
  removeFromInviteCircle,
} from '@/lib/api/play-network'
import type { InviteCircleRow } from '@/lib/api/play-network'
import { Avatar } from '@/app/components/Avatar'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'

interface Props {
  initialItems: InviteCircleRow[]
  refreshToken?: number
  onChange?: (targetUserId: string, saved: boolean) => void
}

export function InviteCirclePanel({
  initialItems,
  refreshToken = 0,
  onChange,
}: Props) {
  const [items, setItems] = useState<InviteCircleRow[]>(initialItems)
  const [loading, setLoading] = useState(initialItems.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    getInviteCircleList(supabase)
      .then(setItems)
      .catch((loadError) => setError((loadError as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  useEffect(() => {
    load()
  }, [refreshToken])

  const handleRemove = async (targetUserId: string) => {
    setRemovingId(targetUserId)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      await removeFromInviteCircle(supabase, targetUserId)
      setItems((prev) => prev.filter((item) => item.target_user_id !== targetUserId))
      onChange?.(targetUserId, false)
    } catch (removeError) {
      setError((removeError as Error).message)
    } finally {
      setRemovingId(null)
    }
  }

  if (loading && items.length === 0) {
    return <p className="text-sm text-gray-400">Loading saved players…</p>
  }

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Saved Players</h3>
      <p className="text-xs text-gray-500 mb-3">
        Your private shortlist of registered players. Saving is silent, does not create a group, and keeps contact players on their separate guest path.
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          No saved players yet. Save people from venue members, groups, or shared matches to build your future invite pool.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100"
            >
              <PlayerProfileTrigger targetUserId={item.target_user_id} className="rounded-full">
                <Avatar
                  src={item.target_avatar_url}
                  displayName={item.target_display_name || '?'}
                  size="md"
                />
              </PlayerProfileTrigger>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800 truncate block">
                  {item.target_display_name || 'Unknown'}
                </span>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {getInviteCircleSourceLabel(item.source)}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Saved {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
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
