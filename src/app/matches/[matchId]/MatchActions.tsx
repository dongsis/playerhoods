'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  requestJoinMatch,
  acceptMatchInvite,
  acceptGroupMatchInvite,
} from '@/lib/api/matches'
import type { MatchParticipant } from '@/lib/types/database'
import { getMatchParticipantRemovalCopy } from '@/lib/utils/match-participant-removal'

interface Props {
  matchId: string
  isOrganizer: boolean
  myParticipation: MatchParticipant | null
  needsReconfirm: boolean
  inScope: boolean
  myGroupInvites: { group_id: string; group_name: string; created_at: string }[]
}

export function MatchActions({ matchId, isOrganizer, myParticipation, needsReconfirm, inScope, myGroupInvites }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
                {loading ? 'Accepting...' : 'Accept Invite'}
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
              >
                {loading ? 'Requesting...' : 'Request to Join'}
              </button>
              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.4rem' }}>
                Host confirmation required.
              </p>
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
          <button
            data-testid="accept-group-invite"
            onClick={() => handleAction(() => acceptGroupMatchInvite(supabase, matchId))}
            disabled={loading}
            style={primaryButtonStyle}
          >
            {loading ? 'Accepting...' : 'Accept Invite'}
          </button>
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
          <button
            data-testid="request-join"
            onClick={() => handleAction(() => requestJoinMatch(supabase, matchId))}
            disabled={loading}
          >
            {loading ? 'Requesting...' : 'Request to Join'}
          </button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
            Host confirmation required.
          </p>
        </div>
      )
    }
    return <p style={{ fontSize: '0.9rem', color: '#666' }}>Not in scope.</p>
  }

  if (isPending) {
    const hasUserAccepted = mp.participant_accepted_at != null
    const isInvited = mp.join_method === 'invited'
    const isNominated = mp.join_method === 'nominated' ||
      (mp.join_method === 'requested' && mp.nominated_by != null)
    const isSelfRequested = mp.join_method === 'requested' && mp.nominated_by == null
    const showTopAcceptAction =
      needsReconfirm || (!hasUserAccepted && (isInvited || isNominated))

    if (!showTopAcceptAction) {
      return null
    }

    return (
      <div>
        {!needsReconfirm && !hasUserAccepted && (isInvited || isNominated) && (
          <button
            onClick={() => handleAction(() => acceptMatchInvite(supabase, matchId))}
            disabled={loading}
            style={primaryButtonStyle}
          >
            {loading ? 'Accepting...' : 'Accept Invite'}
          </button>
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
              {isSelfRequested && <span>Waiting for host confirmation.</span>}
              {isInvited && (
                <span>
                  {hasUserAccepted
                    ? (mp.org_approved_at ? 'Confirmed.' : 'Accepted. Waiting for host confirmation.')
                    : (mp.org_approved_at ? 'Host confirmed. Accept to join.' : 'Accept to join.')}
                </span>
              )}
              {isNominated && (
                <span>
                  {hasUserAccepted
                    ? (mp.org_approved_at ? 'Confirmed.' : 'You accepted. Waiting for host confirmation.')
                    : (mp.org_approved_at ? 'Host confirmed. Accept to join.' : 'Accept to join.')}
                </span>
              )}
            </>
          )}
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  if (isWaitingList) {
    return (
      <div>
        <p style={{ color: '#b45309', fontSize: '0.92rem', margin: '0 0 0.35rem' }}>
          You&apos;re on the waiting list.
        </p>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
          You&apos;ll be notified if a spot opens.
        </p>
      </div>
    )
  }

  if (isConfirmedDerived) {
    return null
  }

  return null
}
