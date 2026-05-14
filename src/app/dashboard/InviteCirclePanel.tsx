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
    return <p className="text-sm text-gray-400">Loading saved registered players...</p>
  }

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Saved Registered Players</h3>
      <p className="mb-3 text-xs text-gray-500">
        Registered players you have saved into your Hood. These saved players can later be used in Invite People or Visible to Groups. Contact players stay on their separate contact path.
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm italic text-gray-400">
          No saved registered players yet. Discover players first, save them to your Hood, and then use them in Invite People or Visible to Groups.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
            >
              <PlayerProfileTrigger targetUserId={item.target_user_id} className="rounded-full">
                <Avatar
                  src={item.target_avatar_url}
                  displayName={item.target_display_name || '?'}
                  size="md"
                />
              </PlayerProfileTrigger>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-800">
                  {item.target_display_name || 'Unknown'}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
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
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {removingId === item.target_user_id ? 'Unsaving...' : 'Unsave'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
