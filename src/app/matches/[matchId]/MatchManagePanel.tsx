'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  inviteGroupToMatch,
  inviteUserToMatch,
  nominateGuest,
  nominateUser,
  revokeGroupInvite,
  type MatchGroupInvite,
  type MatchParticipantEnriched,
  type ScopeUser,
} from '@/lib/api/matches'
import type { Group } from '@/lib/types/database'
import type { MatchUpdateInput } from './match-detail.actions'

type CurrentRequestTarget = {
  id: string
  name: string
}

type SummaryEntry = {
  key: string
  label: string
  kind: 'user' | 'group' | 'contact'
  avatarUrl?: string | null
  onRemove?: () => void
}

type CandidateItem = {
  key: string
  id: string
  name: string
  kind: 'user' | 'group' | 'contact'
  sourceLabel?: string
}

type StagedAdd = CandidateItem & {
  mode: 'invite' | 'request'
}

type StagedRevoke =
  | {
      key: string
      mode: 'invite'
      kind: 'user'
      id: string
      name: string
      participantId: string
    }
  | {
      key: string
      mode: 'invite'
      kind: 'group'
      id: string
      name: string
      groupId: string
    }
  | {
      key: string
      mode: 'remove'
      kind: 'user'
      id: string
      name: string
      participantId: string
    }
  | {
      key: string
      mode: 'request'
      kind: 'user' | 'group'
      id: string
      name: string
    }

type Props = {
  matchId: string
  isOrganizer: boolean
  organizerUserId: string | null
  embedded?: boolean
  requiredCount: number
  confirmedParticipants: MatchParticipantEnriched[]
  activeInviteParticipants: MatchParticipantEnriched[]
  activeGroupInvites: MatchGroupInvite[]
  activeRequestUsers: CurrentRequestTarget[]
  activeRequestGroups: CurrentRequestTarget[]
  candidateUsers: ScopeUser[]
  contactTargets: { guest_id: string; display_name: string; sourceLabel: string; email: string | null }[]
  candidateGroups: Group[]
  onUpdateMatchDetails: (data: MatchUpdateInput) => Promise<void>
  onRemoveParticipant: (participantId: string) => Promise<void>
}

