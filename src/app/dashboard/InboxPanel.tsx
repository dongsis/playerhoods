'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationWithContext,
} from '@/lib/api/notifications'
import { getMatchParticipantRemovalCopy } from '@/lib/utils/match-participant-removal'

const KIND_LABELS: Record<string, string> = {
  match_cancelled: 'Match cancelled',
  invited: 'You were invited',
  nominated: 'You were invited',
  removed: 'No longer invited',
  delegate_target_confirmed: 'Your invited person was confirmed',
  delegate_target_removed: 'Your invited person was removed',
  court_plan_updated: 'Court plan updated',
  waiting_list_promoted: 'You are now in the match',
  group_added: 'You were added to a group',
  group_join_request: 'Group approval requested',
  group_join_request_accepted: 'Group request accepted',
  group_join_request_declined: 'Group request declined',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString()
}

function getNotificationTone(kind: string): string {
  if (kind === 'removed' || kind === 'match_cancelled' || kind === 'group_join_request_declined') {
    return 'bg-[#FEF2F2] text-[#EF4444] ring-[#FECACA]'
  }
  if (kind === 'court_plan_updated' || kind === 'group_added' || kind === 'group_join_request_accepted') {
    return 'bg-[#ECFDF5] text-[#22C55E] ring-[#DCFCE7]'
  }
  if (kind === 'invited' || kind === 'nominated' || kind === 'waiting_list_promoted') {
    return 'bg-[#EFF6FF] text-[#3B82F6] ring-[#DBEAFE]'
  }
  return 'bg-[#F8FAFC] text-[#64748B] ring-[#E2E8F0]'
}

export function InboxPanel({ onUnreadChange }: { onUnreadChange?: (n: number) => void }) {
  const [items, setItems] = useState<NotificationWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const router = useRouter()

  const load = async () => {
    const supabase = createSupabaseBrowserClient()
    setLoading(true)
    try {
      const [list, count] = await Promise.all([
        getNotifications(supabase),
        import('@/lib/api/notifications').then(m => m.getUnreadNotificationCount(supabase)),
      ])
      setItems(list)
      setUnreadCount(count)
      onUnreadChange?.(count)
    } catch (e) {
      console.error('[Inbox] load:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleRead = async (n: NotificationWithContext) => {
    if (n.read_at) return
    const supabase = createSupabaseBrowserClient()
    try {
      await markNotificationRead(supabase, n.id)
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      const next = Math.max(0, unreadCount - 1)
      setUnreadCount(next)
      onUnreadChange?.(next)
      router.refresh()
    } catch (e) {
      console.error('[Inbox] markRead:', e)
    }
  }

  const handleMarkAllRead = async () => {
    const supabase = createSupabaseBrowserClient()
    try {
      await markAllNotificationsRead(supabase)
      setItems(prev => prev.map(x => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })))
      setUnreadCount(0)
      onUnreadChange?.(0)
      router.refresh()
    } catch (e) {
      console.error('[Inbox] markAllRead:', e)
    }
  }

  const getLabel = (notification: NotificationWithContext) => {
    if (notification.kind === 'removed' && notification.participant_snapshot) {
      return getMatchParticipantRemovalCopy(notification.participant_snapshot).badgeLabel
    }
    return KIND_LABELS[notification.kind] ?? notification.kind
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[2rem] font-semibold tracking-tight text-gray-900 sm:text-[2.15rem]">Inbox</h2>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-body-main font-medium text-blue-600 hover:text-blue-800"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-body-main text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-body-main italic text-gray-500">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(n => (
            <li
              key={n.id}
              className={[
                'flex items-start gap-3 rounded-[24px] border px-4 py-3 transition-colors',
                n.read_at ? 'border-[#E2E8F0] bg-white' : 'border-[#DBEAFE] bg-[#F8FBFF]',
              ].join(' ')}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-label inline-flex items-center rounded-full px-2.5 py-1 ring-1 ${getNotificationTone(n.kind)}`}>
                    {getLabel(n)}
                  </span>
                  {n.actor_name && (
                    <span className="text-title-main text-gray-900">by {n.actor_name}</span>
                  )}
                  <span className="text-body-sub text-gray-400">{formatTime(n.created_at)}</span>
                </div>
                {n.note && (
                  <p className="text-body-sub mt-1 truncate text-gray-600">{n.note}</p>
                )}
                {n.match_id && (
                  <Link
                    href={`/matches/${n.match_id}`}
                    onClick={() => handleRead(n)}
                    className="text-body-main mt-2 inline-block font-semibold text-blue-600 hover:text-blue-800"
                  >
                    View match →
                  </Link>
                )}
              </div>
              {!n.read_at && (
                <button
                  onClick={() => handleRead(n)}
                  className="text-body-sub shrink-0 text-gray-500 hover:text-gray-700"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
