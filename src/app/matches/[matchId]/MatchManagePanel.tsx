'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ParticipantQuickPreviewTrigger } from '@/app/components/ParticipantQuickPreviewTrigger'
import { AddPlayersPickerPanel, type AddPlayersCandidate, type AddPlayersMode } from '@/app/matches/AddPlayersPickerPanel'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getAvailabilityStatusDotClass } from '@/lib/profile-options'
import { saveContactPlayer } from '@/lib/api/play-network'
import { createRosterGuest } from '@/lib/api/roster'
import {
  inviteGroupToMatch,
  inviteContactPersonToMatch,
  inviteUserToMatch,
  inviteParticipantUserToMatch,
  revokeGroupInvite,
  type MatchGroupInvite,
  type MatchParticipantEnriched,
  type ScopeUser,
  type ContactPersonAdmissionTarget,
} from '@/lib/api/matches'
import type { AvailabilityStatus, Group } from '@/lib/types/database'
import type { MatchUpdateInput } from './match-detail.actions'
import { processDeliveriesAction } from './process-deliveries-action'

type CurrentRequestTarget = {
  id: string
  name: string
}

type PanelMode = 'invite' | 'remove'
type InviteSelectionMode = 'invite' | 'request'
type AdditionMode = InviteSelectionMode
type RemoveSelectionMode = 'confirmed' | 'invites' | 'requests'
type PickerFilter = 'all' | 'people' | 'groups' | 'contacts' | 'saved'

const ADD_PLAYERS_SECTION_LABEL = 'text-[9px] font-extrabold leading-[1.2] tracking-normal normal-case'
const INVITE_FILTER_OPTIONS: Array<{ value: PickerFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'People' },
  { value: 'groups', label: 'Groups' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'saved', label: 'Saved' },
]
const PLAYER_CALL_FILTER_OPTIONS: Array<{ value: PickerFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'People' },
  { value: 'groups', label: 'Groups' },
]

type CandidateItem = {
  key: string
  id: string
  name: string
  kind: 'user' | 'group' | 'contact'
  availabilityStatus?: AvailabilityStatus | null
  sourceLabel?: string
  avatarUrl?: string | null
  userId?: string | null
  guestId?: string | null
  personId?: string | null
  isLinkedContact?: boolean
}

type PendingAddition = CandidateItem & {
  mode: AdditionMode
}

type PendingRemoval =
  | {
      key: string
      category: 'confirmed'
      kind: 'user' | 'contact'
      id: string
      name: string
      participantId: string
      avatarUrl?: string | null
      userId?: string | null
      guestId?: string | null
      subtitle: string
    }
  | {
      key: string
      category: 'invites'
      kind: 'user' | 'contact'
      id: string
      name: string
      participantId: string
      avatarUrl?: string | null
      userId?: string | null
      guestId?: string | null
      subtitle: string
    }
  | {
      key: string
      category: 'invites'
      kind: 'group'
      id: string
      name: string
      groupId: string
      subtitle: string
    }
  | {
      key: string
      category: 'requests'
      kind: 'user' | 'group'
      id: string
      name: string
      userId?: string | null
      guestId?: string | null
      subtitle: string
    }

type SummaryEntry = {
  key: string
  label: string
  kind: 'user' | 'group' | 'contact'
  detailLabel?: string | null
  availabilityStatus?: AvailabilityStatus | null
  userId?: string | null
  guestId?: string | null
  personId?: string | null
  avatarUrl?: string | null
  isHost?: boolean
}

type RemoveRowItem = {
  key: string
  name: string
  kind: 'user' | 'group' | 'contact'
  avatarUrl?: string | null
  userId?: string | null
  guestId?: string | null
  subtitle: string
  badges: string[]
  selected: boolean
  onToggle: () => void
}

type PendingGroup = {
  title: string
  subtitle: string
  items: PendingRemoval[]
}

type Props = {
  panelMode?: PanelMode
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
  contactTargets: ContactPersonAdmissionTarget[]
  candidateGroups: Group[]
  onUpdateMatchDetails: (data: MatchUpdateInput) => Promise<void>
  onRemoveParticipant: (participantId: string, note?: string | null) => Promise<void>
  onRequestPanelMode?: (mode: PanelMode) => void
  onApplied?: () => void
  shareLinkRow?: ReactNode
}

function sortStrings(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function looksLikeInternalUserLabel(label: string) {
  return /^user\s+[a-f0-9]{4,}$/i.test(label.trim())
}

function normalizeCandidateName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
}

function dedupeCandidateItems(candidates: CandidateItem[]) {
  const byKey = new Set<string>()
  const byPersonName = new Set<string>()
  const deduped: CandidateItem[] = []

  for (const candidate of candidates) {
    if (byKey.has(candidate.key)) continue
    byKey.add(candidate.key)

    if (candidate.kind !== 'group') {
      const normalizedName = normalizeCandidateName(candidate.name)
      if (normalizedName) {
        const personNameKey = `${candidate.kind}:${normalizedName}`
        if (byPersonName.has(personNameKey)) continue
        byPersonName.add(personNameKey)
      }
    }

    deduped.push(candidate)
  }

  return deduped
}

function getAvailabilityLookupKey(kind: 'user' | 'contact', id: string) {
  return `${kind}:${id}`
}

function getLookupAvailabilityStatus(
  lookup: Record<string, AvailabilityStatus | null>,
  item: { kind: 'user' | 'group' | 'contact'; userId?: string | null; guestId?: string | null },
): AvailabilityStatus | null {
  if (item.kind === 'user' && item.userId) {
    return lookup[getAvailabilityLookupKey('user', item.userId)] ?? null
  }
  if (item.kind === 'contact' && item.guestId) {
    return lookup[getAvailabilityLookupKey('contact', item.guestId)] ?? null
  }
  return null
}

function getParticipantEffectiveUserId(participant: MatchParticipantEnriched): string | null {
  return participant.user_id ?? participant.linked_user_id ?? null
}

function getParticipantRosterKind(participant: MatchParticipantEnriched): 'user' | 'contact' {
  if (participant.participant_kind === 'registered_user') return 'user'
  if (participant.participant_kind === 'contact_player') return 'contact'
  return getParticipantEffectiveUserId(participant) ? 'user' : 'contact'
}

