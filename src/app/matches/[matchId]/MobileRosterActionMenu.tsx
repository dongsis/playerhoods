'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  orgApproveParticipant,
  proxyConfirmParticipant,
  proxyDeclineParticipant,
  proxyWithdrawParticipant,
  removeParticipant,
  userWithdraw,
} from '@/lib/api/matches'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import type { MatchStatus } from '@/lib/types/database'
import { MatchExitNoteComposer } from './MatchExitNoteComposer'
import { processDeliveriesAction } from './process-deliveries-action'

type RosterActionKey = 'approve' | 'remove' | 'withdraw' | 'proxy-confirm' | 'proxy-withdraw'

type RosterAction = {
  key: RosterActionKey
  label: string
  tone: 'primary' | 'secondary' | 'danger'
  requiresConfirm: boolean
}

type Props = {
  matchId: string
  matchStatus: MatchStatus
  participant: MatchParticipantEnriched
  isOrganizer: boolean
  myUserId: string | null
  organizerUserId: string | null
  onRemoveParticipant?: (participantId: string, note?: string | null) => Promise<void>
}

function getPendingState(participant: MatchParticipantEnriched) {
  const isApprovedRequestNeedingReconfirm =
    participant.join_method === 'requested' &&
    participant.org_approved_at !== null &&
    participant.participant_accepted_at === null
  const participantConfirmed =
    participant.join_method === 'requested' && !isApprovedRequestNeedingReconfirm
      ? Boolean(participant.participant_accepted_at ?? participant.created_at)
      : Boolean(participant.participant_accepted_at)

  return { participantConfirmed }
}

function getHostRemoveActionLabel(participant: MatchParticipantEnriched) {
  const isPendingRequest =
    participant.status === 'pending' &&
    participant.join_method === 'requested' &&
    participant.org_approved_at === null
  const isWaitingForPlayer = participant.status === 'pending' && !isPendingRequest

  if (isPendingRequest) return 'Not This Time'
  if (participant.status === 'waiting_list') return 'Remove from Waitlist'
  if (isWaitingForPlayer) return 'Cancel Invite'
  if (participant.status === 'confirmed') return 'Remove from Lineup'
  return 'Remove player'
}

function getWithdrawLabel(participant: MatchParticipantEnriched) {
  if (participant.status === 'confirmed') return 'Cancel Participation'
  if (participant.join_method === 'requested') return 'Withdraw request'
  return 'Decline participation'
}

function getProxyWithdrawLabel(participant: MatchParticipantEnriched, participantConfirmed: boolean) {
  return participant.status === 'confirmed' || participant.status === 'waiting_list' || participantConfirmed
    ? 'Withdraw for player'
    : 'Decline for player'
}

