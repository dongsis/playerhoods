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
import {
  dismissContactIntroShare,
  getContactIntroShares,
  saveContactIntroShare,
  type ContactIntroShare,
} from '@/lib/api/contact-intro-shares'
import {
  getUserSaveRequests,
  respondToUserSaveRequest,
  type UserSaveRequest,
} from '@/lib/api/save-requests'
import { getMatchParticipantRemovalCopy } from '@/lib/utils/match-participant-removal'
import { Avatar } from '@/app/components/Avatar'

const KIND_LABELS: Record<string, string> = {
  match_cancelled: 'Match cancelled',
  invited: 'You were invited',
  nominated: 'You were invited',
  removed: 'No longer invited',
  contact_joined_playerhoods: 'A contact joined PlayerHoods',
  saved_contact_joined_playerhoods: 'Saved player joined PlayerHoods',
  group_contact_joined_playerhoods: 'Group contact joined PlayerHoods',
  match_contact_joined_playerhoods: 'Match contact joined PlayerHoods',
  delegate_target_confirmed: 'Your invited person was confirmed',
  delegate_target_removed: 'Your invited person was removed',
  court_plan_updated: 'Court plan updated',
  waiting_list_promoted: 'You are now in the match',
  group_added: 'You were added to a group',
  group_join_request: 'Group approval requested',
  group_join_request_accepted: 'Group request accepted',
  group_join_request_declined: 'Group request declined',
  contact_intro_share: 'Intro shared',
  save_request: 'PlayerHood request',
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
  if (
    kind === 'court_plan_updated' ||
    kind === 'group_added' ||
    kind === 'group_join_request_accepted' ||
    kind === 'contact_joined_playerhoods' ||
    kind === 'saved_contact_joined_playerhoods' ||
    kind === 'group_contact_joined_playerhoods' ||
    kind === 'match_contact_joined_playerhoods'
  ) {
    return 'bg-[#ECFDF5] text-[#22C55E] ring-[#DCFCE7]'
  }
  if (kind === 'invited' || kind === 'nominated' || kind === 'waiting_list_promoted') {
    return 'bg-[#eff6ff] text-[#0d6efd] ring-[#dbeafe]'
  }
  return 'bg-[#F8FAFC] text-[#64748B] ring-[#E2E8F0]'
}

