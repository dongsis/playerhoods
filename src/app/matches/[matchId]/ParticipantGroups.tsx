'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  orgApproveParticipant,
  removeParticipant,
  userWithdraw,
} from '@/lib/api/matches'
import { processDeliveriesAction } from './process-deliveries-action'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import { SavedPlayerButton } from '@/app/components/SavedPlayerButton'
import { SaveContactPlayerButton } from '@/app/components/SaveContactPlayerButton'
import { ParticipantDetailTrigger } from '@/app/components/ParticipantDetailTrigger'
import { ContactPlayerMark } from '@/app/components/ContactPlayerMark'
import type { MatchStatus } from '@/lib/types/database'
import { MatchExitNoteComposer } from './MatchExitNoteComposer'

interface Props {
  matchId: string
  matchStatus: MatchStatus
  // v1.5: page.tsx filters to confirmed-only for non-organizer before passing here.
  // Organizer receives full participants list (confirmed + pending + removed).
  participants: MatchParticipantEnriched[]
  isOrganizer: boolean
  requiredCount: number
  // Count from match_formed view — used to display "Pending (N)" for non-organizer
  pendingCount: number
  waitingCount?: number
  myUserId: string | null
  organizerUserId: string | null
  organizerName: string
  savedPlayerIds: string[]
  /** Server action for remove — ensures revalidatePath so UI updates after remove */
  onRemoveParticipant?: (participantId: string) => Promise<void>
}

type ParticipantMenuAction = 'remove' | 'withdraw' | null

type ParticipantTimelineEvent = {
  key: string
  label: string
  at: string | null
  tone?: 'default' | 'danger'
}

function getPendingState(p: MatchParticipantEnriched) {
  const isApprovedRequestNeedingReconfirm =
    p.join_method === 'requested' &&
    p.org_approved_at !== null &&
    p.participant_accepted_at === null
  const participantConfirmed =
    p.join_method === 'requested' && !isApprovedRequestNeedingReconfirm
      ? Boolean(p.participant_accepted_at ?? p.created_at)
      : Boolean(p.participant_accepted_at)
  const hostConfirmed = Boolean(p.org_approved_at)

  return {
    participantConfirmed,
    hostConfirmed,
  }
}

function formatShortDate(value: string | null) {
  return value ? value.slice(0, 10) : null
}

function formatEventTimestamp(value: string | null) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return formatShortDate(value)
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function ConfirmationBadge({
  label,
  confirmed,
  title,
}: {
  label: 'Host' | 'Player'
  confirmed: boolean
  title: string
}) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.18rem',
        color: '#64748b',
        fontSize: '0.58rem',
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span
        aria-hidden="true"
        style={{
          color: confirmed ? '#5ca0a0' : '#cbd5e1',
          fontSize: '0.74rem',
          lineHeight: 1,
          transform: 'translateY(-0.02rem)',
        }}
      >
        {confirmed ? '✓' : '○'}
      </span>
    </span>
  )
}

