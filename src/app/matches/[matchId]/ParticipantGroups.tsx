'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  orgApproveParticipant,
  proxyConfirmParticipant,
  proxyDeclineParticipant,
  proxyWithdrawParticipant,
  removeParticipant,
  inviteUserToMatch,
  userWithdraw,
} from '@/lib/api/matches'
import { processDeliveriesAction } from './process-deliveries-action'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import { Avatar } from '@/app/components/Avatar'
import { SavedPlayerButton } from '@/app/components/SavedPlayerButton'
import { SaveContactPlayerButton } from '@/app/components/SaveContactPlayerButton'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'
import type { MatchStatus } from '@/lib/types/database'

interface Props {
  matchId: string
  matchStatus: MatchStatus
  // v1.5: page.tsx filters to confirmed-only for non-organizer before passing here.
  // Organizer receives full participants list (confirmed + pending + removed).
  participants: MatchParticipantEnriched[]
  isOrganizer: boolean
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

type ParticipantMenuAction = 'remove' | 'withdraw' | 'proxy-decline' | 'proxy-withdraw' | null

type ParticipantTimelineEvent = {
  key: string
  label: string
  at: string | null
  tone?: 'default' | 'danger'
}

function getPendingState(p: MatchParticipantEnriched) {
  const participantConfirmed =
    p.join_method === 'requested'
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
  label: 'Host' | 'Participant'
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
        gap: '0.24rem',
        color: '#111827',
        fontSize: '0.78rem',
        fontWeight: 500,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span
        aria-hidden="true"
        style={{
          color: confirmed ? '#15803d' : '#98a2b3',
          fontSize: '0.95rem',
          lineHeight: 1,
          transform: 'translateY(-0.02rem)',
        }}
      >
        {confirmed ? '✓' : '○'}
      </span>
    </span>
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
  const canSaveContactPlayer = Boolean(isGuest && p.guest_id !== null)
  const canViewProfile = !isGuest && p.user_id !== null && p.user_id !== myUserId
  const isPendingParticipant = p.status === 'pending'
  const isWaitingListParticipant = p.status === 'waiting_list'
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
    !isOrganizer &&
    p.user_id === myUserId &&
    (p.status === 'pending' || p.status === 'confirmed' || p.status === 'waiting_list')
  const relationshipBadges = [
    isGuest ? 'Contact Player' : null,
    isGuest && p.saved_by_viewer ? 'Saved by you' : null,
    p.proxy_manageable_by_viewer ? 'Proxy for' : null,
  ].filter((badge): badge is string => badge !== null)
  const canProxyManage = isActive && Boolean(p.proxy_manageable_by_viewer)
  const canProxyConfirm =
    canProxyManage &&
    p.status === 'pending' &&
    !(pendingState?.participantConfirmed ?? false)
  const canProxyDecline =
    canProxyManage &&
    p.status === 'pending' &&
    !(pendingState?.participantConfirmed ?? false)
  const canProxyWithdraw =
    canProxyManage &&
    (p.status === 'confirmed'
      || p.status === 'waiting_list'
      || (p.status === 'pending' && (pendingState?.participantConfirmed ?? false)))

  // Invite back a removed participant (organizer only; uses rpc_match_invite_user)
  const canInviteBack =
    isOrganizer && isActive && p.status === 'removed' && p.user_id !== null

  const canRemoveParticipant = canOrganizerRemoveParticipant || canRemovePendingParticipant

  const closeMenus = () => {
    setMenuOpen(false)
    setActiveDialog(null)
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
    if (nominator) {
      timelineEvents.push({
        key: 'nominated',
        label: `Nominated by ${nominator}`,
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
    if (
      p.participant_accepted_via === 'delegate_manual'
      || p.participant_accepted_via === 'manual'
      || p.participant_accepted_via === 'proxy'
    ) {
      const confirmer = resolveActorName(p.manual_confirmed_by)
      timelineEvents.push({
        key: 'player-confirmed-delegated',
        label:
          p.participant_accepted_via === 'proxy'
            ? (confirmer ? `Participant confirmed by ${confirmer} on their behalf` : 'Participant confirmed by proxy')
            : (confirmer ? `Participant confirmed by ${confirmer}` : 'Participant confirmed'),
        at: p.participant_accepted_at,
      })
    } else if (p.user_id !== null) {
      timelineEvents.push({
        key: 'player-confirmed',
        label: `Participant confirmed by ${isMe ? 'You' : p.display_name}`,
        at: p.participant_accepted_at,
      })
    } else {
      timelineEvents.push({
        key: 'player-confirmed',
        label: 'Participant confirmed',
        at: p.participant_accepted_at,
      })
    }
  }

  if (p.org_approved_at) {
    const approver = resolveActorName(p.org_approved_by) ?? organizerName
    timelineEvents.push({
      key: 'organizer-approved',
      label: `Host confirmed by ${approver}`,
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
  const proxyDeclineLabel =
    p.join_method === 'requested'
      ? 'Withdraw request on their behalf'
      : 'Decline on their behalf'
  const proxyWithdrawLabel =
    p.status === 'confirmed'
      ? 'Withdraw on their behalf'
      : p.status === 'waiting_list'
        ? 'Leave waiting list on their behalf'
        : 'Withdraw on their behalf'

  const actionButtons = [
    canProxyDecline
      ? {
          key: 'proxy-decline',
          label: proxyDeclineLabel,
          style: secondaryMenuActionStyle,
          onClick: () => {
            setMenuOpen(false)
            setActiveDialog('proxy-decline')
          },
        }
      : null,
    canProxyWithdraw
      ? {
          key: 'proxy-withdraw',
          label: proxyWithdrawLabel,
          style: dangerMenuActionStyle,
          onClick: () => {
            setMenuOpen(false)
            setActiveDialog('proxy-withdraw')
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
            setActiveDialog('withdraw')
          },
        }
      : null,
    canRemoveParticipant
      ? {
          key: 'remove',
          label: 'Remove participant',
          style: dangerMenuActionStyle,
          onClick: () => {
            setMenuOpen(false)
            setActiveDialog('remove')
          },
        }
      : null,
    canInviteBack
      ? {
          key: 'invite-back',
          label: 'Invite back',
          style: primaryMenuActionStyle,
          onClick: () => {
            setMenuOpen(false)
            act(() => inviteUserToMatch(supabase, matchId, p.user_id!))
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

  return (
      <div style={{ padding: '0.5rem 0', borderBottom: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        {canViewProfile ? (
          <PlayerProfileTrigger targetUserId={p.user_id!} className="rounded-full">
            <Avatar
              src={p.avatar_url}
              displayName={p.display_name}
              size="md"
              className="mt-0.5"
            />
          </PlayerProfileTrigger>
        ) : (
          <Avatar
            src={p.avatar_url}
            displayName={p.display_name}
            size="md"
            className="mt-0.5"
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.12rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontWeight: isMe ? 700 : 500, fontSize: '0.96rem', color: '#111827' }}>
                {p.display_name}
              </span>

              {relationshipBadges.map((badge) => (
                <span
                  key={badge}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.12rem 0.42rem',
                    borderRadius: '999px',
                    background: badge === 'Proxy for' ? '#eef2ff' : '#f4f4f5',
                    color: badge === 'Proxy for' ? '#4338ca' : '#52525b',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>

            {isMe && !isHostRow && (
              <span style={{ fontSize: '0.72rem', color: '#98a2b3', fontWeight: 500 }}>
                You
              </span>
            )}
          </div>

          {!isHostRow && (pendingState || p.status === 'confirmed') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.28rem' }}>
              <ConfirmationBadge
                label="Host"
                confirmed={pendingState ? pendingState.hostConfirmed : true}
                title={pendingState
                  ? (pendingState.hostConfirmed ? 'Host confirmed' : 'Host not yet confirmed')
                  : 'Host confirmed'}
              />
              <ConfirmationBadge
                label="Participant"
                confirmed={pendingState ? pendingState.participantConfirmed : true}
                title={pendingState
                  ? (pendingState.participantConfirmed ? 'Participant confirmed attendance' : 'Participant not yet confirmed attendance')
                  : 'Participant confirmed attendance'}
              />
            </div>
          )}

          {isWaitingListParticipant && (
            <div style={{ marginTop: '0.32rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '999px',
                  background: '#fff7ed',
                  color: '#b45309',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                }}
              >
                Waiting list
              </span>
              <span style={{ fontSize: '0.74rem', color: '#667085' }}>
                Fully confirmed, waiting for an open spot.
                {p.waiting_list_at ? ` Since ${formatEventTimestamp(p.waiting_list_at)}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Organizer / participant action controls */}
        {(canSavePlayer || canSaveContactPlayer || showParticipantMenu) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
            {canSavePlayer && (
              <SavedPlayerButton
                targetUserId={p.user_id!}
                source="match_player"
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
                saveLabel="Save"
              />
            )}

            {canApprove && (
              <button
                type="button"
                onClick={() => act(() => orgApproveParticipant(supabase, p.id))}
                disabled={isPending}
                style={inlinePrimaryActionStyle}
              >
                Confirm this participant
              </button>
            )}

            {canProxyConfirm && (
              <button
                type="button"
                onClick={() => act(() => proxyConfirmParticipant(supabase, p.id))}
                disabled={isPending}
                style={inlinePrimaryActionStyle}
              >
                Confirm on their behalf
              </button>
            )}

            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="More participant actions"
                disabled={isPending}
                style={{
                  background: '#fff',
                  color: '#555',
                  border: '1px solid #ddd',
                  padding: '0.15rem 0.5rem',
                  fontSize: '0.95rem',
                  borderRadius: '999px',
                  cursor: isPending ? 'wait' : 'pointer',
                  lineHeight: 1,
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
                    border: '1px solid #ddd',
                    borderRadius: '12px',
                    boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
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
            <h4 style={dialogTitleStyle}>Remove this participant?</h4>
            <p style={dialogBodyStyle}>
              {isOrganizer
                ? 'This will remove the participant from the match.'
                : 'Remove this participant from the match?'}
            </p>
            <div style={dialogActionsStyle}>
              <button type="button" onClick={closeMenus} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMenus()
                  if (canRemoveParticipant && onRemoveParticipant) {
                    setError(null)
                    startTransition(async () => {
                      try {
                        await onRemoveParticipant(p.id)
                        router.refresh()
                        processDeliveriesAction().catch(() => {})
                      } catch (err: unknown) {
                        setError((err as { message?: string })?.message ?? 'Action failed')
                      }
                    })
                  } else {
                    act(() => removeParticipant(supabase, p.id))
                  }
                }}
                style={dangerButtonStyle}
              >
                Remove participant
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
                ? 'You will be removed from this match.'
                : 'This will remove your current participation from the match.'}
            </p>
            <div style={dialogActionsStyle}>
              <button type="button" onClick={closeMenus} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMenus()
                  act(() => userWithdraw(supabase, matchId))
                }}
                style={dangerButtonStyle}
              >
                {withdrawLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDialog === 'proxy-decline' && (
        <div style={dialogOverlayStyle}>
          <div style={dialogCardStyle}>
            <h4 style={dialogTitleStyle}>{proxyDeclineLabel}?</h4>
            <p style={dialogBodyStyle}>
              This will record a proxy decline for this participant. They still keep full control and can manage their own participation directly.
            </p>
            <div style={dialogActionsStyle}>
              <button type="button" onClick={closeMenus} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMenus()
                  act(() => proxyDeclineParticipant(supabase, p.id))
                }}
                style={dangerButtonStyle}
              >
                {proxyDeclineLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDialog === 'proxy-withdraw' && (
        <div style={dialogOverlayStyle}>
          <div style={dialogCardStyle}>
            <h4 style={dialogTitleStyle}>{proxyWithdrawLabel}?</h4>
            <p style={dialogBodyStyle}>
              This will record a proxy withdrawal for this participant. They still keep full control and can manage their own participation directly.
            </p>
            <div style={dialogActionsStyle}>
              <button type="button" onClick={closeMenus} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMenus()
                  act(() => proxyWithdrawParticipant(supabase, p.id))
                }}
                style={dangerButtonStyle}
              >
                {proxyWithdrawLabel}
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

const primaryButtonStyle: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
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

function Section({
  title,
  badge,
  badgeColor,
  children,
  defaultOpen = true,
}: {
  title: string
  badge: number
  badgeColor: string
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
    <div style={{ marginBottom: '1.25rem' }}>
      <h4 style={{ margin: '0 0 0.45rem', fontSize: '0.92rem', color: badgeColor, fontWeight: 600 }}>
        {title} · {badge}
      </h4>
      {children}
    </div>
  )
}

export function ParticipantGroups({
  matchId,
  matchStatus,
  participants,
  isOrganizer,
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
      <Section title="Confirmed" badge={confirmed.length} badgeColor="#2d8a4e">
        {confirmed.length === 0
          ? <p style={{ color: '#aaa', fontSize: '0.85rem' }}>None yet.</p>
          : confirmed.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)
        }
      </Section>

      {/* Pending — visible here when the current page model allows the row through. */}
      {pending.length > 0 && isOrganizer ? (
        <Section title="Waiting for confirmation" badge={pending.length} badgeColor="#d97706">
          {pending.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
        </Section>
      ) : pending.length > 0 ? (
        <Section title="Waiting for confirmation" badge={pending.length} badgeColor="#d97706">
          {pending.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
        </Section>
      ) : null}

      {(waiting.length > 0 || (waitingCount ?? 0) > 0) && (
        <Section title="Waiting List" badge={waitingCount ?? waiting.length} badgeColor="#b45309">
          {waiting.length === 0 ? (
            <p style={{ color: '#98a2b3', fontSize: '0.82rem' }}>Waiting list exists, but details are hidden for your current role.</p>
          ) : (
            waiting.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)
          )}
        </Section>
      )}

      {/* Removed — organizer only (§3.3). Always expanded for clarity. */}
      {isOrganizer && removed.length > 0 && (
        <Section title="Removed" badge={removed.length} badgeColor="#999">
          {removed.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
        </Section>
      )}
    </div>
  )
}