function getRosterActions({
  participant,
  isOrganizer,
  matchStatus,
  myUserId,
  organizerUserId,
}: Pick<Props, 'participant' | 'isOrganizer' | 'matchStatus' | 'myUserId' | 'organizerUserId'>): RosterAction[] {
  const isActive = matchStatus === 'active'
  const pendingState = participant.status === 'pending' ? getPendingState(participant) : null
  const participantConfirmed = pendingState?.participantConfirmed ?? false
  const isOrganizerRow = participant.user_id !== null && participant.user_id === organizerUserId
  const canApprove =
    isOrganizer &&
    isActive &&
    participant.status === 'pending' &&
    participant.org_approved_at === null
  const canOrganizerRemoveParticipant =
    isOrganizer &&
    isActive &&
    participant.status !== 'removed' &&
    !isOrganizerRow
  const canSelfWithdraw =
    isActive &&
    participant.user_id === myUserId &&
    (participant.status === 'pending' || participant.status === 'confirmed' || participant.status === 'waiting_list')
  const canProxyManage =
    isActive &&
    participant.proxy_manageable_by_viewer === true &&
    (participant.status === 'pending' || participant.status === 'confirmed' || participant.status === 'waiting_list')
  const canProxyConfirm =
    canProxyManage &&
    participant.status === 'pending' &&
    participant.participant_accepted_at === null
  const canProxyWithdraw =
    canProxyManage &&
    participant.participant_accepted_at !== null

  const actions: Array<RosterAction | null> = [
    canApprove
      ? {
          key: 'approve' as const,
          label: 'Add to Lineup',
          tone: 'primary' as const,
          requiresConfirm: false,
        }
      : null,
    canProxyConfirm
      ? {
          key: 'proxy-confirm' as const,
          label: 'Confirm for player',
          tone: 'primary' as const,
          requiresConfirm: false,
        }
      : null,
    canOrganizerRemoveParticipant
      ? {
          key: 'remove' as const,
          label: getHostRemoveActionLabel(participant),
          tone: 'danger' as const,
          requiresConfirm: true,
        }
      : null,
    canProxyWithdraw
      ? {
          key: 'proxy-withdraw' as const,
          label: getProxyWithdrawLabel(participant, participantConfirmed),
          tone: 'secondary' as const,
          requiresConfirm: true,
        }
      : null,
    canSelfWithdraw
      ? {
          key: 'withdraw' as const,
          label: getWithdrawLabel(participant),
          tone: 'secondary' as const,
          requiresConfirm: true,
        }
      : null,
  ]

  return actions.filter((action): action is RosterAction => action !== null)
}

function getConfirmCopy(action: RosterAction, participant: MatchParticipantEnriched) {
  if (action.key === 'remove') {
    if (action.label === 'Not This Time') {
      return 'This lets them know there is not a lineup spot this time.'
    }
    if (action.label === 'Cancel Invite') {
      return 'This cancels the invitation before the player confirms.'
    }
    if (action.label === 'Remove from Waitlist') {
      return 'This removes them from the waitlist.'
    }
    return 'This removes them from the match.'
  }

  if (action.key === 'proxy-withdraw') {
    return 'This updates participation for the player you manage.'
  }

  return participant.status === 'confirmed'
    ? 'You will leave this match.'
    : 'This removes your participation.'
}

function getWithdrawDialogMode(action: RosterAction, participant: MatchParticipantEnriched) {
  const participantConfirmed = participant.status === 'pending' ? getPendingState(participant).participantConfirmed : false

  if (action.key === 'proxy-withdraw') {
    return participant.status === 'confirmed' || participant.status === 'waiting_list' || participantConfirmed
      ? 'withdraw'
      : 'decline'
  }

  return participant.status === 'confirmed'
    || participant.status === 'waiting_list'
    || participantConfirmed
    ? 'withdraw'
    : 'decline'
}

