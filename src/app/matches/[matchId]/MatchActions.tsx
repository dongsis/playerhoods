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

// v1.3 state machine props (per Match_UI_State_Machine_v1.3.md)
interface Props {
  matchId: string
  isOrganizer: boolean
  myParticipation: MatchParticipant | null
  inScope: boolean
}

export function MatchActions({ matchId, isOrganizer, myParticipation, inScope }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const router = useRouter()

  const handleAction = async (action: () => Promise<void>, redirectAfter?: string) => {
    setError(null)
    setLoading(true)
    try {
      await action()
      setNote('')
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
  const isPending = mp?.status === 'pending'
  const isRemoved = mp?.status === 'removed'
  const isConfirmedDerived = mp && mp.status !== 'removed' && mp.user_accepted_at != null && mp.org_approved_at != null

  const noteInput = (
    <input
      type="text"
      placeholder="Add a note (optional)"
      value={note}
      onChange={(e) => setNote(e.target.value)}
      style={{ padding: '0.4rem', marginBottom: '0.5rem', width: '100%', boxSizing: 'border-box' as const }}
    />
  )

  const getNoteValue = () => note || undefined

  // ── 4) Removed — always show Request to Join ──
  if (isRemoved) {
    return (
      <div>
        {noteInput}
        <button
          data-testid="request-join"
          onClick={() => handleAction(() => requestJoinMatch(supabase, matchId, getNoteValue()))}
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

  // ── 1) Non-participant (mp == null) ──
  if (!mp && !isOrganizer) {
    if (inScope) {
      return (
        <div>
          {noteInput}
          <button
            data-testid="request-join"
            onClick={() => handleAction(() => requestJoinMatch(supabase, matchId, getNoteValue()))}
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
    return <p style={{ fontSize: '0.9rem', color: '#666' }}>Not in scope. Need an invite from organizer.</p>
  }

  // ── 2) Pending participant ──
  if (isPending) {
    const hasUserAccepted = mp.user_accepted_at != null
    const isInvited = mp.join_method === 'invited'
    const isNominated = mp.join_method === 'requested' && mp.nominated_by != null
    const isSelfRequested = mp.join_method === 'requested' && mp.nominated_by == null

    return (
      <div>
        {noteInput}
        {/* 2.1 Accept (invited or nominated, not yet accepted) */}
        {!hasUserAccepted && (isInvited || isNominated) && (
          <button
            onClick={() => handleAction(() => acceptMatchInvite(supabase, matchId, getNoteValue()))}
            disabled={loading}
            style={{ background: 'green', color: 'white', border: 'none', padding: '0.5rem 1rem', marginRight: '0.5rem' }}
          >
            {loading ? 'Accepting...' : isNominated ? 'Accept Nomination' : 'Accept Invite'}
          </button>
        )}

        {/* 2.2 Withdraw */}
        <button
          onClick={() => handleAction(() => userWithdraw(supabase, matchId, getNoteValue()), '/matches')}
          disabled={loading}
          style={{ background: '#666', color: 'white', border: 'none', padding: '0.5rem 1rem' }}
        >
          {loading ? 'Withdrawing...' : 'Withdraw'}
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

  // ── 3) Confirmed participant ──
  if (isConfirmedDerived && !isOrganizer) {
    return (
      <div>
        {noteInput}
        <button
          onClick={() => handleAction(() => userWithdraw(supabase, matchId, getNoteValue()), '/matches')}
          disabled={loading}
          style={{ background: '#666', color: 'white', border: 'none', padding: '0.5rem 1rem' }}
        >
          {loading ? 'Leaving...' : 'Leave Match'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  // Organizer or confirmed — no additional actions needed here
  // (Organizer actions like approve/remove are in ParticipantsList)
  return null
}