function SummaryRosterRow({
  title,
  items,
  emptyLabel,
  metaLabel,
  tone = 'slate',
  availabilityLookup,
}: {
  title: string
  items: SummaryEntry[]
  emptyLabel: string
  metaLabel?: string | null
  tone?: 'slate' | 'orange' | 'green'
  availabilityLookup: Record<string, AvailabilityStatus | null>
}) {
  const previewItems = items.slice(0, 5)
  const overflow = items.length > previewItems.length ? ` +${items.length - previewItems.length}` : ''
  const toneDotClass = tone === 'orange' ? 'bg-[#0d6efd]' : tone === 'green' ? 'bg-green-400' : 'bg-teal-500'
  const toneChipClass =
    tone === 'orange'
      ? 'border-[#0d6efd]/15 bg-[#eff6ff] text-[#0d6efd]'
      : tone === 'green'
        ? 'border-green-100 bg-green-50 text-green-700'
        : 'border-[#D6F5EC] bg-[#F2FBF8] text-[#0F766E]'

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${toneDotClass}`} />
        <span className="text-label">{title}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-body-main rounded-lg border border-dashed border-[#E2E8F0] bg-white px-4 py-4 text-[#CBD5E1]">
          {emptyLabel}
        </div>
      ) : (
        <div className="min-w-0">
          <div className="space-y-1.5">
            {previewItems.map((item) => (
              <span key={item.key} className="flex min-w-0 max-w-full flex-col gap-0.5">
                <span
                  className={`text-body-sub flex min-w-0 max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 font-semibold ${toneChipClass}`}
                >
                {item.kind === 'user' ? (
                  (() => {
                    const availabilityDotClass = getAvailabilityStatusDotClass(
                      item.availabilityStatus ?? getLookupAvailabilityStatus(availabilityLookup, item),
                    )
                    return availabilityDotClass ? (
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${availabilityDotClass}`}
                        aria-hidden="true"
                      />
                    ) : null
                  })()
                ) : null}
                {item.kind === 'group' ? (
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                ) : (
                  <ParticipantQuickPreviewTrigger
                    target={{
                      userId: item.userId ?? null,
                      guestId: item.guestId ?? null,
                      displayName: item.label,
                      avatarUrl: item.avatarUrl ?? null,
                    }}
                  >
                    <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.isHost ? (
                        <span className="shrink-0" aria-label="Host" title="Host">
                          👑
                        </span>
                      ) : null}
                    </span>
                  </ParticipantQuickPreviewTrigger>
                )}
                {item.kind === 'contact' ? (
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    Contact
                  </span>
                ) : null}
                {item.kind === 'group' ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                    Group
                  </span>
                ) : null}
                </span>
                {item.detailLabel ? (
                  <span className="text-body-sub pl-1 font-semibold text-slate-400">
                    {item.detailLabel}
                  </span>
                ) : null}
              </span>
            ))}
            {overflow ? <span className="text-body-sub text-slate-400">{overflow}</span> : null}
          </div>
          {metaLabel ? (
            <div className="text-body-sub mt-1 text-slate-400">{metaLabel}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function ActionCard({
  title,
  subtitle,
  selected,
  onClick,
  accent = 'slate',
}: {
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
  accent?: 'slate' | 'orange' | 'green'
}) {
  const selectedClasses =
    accent === 'orange'
      ? 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd] ring-2 ring-[#0d6efd]/15'
      : accent === 'green'
        ? 'border-[#22C55E] bg-[#F0FDF4] text-[#15803D] ring-2 ring-[#22C55E]/15'
        : 'border-[#1E293B] bg-[#1E293B] text-white ring-2 ring-[#1E293B]/10'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-xl border-2 px-4 py-3 text-left transition active:scale-[0.98]',
        selected
          ? selectedClasses
          : accent === 'green'
            ? 'border-[#E2E8F0] bg-white text-[#15803D] hover:border-[#22C55E]/35 hover:bg-[#F0FDF4]'
            : accent === 'orange'
              ? 'border-[#E2E8F0] bg-white text-[#0d6efd] hover:border-[#0d6efd]/35 hover:bg-[#eff6ff]'
              : 'border-[#E2E8F0] bg-white text-[#475569] hover:border-[#1E293B]/25 hover:bg-[#F8FAFC]',
      ].join(' ')}
    >
      <div className="text-title-main">{title}</div>
      <div className={`text-body-sub mt-1 ${selected ? 'text-current/80' : 'text-[#94A3B8]'}`}>
        {subtitle}
      </div>
    </button>
  )
}

function InviteModeButton({
  title,
  selected,
  tone,
  onClick,
}: {
  title: string
  selected: boolean
  tone: 'orange' | 'green'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-[48px] w-full items-center gap-2.5 rounded-xl border-2 px-3 text-left transition active:scale-[0.98]',
        tone === 'green'
          ? selected
            ? 'border-[#22C55E] bg-[#F0FDF4] text-[#15803D] ring-2 ring-[#22C55E]/15'
            : 'border-[#E2E8F0] bg-white text-[#15803D] hover:border-[#22C55E]/35 hover:bg-[#F0FDF4]'
          : selected
            ? 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd] ring-2 ring-[#0d6efd]/15'
            : 'border-[#E2E8F0] bg-white text-[#0d6efd] hover:border-[#0d6efd]/35 hover:bg-[#eff6ff]',
      ].join(' ')}
    >
      <span className="text-base">+</span>
      <span className="text-body-main whitespace-nowrap font-medium">{title}</span>
    </button>
  )
}