function ActionSheet({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] md:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close player actions"
        className="absolute inset-0 bg-slate-950/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 rounded-t-[24px] border border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-24px_60px_rgba(15,23,42,0.24)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}

export function MobileRosterActionMenu({
  matchId,
  matchStatus,
  participant,
  isOrganizer,
  myUserId,
  organizerUserId,
  onRemoveParticipant,
}: Props) {
  const [open, setOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<RosterAction | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const actions = getRosterActions({ participant, isOrganizer, matchStatus, myUserId, organizerUserId })

  if (actions.length === 0) {
    return null
  }

  const closeSheets = () => {
    setOpen(false)
    setConfirmAction(null)
    setActionReason('')
  }

  const runAction = (action: RosterAction, note?: string) => {
    setError(null)
    startTransition(async () => {
      try {
        if (action.key === 'approve') {
          await orgApproveParticipant(supabase, participant.id)
        } else if (action.key === 'proxy-confirm') {
          await proxyConfirmParticipant(supabase, participant.id)
        } else if (action.key === 'remove') {
          if (onRemoveParticipant) {
            await onRemoveParticipant(participant.id, note)
          } else {
            await removeParticipant(supabase, participant.id, note)
          }
        } else if (action.key === 'proxy-withdraw') {
          const mode = getWithdrawDialogMode(action, participant)
          if (mode === 'withdraw') {
            await proxyWithdrawParticipant(supabase, participant.id, note)
          } else {
            await proxyDeclineParticipant(supabase, participant.id, note)
          }
        } else {
          await userWithdraw(supabase, matchId, note)
        }

        router.refresh()
        window.dispatchEvent(new Event('playerhoods:dashboard-live-refresh'))
        processDeliveriesAction().catch(() => {})
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Action failed')
      }
    })
  }

  const handleAction = (action: RosterAction) => {
    if (action.requiresConfirm) {
      setConfirmAction(action)
      setActionReason('')
      return
    }

    closeSheets()
    runAction(action)
  }

  const confirmMode = confirmAction ? getWithdrawDialogMode(confirmAction, participant) : 'withdraw'

  return (
    <>
      <button
        type="button"
        aria-label={`Open actions for ${participant.display_name}`}
        aria-haspopup="dialog"
        aria-expanded={open || confirmAction !== null}
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D9E5F4] bg-white text-[17px] font-black leading-none text-[#64748B] shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
      >
        ...
      </button>

      {open ? (
        <ActionSheet title={`Actions for ${participant.display_name}`} onClose={closeSheets}>
          <div className="mb-3">
            <p className="m-0 truncate text-[15px] font-black text-[#0F172A]">{participant.display_name}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-[#64748B]">Player actions</p>
          </div>
          <div className="grid gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => handleAction(action)}
                disabled={isPending}
                className={
                  action.tone === 'primary'
                    ? 'flex min-h-11 w-full items-center justify-between rounded-[14px] bg-[#0B1F47] px-4 text-left text-[14px] font-black text-white'
                    : action.tone === 'danger'
                      ? 'flex min-h-11 w-full items-center justify-between rounded-[14px] border border-red-200 bg-red-50 px-4 text-left text-[14px] font-black text-[#B91C1C]'
                      : 'flex min-h-11 w-full items-center justify-between rounded-[14px] border border-[#D9E5F4] bg-white px-4 text-left text-[14px] font-black text-[#334155]'
                }
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={closeSheets}
              className="mt-1 flex min-h-11 w-full items-center justify-center rounded-[14px] border border-[#D9E5F4] bg-white px-4 text-[14px] font-black text-[#64748B]"
            >
              Close
            </button>
          </div>
          {error ? <p className="mt-3 text-[12px] font-bold text-[#B91C1C]">{error}</p> : null}
        </ActionSheet>
      ) : null}

      {confirmAction ? (
        <ActionSheet title={`${confirmAction.label} ${participant.display_name}`} onClose={closeSheets}>
          <div className="space-y-3">
            <div>
              <p className="m-0 text-[15px] font-black text-[#0F172A]">{confirmAction.label}?</p>
              <p className="mt-1 text-[13px] font-semibold leading-relaxed text-[#64748B]">
                {getConfirmCopy(confirmAction, participant)}
              </p>
            </div>
            {confirmAction.key === 'remove' ? (
              <textarea
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="Add a note (optional)"
                className="min-h-24 w-full resize-y rounded-[16px] border border-[#CBD5E1] px-3 py-3 text-[14px] font-semibold text-[#0F172A] outline-none focus:border-[#0d6efd] focus:ring-2 focus:ring-[#0d6efd]/15"
              />
            ) : (
              <MatchExitNoteComposer
                mode={confirmMode}
                note={actionReason}
                onNoteChange={setActionReason}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeSheets}
                className="min-h-11 rounded-[14px] border border-[#D9E5F4] bg-white px-4 text-[14px] font-black text-[#64748B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const note = actionReason.trim()
                  const action = confirmAction
                  closeSheets()
                  runAction(action, note)
                }}
                disabled={isPending}
                className="min-h-11 rounded-[14px] bg-[#B91C1C] px-4 text-[14px] font-black text-white"
              >
                {confirmAction.label}
              </button>
            </div>
            {error ? <p className="text-[12px] font-bold text-[#B91C1C]">{error}</p> : null}
          </div>
        </ActionSheet>
      ) : null}
    </>
  )
}
