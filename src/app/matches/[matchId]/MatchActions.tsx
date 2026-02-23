'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  requestJoinMatch,
  acceptMatchInvite,
  userWithdraw,
} from '@/lib/api/matches'
import type { MatchParticipant } from '@/lib/types/database'

// v1.5 CTA state machine (§4 of Match Detail Blueprint)
interface Props {
  matchId: string
  isOrganizer: boolean
  myParticipation: MatchParticipant | null
  inScope: boolean
}

export function MatchActions({ matchId, isOrganizer, myParticipation, inScope }: Props) {
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
  // v1.5: use status field (written by reconcile) as the authoritative confirmed signal
  const isConfirmedDerived = mp?.status === 'confirmed'

  // Organizer has no self-service CTA (admin actions are in the Organizer Admin section)
  if (isOrganizer) return null

  // ── §3.3 / §4.1 Removed ──────────────────────────────────────────────────
  // Removed person sees notice + can request-to-join if still in scope
  if (isRemoved) {
    return (
      <div>
        <p style={{ color: '#c00', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          You have been removed from this match.
        </p>
        {inScope ? (
          <>
            <button
              data-testid="request-join"
              onClick={() => handleAction(() => requestJoinMatch(supabase, matchId))}
              disabled={loading}
            >
              {loading ? 'Requesting...' : 'Request to Join'}
            </button>
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.4rem' }}>
              Your request will need organizer approval.
            </p>
          </>
        ) : (
          <p style={{ fontSize: '0.9rem', color: '#666' }}>
            Contact the organizer for a new invitation.
          </p>
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  // ── §4.1 Non-participant ──────────────────────────────────────────────────
  if (!mp) {
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
            Your request will need organizer approval.
          </p>
        </div>
      )
    }
    return <p style={{ fontSize: '0.9rem', color: '#666' }}>Not in scope. Need an invite from the organizer.</p>
  }

  // ── §4.2 / §4.3 Pending participant ──────────────────────────────────────
  if (isPending) {
    // v1.5: participant_accepted_at is canonical; fall back to v1.3 user_accepted_at
    const hasUserAccepted = (mp.participant_accepted_at ?? mp.user_accepted_at) != null
    const isInvited = mp.join_method === 'invited'
    const isNominated = mp.join_method === 'requested' && mp.nominated_by != null
    const isSelfRequested = mp.join_method === 'requested' && mp.nominated_by == null

    return (
      <div>
        {/* §4.2: Accept — only for invited/nominated who have not yet accepted */}
        {!hasUserAccepted && (isInvited || isNominated) && (
          <button
            onClick={() => handleAction(() => acceptMatchInvite(supabase, matchId))}
            disabled={loading}
            style={{ background: 'green', color: 'white', border: 'none', padding: '0.5rem 1rem', marginRight: '0.5rem' }}
          >
            {loading ? 'Accepting...' : isNominated ? 'Accept Nomination' : 'Accept Invite'}
          </button>
        )}

        {/* §4.2: Decline (invited/nominated) / §4.3: Withdraw Request (self-requested) */}
        <button
          onClick={() => handleAction(() => userWithdraw(supabase, matchId), '/dashboard')}
          disabled={loading}
          style={{ background: '#666', color: 'white', border: 'none', padding: '0.5rem 1rem' }}
        >
          {loading ? 'Withdrawing...' : isSelfRequested ? 'Withdraw Request' : 'Decline'}
        </button>

        {/* Status info */}
        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          {isSelfRequested && 'Waiting for organizer approval.'}
          {isInvited && (hasUserAccepted
            ? (mp.org_approved_at ? 'Both confirmed — reconciling...' : 'Accepted. Waiting for organizer approval.')
            : (mp.org_approved_at ? 'Organizer approved. Accept to confirm.' : 'Waiting for your acceptance and organizer approval.')
          )}
          {isNominated && (hasUserAccepted
            ? (mp.org_approved_at ? 'Both confirmed — reconciling...' : 'You accepted. Waiting for organizer approval.')
            : (mp.org_approved_at ? 'Organizer approved. Accept to confirm.' : 'You were nominated. Accept and wait for organizer approval.')
          )}
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  // ── §4.4 Confirmed participant ────────────────────────────────────────────
  if (isConfirmedDerived) {
    return (
      <div>
        <button
          onClick={() => handleAction(() => userWithdraw(supabase, matchId), '/dashboard')}
          disabled={loading}
          style={{ background: '#666', color: 'white', border: 'none', padding: '0.5rem 1rem' }}
        >
          {loading ? 'Leaving...' : 'Leave Match'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  return null
}