function ParticipantAvatar({
  displayName,
  avatarUrl,
  registered,
  isContact,
}: {
  displayName: string
  avatarUrl: string | null
  registered: boolean
  isContact: boolean
}) {
  const initial = displayName.charAt(0).toUpperCase() || '?'

  if (isContact) {
    return (
      <ContactPlayerMark className="h-[2.2rem] w-[2.2rem]" />
    )
  }

  return (
    <div
      title={displayName}
      style={{
        width: '2.2rem',
        height: '2.2rem',
        borderRadius: '999px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: registered ? '#5ca0a0' : '#1E3A5F',
        color: '#fff',
        border: registered ? '2px solid #ffffff' : '2px dashed #e2e8f0',
        boxShadow: registered ? '0 8px 16px rgba(15, 118, 110, 0.08)' : 'none',
        fontSize: '0.7rem',
        fontWeight: 700,
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}

function ParticipantRow({
  p,
  matchId,
  matchStatus,
  isOrganizer,
  isMe,
  myUserId,
  organizerUserId,
  organizerName,
  initiallySaved,
  actorNames,
  onRemoveParticipant,
}: {
  p: MatchParticipantEnriched
  matchId: string
  matchStatus: MatchStatus
  isOrganizer: boolean
  isMe: boolean
  myUserId: string | null
  organizerUserId: string | null
  organizerName: string
  initiallySaved: boolean
  actorNames: Map<string, string>
  onRemoveParticipant?: (participantId: string) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [activeDialog, setActiveDialog] = useState<ParticipantMenuAction>(null)
  const [actionReason, setActionReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const isActive = matchStatus === 'active'

  useEffect(() => {
    if (!menuOpen) return

    const updateMenuPosition = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect()
      if (!rect) return

      const menuWidth = 320
      const viewportPadding = 12
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding,
      )

      setMenuPosition({
        top: rect.bottom + 6,
        left,
      })
    }

    updateMenuPosition()

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        menuRef.current?.contains(target)
        || menuButtonRef.current?.contains(target)
      ) {
        return
      }

      if (menuRef.current) {
        setMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null)
    }
  }, [menuOpen])

  const act = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
        // Run delivery worker in background — don't block UI on email send
        processDeliveriesAction().catch(() => {})
      } catch (err: unknown) {
        const message = (err as { message?: string })?.message ?? 'Action failed'
        setError(message)
      }
    })
  }

  const isGuest = p.guest_id !== null
  const isHostRow = organizerUserId !== null && p.user_id === organizerUserId
  const canSavePlayer = !isGuest && p.user_id !== null && p.user_id !== myUserId
  const canSaveContactPlayer = Boolean(
    isGuest
    && p.guest_id !== null
    && !isMe
    && (!myUserId || p.linked_user_id !== myUserId),
  )
  const canOpenDetails = Boolean(p.user_id || p.guest_id)
  const isPendingParticipant = p.status === 'pending'
  const isWaitingListParticipant = p.status === 'waiting_list'
  const isHostManagedConfirmation =
    p.confirmation_source === 'host_managed_offline'
    || p.confirmation_source === 'contact_owner_managed'
    || p.participant_accepted_via === 'host_offline_confirmation'
  const pendingState = isPendingParticipant ? getPendingState(p) : null
  // Approve: organizer only, pending, org not yet approved. Org and user confirm can happen in any order.
  const canApprove =
    isOrganizer &&
    isActive &&
    p.status === 'pending' &&
    p.org_approved_at === null

  const canOrganizerRemoveParticipant =
    isActive &&
    isOrganizer &&
    p.status !== 'removed' &&
    !(p.user_id !== null && p.user_id === organizerUserId)

  const canRemovePendingParticipant = false

  const canSelfWithdraw =
    isActive &&
    p.user_id === myUserId &&
    (p.status === 'pending' || p.status === 'confirmed' || p.status === 'waiting_list')
  const relationshipBadges: string[] = []

  const canRemoveParticipant = canOrganizerRemoveParticipant || canRemovePendingParticipant
  const isPendingRequest = p.status === 'pending' && p.join_method === 'requested' && p.org_approved_at === null
  const hostRemoveActionLabel = isPendingRequest ? 'Decline request' : 'Remove player'

  const closeMenus = () => {
    setMenuOpen(false)
    setActiveDialog(null)
    setActionReason('')
  }

  const resolveActorName = (actorId: string | null | undefined) => {
    if (!actorId) return null
    if (actorId === myUserId) return 'You'
    if (actorId === organizerUserId) {
      return organizerUserId === myUserId ? 'You' : organizerName
    }
    if (actorId === p.user_id) {
      return isMe ? 'You' : p.display_name
    }
    return actorNames.get(actorId) ?? actorId.slice(0, 6)
  }

  const timelineEvents: ParticipantTimelineEvent[] = []
  if (p.join_method === 'invited') {
    const inviter = resolveActorName(p.created_by)
    if (inviter) {
      timelineEvents.push({
        key: 'invited',
        label: `Invited by ${inviter}`,
        at: p.created_at,
      })
    }
  } else if (p.join_method === 'nominated') {
    const nominator = resolveActorName(p.nominated_by ?? p.created_by)
    if (isOrganizer && nominator) {
      timelineEvents.push({
        key: 'nominated',
        label: `Suggested by ${nominator}`,
        at: p.created_at,
      })
    } else {
      timelineEvents.push({
        key: 'invited',
        label: 'Invited',
        at: p.created_at,
      })
    }
  } else if (p.join_method === 'guest_add') {
    const adder = resolveActorName(p.created_by)
    if (adder) {
      timelineEvents.push({
        key: 'guest-add',
        label: `Added by ${adder}`,
        at: p.created_at,
      })
    }
  } else if (p.join_method === 'requested') {
    timelineEvents.push({
      key: 'requested',
      label: `Self request to join`,
      at: p.created_at,
    })
  }

  if (p.participant_accepted_at) {
    if (isOrganizer && isHostManagedConfirmation) {
      timelineEvents.push({
        key: 'host-offline-confirmed',
        label: 'Added by host · Confirmed offline',
        at: p.participant_accepted_at,
      })
    } else if (
      p.participant_accepted_via === 'delegate_manual'
      || p.participant_accepted_via === 'manual'
      || p.participant_accepted_via === 'proxy'
    ) {
      const confirmer = resolveActorName(p.manual_confirmed_by)
      timelineEvents.push({
        key: 'player-confirmed-delegated',
        label: confirmer ? `Player confirmed by ${confirmer}` : 'Player confirmed',
        at: p.participant_accepted_at,
      })
    } else if (p.user_id !== null) {
      timelineEvents.push({
        key: 'player-confirmed',
        label: `Player confirmed by ${isMe ? 'You' : p.display_name}`,
        at: p.participant_accepted_at,
      })
    } else {
      timelineEvents.push({
        key: 'player-confirmed',
        label: 'Player confirmed',
        at: p.participant_accepted_at,
      })
    }
  }

  if (p.org_approved_at) {
    const approver = resolveActorName(p.org_approved_by) ?? organizerName
    timelineEvents.push({
      key: 'organizer-approved',
      label: `Host approved by ${approver}`,
      at: p.org_approved_at,
    })
  }

  if (p.status === 'removed') {
    const remover = resolveActorName(p.removed_by) ?? 'Host'
    timelineEvents.push({
      key: 'removed',
      label: `Removed by ${remover}${p.removal_note ? ` - ${p.removal_note}` : ''}`,
      at: p.removed_at,
      tone: 'danger',
    })
  }

  const withdrawLabel =
    p.status === 'confirmed'
      ? 'Leave match'
      : p.join_method === 'requested'
        ? 'Withdraw request'
        : 'Decline participation'
  const actionButtons = [
    canRemoveParticipant
      ? {
          key: 'remove',
          label: hostRemoveActionLabel,
          style: dangerMenuActionStyle,
          onClick: () => {
            setMenuOpen(false)
            setActiveDialog('remove')
          },
        }
      : null,
    canSelfWithdraw
      ? {
          key: 'withdraw',
          label: withdrawLabel,
          style: secondaryMenuActionStyle,
          onClick: () => {
            setMenuOpen(false)
            setActionReason('')
            setActiveDialog('withdraw')
          },
        }
      : null,
  ].filter((item): item is {
    key: string
    label: string
    style: React.CSSProperties
    onClick: () => void
  } => item !== null)

  const showParticipantMenu = timelineEvents.length > 0 || actionButtons.length > 0
  const withdrawDialogMode =
    p.status === 'confirmed'
      || p.status === 'waiting_list'
      || (p.status === 'pending' && (pendingState?.participantConfirmed ?? false))
      ? 'withdraw'
      : 'decline'
  const participantInfo = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', minWidth: 0, flex: 1 }}>
      <ParticipantAvatar
        avatarUrl={p.avatar_url ?? null}
        displayName={p.display_name}
        registered={!isGuest}
        isContact={isGuest}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.08rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: isGuest ? '#64748b' : '#0f172a', letterSpacing: '-0.01em' }}>
              {p.display_name}
            </span>

            {isMe ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.1rem 0.34rem',
                  borderRadius: '6px',
                  background: '#f1f5f9',
                  color: '#94a3b8',
                  fontSize: '0.5rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                You
              </span>
            ) : null}

            {relationshipBadges.map((badge) => (
              <span
                key={badge}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.08rem 0.32rem',
                  borderRadius: '999px',
                  background: '#F8FBFF',
                  color: '#7F98BC',
                  border: '1px solid #D6E0EF',
                  fontSize: '0.42rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
                title={badge === 'CP' ? 'Contact player' : badge}
              >
                {badge}
              </span>
            ))}
            {isOrganizer && isHostManagedConfirmation ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.08rem 0.38rem',
                  borderRadius: '999px',
                  background: '#eff6ff',
                  color: '#0d6efd',
                  border: '1px solid #bfdbfe',
                  fontSize: '0.42rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
                title="Confirmed offline"
              >
                Added by host
              </span>
            ) : null}
          </div>
        </div>

        {!isHostRow && (pendingState || p.status === 'confirmed') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.18rem' }}>
            <ConfirmationBadge
              label="Host"
              confirmed={pendingState ? pendingState.hostConfirmed : true}
              title={pendingState
                ? (pendingState.hostConfirmed ? 'Waiting for player' : 'Waiting for host')
                : 'Confirmed by host'}
            />
            <ConfirmationBadge
              label="Player"
              confirmed={pendingState ? pendingState.participantConfirmed : true}
              title={pendingState
                ? (pendingState.participantConfirmed ? 'Player confirmed attendance' : 'Player not yet confirmed attendance')
                : 'Player confirmed attendance'}
            />
          </div>
        )}

        {isWaitingListParticipant && (
          <div style={{ marginTop: '0.2rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.1rem 0.42rem',
                borderRadius: '999px',
                background: '#fff7ed',
                color: '#b45309',
                fontSize: '0.58rem',
                fontWeight: 600,
              }}
            >
              Waiting list
            </span>
            <span style={{ fontSize: '0.64rem', color: '#94a3b8' }}>
              Fully confirmed, waiting for an open spot.
              {p.waiting_list_at ? ` Since ${formatEventTimestamp(p.waiting_list_at)}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )

  return (
      <div style={{ padding: '0.52rem 0', borderBottom: '1px solid #f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem' }}>
        {canOpenDetails ? (
          <ParticipantDetailTrigger
            participant={p}
            className="flex min-w-0 flex-1 items-start gap-[0.7rem] rounded-[14px] px-1 py-1 text-left transition hover:bg-slate-50"
            label={`View details for ${p.display_name}`}
          >
            {participantInfo}
          </ParticipantDetailTrigger>
        ) : participantInfo}

        {/* Organizer / participant action controls */}
        {(canSavePlayer || canSaveContactPlayer || showParticipantMenu) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, paddingTop: '0.06rem' }}>
            {canSavePlayer && (
              <SavedPlayerButton
                targetUserId={p.user_id!}
                source="match_player"
                currentUserId={myUserId}
                initialSaved={initiallySaved}
                compact
                savedLabel="Saved"
                removeLabel="Remove"
              />
            )}

            {canSaveContactPlayer && (
              <SaveContactPlayerButton
                guestId={p.guest_id!}
                source="shared_match"
                matchId={matchId}
                compact
                saveLabel="Save player"
              />
            )}

            {canApprove && (
              <button
                type="button"
                onClick={() => act(() => orgApproveParticipant(supabase, p.id))}
                disabled={isPending}
                style={inlinePrimaryActionStyle}
              >
                Confirm this player
              </button>
            )}

            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="More player actions"
                disabled={isPending}
                style={{
                  background: '#fff',
                  color: '#cbd5e1',
                  border: '1px solid #e2e8f0',
                  padding: '0.12rem 0.42rem',
                  fontSize: '0.92rem',
                  borderRadius: '999px',
                  cursor: isPending ? 'wait' : 'pointer',
                  lineHeight: 1,
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                }}
              >
                ...
              </button>

              {menuOpen && menuPosition && (
                <div
                  ref={menuRef}
                  style={{
                    position: 'fixed',
                    top: `${menuPosition.top}px`,
                    left: `${menuPosition.left}px`,
                    width: '320px',
                    maxWidth: 'calc(100vw - 24px)',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '18px',
                    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
                    padding: '0.8rem',
                    zIndex: 60,
                  }}
                >
                  <div style={{ display: 'grid', gap: '0.26rem' }}>
                    {timelineEvents.map((event) => (
                      <div
                        key={`${event.key}-${event.at ?? 'na'}`}
                        style={{
                          fontSize: '0.73rem',
                          color: event.tone === 'danger' ? '#b42318' : '#667085',
                          lineHeight: 1.45,
                        }}
                      >
                        {event.label}
                        {event.at && ` · ${formatEventTimestamp(event.at)}`}
                      </div>
                    ))}
                  </div>

                  {actionButtons.length > 0 && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #eceff3' }}>
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {actionButtons.map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            onClick={action.onClick}
                            disabled={isPending}
                            style={action.style}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {activeDialog === 'remove' && (
        <div style={dialogOverlayStyle}>
          <div style={dialogCardStyle}>
            <h4 style={dialogTitleStyle}>{hostRemoveActionLabel}?</h4>
            <p style={dialogBodyStyle}>
              {isPendingRequest
                ? 'This will decline their request to join.'
                : isOrganizer
                  ? 'This removes them from the match.'
                  : 'Remove this player?'}
            </p>
            <textarea
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              placeholder={isPendingRequest ? 'Add a note for declining (optional)' : 'Add a note (optional)'}
              style={dialogTextareaStyle}
            />
            <div style={dialogActionsStyle}>
              <button type="button" onClick={closeMenus} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const note = actionReason.trim()
                  closeMenus()
                  if (canRemoveParticipant && onRemoveParticipant) {
                    setError(null)
                    startTransition(async () => {
                      try {
                        await (onRemoveParticipant as ((participantId: string, note?: string | null) => Promise<void>))(p.id, note)
                        router.refresh()
                        processDeliveriesAction().catch(() => {})
                      } catch (err: unknown) {
                        setError((err as { message?: string })?.message ?? 'Action failed')
                      }
                    })
                  } else {
                    act(() => removeParticipant(supabase, p.id, note))
                  }
                }}
                style={dangerButtonStyle}
              >
                {hostRemoveActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDialog === 'withdraw' && (
        <div style={dialogOverlayStyle}>
          <div style={dialogCardStyle}>
            <h4 style={dialogTitleStyle}>{withdrawLabel}?</h4>
            <p style={dialogBodyStyle}>
              {p.status === 'confirmed'
                ? 'You will leave this match.'
                : 'This removes your participation.'}
            </p>
            <MatchExitNoteComposer
              mode={withdrawDialogMode}
              note={actionReason}
              onNoteChange={setActionReason}
            />
            <div style={dialogActionsStyle}>
              <button type="button" onClick={closeMenus} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const note = actionReason.trim()
                  closeMenus()
                  act(() => userWithdraw(supabase, matchId, note))
                }}
                style={dangerButtonStyle}
              >
                {withdrawLabel}
              </button>
            </div>
          </div>
        </div>
      )}


      {error && <p style={{ color: 'red', fontSize: '0.75rem', margin: '0.2rem 0 0' }}>{error}</p>}
    </div>
  )
}

const primaryMenuActionStyle: React.CSSProperties = {
  width: '100%',
  background: '#111827',
  color: '#fff',
  border: 'none',
  padding: '0.55rem 0.7rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.78rem',
  textAlign: 'left',
}

const inlinePrimaryActionStyle: React.CSSProperties = {
  background: '#111827',
  color: '#fff',
  border: 'none',
  padding: '0.45rem 0.75rem',
  borderRadius: '999px',
  cursor: 'pointer',
  fontSize: '0.76rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
}

const secondaryMenuActionStyle: React.CSSProperties = {
  width: '100%',
  background: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  padding: '0.55rem 0.7rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.78rem',
  textAlign: 'left',
}

const dangerMenuActionStyle: React.CSSProperties = {
  width: '100%',
  background: '#fff5f5',
  color: '#b42318',
  border: '1px solid #fecdca',
  padding: '0.55rem 0.7rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.78rem',
  textAlign: 'left',
}

const dialogOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  zIndex: 30,
}

const dialogCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  background: '#fff',
  borderRadius: '12px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.15)',
  padding: '1rem',
}

const dialogTitleStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '1rem',
  color: '#111827',
}

const dialogBodyStyle: React.CSSProperties = {
  margin: '0 0 1rem',
  fontSize: '0.85rem',
  color: '#4b5563',
  lineHeight: 1.5,
}

const dialogTextareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '6rem',
  padding: '0.8rem 0.9rem',
  borderRadius: '14px',
  border: '1px solid #cbd5e1',
  color: '#0f172a',
  fontSize: '0.9rem',
  resize: 'vertical',
  marginBottom: '1rem',
}

const dialogActionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
}

const secondaryButtonStyle: React.CSSProperties = {
  background: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  padding: '0.45rem 0.7rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.8rem',
}

const dangerButtonStyle: React.CSSProperties = {
  background: '#b42318',
  color: '#fff',
  border: 'none',
  padding: '0.45rem 0.7rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.8rem',
}

const participantGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  columnGap: '0',
  rowGap: '0',
}

function Section({
  title,
  badge,
  badgeColor,
  extraLabel,
  children,
  defaultOpen = true,
}: {
  title: string
  badge: number
  badgeColor: string
  extraLabel?: string | null
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  if (!defaultOpen) {
    return (
      <details style={{ marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: badgeColor }}>
          {title} ({badge})
        </summary>
        <div style={{ paddingLeft: '0.5rem', marginTop: '0.3rem' }}>{children}</div>
      </details>
    )
  }

  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.28rem',
          marginBottom: '0.18rem',
          flexWrap: 'wrap',
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: '0.82rem',
            color: badgeColor,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
        {title} · {badge}
      </h4>
        {extraLabel ? (
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              color: badgeColor,
            }}
          >
            {extraLabel}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function ParticipantGroups({
  matchId,
  matchStatus,
  participants,
  isOrganizer,
  requiredCount,
  pendingCount,
  waitingCount,
  myUserId,
  organizerUserId,
  organizerName,
  savedPlayerIds,
  onRemoveParticipant,
}: Props) {
  // Build name map: user_id → display_name (for resolving guest adders)
  const nameMap = new Map(
    participants
      .filter(p => p.user_id !== null)
      .map(p => [p.user_id!, p.display_name])
  )

  if (organizerUserId && !nameMap.has(organizerUserId)) {
    nameMap.set(organizerUserId, organizerName)
  }

  const savedPlayerIdSet = new Set(savedPlayerIds)

  // Removed first — used to exclude duplicates from confirmed/pending
  const removed = participants.filter(p => p.status === 'removed')
  const removedIdentityIds = new Set(
    removed.map(p => p.guest_id ?? p.user_id).filter((id): id is string => !!id)
  )

  // Confirmed participants — exclude anyone who is also in removed (handles duplicate rows for same guest/user)
  const confirmed = participants.filter(p => {
    if (removedIdentityIds.has(p.guest_id ?? p.user_id ?? '')) return false
    return p.status === 'confirmed' || (p.join_method === 'guest_add' && p.status !== 'removed')
  })

  // Pending — exclude anyone in removed
  const pending = participants.filter(
    p => !removedIdentityIds.has(p.guest_id ?? p.user_id ?? '') &&
      p.status === 'pending' && p.join_method !== 'guest_add'
  )
  const waiting = participants.filter(
    p => !removedIdentityIds.has(p.guest_id ?? p.user_id ?? '') &&
      p.status === 'waiting_list' && p.join_method !== 'guest_add'
  )

  const rowProps = (p: MatchParticipantEnriched) => ({
    p,
    matchId,
    matchStatus,
    isOrganizer,
    isMe: p.user_id === myUserId,
    myUserId,
    organizerUserId,
    organizerName,
    initiallySaved: !!(p.user_id && savedPlayerIdSet.has(p.user_id)),
    actorNames: nameMap,
    onRemoveParticipant,
  })

  return (
    <div>
      {/* Confirmed — visible to all */}
      <Section
        title="Confirmed"
        badge={confirmed.length}
        badgeColor="#2d8a4e"
        extraLabel={confirmed.length >= requiredCount ? 'Full' : null}
      >
        {confirmed.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: '0.85rem' }}>None yet.</p>
        ) : (
          <div style={participantGridStyle}>
            {confirmed.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
          </div>
        )}
      </Section>

      {/* Pending — visible here when the current page model allows the row through. */}
      {pending.length > 0 && isOrganizer ? (
        <Section title="Waiting for confirmation" badge={pending.length} badgeColor="#d97706">
          <div style={participantGridStyle}>
            {pending.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
          </div>
        </Section>
      ) : null}

      {isOrganizer && (waiting.length > 0 || (waitingCount ?? 0) > 0) && (
        <Section title="Waiting List" badge={waitingCount ?? waiting.length} badgeColor="#b45309">
          {waiting.length === 0 ? (
            <p style={{ color: '#98a2b3', fontSize: '0.82rem' }}>Waiting list exists, but details are hidden for your current role.</p>
          ) : (
            <div style={participantGridStyle}>
              {waiting.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
            </div>
          )}
        </Section>
      )}

      {/* Removed — organizer only (§3.3). Always expanded for clarity. */}
      {isOrganizer && removed.length > 0 && (
        <Section title="Removed" badge={removed.length} badgeColor="#999">
          <div style={participantGridStyle}>
            {removed.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
          </div>
        </Section>
      )}
    </div>
  )
}