export function InboxPanel({ onUnreadChange }: { onUnreadChange?: (n: number) => void }) {
  const [items, setItems] = useState<NotificationWithContext[]>([])
  const [introShares, setIntroShares] = useState<ContactIntroShare[]>([])
  const [saveRequests, setSaveRequests] = useState<UserSaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [introActionId, setIntroActionId] = useState<string | null>(null)
  const [introActionError, setIntroActionError] = useState<string | null>(null)
  const [saveRequestActionId, setSaveRequestActionId] = useState<string | null>(null)
  const router = useRouter()

  const load = async () => {
    const supabase = createSupabaseBrowserClient()
    setLoading(true)
    try {
      const [list, shares, requests, count] = await Promise.all([
        getNotifications(supabase),
        getContactIntroShares(supabase),
        getUserSaveRequests(supabase),
        import('@/lib/api/notifications').then(m => m.getUnreadNotificationCount(supabase)),
      ])
      setItems(list.filter((item) => item.kind !== 'contact_intro_share' && item.kind !== 'save_request'))
      setIntroShares(shares.filter((share) => share.direction === 'inbound' && share.status === 'pending'))
      setSaveRequests(requests.filter((request) => request.status === 'pending'))
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

  const handleSaveIntroShare = async (share: ContactIntroShare) => {
    const supabase = createSupabaseBrowserClient()
    setIntroActionId(share.share_id)
    setIntroActionError(null)
    try {
      await saveContactIntroShare(supabase, share.share_id)
      setIntroShares(prev => prev.filter(item => item.share_id !== share.share_id))
      await load()
      router.refresh()
    } catch (e) {
      setIntroActionError((e as Error).message)
    } finally {
      setIntroActionId(null)
    }
  }

  const handleDismissIntroShare = async (share: ContactIntroShare) => {
    const supabase = createSupabaseBrowserClient()
    setIntroActionId(share.share_id)
    setIntroActionError(null)
    try {
      await dismissContactIntroShare(supabase, share.share_id)
      setIntroShares(prev => prev.filter(item => item.share_id !== share.share_id))
      await load()
      router.refresh()
    } catch (e) {
      setIntroActionError((e as Error).message)
    } finally {
      setIntroActionId(null)
    }
  }

  const handleSaveRequestResponse = async (request: UserSaveRequest, allow: boolean) => {
    const supabase = createSupabaseBrowserClient()
    setSaveRequestActionId(request.request_id)
    setIntroActionError(null)
    try {
      await respondToUserSaveRequest(supabase, request.request_id, allow)
      setSaveRequests(prev => prev.filter(item => item.request_id !== request.request_id))
      await load()
      router.refresh()
    } catch (e) {
      setIntroActionError((e as Error).message)
    } finally {
      setSaveRequestActionId(null)
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

      {introActionError ? (
        <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-body-sub text-red-700">
          {introActionError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-body-main text-gray-500">Loading…</p>
      ) : introShares.length === 0 && saveRequests.length === 0 && items.length === 0 ? (
        <p className="text-body-main italic text-gray-500">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {saveRequests.map((request) => {
            const requesterName = request.requester_display_name || 'Someone'
            const isBusy = saveRequestActionId === request.request_id

            return (
              <li
                key={request.request_id}
                className="rounded-[24px] border border-[#dbeafe] bg-[#F8FBFF] px-4 py-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Avatar
                      src={request.requester_avatar_url}
                      displayName={requesterName}
                      size="md"
                      fallback="initial"
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-label inline-flex items-center rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#0d6efd] ring-1 ring-[#dbeafe]">
                          PlayerHood request
                        </span>
                        <span className="text-body-sub text-gray-400">{formatTime(request.created_at)}</span>
                      </div>
                      <h3 className="mt-2 text-title-main text-gray-900">
                        {requesterName} wants to add you to their PlayerHood.
                      </h3>
                      <p className="text-body-sub mt-1 text-gray-600">
                        If you allow this, {requesterName} can save your basic player profile and invite you to play. Your phone and email will not be shared.
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSaveRequestResponse(request, true)}
                      className="text-body-main rounded-full bg-[#0B1F44] px-4 py-2 font-semibold text-white transition hover:bg-[#16335F] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSaveRequestResponse(request, false)}
                      className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-semibold text-[#475569] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
          {introShares.map((share) => {
            const personName = share.person_display_name || 'this player'
            const senderName = share.sender_display_name || 'Someone'
            const isBusy = introActionId === share.share_id

            return (
              <li
                key={share.share_id}
                className="rounded-[24px] border border-[#dbeafe] bg-[#F8FBFF] px-4 py-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Avatar
                      src={share.person_avatar_url}
                      displayName={personName}
                      size="md"
                      fallback="contact"
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-label inline-flex items-center rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#0d6efd] ring-1 ring-[#dbeafe]">
                          Intro shared
                        </span>
                        <span className="text-body-sub text-gray-400">{formatTime(share.created_at)}</span>
                      </div>
                      <h3 className="mt-2 text-title-main text-gray-900">
                        {senderName} shared {personName}'s Intro with you.
                      </h3>
                      <p className="text-body-sub mt-1 text-gray-600">
                        Save {personName} to your Hood so you can invite them to matches.
                      </p>
                      {share.optional_message ? (
                        <p className="text-body-sub mt-2 rounded-[16px] bg-white px-3 py-2 text-gray-600 ring-1 ring-[#E2E8F0]">
                          {share.optional_message}
                        </p>
                      ) : null}
                      <p className="text-body-sub mt-2 text-gray-500">Contact details stay private.</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSaveIntroShare(share)}
                      className="text-body-main rounded-full bg-[#0B1F44] px-4 py-2 font-semibold text-white transition hover:bg-[#16335F] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {share.already_saved ? 'Saved' : 'Save to Hood'}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDismissIntroShare(share)}
                      className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-semibold text-[#475569] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
          {items.map(n => (
            <li
              key={n.id}
              className={[
                'flex items-start gap-3 rounded-[24px] border px-4 py-3 transition-colors',
                n.read_at ? 'border-[#E2E8F0] bg-white' : 'border-[#dbeafe] bg-[#F8FBFF]',
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