function sortStrings(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function SummaryPreviewAvatar({
  label,
  kind,
  avatarUrl,
  zIndex,
}: {
  label: string
  kind: SummaryEntry['kind']
  avatarUrl?: string | null
  zIndex: number
}) {
  const initial = label.charAt(0).toUpperCase() || '?'

  return (
    <div
      className={[
        'relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white text-[11px] font-bold shadow-sm',
        kind === 'user'
          ? 'bg-[#5ca0a0] text-white'
          : kind === 'contact'
            ? 'border-dashed border-slate-300 bg-slate-100 text-slate-500'
            : 'bg-green-100 text-green-700',
      ].join(' ')}
      style={{ zIndex }}
      title={label}
    >
      {avatarUrl && kind !== 'group' ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}

function SummaryRosterRow({
  title,
  items,
  emptyLabel,
  metaLabel,
}: {
  title: string
  items: SummaryEntry[]
  emptyLabel: string
  metaLabel?: string | null
}) {
  const previewItems = items.slice(0, 4)
  const overflow = items.length > previewItems.length ? ` +${items.length - previewItems.length}` : ''

  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-300">{emptyLabel}</div>
      ) : (
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex shrink-0 -space-x-2 pt-0.5">
            {previewItems.map((item, index) => (
              <SummaryPreviewAvatar
                key={`avatar-${item.key}`}
                label={item.label}
                kind={item.kind}
                avatarUrl={item.avatarUrl}
                zIndex={10 - index}
              />
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-700">
              {previewItems.map((item) => (
                <span key={item.key} className="inline-flex min-w-0 items-center gap-1">
                  <span className="break-all">{item.label}</span>
                  {item.kind === 'group' ? (
                    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-green-700">
                      Group
                    </span>
                  ) : item.kind === 'contact' ? (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Contact
                    </span>
                  ) : null}
                  {item.onRemove ? (
                    <button
                      type="button"
                      onClick={item.onRemove}
                      className="opacity-40 transition hover:opacity-100"
                      aria-label={`Remove ${item.label}`}
                    >
                      x
                    </button>
                  ) : null}
                </span>
              ))}
              {overflow ? <span className="text-slate-400">{overflow}</span> : null}
            </div>
            {metaLabel ? (
              <div className="mt-1 text-xs text-slate-400">{metaLabel}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export function MatchManagePanel({
  matchId,
  isOrganizer,
  organizerUserId,
  embedded = false,
  requiredCount,
  confirmedParticipants,
  activeInviteParticipants,
  activeGroupInvites,
  activeRequestUsers,
  activeRequestGroups,
  candidateUsers,
  contactTargets,
  candidateGroups,
  onUpdateMatchDetails,
  onRemoveParticipant,
}: Props) {
  const router = useRouter()
  const panelRef = useRef<HTMLElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectionMode, setSelectionMode] = useState<'invite' | 'request'>('invite')
  const [search, setSearch] = useState('')
  const [stagedAdds, setStagedAdds] = useState<StagedAdd[]>([])
  const [stagedRevokes, setStagedRevokes] = useState<StagedRevoke[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const revokedInviteParticipantIds = new Set(
    stagedRevokes
      .filter((item): item is Extract<StagedRevoke, { mode: 'invite'; kind: 'user' }> => item.mode === 'invite' && item.kind === 'user')
      .map((item) => item.participantId),
  )
  const removedConfirmedParticipantIds = new Set(
    stagedRevokes
      .filter((item): item is Extract<StagedRevoke, { mode: 'remove'; kind: 'user' }> => item.mode === 'remove' && item.kind === 'user')
      .map((item) => item.participantId),
  )
  const revokedInviteGroupIds = new Set(
    stagedRevokes
      .filter((item): item is Extract<StagedRevoke, { mode: 'invite'; kind: 'group' }> => item.mode === 'invite' && item.kind === 'group')
      .map((item) => item.groupId),
  )
  const revokedRequestUserIds = new Set(
    stagedRevokes.filter((item) => item.mode === 'request' && item.kind === 'user').map((item) => item.id),
  )
  const revokedRequestGroupIds = new Set(
    stagedRevokes.filter((item) => item.mode === 'request' && item.kind === 'group').map((item) => item.id),
  )

  const activeInviteUsers = useMemo(
    () => activeInviteParticipants.filter((participant) => !revokedInviteParticipantIds.has(participant.id)),
    [activeInviteParticipants, revokedInviteParticipantIds],
  )
  const visibleConfirmedParticipants = useMemo(
    () => confirmedParticipants.filter((participant) => !removedConfirmedParticipantIds.has(participant.id)),
    [confirmedParticipants, removedConfirmedParticipantIds],
  )
  const activeVisibleGroupInvites = useMemo(
    () => activeGroupInvites.filter((group) => !revokedInviteGroupIds.has(group.group_id)),
    [activeGroupInvites, revokedInviteGroupIds],
  )

  const visibleRequestUsers = useMemo(
    () => activeRequestUsers.filter((user) => !revokedRequestUserIds.has(user.id)),
    [activeRequestUsers, revokedRequestUserIds],
  )

  const visibleRequestGroups = useMemo(
    () => activeRequestGroups.filter((group) => !revokedRequestGroupIds.has(group.id)),
    [activeRequestGroups, revokedRequestGroupIds],
  )

  const stagedInviteAdds = stagedAdds.filter((item) => item.mode === 'invite')
  const stagedRequestAdds = stagedAdds.filter((item) => item.mode === 'request')

  const inviteUserCandidates = candidateUsers.map<CandidateItem>((user) => ({
    key: `user:${user.id}`,
    id: user.id,
    name: user.display_name,
    kind: 'user',
    sourceLabel: user.sourceLabel,
  }))

  const contactCandidates = contactTargets.map<CandidateItem>((target) => ({
    key: `contact:${target.guest_id}`,
    id: target.guest_id,
    name: target.display_name,
    kind: 'contact',
    sourceLabel: target.sourceLabel,
  }))

  const groupCandidates = candidateGroups.map<CandidateItem>((group) => ({
    key: `group:${group.id}`,
    id: group.id,
    name: group.name,
    kind: 'group',
  }))

  const currentInviteUserIds = new Set(
    activeInviteParticipants.map((participant) => participant.user_id).filter((id): id is string => Boolean(id)),
  )
  const currentGroupInviteIds = new Set(activeGroupInvites.map((group) => group.group_id))
  const currentRequestUserIds = new Set(activeRequestUsers.map((user) => user.id))
  const currentRequestGroupIds = new Set(activeRequestGroups.map((group) => group.id))
  const stagedAddKeys = new Set(stagedAdds.map((item) => `${item.mode}:${item.key}`))

  const candidates = useMemo(() => {
    const pool = selectionMode === 'invite'
      ? [...inviteUserCandidates, ...contactCandidates, ...(isOrganizer ? groupCandidates : [])]
      : [...inviteUserCandidates, ...(isOrganizer ? groupCandidates : [])]

    return pool.filter((candidate) => {
      if (stagedAddKeys.has(`${selectionMode}:${candidate.key}`)) return false

      if (selectionMode === 'invite') {
        if (candidate.kind === 'user' && currentInviteUserIds.has(candidate.id)) return false
        if (candidate.kind === 'group' && currentGroupInviteIds.has(candidate.id)) return false
      } else {
        if (candidate.kind === 'user' && currentRequestUserIds.has(candidate.id) && !revokedRequestUserIds.has(candidate.id)) return false
        if (candidate.kind === 'group' && currentRequestGroupIds.has(candidate.id) && !revokedRequestGroupIds.has(candidate.id)) return false
      }

      if (!search.trim()) return true
      const haystack = `${candidate.name} ${candidate.sourceLabel ?? ''}`.toLowerCase()
      return haystack.includes(search.trim().toLowerCase())
    })
  }, [
    currentGroupInviteIds,
    currentInviteUserIds,
    currentRequestGroupIds,
    currentRequestUserIds,
    contactCandidates,
    groupCandidates,
    isOrganizer,
    inviteUserCandidates,
    revokedRequestGroupIds,
    revokedRequestUserIds,
    search,
    selectionMode,
    stagedAddKeys,
  ])

  const stageAdd = (candidate: CandidateItem) => {
    setSuccess(null)
    setError(null)
    setStagedAdds((prev) => [
      ...prev,
      {
        ...candidate,
        mode: selectionMode,
      },
    ])
  }

  const stageInviteRevoke = (participant: MatchParticipantEnriched) => {
    setSuccess(null)
    setError(null)
    setStagedRevokes((prev) => [
      ...prev,
      {
        key: `invite:${participant.id}`,
        mode: 'invite',
        kind: 'user',
        id: participant.user_id ?? participant.id,
        name: participant.display_name,
        participantId: participant.id,
      },
    ])
  }

  const stageGroupInviteRevoke = (group: MatchGroupInvite) => {
    setSuccess(null)
    setError(null)
    setStagedRevokes((prev) => [
      ...prev,
      {
        key: `invite-group:${group.group_id}`,
        mode: 'invite',
        kind: 'group',
        id: group.group_id,
        name: group.group_name,
        groupId: group.group_id,
      },
    ])
  }

  const stageRequestRevoke = (target: CurrentRequestTarget, kind: 'user' | 'group') => {
    setSuccess(null)
    setError(null)
    setStagedRevokes((prev) => [
      ...prev,
      {
        key: `request:${kind}:${target.id}`,
        mode: 'request',
        kind,
        id: target.id,
        name: target.name,
      },
    ])
  }

  const stageConfirmedRemove = (participant: MatchParticipantEnriched) => {
    setSuccess(null)
    setError(null)
    setStagedRevokes((prev) => [
      ...prev,
      {
        key: `remove:${participant.id}`,
        mode: 'remove',
        kind: 'user',
        id: participant.user_id ?? participant.id,
        name: participant.display_name,
        participantId: participant.id,
      },
    ])
  }

  const cancelAdd = (key: string, mode: 'invite' | 'request') => {
    setStagedAdds((prev) => prev.filter((item) => !(item.key === key && item.mode === mode)))
  }

  const cancelRevoke = (key: string) => {
    setStagedRevokes((prev) => prev.filter((item) => item.key !== key))
  }

  const handleApply = async () => {
    setIsApplying(true)
    setError(null)
    setSuccess(null)

    try {
      const nextRequestUserIds = sortStrings([
        ...activeRequestUsers
          .map((user) => user.id)
          .filter((id) => !revokedRequestUserIds.has(id)),
        ...stagedRequestAdds.filter((item) => item.kind === 'user').map((item) => item.id),
      ])

      const nextRequestGroupIds = sortStrings([
        ...activeRequestGroups
          .map((group) => group.id)
          .filter((id) => !revokedRequestGroupIds.has(id)),
        ...stagedRequestAdds.filter((item) => item.kind === 'group').map((item) => item.id),
      ])

      const currentRequestUserIdsSorted = sortStrings(activeRequestUsers.map((user) => user.id))
      const currentRequestGroupIdsSorted = sortStrings(activeRequestGroups.map((group) => group.id))

      if (
        !arraysEqual(nextRequestUserIds, currentRequestUserIdsSorted) ||
        !arraysEqual(nextRequestGroupIds, currentRequestGroupIdsSorted)
      ) {
        await onUpdateMatchDetails({
          invitation_scope_user_ids: nextRequestUserIds,
          invitation_scope_group_ids: nextRequestGroupIds,
        })
      }

      const supabase = createSupabaseBrowserClient()

      for (const item of stagedRevokes) {
        if (item.mode === 'invite' && item.kind === 'user') {
          await onRemoveParticipant(item.participantId)
        }
        if (item.mode === 'invite' && item.kind === 'group') {
          await revokeGroupInvite(supabase, matchId, item.groupId)
        }
        if (item.mode === 'remove' && item.kind === 'user') {
          await onRemoveParticipant(item.participantId)
        }
      }

      for (const item of stagedInviteAdds) {
        if (item.kind === 'user') {
          if (isOrganizer) {
            await inviteUserToMatch(supabase, matchId, item.id)
          } else {
            await nominateUser(supabase, matchId, item.id)
          }
        } else if (item.kind === 'group') {
          await inviteGroupToMatch(supabase, matchId, item.id)
        } else {
          await nominateGuest(supabase, matchId, item.id)
        }
      }

      setStagedAdds([])
      setStagedRevokes([])
      setSearch('')
      setSuccess('Changes applied.')
      router.refresh()
    } catch (applyError) {
      setError((applyError as { message?: string })?.message ?? 'Failed to apply changes')
    } finally {
      setIsApplying(false)
    }
  }

  const changes = [
    ...stagedInviteAdds.map((item) => ({
      key: `add:${item.mode}:${item.key}`,
      tone: 'invite' as const,
      label: 'INVITE',
      name: item.name,
      onUndo: () => cancelAdd(item.key, item.mode),
      isGroup: item.kind === 'group',
    })),
    ...stagedRequestAdds.map((item) => ({
      key: `add:${item.mode}:${item.key}`,
      tone: 'request' as const,
      label: 'OPEN',
      name: item.name,
      onUndo: () => cancelAdd(item.key, item.mode),
      isGroup: item.kind === 'group',
    })),
    ...stagedRevokes.map((item) => ({
      key: `revoke:${item.key}`,
      tone: item.mode === 'remove' ? ('invite' as const) : ('revoke' as const),
      label: item.mode === 'remove' ? 'REMOVE' : 'REVOKE',
      name: item.name,
      onUndo: () => cancelRevoke(item.key),
      isGroup: item.kind === 'group',
    })),
  ]

  const confirmedSummaryItems: SummaryEntry[] = visibleConfirmedParticipants.map((participant) => ({
    key: `confirmed-${participant.id}`,
    label: participant.display_name,
    kind: participant.user_id ? ('user' as const) : ('contact' as const),
    avatarUrl: participant.avatar_url ?? null,
    onRemove: isOrganizer && participant.user_id !== organizerUserId
      ? () => stageConfirmedRemove(participant)
      : undefined,
  }))

  const inviteSummaryItems: SummaryEntry[] = [
    ...activeInviteUsers.map((participant) => ({
      key: `invite-user-${participant.id}`,
      label: participant.display_name,
      kind: participant.user_id ? ('user' as const) : ('contact' as const),
      avatarUrl: participant.avatar_url ?? null,
      onRemove: isOrganizer ? () => stageInviteRevoke(participant) : undefined,
    })),
    ...activeVisibleGroupInvites.map((group) => ({
      key: `invite-group-${group.group_id}`,
      label: group.group_name,
      kind: 'group' as const,
      onRemove: isOrganizer ? () => stageGroupInviteRevoke(group) : undefined,
    })),
  ]

  const requestSummaryItems: SummaryEntry[] = [
    ...visibleRequestUsers.map((user) => ({
      key: `request-user-${user.id}`,
      label: user.name,
      kind: 'user' as const,
      onRemove: isOrganizer ? () => stageRequestRevoke(user, 'user') : undefined,
    })),
    ...visibleRequestGroups.map((group) => ({
      key: `request-group-${group.id}`,
      label: group.name,
      kind: 'group' as const,
      onRemove: isOrganizer ? () => stageRequestRevoke(group, 'group') : undefined,
    })),
  ]

  const confirmedMetaLabel =
    visibleConfirmedParticipants.length >= requiredCount
      ? 'Full'
      : `${Math.max(requiredCount - visibleConfirmedParticipants.length, 0)} spots left`
  const inviteMetaParts: string[] = []
  if (activeInviteUsers.length > 0) inviteMetaParts.push(`${activeInviteUsers.length} player${activeInviteUsers.length === 1 ? '' : 's'}`)
  if (activeVisibleGroupInvites.length > 0) inviteMetaParts.push(`${activeVisibleGroupInvites.length} group${activeVisibleGroupInvites.length === 1 ? '' : 's'}`)
  const inviteMetaLabel = inviteMetaParts.join(' · ')
  const requestMetaParts: string[] = []
  if (visibleRequestUsers.length > 0) requestMetaParts.push(`${visibleRequestUsers.length} player${visibleRequestUsers.length === 1 ? '' : 's'}`)
  if (visibleRequestGroups.length > 0) requestMetaParts.push(`${visibleRequestGroups.length} group${visibleRequestGroups.length === 1 ? '' : 's'}`)
  const requestMetaLabel = requestMetaParts.join(' · ')

  const spotsLabel = `${visibleConfirmedParticipants.length} / ${requiredCount}${visibleConfirmedParticipants.length >= requiredCount ? ' Full' : ''}`

  return (
    <section
      ref={panelRef}
      className={embedded ? '' : 'mt-5 overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]'}
    >
      {!embedded ? (
        <button
          type="button"
          onClick={() => {
            setIsExpanded((expanded) => {
              const next = !expanded
              if (next) {
                requestAnimationFrame(() => {
                  panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }
              return next
            })
          }}
          className={[
            'flex w-full items-center justify-between px-6 py-5 text-left transition',
            isExpanded ? 'border-b border-slate-100' : '',
          ].join(' ')}
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-50 text-[13px] font-bold text-orange-500">
              +
            </span>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">Invite Players</h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-teal-600">{spotsLabel}</span>
            <span
              className={`text-sm text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              v
            </span>
          </div>
        </button>
      ) : null}

      {(embedded || isExpanded) ? (
        <div className="px-6 pb-6 pt-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-2">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">1. Add By</div>
          <button
            type="button"
            onClick={() => setSelectionMode('invite')}
            className={[
              'flex h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white text-xs font-bold transition',
              selectionMode === 'invite'
                ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-sm'
                : 'border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className="text-lg">+</span>
            <span>Invite</span>
          </button>
          {isOrganizer ? (
            <button
              type="button"
              onClick={() => setSelectionMode('request')}
              className={[
                'flex h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white text-xs font-bold transition',
                selectionMode === 'request'
                  ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                  : 'border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50',
              ].join(' ')}
            >
              <span className="text-lg">O</span>
              <span>Open for Request</span>
            </button>
          ) : null}
        </div>

        <div className="lg:col-span-5">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">2. Select Target</div>
          <div className="rounded-[28px] border border-slate-100 bg-slate-50/70 p-6">
            <div className="relative mb-6">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search friends or groups..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {candidates.length === 0 ? (
                <span className="text-xs italic text-slate-300">No targets available.</span>
              ) : (
                candidates.map((candidate) => (
                  <button
                    key={`${selectionMode}:${candidate.key}`}
                    type="button"
                    onClick={() => stageAdd(candidate)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span>{candidate.name}</span>
                    {candidate.kind === 'group' ? (
                      <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-bold text-green-700">Group</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            <div className="mt-10 border-t border-slate-200 pt-6">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
              >
                <span>+</span>
                <span>HOOD PANEL</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:col-span-5">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">3. Summary</div>
          <div className="flex min-h-[420px] flex-col rounded-[20px] border border-slate-100 bg-[#fafafa] px-5 py-6">
            <div className="mb-8 space-y-3">
              <SummaryRosterRow
                title="Confirmed"
                items={confirmedSummaryItems}
                emptyLabel="No confirmed players yet"
                metaLabel={confirmedMetaLabel}
              />
              <SummaryRosterRow
                title="Invites"
                items={inviteSummaryItems}
                emptyLabel="None"
                metaLabel={inviteMetaLabel}
              />
              {isOrganizer ? (
                <SummaryRosterRow
                  title="Open for Request"
                  items={requestSummaryItems}
                  emptyLabel="None"
                  metaLabel={requestMetaLabel}
                />
              ) : null}
            </div>

            <div className="mt-auto border-t border-slate-100 pt-6">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-orange-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span>New Changes</span>
              </div>

              {changes.length === 0 ? (
                <div className="py-4 text-center opacity-10">
                  <div className="text-2xl">[]</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {changes.map((change) => (
                    <div
                      key={change.key}
                      className={[
                        'flex items-center justify-between rounded-xl p-2 text-[10px] font-bold',
                        change.tone === 'invite'
                          ? 'border border-dashed border-orange-300 bg-orange-50 text-orange-700'
                          : change.tone === 'request'
                            ? 'border border-dashed border-green-300 bg-green-50 text-green-700'
                            : 'border border-red-200 bg-red-50 text-red-700 line-through',
                      ].join(' ')}
                    >
                      <span>
                        <span className="mr-1 text-[8px] opacity-50">{change.label}</span>
                        {change.name}
                        {change.isGroup ? ' (Group)' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={change.onUndo}
                        className="opacity-40 transition hover:opacity-100"
                        aria-label={`Undo ${change.label.toLowerCase()} for ${change.name}`}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(error || success) && (
            <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm">
              {error ? <p className="text-red-600">{error}</p> : null}
              {success ? <p className="text-green-700">{success}</p> : null}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={isApplying || changes.length === 0}
            className="mt-6 w-full rounded-2xl bg-slate-900 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-xl transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? 'Applying...' : 'Apply Changes'}
          </button>
        </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
