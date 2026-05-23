'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  requestJoinMatch,
  acceptMatchInvite,
  acceptGroupMatchInvite,
  reconfirmMatchParticipation,
  userWithdraw,
} from '@/lib/api/matches'
import { MatchExitNoteComposer } from './MatchExitNoteComposer'
import type { MatchParticipant } from '@/lib/types/database'
import { getMatchParticipantRemovalCopy } from '@/lib/utils/match-participant-removal'

interface Props {
  matchId: string
  isOrganizer: boolean
  myParticipation: MatchParticipant | null
  needsReconfirm: boolean
  inScope: boolean
  myGroupInvites: { group_id: string; group_name: string; created_at: string }[]
  organizerName: string
}

export function MatchActions({ matchId, isOrganizer, myParticipation, needsReconfirm, inScope, myGroupInvites, organizerName }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const router = useRouter()

  const handleAction = async (action: () => Promise<void>, redirectAfter?: string) => {
    setError(null)
    setLoading(true)
    try {
      await action()
      if (redirectAfter) {
        router.push(redirectAfter)
      } else {
        router.refresh()
      }
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Action failed'
      console.error('MatchActions error:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const supabase = createSupabaseBrowserClient()
  const mp = myParticipation
  const isRemoved = mp?.status === 'removed'
  const isPending = mp?.status === 'pending'
  const isWaitingList = mp?.status === 'waiting_list'
  const isConfirmedDerived = mp?.status === 'confirmed'
  const hasGroupInvite = myGroupInvites.length > 0
  const invitedGroupNames = myGroupInvites.map((invite) => invite.group_name)
  const primaryButtonStyle = {
    background: '#2d8a4e',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1rem',
    marginRight: '0.5rem',
  } as const
  const requestJoinButtonStyle = {
    background: '#6f95c8',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    padding: '0.65rem 1.1rem',
    fontSize: '0.98rem',
    fontWeight: 700,
    boxShadow: '0 8px 20px rgba(111, 149, 200, 0.18)',
  } as const
  const secondaryButtonStyle = {
    background: 'white',
    color: '#475569',
    border: '1px solid #cbd5e1',
    padding: '0.5rem 1rem',
  } as const
  const declineActionLabel = "Can't Make It"

  const closeDeclineDialog = () => {
    setDeclineOpen(false)
    setDeclineReason('')
  }

  if (isOrganizer) return null

  if (isRemoved) {
    const removalCopy = getMatchParticipantRemovalCopy(mp)

    return (
      <div>
        <p style={{ color: '#c00', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          {removalCopy.sentenceLabel}
        </p>
        {!removalCopy.isSelfWithdraw && (
          hasGroupInvite ? (
            <>
              <button
                data-testid="accept-group-invite"
                onClick={() => handleAction(() => acceptGroupMatchInvite(supabase, matchId))}
                disabled={loading}
                style={primaryButtonStyle}
              >
                {loading ? 'Joining...' : "I'm In"}
              </button>
              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.4rem' }}>
                Invited via {invitedGroupNames.join(', ')}.
              </p>
            </>
          ) : inScope ? (
            <>
              <button
                data-testid="request-join"
                onClick={() => handleAction(() => requestJoinMatch(supabase, matchId))}
                disabled={loading}
                style={requestJoinButtonStyle}
              >
                {loading ? 'Sending...' : "I'd like to play"}
              </button>
            </>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#666' }}>
              Need an invite.
            </p>
          )
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  if (!mp) {
    if (hasGroupInvite) {
      return (
        <div>
          <p style={{ margin: '0 0 0.35rem', color: '#0f172a', fontWeight: 800 }}>You&apos;re invited to play</p>
          <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
            Let the host know if you can make it.
          </p>
          <button
            data-testid="accept-group-invite"
            onClick={() => handleAction(() => acceptGroupMatchInvite(supabase, matchId))}
            disabled={loading}
            style={primaryButtonStyle}
          >
            {loading ? 'Joining...' : "I'm In"}
          </button>
          <a href="#match-communication" style={{ ...secondaryButtonStyle, textDecoration: 'none' }}>
            Message Host
          </a>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
            Invited via {invitedGroupNames.join(', ')}.
          </p>
        </div>
      )
    }
    if (inScope) {
      return (
        <div>
          <p style={{ margin: '0 0 0.35rem', color: '#0f172a', fontWeight: 800 }}>Open to Join</p>
          <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
            Let the host know you&apos;d like to play. They can add you to the lineup if there&apos;s a spot.
          </p>
          <button
            data-testid="request-join"
            onClick={() => handleAction(() => requestJoinMatch(supabase, matchId))}
            disabled={loading}
            style={requestJoinButtonStyle}
          >
            {loading ? 'Sending...' : "I'd like to play"}
          </button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      )
    }
    return <p style={{ fontSize: '0.9rem', color: '#666' }}>Not in scope.</p>
  }

  if (isPending) {
    const hasUserAccepted = mp.participant_accepted_at != null
    const isInvited = mp.join_method === 'invited'
    const isParticipantInvite = mp.join_method === 'nominated' ||
      (mp.join_method === 'requested' && mp.nominated_by != null)
    const isSelfRequested = mp.join_method === 'requested' && mp.nominated_by == null
    const showTopAcceptAction =
      needsReconfirm || (!hasUserAccepted && (isInvited || isParticipantInvite))

    if (!showTopAcceptAction) {
      if (isSelfRequested) {
        return (
          <div
            style={{
              border: '1px solid #dbeafe',
              borderRadius: '18px',
              background: '#eff6ff',
              padding: '0.9rem 1rem',
            }}
          >
            <p style={{ margin: '0 0 0.35rem', color: '#0f172a', fontWeight: 800 }}>Request sent</p>
            <p style={{ margin: '0 0 0.75rem', color: '#475569', fontSize: '0.9rem', lineHeight: 1.45 }}>
              The host can now add you to the lineup.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setDeclineOpen(true)
                }}
                disabled={loading}
                style={secondaryButtonStyle}
              >
                Withdraw Request
              </button>
              <a href="#match-communication" style={{ ...secondaryButtonStyle, textDecoration: 'none' }}>
                Message Host
              </a>
            </div>
            <p style={{ margin: '0.6rem 0 0', color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
              Waiting for host
            </p>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            {declineOpen && (
              <div style={dialogOverlayStyle}>
                <div style={dialogCardStyle}>
                  <h4 style={dialogTitleStyle}>Withdraw Request</h4>
                  <p style={dialogBodyStyle}>
                    The host will see that you no longer want to join this match.
                  </p>
                  <MatchExitNoteComposer
                    mode="withdraw"
                    note={declineReason}
                    onNoteChange={setDeclineReason}
                  />
                  <div style={dialogActionsStyle}>
                    <button type="button" onClick={closeDeclineDialog} style={secondaryDialogButtonStyle}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const note = declineReason.trim()
                        closeDeclineDialog()
                        handleAction(() => userWithdraw(supabase, matchId, note))
                      }}
                      style={{
                        ...dangerDialogButtonStyle,
                        opacity: loading ? 0.6 : 1,
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loading ? 'Withdrawing...' : 'Withdraw Request'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      }
      return null
    }

    return (
      <div>
        {!needsReconfirm && !hasUserAccepted && (isInvited || isParticipantInvite) && (
          <>
            <button
              onClick={() => handleAction(() => acceptMatchInvite(supabase, matchId))}
              disabled={loading}
              style={primaryButtonStyle}
            >
              {loading ? 'Joining...' : "I'm In"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setDeclineOpen(true)
              }}
              disabled={loading}
              style={secondaryButtonStyle}
            >
              Can&apos;t Make It
            </button>
          </>
        )}

        {needsReconfirm && (
          <button
            onClick={() => handleAction(() => acceptMatchInvite(supabase, matchId))}
            disabled={loading}
            style={primaryButtonStyle}
          >
            {loading ? 'Confirming...' : 'Confirm Attendance'}
          </button>
        )}

        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          {needsReconfirm && (
            <span>Match updated. Confirm again.</span>
          )}
          {!needsReconfirm && (
            <>
              {isSelfRequested && <span>Waiting for host.</span>}
              {isInvited && (
                <span>
                  {hasUserAccepted
                    ? (mp.org_approved_at ? "You're in the lineup." : 'Waiting for host.')
                    : (mp.org_approved_at ? 'The host added you. Join when ready.' : 'Let the host know if you can make it.')}
                </span>
              )}
              {isParticipantInvite && (
                <span>
                  {hasUserAccepted
                    ? (mp.org_approved_at ? "You're in the lineup." : 'Waiting for host.')
                    : (mp.org_approved_at ? 'The host added you. Join when ready.' : 'Let the host know if you can make it.')}
                </span>
              )}
            </>
          )}
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {declineOpen && (
          <div style={dialogOverlayStyle}>
            <div style={dialogCardStyle}>
              <h4 style={dialogTitleStyle}>{declineActionLabel}</h4>
              <p style={dialogBodyStyle}>
                Add a note if you want. The host will see it with your response.
              </p>
              <MatchExitNoteComposer
                mode="decline"
                note={declineReason}
                onNoteChange={setDeclineReason}
              />
              <div style={dialogActionsStyle}>
                <button type="button" onClick={closeDeclineDialog} style={secondaryDialogButtonStyle}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    const note = declineReason.trim()
                    closeDeclineDialog()
                    handleAction(() => userWithdraw(supabase, matchId, note))
                  }}
                  style={{
                    ...dangerDialogButtonStyle,
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Declining...' : declineActionLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (isWaitingList) {
    return (
      <div>
        <p style={{ color: '#b45309', fontSize: '0.92rem', margin: '0 0 0.35rem' }}>
          You&apos;re on the waitlist
        </p>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
          You&apos;re available, but the match is currently full. The organizer will let you know if a spot opens.
        </p>
        <a href="#match-communication" style={{ ...secondaryButtonStyle, display: 'inline-flex', marginTop: '0.75rem', textDecoration: 'none' }}>
          Message Host
        </a>
      </div>
    )
  }

  if (isConfirmedDerived) {
    const isHostManagedConfirmation =
      mp.confirmation_source === 'host_managed_offline'
      || mp.confirmation_source === 'contact_owner_managed'
      || mp.participant_accepted_via === 'host_offline_confirmation'

    if (!isHostManagedConfirmation) {
      return null
    }

    return (
      <div>
        <div
          style={{
            border: '1px solid #dbeafe',
            borderRadius: '18px',
            background: '#eff6ff',
            padding: '0.9rem 1rem',
          }}
        >
          <p style={{ margin: 0, color: '#0f172a', fontWeight: 800 }}>You&apos;re in the lineup</p>
          <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.9rem', lineHeight: 1.45 }}>
            The host added you because you already confirmed outside PlayerHoods. If anything changed, you can update your response.
          </p>
          <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction(() => reconfirmMatchParticipation(supabase, matchId))}
              style={primaryButtonStyle}
            >
              I&apos;m In
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setDeclineOpen(true)
              }}
              disabled={loading}
              style={secondaryButtonStyle}
            >
              Can&apos;t Make It
            </button>
            <a href="#match-communication" style={{ ...secondaryButtonStyle, textDecoration: 'none' }}>
              Message Host
            </a>
          </div>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {declineOpen && (
          <div style={dialogOverlayStyle}>
            <div style={dialogCardStyle}>
              <h4 style={dialogTitleStyle}>{declineActionLabel}</h4>
              <p style={dialogBodyStyle}>
                Add a note if you want. The host will see it with your response.
              </p>
              <MatchExitNoteComposer
                mode="withdraw"
                note={declineReason}
                onNoteChange={setDeclineReason}
              />
              <div style={dialogActionsStyle}>
                <button type="button" onClick={closeDeclineDialog} style={secondaryDialogButtonStyle}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    const note = declineReason.trim()
                    closeDeclineDialog()
                    handleAction(() => userWithdraw(supabase, matchId, note))
                  }}
                  style={{
                    ...dangerDialogButtonStyle,
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Updating...' : declineActionLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}

const dialogOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  zIndex: 70,
} as const

const dialogCardStyle = {
  width: '100%',
  maxWidth: '30rem',
  borderRadius: '20px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  padding: '1rem',
  boxShadow: '0 24px 48px -24px rgba(15, 23, 42, 0.35)',
} as const

const dialogTitleStyle = {
  margin: 0,
  color: '#0f172a',
  fontSize: '1rem',
  fontWeight: 700,
} as const

const dialogBodyStyle = {
  margin: '0.45rem 0 0',
  color: '#64748b',
  fontSize: '0.88rem',
  lineHeight: 1.5,
} as const

const dialogActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.6rem',
  marginTop: '0.9rem',
} as const

const secondaryDialogButtonStyle = {
  borderRadius: '999px',
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#475569',
  padding: '0.5rem 0.9rem',
  fontWeight: 600,
} as const

const dangerDialogButtonStyle = {
  borderRadius: '999px',
  border: 'none',
  background: '#b91c1c',
  color: '#fff',
  padding: '0.5rem 0.9rem',
  fontWeight: 600,
} as const