function SelectableTargetRow({
  item,
}: {
  item: RemoveRowItem
}) {
  return (
    <button
      type="button"
      onClick={item.onToggle}
      className={[
        'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition',
        item.selected
          ? 'border-[#0d6efd]/35 bg-[#eff6ff] shadow-sm'
          : 'border-[#E2E8F0] bg-white hover:border-[#0d6efd]/20 hover:bg-[#F8FAFC]',
      ].join(' ')}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-500">
        {item.kind === 'group' ? (
          <span>{getInitials(item.name)}</span>
        ) : item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{getInitials(item.name)}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {item.kind === 'group' ? (
            <span className="text-title-main break-words text-slate-800">{item.name}</span>
          ) : (
            <ParticipantQuickPreviewTrigger
              target={{
                userId: item.userId ?? null,
                guestId: item.guestId ?? null,
                displayName: item.name,
                avatarUrl: item.avatarUrl ?? null,
              }}
            >
              <span className="text-title-main break-words text-slate-800">{item.name}</span>
            </ParticipantQuickPreviewTrigger>
          )}
          {item.badges.map((badge) => (
            <span
              key={`${item.key}-${badge}`}
              className={`text-label rounded-full px-1.5 py-0.5 ${
                badge === 'Group'
                  ? 'bg-green-100 text-green-700'
                  : badge === 'Contact'
                    ? 'bg-slate-100 text-slate-500'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {badge}
            </span>
          ))}
        </div>
        <div className="text-body-sub mt-1 text-slate-400">{item.subtitle}</div>
      </div>

      <span
        className={[
          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition',
          item.selected
            ? 'border-[#0d6efd] bg-[#0d6efd] text-white'
            : 'border-[#E2E8F0] bg-white text-transparent',
        ].join(' ')}
        aria-hidden="true"
      >
        ✓
      </span>
    </button>
  )
}

function SelectableInviteChip({
  item,
  selected,
  mode,
  onToggle,
}: {
  item: CandidateItem
  selected: boolean
  mode: InviteSelectionMode
  onToggle: () => void
}) {
  const selectedClass =
    mode === 'request'
      ? 'border-[#22C55E] bg-[#F0FDF4] text-[#15803D]'
      : 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]'
  const hoverClass =
    mode === 'request'
      ? 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#22C55E]/35 hover:bg-[#F0FDF4] hover:text-[#15803D]'
      : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#0d6efd]/35 hover:bg-[#eff6ff] hover:text-[#0d6efd]'
  const availabilityDotClass = item.kind === 'user' ? getAvailabilityStatusDotClass(item.availabilityStatus) : null

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      title={item.sourceLabel ? `${item.name}: ${item.sourceLabel}` : item.name}
      className={[
        'text-body-main flex w-full max-w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
        selected ? selectedClass : hoverClass,
      ].join(' ')}
    >
      {availabilityDotClass ? (
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${availabilityDotClass}`} aria-hidden="true" />
      ) : null}
      {item.kind === 'group' ? (
        <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
      ) : (
        <ParticipantQuickPreviewTrigger
          target={{
            userId: item.userId ?? null,
            guestId: item.guestId ?? null,
            displayName: item.name,
            avatarUrl: item.avatarUrl ?? null,
          }}
        >
          <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
        </ParticipantQuickPreviewTrigger>
      )}
      {item.kind === 'group' ? (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
          Group
        </span>
      ) : null}
      {item.kind === 'contact' ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
          Contact
        </span>
      ) : null}
      {item.isLinkedContact ? (
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
          Linked
        </span>
      ) : null}
      <span
        className={[
          'ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition',
          selected
            ? mode === 'request'
              ? 'border-green-600 bg-green-600 text-white'
              : 'border-[#0d6efd] bg-[#0d6efd] text-white'
            : 'border-[#E2E8F0] bg-white text-transparent',
        ].join(' ')}
        aria-hidden="true"
      >
        ✓
      </span>
    </button>
  )
}

function PendingGroupCard({
  group,
  onUndo,
}: {
  group: PendingGroup
  onUndo: (key: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className="text-title-main text-slate-700">{group.title}</div>
      <div className="text-body-sub mt-1 text-slate-400">{group.subtitle}</div>
      <div className="mt-3 space-y-2">
        {group.items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-body-main break-words font-semibold text-slate-700">
                {item.kind === 'group' ? (
                  item.name
                ) : (
                  <ParticipantQuickPreviewTrigger
                    target={{
                      userId: item.userId ?? null,
                      guestId: item.guestId ?? null,
                      displayName: item.name,
                      avatarUrl: 'avatarUrl' in item ? (item.avatarUrl ?? null) : null,
                    }}
                  >
                    <span>{item.name}</span>
                  </ParticipantQuickPreviewTrigger>
                )}
              </div>
              <div className="text-label mt-1 text-slate-400">
                {item.kind === 'group' ? 'Group' : item.kind === 'contact' ? 'Contact' : 'Player'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUndo(item.key)}
              className="text-body-sub shrink-0 font-semibold text-slate-400 transition hover:text-slate-700"
            >
              Undo
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConfirmationModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  isApplying,
}: {
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  isApplying: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4">
      <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <h3 className="text-h2 text-slate-800">{title}</h3>
        <p className="text-body-main mt-3 text-slate-500">{body}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isApplying}
            className="text-body-main rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel === 'Remove Players' ? 'Cancel' : 'Back'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isApplying}
            className="text-body-main rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? 'Applying...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function MatchManagePanel({
  panelMode = 'invite',
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
  onRequestPanelMode,
  onApplied,
  shareLinkRow,
}: Props) {
  const router = useRouter()
  const panelRef = useRef<HTMLElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [inviteMode, setInviteMode] = useState<InviteSelectionMode>('invite')
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>('all')
  const [removeMode, setRemoveMode] = useState<RemoveSelectionMode>('confirmed')
  const [pendingAdds, setPendingAdds] = useState<PendingAddition[]>([])
  const [pendingRemovals, setPendingRemovals] = useState<PendingRemoval[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [availabilityLookup, setAvailabilityLookup] = useState<Record<string, AvailabilityStatus | null>>({})
  const [localContactCandidates, setLocalContactCandidates] = useState<CandidateItem[]>([])
  const [contactComposerOpen, setContactComposerOpen] = useState(false)
  const [contactDisplayName, setContactDisplayName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [contactCreateError, setContactCreateError] = useState<string | null>(null)
  const [isCreatingContact, setIsCreatingContact] = useState(false)

  useEffect(() => {
    const userIds = Array.from(
      new Set(
        [
          ...candidateUsers.map((user) => user.id),
          ...confirmedParticipants.map((participant) => participant.user_id).filter((id): id is string => Boolean(id)),
          ...activeInviteParticipants.map((participant) => participant.user_id).filter((id): id is string => Boolean(id)),
          ...activeRequestUsers.map((user) => user.id),
        ].filter(Boolean),
      ),
    )
    const guestIds = Array.from(
      new Set(
        [
          ...confirmedParticipants.map((participant) => participant.guest_id).filter((id): id is string => Boolean(id)),
          ...activeInviteParticipants.map((participant) => participant.guest_id).filter((id): id is string => Boolean(id)),
        ].filter(Boolean),
      ),
    )

    if (userIds.length === 0 && guestIds.length === 0) {
      setAvailabilityLookup({})
      return
    }

    let cancelled = false

    async function loadAvailabilityLookup() {
      const supabase = createSupabaseBrowserClient()
      const nextLookup: Record<string, AvailabilityStatus | null> = {}

      const [profilesResult, guestsResult] = await Promise.all([
        userIds.length > 0
          ? supabase.from('profiles').select('id, availability_status').in('id', userIds)
          : Promise.resolve({ data: [], error: null }),
        guestIds.length > 0
          ? supabase.from('guests').select('id, availability_status').in('id', guestIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (profilesResult.error || guestsResult.error) {
        return
      }

      ;(profilesResult.data ?? []).forEach((profile) => {
        nextLookup[getAvailabilityLookupKey('user', profile.id)] = profile.availability_status ?? null
      })
      ;(guestsResult.data ?? []).forEach((guest) => {
        nextLookup[getAvailabilityLookupKey('contact', guest.id)] = guest.availability_status ?? null
      })

      if (!cancelled) {
        setAvailabilityLookup(nextLookup)
      }
    }

    loadAvailabilityLookup()

    return () => {
      cancelled = true
    }
  }, [activeInviteParticipants, activeRequestUsers, candidateUsers, confirmedParticipants, contactTargets])

  const removedConfirmedParticipantIds = new Set(
    pendingRemovals
      .filter((item): item is Extract<PendingRemoval, { category: 'confirmed' }> => item.category === 'confirmed')
      .map((item) => item.participantId),
  )
  const revokedInviteParticipantIds = new Set(
    pendingRemovals
      .filter(
        (item): item is Extract<PendingRemoval, { category: 'invites'; kind: 'user' | 'contact' }> =>
          item.category === 'invites' && (item.kind === 'user' || item.kind === 'contact'),
      )
      .map((item) => item.participantId),
  )
  const revokedInviteGroupIds = new Set(
    pendingRemovals
      .filter((item): item is Extract<PendingRemoval, { category: 'invites'; kind: 'group' }> => item.category === 'invites' && item.kind === 'group')
      .map((item) => item.groupId),
  )
  const revokedRequestUserIds = new Set(
    pendingRemovals
      .filter((item) => item.category === 'requests' && item.kind === 'user')
      .map((item) => item.id),
  )
  const revokedRequestGroupIds = new Set(
    pendingRemovals
      .filter((item) => item.category === 'requests' && item.kind === 'group')
      .map((item) => item.id),
  )

  const visibleConfirmedParticipants = useMemo(
    () => confirmedParticipants.filter((participant) => !removedConfirmedParticipantIds.has(participant.id)),
    [confirmedParticipants, removedConfirmedParticipantIds],
  )
  const visibleInviteUsers = useMemo(
    () => activeInviteParticipants.filter((participant) => !revokedInviteParticipantIds.has(participant.id)),
    [activeInviteParticipants, revokedInviteParticipantIds],
  )
  const visibleInviteGroups = useMemo(
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

  const pendingInviteAdds = pendingAdds.filter((item) => item.mode === 'invite')
  const pendingRequestAdds = pendingAdds.filter((item) => item.mode === 'request')
  const pendingConfirmedRemovals = pendingRemovals.filter((item) => item.category === 'confirmed')
  const pendingInviteRemovals = pendingRemovals.filter((item) => item.category === 'invites')
  const pendingRequestRemovals = pendingRemovals.filter((item) => item.category === 'requests')

  const currentInviteUserIds = new Set(
    activeInviteParticipants.map((participant) => participant.user_id).filter((id): id is string => Boolean(id)),
  )
  const currentGroupInviteIds = new Set(activeGroupInvites.map((group) => group.group_id))
  const currentRequestUserIds = new Set(activeRequestUsers.map((user) => user.id))
  const currentRequestGroupIds = new Set(activeRequestGroups.map((group) => group.id))
  const pendingAddKeys = new Set(pendingAdds.map((item) => `${item.mode}:${item.key}`))
  const pendingRemovalKeys = new Set(pendingRemovals.map((item) => item.key))

  const inviteCandidates = useMemo(() => {
    const pool: CandidateItem[] =
      inviteMode === 'invite'
        ? [
            ...candidateUsers.map((user) => ({
              key: `user:${user.id}`,
              id: user.id,
              name: user.display_name,
              kind: 'user' as const,
              availabilityStatus: getLookupAvailabilityStatus(availabilityLookup, {
                kind: 'user',
                userId: user.id,
              }),
              sourceLabel: user.sourceLabel,
              userId: user.id,
            })),
            ...contactTargets.filter((target) => target.can_invite).map((target) => ({
              key: `contact-person:${target.person_id}`,
              id: target.person_id,
              name: target.display_name ?? 'Contact Player',
              kind: 'contact' as const,
              availabilityStatus: null,
              sourceLabel: target.sourceLabel,
              avatarUrl: target.avatar_url ?? null,
              personId: target.person_id,
              isLinkedContact: target.eligible_via === 'registered_user_path',
            })),
            ...localContactCandidates,
            ...(isOrganizer
              ? candidateGroups.map((group) => ({
                  key: `group:${group.id}`,
                  id: group.id,
                  name: group.name,
                  kind: 'group' as const,
                  sourceLabel: 'Shared group',
                }))
              : []),
          ]
        : [
            ...candidateUsers.map((user) => ({
              key: `user:${user.id}`,
              id: user.id,
              name: user.display_name,
              kind: 'user' as const,
              availabilityStatus: getLookupAvailabilityStatus(availabilityLookup, {
                kind: 'user',
                userId: user.id,
              }),
              sourceLabel: user.sourceLabel,
              userId: user.id,
            })),
            ...(isOrganizer
              ? candidateGroups.map((group) => ({
                  key: `group:${group.id}`,
                  id: group.id,
                  name: group.name,
                  kind: 'group' as const,
                  sourceLabel: 'Shared group',
                }))
              : []),
          ]

    const filteredCandidates = pool.filter((candidate) => {
      if (inviteMode === 'invite') {
        if (candidate.kind === 'user' && currentInviteUserIds.has(candidate.id)) return false
        if (candidate.kind === 'group' && currentGroupInviteIds.has(candidate.id)) return false
      } else {
        if (candidate.kind === 'user' && currentRequestUserIds.has(candidate.id) && !revokedRequestUserIds.has(candidate.id)) return false
        if (candidate.kind === 'group' && currentRequestGroupIds.has(candidate.id) && !revokedRequestGroupIds.has(candidate.id)) return false
      }

      return true
    })

    return dedupeCandidateItems(filteredCandidates)
  }, [
    candidateGroups,
    candidateUsers,
    contactTargets,
    localContactCandidates,
    currentGroupInviteIds,
    currentInviteUserIds,
    currentRequestGroupIds,
    currentRequestUserIds,
    inviteMode,
    isOrganizer,
    availabilityLookup,
    pendingAddKeys,
    revokedRequestGroupIds,
    revokedRequestUserIds,
  ])

  const addPlayersMode: AddPlayersMode = inviteMode === 'request' ? 'playerCall' : 'invite'
  const pickerFilterOptions = inviteMode === 'request' ? PLAYER_CALL_FILTER_OPTIONS : INVITE_FILTER_OPTIONS
  const sharedPickerCandidates = useMemo<AddPlayersCandidate[]>(() => (
    inviteCandidates.map((candidate) => {
      const isSelected = pendingAddKeys.has(`${inviteMode}:${candidate.key}`)
      const availabilityDotClass = candidate.kind === 'user'
        ? getAvailabilityStatusDotClass(candidate.availabilityStatus)
        : null
      const filterTags = candidate.kind === 'group'
        ? ['groups']
        : candidate.kind === 'contact'
          ? ['contacts']
          : ['people', candidate.sourceLabel?.toLowerCase().includes('saved') ? 'saved' : null]
              .filter((tag): tag is string => Boolean(tag))

      return {
        key: candidate.key,
        name: candidate.name,
        kind: candidate.kind === 'group' ? 'group' : candidate.kind === 'contact' ? 'contact' : 'person',
        filterTags,
        selected: isSelected,
        searchText: `${candidate.name} ${candidate.sourceLabel ?? ''}`,
        title: candidate.sourceLabel ? `${candidate.name}: ${candidate.sourceLabel}` : candidate.name,
        leadingNode: availabilityDotClass ? (
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${availabilityDotClass}`} aria-hidden="true" />
        ) : null,
        labelNode: candidate.kind === 'group' ? (
          <span>{candidate.name}</span>
        ) : (
          <ParticipantQuickPreviewTrigger
            target={{
              userId: candidate.userId ?? null,
              guestId: candidate.guestId ?? null,
              displayName: candidate.name,
              avatarUrl: candidate.avatarUrl ?? null,
            }}
          >
            <span>{candidate.name}</span>
          </ParticipantQuickPreviewTrigger>
        ),
        payload: candidate,
      }
    })
  ), [inviteCandidates, inviteMode, pendingAddKeys])

  const handleCreateContactForMatch = async () => {
    const displayName = contactDisplayName.trim()
    const email = contactEmail.trim().toLowerCase()
    const phone = contactPhone.trim()
    const notes = contactNotes.trim()

    setContactCreateError(null)
    setError(null)
    setSuccess(null)

    if (!displayName) {
      setContactCreateError('Enter a player name.')
      return
    }

    if (!email && !phone) {
      setContactCreateError('Email or phone required.')
      return
    }

    setIsCreatingContact(true)

    try {
      const supabase = createSupabaseBrowserClient()
      const newGuest = await createRosterGuest(supabase, {
        display_name: displayName,
        email: email || null,
        phone: phone || null,
        notes: notes || null,
      })
      await saveContactPlayer(supabase, newGuest.id, { source: 'manual' })

      const personId = newGuest.person_id
      if (!personId) {
        throw new Error('Contact was saved, but could not be added to this match yet.')
      }

      const candidate: CandidateItem = {
        key: `contact-person:${personId}`,
        id: personId,
        name: newGuest.display_name || displayName,
        kind: 'contact',
        availabilityStatus: null,
        sourceLabel: 'Contact',
        avatarUrl: null,
        guestId: newGuest.id,
        personId,
      }

      setLocalContactCandidates((prev) => {
        if (prev.some((item) => item.key === candidate.key)) return prev
        return [...prev, candidate]
      })
      stageAdd(candidate, 'invite')
      setInviteMode('invite')
      setContactDisplayName('')
      setContactEmail('')
      setContactPhone('')
      setContactNotes('')
      setContactComposerOpen(false)
      setSuccess(`${candidate.name} was saved and added to pending invites.`)
    } catch (createError) {
      const message = (createError as { message?: string })?.message ?? 'Failed to save contact.'
      setContactCreateError(message)
    } finally {
      setIsCreatingContact(false)
    }
  }

  const removeCandidates = useMemo<RemoveRowItem[]>(() => {
    if (removeMode === 'confirmed') {
      return confirmedParticipants
        .filter((participant) => getParticipantEffectiveUserId(participant) !== organizerUserId)
        .map((participant) => {
          const effectiveUserId = getParticipantEffectiveUserId(participant)
          const rosterKind = getParticipantRosterKind(participant)
          return {
            key: `remove:${participant.id}`,
            name: participant.display_name,
            kind: rosterKind,
            avatarUrl: participant.avatar_url ?? null,
            userId: effectiveUserId,
            guestId: participant.guest_id ?? null,
            subtitle: 'Confirmed in this match',
            badges: rosterKind === 'contact' ? ['Contact'] : [],
            selected: pendingRemovalKeys.has(`remove:${participant.id}`),
            onToggle: () => {
              setSuccess(null)
              setError(null)
              setPendingRemovals((prev) =>
                prev.some((item) => item.key === `remove:${participant.id}`)
                  ? prev.filter((item) => item.key !== `remove:${participant.id}`)
                  : [
                      ...prev,
                      {
                        key: `remove:${participant.id}`,
                        category: 'confirmed',
                        kind: rosterKind,
                        id: effectiveUserId ?? participant.id,
                        name: participant.display_name,
                        participantId: participant.id,
                        avatarUrl: participant.avatar_url ?? null,
                        userId: effectiveUserId,
                        guestId: participant.guest_id ?? null,
                        subtitle: 'Confirmed in this match',
                      },
                    ],
              )
            },
          }
        })
    }

    if (removeMode === 'invites') {
      const userRows = activeInviteParticipants
        .map((participant) => {
          const effectiveUserId = getParticipantEffectiveUserId(participant)
          const rosterKind = getParticipantRosterKind(participant)
          return {
            key: `invite:${participant.id}`,
            name: participant.display_name,
            kind: rosterKind,
            avatarUrl: participant.avatar_url ?? null,
            userId: effectiveUserId,
            guestId: participant.guest_id ?? null,
            subtitle: 'Invited, not confirmed',
            badges: rosterKind === 'contact' ? ['Contact'] : [],
            selected: pendingRemovalKeys.has(`invite:${participant.id}`),
            onToggle: () => {
              setSuccess(null)
              setError(null)
              setPendingRemovals((prev) =>
                prev.some((item) => item.key === `invite:${participant.id}`)
                  ? prev.filter((item) => item.key !== `invite:${participant.id}`)
                  : [
                      ...prev,
                      {
                        key: `invite:${participant.id}`,
                        category: 'invites',
                        kind: rosterKind,
                        id: effectiveUserId ?? participant.id,
                        name: participant.display_name,
                        participantId: participant.id,
                        avatarUrl: participant.avatar_url ?? null,
                        userId: effectiveUserId,
                        guestId: participant.guest_id ?? null,
                        subtitle: 'Invited, not confirmed',
                      },
                    ],
              )
            },
          }
        })

      const groupRows = activeGroupInvites
        .map((group) => ({
          key: `invite-group:${group.group_id}`,
          name: group.group_name,
          kind: 'group' as const,
          subtitle: 'Group invite, not confirmed',
          badges: ['Group'],
          selected: pendingRemovalKeys.has(`invite-group:${group.group_id}`),
          onToggle: () => {
            setSuccess(null)
            setError(null)
            setPendingRemovals((prev) =>
              prev.some((item) => item.key === `invite-group:${group.group_id}`)
                ? prev.filter((item) => item.key !== `invite-group:${group.group_id}`)
                : [
                    ...prev,
                    {
                      key: `invite-group:${group.group_id}`,
                      category: 'invites',
                      kind: 'group',
                      id: group.group_id,
                      name: group.group_name,
                      groupId: group.group_id,
                      subtitle: 'Group invite, not confirmed',
                    },
                  ],
            )
          },
        }))

      return [...userRows, ...groupRows]
    }

    return [
      ...activeRequestUsers
        .map((user) => ({
          key: `request:user:${user.id}`,
          name: user.name,
          kind: 'user' as const,
          userId: user.id,
          subtitle: "Can choose I'd like to play",
          badges: [],
          selected: pendingRemovalKeys.has(`request:user:${user.id}`),
          onToggle: () => {
            setSuccess(null)
            setError(null)
            setPendingRemovals((prev) =>
              prev.some((item) => item.key === `request:user:${user.id}`)
                ? prev.filter((item) => item.key !== `request:user:${user.id}`)
                : [
                    ...prev,
                    {
                      key: `request:user:${user.id}`,
                      category: 'requests',
                      kind: 'user',
                      id: user.id,
                      name: user.name,
                      userId: user.id,
                      subtitle: "Can choose I'd like to play",
                    },
                  ],
            )
          },
        })),
      ...activeRequestGroups
        .map((group) => ({
          key: `request:group:${group.id}`,
          name: group.name,
          kind: 'group' as const,
          subtitle: "Group can choose I'd like to play",
          badges: ['Group'],
          selected: pendingRemovalKeys.has(`request:group:${group.id}`),
          onToggle: () => {
            setSuccess(null)
            setError(null)
            setPendingRemovals((prev) =>
              prev.some((item) => item.key === `request:group:${group.id}`)
                ? prev.filter((item) => item.key !== `request:group:${group.id}`)
                : [
                    ...prev,
                    {
                      key: `request:group:${group.id}`,
                      category: 'requests',
                      kind: 'group',
                      id: group.id,
                      name: group.name,
                      subtitle: "Group can choose I'd like to play",
                    },
                  ],
            )
          },
        })),
    ]
  }, [
    activeGroupInvites,
    activeInviteParticipants,
    activeRequestGroups,
    activeRequestUsers,
    confirmedParticipants,
    organizerUserId,
    pendingRemovalKeys,
    removeMode,
  ])

  const stageAdd = (candidate: CandidateItem, mode: AdditionMode = inviteMode) => {
    setSuccess(null)
    setError(null)
    setPendingAdds((prev) => [...prev.filter((item) => item.key !== candidate.key), { ...candidate, mode }])
  }

  const togglePendingAdd = (candidate: CandidateItem) => {
    const alreadySelected = pendingAddKeys.has(`${inviteMode}:${candidate.key}`)
    if (alreadySelected) {
      cancelAdd(candidate.key, inviteMode)
      return
    }
    stageAdd(candidate, inviteMode)
  }

  const resetSharedPickerMode = (mode: AddPlayersMode) => {
    setInviteMode(mode === 'playerCall' ? 'request' : 'invite')
    setPickerSearch('')
    setPickerFilter('all')
    setContactComposerOpen(false)
    setContactCreateError(null)
    setError(null)
    setSuccess(null)
  }

  const toggleSharedPickerCandidate = (candidate: AddPlayersCandidate) => {
    const item = candidate.payload as CandidateItem | undefined
    if (!item) return
    togglePendingAdd(item)
  }

  const cancelAdd = (key: string, mode: AdditionMode) => {
    setPendingAdds((prev) => prev.filter((item) => !(item.key === key && item.mode === mode)))
  }

  const cancelRemoval = (key: string) => {
    setPendingRemovals((prev) => prev.filter((item) => item.key !== key))
  }

  const removePostedUserTarget = (user: CurrentRequestTarget) => {
    setSuccess(null)
    setError(null)
    setPendingRemovals((prev) => [
      ...prev.filter((item) => item.key !== `request:user:${user.id}`),
      {
        key: `request:user:${user.id}`,
        category: 'requests',
        kind: 'user',
        id: user.id,
        name: user.name,
        userId: user.id,
        subtitle: 'Player Call target',
      },
    ])
  }

  const removePostedGroupTarget = (group: CurrentRequestTarget) => {
    setSuccess(null)
    setError(null)
    setPendingRemovals((prev) => [
      ...prev.filter((item) => item.key !== `request:group:${group.id}`),
      {
        key: `request:group:${group.id}`,
        category: 'requests',
        kind: 'group',
        id: group.id,
        name: group.name,
        subtitle: 'Player Call target',
      },
    ])
  }

  const handleApply = async (action: 'invite' | 'request' | 'remove') => {
    if (isApplying) return

    let closesAfterApply = false
    setIsApplying(true)
    setError(null)
    setSuccess(null)

    try {
      const inviteAddsToApply = action === 'invite' ? pendingInviteAdds : []
      const requestAddsToApply = action === 'request' ? pendingRequestAdds : []
      const removalsToApply = action === 'remove'
        ? pendingRemovals
        : action === 'request'
          ? pendingRequestRemovals
          : []
      const requestUserIdsToRemove = new Set(
        removalsToApply
          .filter((item) => item.category === 'requests' && item.kind === 'user')
          .map((item) => item.id),
      )
      const requestGroupIdsToRemove = new Set(
        removalsToApply
          .filter((item) => item.category === 'requests' && item.kind === 'group')
          .map((item) => item.id),
      )

      const nextRequestUserIds = sortStrings([
        ...activeRequestUsers
          .map((user) => user.id)
          .filter((id) => !requestUserIdsToRemove.has(id)),
        ...requestAddsToApply.filter((item) => item.kind === 'user').map((item) => item.id),
      ])

      const nextRequestGroupIds = sortStrings([
        ...activeRequestGroups
          .map((group) => group.id)
          .filter((id) => !requestGroupIdsToRemove.has(id)),
        ...requestAddsToApply.filter((item) => item.kind === 'group').map((item) => item.id),
      ])

      const currentRequestUserIdsSorted = sortStrings(activeRequestUsers.map((user) => user.id))
      const currentRequestGroupIdsSorted = sortStrings(activeRequestGroups.map((group) => group.id))

      if (
        !arraysEqual(nextRequestUserIds, currentRequestUserIdsSorted)
        || !arraysEqual(nextRequestGroupIds, currentRequestGroupIdsSorted)
      ) {
        await onUpdateMatchDetails({
          invitation_scope_user_ids: nextRequestUserIds,
          invitation_scope_group_ids: nextRequestGroupIds,
        })
      }

      const supabase = createSupabaseBrowserClient()

      for (const item of removalsToApply) {
        if (item.category === 'confirmed') {
          await onRemoveParticipant(item.participantId)
          continue
        }

        if (item.category === 'invites' && item.kind === 'group') {
          await revokeGroupInvite(supabase, matchId, item.groupId)
          continue
        }

        if (item.category === 'invites') {
          await onRemoveParticipant(item.participantId)
        }
      }

      for (const item of inviteAddsToApply) {
        if (item.kind === 'user') {
          if (isOrganizer) {
            await inviteUserToMatch(supabase, matchId, item.id)
          } else {
            await inviteParticipantUserToMatch(supabase, matchId, item.id)
          }
        } else if (item.kind === 'group') {
          await inviteGroupToMatch(supabase, matchId, item.id)
        } else {
          await inviteContactPersonToMatch(supabase, matchId, item.personId ?? item.id)
        }
      }

      if (inviteAddsToApply.length > 0) {
        processDeliveriesAction().catch(() => {})
      }

      setPendingAdds((prev) =>
        action === 'invite'
          ? prev.filter((item) => item.mode !== 'invite')
          : action === 'request'
            ? prev.filter((item) => item.mode !== 'request')
            : prev,
      )
      setPendingRemovals((prev) =>
        action === 'remove'
          ? []
          : action === 'request'
            ? prev.filter((item) => item.category !== 'requests')
            : prev,
      )
      if (action === 'invite') {
        setLocalContactCandidates([])
      }
      setConfirmOpen(false)
      setSuccess(
        action === 'invite'
          ? 'Invites sent.'
          : action === 'request'
            ? requestSummaryItems.length > 0 ? 'Player Call updated.' : 'Player Call posted.'
            : 'Changes applied.',
      )
      window.dispatchEvent(new Event('playerhoods:dashboard-live-refresh'))
      router.refresh()
      if (onApplied) {
        closesAfterApply = true
        onApplied()
      }
    } catch (applyError) {
      const message = (applyError as { message?: string })?.message ?? ''
      setError(
        message.includes('contact_communication_opted_out')
            ? 'This contact has unsubscribed or has no reachable invitation channel.'
            : "Couldn't apply changes. Please try again.",
      )
    } finally {
      if (!closesAfterApply) {
        setIsApplying(false)
      }
    }
  }

  const confirmedSummaryItems: SummaryEntry[] = visibleConfirmedParticipants.map((participant) => {
    const effectiveUserId = getParticipantEffectiveUserId(participant)
    const rosterKind = getParticipantRosterKind(participant)
    return {
      key: `confirmed-${participant.id}`,
      label: participant.display_name,
      kind: rosterKind,
      availabilityStatus: effectiveUserId
        ? getLookupAvailabilityStatus(availabilityLookup, {
            kind: 'user',
            userId: effectiveUserId,
          })
        : null,
      userId: effectiveUserId,
      guestId: participant.guest_id ?? null,
      avatarUrl: participant.avatar_url ?? null,
      isHost: Boolean(organizerUserId && effectiveUserId === organizerUserId),
    }
  })
  const inviteSummaryItems: SummaryEntry[] = [
    ...visibleInviteUsers.map((participant) => {
      const effectiveUserId = getParticipantEffectiveUserId(participant)
      const rosterKind = getParticipantRosterKind(participant)
      return {
        key: `invite-user-${participant.id}`,
        label: participant.display_name,
        kind: rosterKind,
        availabilityStatus: effectiveUserId
          ? getLookupAvailabilityStatus(availabilityLookup, {
              kind: 'user',
              userId: effectiveUserId,
            })
          : null,
        userId: effectiveUserId,
        guestId: participant.guest_id ?? null,
        avatarUrl: participant.avatar_url ?? null,
        isHost: Boolean(organizerUserId && effectiveUserId === organizerUserId),
        detailLabel: participant.invited_by_name ? `Invited by ${participant.invited_by_name}` : null,
      }
    }),
    ...visibleInviteGroups.map((group) => ({
      key: `invite-group-${group.group_id}`,
      label: group.group_name,
      kind: 'group' as const,
    })),
  ]
  const requestSummaryItems: SummaryEntry[] = [
    ...visibleRequestUsers.map((user) => ({
      key: `request-user-${user.id}`,
      label: looksLikeInternalUserLabel(user.name) ? 'Open spot' : user.name,
      kind: 'user' as const,
      availabilityStatus: getLookupAvailabilityStatus(availabilityLookup, {
        kind: 'user',
        userId: user.id,
      }),
      userId: user.id,
    })),
    ...visibleRequestGroups.map((group) => ({
      key: `request-group-${group.id}`,
      label: group.name,
      kind: 'group' as const,
    })),
  ]

  const openSpotCount = Math.max(requiredCount - visibleConfirmedParticipants.length, 0)
  const openSpotLabel = openSpotCount === 0
    ? 'No open spots'
    : `${openSpotCount} open ${openSpotCount === 1 ? 'spot' : 'spots'}`
  const confirmedMetaLabel =
    visibleConfirmedParticipants.length >= requiredCount
      ? 'Full'
      : openSpotLabel
  const inviteMetaParts: string[] = []
  if (visibleInviteUsers.length > 0) inviteMetaParts.push(`${visibleInviteUsers.length} player${visibleInviteUsers.length === 1 ? '' : 's'}`)
  if (visibleInviteGroups.length > 0) inviteMetaParts.push(`${visibleInviteGroups.length} group${visibleInviteGroups.length === 1 ? '' : 's'}`)
  const inviteMetaLabel = inviteMetaParts.join(' · ')
  const requestMetaParts: string[] = []
  if (visibleRequestUsers.length > 0) requestMetaParts.push(`${visibleRequestUsers.length} player${visibleRequestUsers.length === 1 ? '' : 's'}`)
  if (visibleRequestGroups.length > 0) requestMetaParts.push(`${visibleRequestGroups.length} group${visibleRequestGroups.length === 1 ? '' : 's'}`)
  const requestMetaLabel = [openSpotLabel, requestMetaParts.join(' · ')].filter(Boolean).join(' · ')

  const spotsLabel = `${visibleConfirmedParticipants.length} / ${requiredCount}`
  const isOverCapacity = visibleConfirmedParticipants.length > requiredCount

  const pendingGroups: PendingGroup[] = []
  if (pendingConfirmedRemovals.length > 0) {
    pendingGroups.push({
      title: 'Remove Confirmed',
      subtitle: 'Confirmed lineup players to remove from this match',
      items: pendingConfirmedRemovals,
    })
  }
  if (pendingInviteRemovals.length > 0) {
    pendingGroups.push({
      title: 'Cancel Invites',
      subtitle: 'Invites that will be cancelled',
      items: pendingInviteRemovals,
    })
  }
  if (pendingRequestRemovals.length > 0) {
    pendingGroups.push({
      title: 'Remove Request Access',
      subtitle: "Players or groups that will no longer be able to use I'd like to play",
      items: pendingRequestRemovals,
    })
  }

  const inviteChanges = [
    ...pendingInviteAdds.map((item) => ({
      key: `add:invite:${item.key}`,
      title: item.kind === 'group' ? 'Invite group' : 'Invite player',
      name: item.name,
      mode: item.mode,
    })),
    ...pendingRequestAdds.map((item) => ({
      key: `add:request:${item.key}`,
      title: item.kind === 'group' ? 'Open group request' : 'Open player request',
      name: item.name,
      mode: item.mode,
    })),
  ]

  const hasExistingPlayerCall = activeRequestUsers.length > 0 || activeRequestGroups.length > 0
  const hasPlayerCallChanges = pendingRequestAdds.length > 0 || pendingRequestRemovals.length > 0
  const invitePrimaryLabel =
    inviteMode === 'request'
      ? hasExistingPlayerCall ? 'Update Player Call' : 'Post Player Call'
      : 'Send Invites'
  const inviteActionDisabled =
    isApplying ||
    (inviteMode === 'request'
      ? !hasPlayerCallChanges
      : pendingInviteAdds.length === 0)

  const removePrimaryLabel =
    pendingGroups.length === 1
      ? pendingGroups[0].title === 'Remove Confirmed'
        ? 'Remove Selected'
        : pendingGroups[0].title === 'Cancel Invites'
          ? 'Cancel Selected Invites'
          : 'Remove Request Access'
      : 'Confirm Changes'

  const totalRemovalCount = pendingRemovals.length

  const confirmationCopy = useMemo(() => {
    if (pendingConfirmedRemovals.length > 0 && pendingInviteRemovals.length === 0 && pendingRequestRemovals.length === 0) {
      return {
        title: `Remove ${pendingConfirmedRemovals.length} confirmed player${pendingConfirmedRemovals.length === 1 ? '' : 's'}?`,
        body: 'This will free up their spots in the match and may affect the current lineup.',
        confirmLabel: 'Remove Players',
      }
    }

    if (pendingInviteRemovals.length > 0 && pendingConfirmedRemovals.length === 0 && pendingRequestRemovals.length === 0) {
      return {
        title: `Cancel ${pendingInviteRemovals.length} invite${pendingInviteRemovals.length === 1 ? '' : 's'}?`,
        body: 'These invited players or groups will no longer be able to join from those invitations.',
        confirmLabel: 'Cancel Invites',
      }
    }

    if (pendingRequestRemovals.length > 0 && pendingConfirmedRemovals.length === 0 && pendingInviteRemovals.length === 0) {
      return {
        title: `Remove request access for ${pendingRequestRemovals.length} item${pendingRequestRemovals.length === 1 ? '' : 's'}?`,
        body: "Selected players or groups will no longer see the I'd like to play entry for this match.",
        confirmLabel: 'Remove Request Access',
      }
    }

    return {
      title: `Confirm ${totalRemovalCount} change${totalRemovalCount === 1 ? '' : 's'}?`,
      body:
        pendingConfirmedRemovals.length > 0
          ? 'This will remove confirmed players, cancel invites, and remove request access as listed in pending changes.'
          : 'This will cancel invites and remove request access as listed in pending changes.',
      confirmLabel: 'Confirm Changes',
    }
  }, [
    pendingConfirmedRemovals.length,
    pendingInviteRemovals.length,
    pendingRequestRemovals.length,
    totalRemovalCount,
  ])

  const inviteSummarySlot = pendingInviteAdds.length === 0 ? (
    <p className="text-body-sub font-semibold text-[#94A3B8]">No people or groups selected yet.</p>
  ) : (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-body-sub mr-1 font-semibold text-[#64748B]">
        {pendingInviteAdds.length} selected
      </span>
      {pendingInviteAdds.map((item) => (
        <button
          key={`invite-selected-${item.key}`}
          type="button"
          onClick={() => cancelAdd(item.key, 'invite')}
          className="text-body-sub flex items-center rounded-lg border border-[#0d6efd]/15 bg-[#eff6ff] px-2 py-1 font-semibold text-[#0d6efd]"
        >
          {item.kind === 'group' ? (
            <span>{item.name}</span>
          ) : (
            <ParticipantQuickPreviewTrigger
              target={{
                userId: item.userId ?? null,
                guestId: item.guestId ?? null,
                displayName: item.name,
                avatarUrl: item.avatarUrl ?? null,
              }}
            >
              <span>{item.name}</span>
            </ParticipantQuickPreviewTrigger>
          )}
          <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
        </button>
      ))}
    </div>
  )

  const playerCallTargetCount = requestSummaryItems.length + pendingRequestAdds.length
  const playerCallSummarySlot = playerCallTargetCount === 0 ? (
    <p className="text-body-sub font-semibold text-[#94A3B8]">No one yet</p>
  ) : (
    <div className="flex flex-wrap gap-1.5">
      {visibleRequestUsers.map((user) => (
        <button
          key={`posted-user-${user.id}`}
          type="button"
          onClick={() => removePostedUserTarget(user)}
          className="text-body-sub flex items-center rounded-lg border border-green-100 bg-green-50 px-2 py-1 font-semibold text-green-700"
        >
          <ParticipantQuickPreviewTrigger
            target={{
              userId: user.id,
              guestId: null,
              displayName: user.name,
            }}
          >
            <span>{looksLikeInternalUserLabel(user.name) ? 'Open spot' : user.name}</span>
          </ParticipantQuickPreviewTrigger>
          <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
        </button>
      ))}
      {visibleRequestGroups.map((group) => (
        <button
          key={`posted-group-${group.id}`}
          type="button"
          onClick={() => removePostedGroupTarget(group)}
          className="text-body-sub flex items-center rounded-lg border border-green-100 bg-green-50 px-2 py-1 font-semibold text-green-700"
        >
          <span>{group.name}</span>
          <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
        </button>
      ))}
      {pendingRequestAdds.map((item) => (
        <button
          key={`call-selected-${item.key}`}
          type="button"
          onClick={() => cancelAdd(item.key, 'request')}
          className="text-body-sub flex items-center rounded-lg border border-green-100 bg-green-50 px-2 py-1 font-semibold text-green-700"
        >
          {item.kind === 'group' ? (
            <span>{item.name}</span>
          ) : (
            <ParticipantQuickPreviewTrigger
              target={{
                userId: item.userId ?? null,
                guestId: item.guestId ?? null,
                displayName: item.name,
                avatarUrl: item.avatarUrl ?? null,
              }}
            >
              <span>{item.name}</span>
            </ParticipantQuickPreviewTrigger>
          )}
          <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
        </button>
      ))}
    </div>
  )

  const addContactSlot = (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setContactCreateError(null)
            setContactComposerOpen((open) => !open)
          }}
          className="text-body-sub inline-flex shrink-0 items-center justify-center rounded-full border border-[#D7E3F4] bg-[#F8FBFF] px-3 py-1.5 font-bold text-slate-900 transition hover:border-blue-200 hover:bg-white"
        >
          <span className="mr-1.5 text-base leading-none">+</span>
          Add My Contact
        </button>
      </div>

      {contactComposerOpen ? (
        <form
          className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void handleCreateContactForMatch()
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-label text-slate-500">
              Name
              <input
                type="text"
                value={contactDisplayName}
                onChange={(event) => setContactDisplayName(event.target.value)}
                placeholder="Player's full name"
                className="text-body-main mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </label>
            <label className="text-label text-slate-500">
              Email
              <input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="email@example.com"
                className="text-body-main mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </label>
            <label className="text-label text-slate-500">
              Phone
              <input
                type="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder="+1 234 567 890"
                className="text-body-main mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </label>
            <label className="text-label text-slate-500">
              Notes
              <input
                type="text"
                value={contactNotes}
                onChange={(event) => setContactNotes(event.target.value)}
                placeholder="Optional"
                className="text-body-main mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </label>
          </div>
          {contactCreateError ? (
            <p className="text-body-sub rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-600">
              {contactCreateError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setContactComposerOpen(false)
                setContactCreateError(null)
              }}
              disabled={isCreatingContact}
              className="text-body-main rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreatingContact}
              className="text-body-main rounded-xl bg-blue-600 px-4 py-2 font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingContact ? 'Saving...' : 'Save & Add'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )

  const inviteFooterSlot = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        onClick={() => {
          setError(null)
          setSuccess(null)
          if (inviteMode === 'invite') {
            setPendingAdds((prev) => prev.filter((item) => item.mode !== 'invite'))
            setLocalContactCandidates([])
          } else {
            setPendingAdds((prev) => prev.filter((item) => item.mode !== 'request'))
            setPendingRemovals((prev) => prev.filter((item) => item.category !== 'requests'))
          }
        }}
        disabled={inviteActionDisabled}
        className="text-body-main rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void handleApply(inviteMode)}
        disabled={inviteActionDisabled}
        className={`text-label rounded-2xl px-5 py-4 text-white shadow-xl transition disabled:cursor-not-allowed disabled:opacity-50 ${
          inviteMode === 'request'
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-[#0d6efd] hover:bg-[#0b5ed7]'
        }`}
      >
        {isApplying
          ? inviteMode === 'request' ? 'Updating...' : 'Sending...'
          : invitePrimaryLabel}
      </button>
    </div>
  )

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
            <span
              className={`text-body-main inline-flex h-5 w-5 items-center justify-center rounded-full font-bold ${
                panelMode === 'remove' ? 'bg-orange-50 text-orange-500' : 'bg-slate-900 text-white'
              }`}
            >
              {panelMode === 'remove' ? '-' : '+'}
            </span>
            <h2 className="text-h2 text-slate-800">
              {panelMode === 'remove' ? 'Remove Players' : 'Invite Players'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-title-main text-teal-600">{spotsLabel}</span>
            <span
              className={`text-body-main text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              v
            </span>
          </div>
        </button>
      ) : null}

      {(embedded || isExpanded) ? (
        <div className="px-6 pb-6 pt-5">
          {panelMode === 'remove' ? (
            <div className="mb-5 rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-3">
              <div className="text-title-main text-orange-700">Remove mode</div>
              <div className="text-body-sub mt-1 text-orange-600">
                Select confirmed players, invites, or request access to remove.
              </div>
            </div>
          ) : null}
          {panelMode === 'invite' && isOverCapacity ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-title-main text-amber-800">More confirmed players than spots</div>
              <div className="text-body-sub mt-1 text-amber-700">
                Choose who is in the match before forming. Extra confirmed players can be moved to the waitlist.
              </div>
              {onRequestPanelMode ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onRequestPanelMode('remove')}
                    className="text-body-main rounded-full bg-slate-900 px-4 py-2 font-bold text-white"
                  >
                    Choose Lineup
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestPanelMode('remove')}
                    className="text-body-main rounded-full border border-amber-200 bg-white px-4 py-2 font-bold text-amber-800"
                  >
                    Move extra players to waitlist
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {panelMode === 'invite' ? (
            <div className="space-y-4">
              <AddPlayersPickerPanel
                mode={addPlayersMode}
                onModeChange={resetSharedPickerMode}
                searchValue={pickerSearch}
                onSearchChange={setPickerSearch}
                filterValue={pickerFilter}
                onFilterChange={(value) => setPickerFilter(value as PickerFilter)}
                filterOptions={pickerFilterOptions}
                candidates={sharedPickerCandidates}
                onToggleCandidate={toggleSharedPickerCandidate}
                shareLinkRow={shareLinkRow}
                playerCallSummaryLabel="Currently posted to"
                playerCallSummary={playerCallSummarySlot}
                inviteSummary={inviteSummarySlot}
                addContactSlot={addContactSlot}
                footerSlot={inviteFooterSlot}
                playerCallEmptyLabel={(
                  <>
                    No matching players or groups.
                    <span className="text-body-sub mt-1 block font-semibold text-[#64748B]">
                      Use Invite to add a new contact directly.
                    </span>
                  </>
                )}
              />

              {(error || success) ? (
                <div className="text-body-main rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
                  {error ? <p className="text-red-600">{error}</p> : null}
                  {success ? <p className="text-green-700">{success}</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-3">
                <div className={`${ADD_PLAYERS_SECTION_LABEL} mb-1 flex items-center text-[#94A3B8]`}>
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#0d6efd]" />
                  Action
                </div>
                <ActionCard
                  title="Remove Confirmed"
                  subtitle="Remove players already confirmed in this match"
                  selected={removeMode === 'confirmed'}
                  onClick={() => setRemoveMode('confirmed')}
                  accent="orange"
                />
                <ActionCard
                  title="Cancel Invites"
                  subtitle="Cancel players, contacts, or groups that were invited but not confirmed"
                  selected={removeMode === 'invites'}
                  onClick={() => setRemoveMode('invites')}
                  accent="orange"
                />
                <ActionCard
                  title="Remove Request Access"
                  subtitle="Stop selected players or groups from using I'd like to play"
                  selected={removeMode === 'requests'}
                  onClick={() => setRemoveMode('requests')}
                  accent="orange"
                />
              </div>

              <div className="lg:col-span-5">
                <div className={`${ADD_PLAYERS_SECTION_LABEL} mb-4 flex items-center text-[#94A3B8]`}>
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#0d6efd]" />
                  Choose players
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <div className="space-y-3">
                    {removeCandidates.length === 0 ? (
                      <div className="text-body-main w-full rounded-lg border border-dashed border-[#E2E8F0] bg-white px-4 py-6 text-center text-[#CBD5E1]">
                        No targets available for this action.
                      </div>
                    ) : (
                      removeCandidates.map((candidate) => (
                        <SelectableTargetRow key={candidate.key} item={candidate} />
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col lg:col-span-4">
                <div className={`${ADD_PLAYERS_SECTION_LABEL} mb-4 flex items-center text-[#94A3B8]`}>
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#0d6efd]" />
                  Pending Actions
                </div>
                <div className="flex min-h-[420px] flex-col rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <div className="mb-4 space-y-3">
                    {pendingGroups.length === 0 ? (
                      <div className="text-body-main rounded-lg border border-dashed border-[#E2E8F0] bg-white px-4 py-4 text-[#CBD5E1]">
                        Choose confirmed players, invites, or request access to remove.
                      </div>
                    ) : (
                      pendingGroups.map((group) => (
                        <PendingGroupCard
                          key={group.title}
                          group={group}
                          onUndo={cancelRemoval}
                        />
                      ))
                    )}
                  </div>
                </div>

                {(error || success) ? (
                  <div className="text-body-main mt-4 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
                    {error ? <p className="text-red-600">{error}</p> : null}
                    {success ? <p className="text-green-700">{success}</p> : null}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      setSuccess(null)
                      setPendingRemovals([])
                      setConfirmOpen(false)
                    }}
                    disabled={isApplying || pendingRemovals.length === 0}
                    className="text-body-main rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmOpen(true)
                    }}
                    disabled={isApplying || pendingRemovals.length === 0}
                    className="text-label rounded-2xl bg-orange-600 px-5 py-4 text-white shadow-xl transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isApplying ? 'Applying...' : removePrimaryLabel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {panelMode === 'remove' && confirmOpen ? (
        <ConfirmationModal
          title={confirmationCopy.title}
          body={confirmationCopy.body}
          confirmLabel={confirmationCopy.confirmLabel}
          isApplying={isApplying}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void handleApply('remove')}
        />
      ) : null}
    </section>
  )
}
