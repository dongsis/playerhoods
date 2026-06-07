'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { PendingGroupInvite, GroupWithMembers } from '@/lib/api/players'
import {
  acceptGroupInvite,
  acceptGroupJoinRequest,
  declineGroupJoinRequest,
  rejectGroupInvite,
} from '@/lib/api/groups'
import type { Sport } from '@/lib/types/database'
import { getGroupIconMeta } from '@/lib/group-icons'

type Props = {
  groups: GroupWithMembers[]
  pendingInvites: PendingGroupInvite[]
  sports: Sport[]
  showBackToDashboard?: boolean
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatGroupMetaTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) return 'Yesterday'

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function GroupsPanel({ groups, pendingInvites, sports, showBackToDashboard = false }: Props) {
  const router = useRouter()
  const [keeperNames, setKeeperNames] = useState<Map<string, string>>(new Map())
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedSportId, setSelectedSportId] = useState<string>('all')

  useEffect(() => {
    const keeperIds = Array.from(new Set(groups.map((group) => group.group.boundary_keeper_id)))
    if (keeperIds.length === 0) {
      setKeeperNames(new Map())
      return
    }

    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    void supabase
      .from('profile_display')
      .select('id, display_name')
      .in('id', keeperIds)
      .then(({ data, error: lookupError }) => {
        if (cancelled || lookupError) return
        setKeeperNames(
          new Map(
            ((data ?? []) as { id: string; display_name: string }[]).map((row) => [row.id, row.display_name]),
          ),
        )
      })

    return () => {
      cancelled = true
    }
  }, [groups])

  const sportNameById = useMemo(
    () => new Map(sports.map((sport) => [sport.id, sport.display_name])),
    [sports],
  )

  const availableSportFilters = useMemo(() => {
    return sports
  }, [sports])

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return groups.filter(({ group }) => {
      const matchesSport =
        selectedSportId === 'all' || String(group.primary_sport_id ?? '') === selectedSportId
      if (!matchesSport) return false

      if (!needle) return true

      const sportName = group.primary_sport_id ? sportNameById.get(group.primary_sport_id) ?? '' : ''
      const preview = group.description ?? ''
      return [group.name, sportName, preview].some((value) => value.toLowerCase().includes(needle))
    })
  }, [groups, query, selectedSportId, sportNameById])

  const handlePendingDecision = async (invite: PendingGroupInvite, decision: 'accept' | 'decline') => {
    const actionKey = `${invite.pendingKind}:${invite.requestId ?? invite.groupId}:${decision}`
    setPendingActionKey(actionKey)
    setFeedback(null)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      if (invite.pendingKind === 'approval_request') {
        if (!invite.requestId) throw new Error('Missing join request id')
        if (decision === 'accept') {
          await acceptGroupJoinRequest(supabase, invite.requestId)
          setFeedback(`Joined ${invite.groupName}.`)
        } else {
          await declineGroupJoinRequest(supabase, invite.requestId)
          setFeedback(`Declined ${invite.groupName}.`)
        }
      } else if (decision === 'accept') {
        await acceptGroupInvite(supabase, invite.groupId)
        setFeedback(`Joined ${invite.groupName}.`)
      } else {
        await rejectGroupInvite(supabase, invite.groupId)
        setFeedback(`Declined ${invite.groupName}.`)
      }

      router.refresh()
    } catch (actionError) {
      const message =
        (actionError as { message?: string })?.message ??
        (decision === 'accept' ? 'Failed to accept group request' : 'Failed to decline group request')
      setError(message)
    } finally {
      setPendingActionKey(null)
    }
  }

  return (
    <div className="space-y-6 max-[768px]:space-y-4 max-[768px]:pb-20">
      <section className="rounded-[30px] border border-[#E2E8F0] bg-white px-6 py-5 shadow-[0_20px_42px_-34px_rgba(30,41,59,0.16)] max-[768px]:rounded-none max-[768px]:border-0 max-[768px]:px-4 max-[768px]:pb-3 max-[768px]:pt-4 max-[768px]:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 max-[768px]:items-center max-[768px]:gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-label text-[#94A3B8] max-[768px]:hidden">Community</div>
            <h1 className="text-h1 mt-1 text-[#1E293B] max-[768px]:mt-0 max-[768px]:text-[24px] max-[768px]:leading-tight">
              Groups
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-[768px]:shrink-0">
            {showBackToDashboard ? (
              <Link
                href="/dashboard"
                className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#475569] transition hover:border-[#0d6efd]/35 hover:bg-[#F8FBFF] max-[768px]:hidden"
              >
                Back to dashboard
              </Link>
            ) : null}
            <Link
              href="/groups/new"
              className="text-body-main rounded-full bg-[#0d6efd] px-4 py-2 font-semibold text-white transition hover:bg-[#0b5ed7] max-[768px]:px-3 max-[768px]:py-2 max-[768px]:text-[13px] max-[768px]:leading-none"
            >
              + New Group
            </Link>
          </div>
        </div>

        <div className="mt-5">
          <label className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]">
              <SearchIcon />
            </span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a group"
              className="text-body-main w-full rounded-[18px] border border-[#D7E2F0] bg-white py-3 pl-11 pr-4 text-[#1E293B] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0d6efd] focus:ring-2 focus:ring-[#0d6efd]/10 max-[768px]:rounded-[16px] max-[768px]:py-3"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 max-[768px]:-mx-4 max-[768px]:flex-nowrap max-[768px]:overflow-x-auto max-[768px]:px-4 max-[768px]:pb-1">
          <span className="text-label text-[#94A3B8] max-[768px]:hidden">Sport</span>
          <button
            type="button"
            onClick={() => setSelectedSportId('all')}
            className={`text-body-sub shrink-0 rounded-full px-4 py-2 font-semibold transition ${
              selectedSportId === 'all'
                ? 'bg-[#0d6efd] text-white'
                : 'bg-[#F8FBFF] text-[#94A3B8] hover:bg-[#EEF4FB] hover:text-[#475569]'
            }`}
          >
            All
          </button>
          {availableSportFilters.map((sport) => (
            <button
              key={sport.id}
              type="button"
              onClick={() => setSelectedSportId(String(sport.id))}
              className={`text-body-sub shrink-0 rounded-full px-4 py-2 font-semibold transition ${
                selectedSportId === String(sport.id)
                  ? 'bg-[#1E293B] text-white'
                  : 'bg-[#F8FBFF] text-[#94A3B8] hover:bg-[#EEF4FB] hover:text-[#475569]'
              }`}
            >
              {sport.display_name}
            </button>
          ))}
        </div>
      </section>

      {feedback ? (
        <section className="text-body-main rounded-[24px] border border-[#BBF7D0] bg-[#F0FDF4] px-5 py-4 text-[#166534] max-[768px]:mx-4">
          {feedback}
        </section>
      ) : null}

      {error ? (
        <section className="text-body-main rounded-[24px] border border-[#FECACA] bg-[#FEF2F2] px-5 py-4 text-[#B91C1C] max-[768px]:mx-4">
          {error}
        </section>
      ) : null}

      {pendingInvites.length > 0 ? (
        <section className="rounded-[30px] border border-[#FDE68A] bg-[#FFFBEB] p-5 shadow-[0_20px_42px_-34px_rgba(30,41,59,0.12)] max-[768px]:mx-4 max-[768px]:rounded-[22px] max-[768px]:p-4">
          <div className="text-label text-[#0d6efd]">Pending</div>
          <div className="mt-3 space-y-3">
            {pendingInvites.map((invite) => (
              <div
                key={`${invite.pendingKind}:${invite.requestId ?? invite.groupId}`}
                className="rounded-[22px] border border-[#FDE68A] bg-white px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-title-main text-[#1E293B]">{invite.groupName}</div>
                    <div className="text-body-sub mt-1 text-[#64748B]">
                      {invite.primarySportId ? sportNameById.get(invite.primarySportId) ?? 'Shared Group' : 'Shared Group'}
                    </div>
                  </div>
                  <span className="text-label rounded-full bg-[#eff6ff] px-2.5 py-1 text-[#0d6efd]">
                    {invite.pendingKind === 'approval_request' ? 'Approval' : 'Invite'}
                  </span>
                </div>
                {invite.invitedByName ? (
                  <div className="text-body-sub mt-2 text-[#94A3B8]">
                    {invite.pendingKind === 'approval_request' ? 'Requested by ' : 'Invited by '}
                    {invite.invitedByName}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handlePendingDecision(invite, 'accept')}
                    disabled={pendingActionKey === `${invite.pendingKind}:${invite.requestId ?? invite.groupId}:accept`}
                    className="text-body-main rounded-full bg-[#0d6efd] px-4 py-2 font-semibold text-white transition hover:bg-[#0b5ed7] disabled:opacity-60"
                  >
                    {pendingActionKey === `${invite.pendingKind}:${invite.requestId ?? invite.groupId}:accept`
                      ? 'Working...'
                      : invite.pendingKind === 'approval_request'
                        ? 'Join'
                        : 'Accept'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePendingDecision(invite, 'decline')}
                    disabled={pendingActionKey === `${invite.pendingKind}:${invite.requestId ?? invite.groupId}:decline`}
                    className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#475569] transition hover:border-[#0d6efd]/35 hover:bg-[#F8FBFF] disabled:opacity-60"
                  >
                    {pendingActionKey === `${invite.pendingKind}:${invite.requestId ?? invite.groupId}:decline`
                      ? 'Working...'
                      : 'Decline'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {filteredGroups.length === 0 ? (
        <section className="text-body-main rounded-[30px] border border-dashed border-[#CBD5E1] bg-[#F8FBFF] p-8 text-center text-[#64748B] max-[768px]:mx-4 max-[768px]:rounded-[22px] max-[768px]:p-6">
          No groups match this view.
        </section>
      ) : (
        <section className="overflow-hidden rounded-[32px] border border-[#E2E8F0] bg-white shadow-[0_24px_50px_-40px_rgba(30,41,59,0.18)] max-[768px]:rounded-none max-[768px]:border-x-0 max-[768px]:shadow-none">
          {filteredGroups.map(({ group, members }, index) => {
            const sportName = group.primary_sport_id
              ? sportNameById.get(group.primary_sport_id) ?? 'Shared Group'
              : 'Shared Group'
            const keeperName = keeperNames.get(group.boundary_keeper_id) ?? 'Coordinator'
            const preview = group.description?.trim()
              ? `${keeperName}: ${group.description.trim()}`
              : group.open_to_club_members
                ? `${keeperName}: Open to club members.`
                : `${keeperName}: Private group.`
            const icon = getGroupIconMeta(group.icon_key)

            return (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className={`flex items-center gap-4 px-5 py-5 transition hover:bg-[#F8FBFF] max-[768px]:gap-3 max-[768px]:px-4 max-[768px]:py-4 ${
                  index === 0 ? '' : 'border-t border-[#EEF3F8]'
                }`}
              >
                <div className="relative shrink-0">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-1 top-2 h-2.5 w-2.5 rounded-full border-2 border-white ${
                      group.open_to_club_members ? 'bg-[#22C55E]' : 'bg-[#F97316]'
                    }`}
                  />
                  <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#EEF2F7] bg-white text-[22px] shadow-[0_10px_24px_-22px_rgba(30,41,59,0.25)] max-[768px]:h-11 max-[768px]:w-11 max-[768px]:text-[20px]">
                    {icon.emoji}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 max-[768px]:gap-1.5">
                    <h2 className="text-title-main truncate text-[#1E293B]">
                      {group.name}
                    </h2>
                    <span className="text-label rounded-full bg-[#eff6ff] px-2 py-0.5 text-[#0d6efd] max-[768px]:max-w-full max-[768px]:truncate">
                      {sportName}
                    </span>
                  </div>
                  <p className="text-body-sub mt-1 truncate italic text-[#64748B]">{preview}</p>
                </div>

                <div className="shrink-0 text-right max-[768px]:hidden">
                  <div className="text-body-sub text-[#94A3B8]">{formatGroupMetaTime(group.created_at)}</div>
                  <div className="text-label mt-2 inline-flex min-w-[2rem] items-center justify-center rounded-[10px] bg-[#F8FBFF] px-2 py-1 text-[#94A3B8]">
                    {members.length}
                  </div>
                </div>

                <div className="shrink-0 text-[#CBD5E1]">
                  <ChevronRight />
                </div>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
