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

// v1.5 CTA state machine (§4 of Match Detail Blueprint)
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
  // v1.5: use status field (written by reconcile) as the authoritative confirmed signal
  const isConfirmedDerived = mp?.status === 'confirmed'
  const hasGroupInvite = myGroupInvites.length > 0
  const invitedGroupNames = myGroupInvites.map((invite) => invite.group_name)

  // Organizer has no self-service CTA (admin actions are in the Organizer Admin section)
  if (isOrganizer) return null

  // ── §3.3 / §4.1 Removed ──────────────────────────────────────────────────
  // Removed person sees notice + can request-to-join if still in scope
  if (isRemoved) {
    const note = mp.removal_note ?? ''
    const normalizedNote = note.toLowerCase()
    const isSelfWithdraw =
      (mp.removed_by !== null && mp.user_id !== null && mp.removed_by === mp.user_id)
      || normalizedNote.includes('declined')
      || normalizedNote.includes('withdraw')

    return (
      <div>
        <p style={{ color: '#c00', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          {isSelfWithdraw
            ? 'You have Withdrawn from this match.'
            : 'No longer invited.'}
        </p>
        {!isSelfWithdraw && (
          hasGroupInvite ? (
            <>
              <button
                data-testid="accept-group-invite"
                onClick={() => handleAction(() => acceptGroupMatchInvite(supabase, matchId))}
                disabled={loading}
              >
                {loading ? 'Accepting...' : 'Accept Group Invite'}
              </button>
              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.4rem' }}>
                Invited via {invitedGroupNames.join(', ')}. Accepting creates your participant row immediately.
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
                Your request will need host confirmation.
              </p>
            </>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#666' }}>
              Contact the host for a new invitation.
            </p>
          )
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  // ── §4.1 Non-participant ──────────────────────────────────────────────────
  if (!mp) {
    if (hasGroupInvite) {
      return (
        <div>
          <button
            data-testid="accept-group-invite"
            onClick={() => handleAction(() => acceptGroupMatchInvite(supabase, matchId))}
            disabled={loading}
          >
            {loading ? 'Accepting...' : 'Accept Group Invite'}
          </button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
            Invited via {invitedGroupNames.join(', ')}. This uses the host-approved invite path, so no extra host approval is needed.
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
            Your request will need host confirmation.
          </p>
        </div>
      )
    }
    return <p style={{ fontSize: '0.9rem', color: '#666' }}>Not in scope. Need an invite from the host.</p>
  }

  // ── §4.2 / §4.3 Pending participant ──────────────────────────────────────
  if (isPending) {
    const hasUserAccepted = mp.participant_accepted_at != null
    const isInvited = mp.join_method === 'invited'
    // v1.5: join_method='nominated' (new), or v1.3 legacy: 'requested' + nominated_by set
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
        {/* §4.2: Accept — invited/nominated who haven't yet accepted */}
        {!needsReconfirm && !hasUserAccepted && (isInvited || isNominated) && (
          <button
            onClick={() => handleAction(() => acceptMatchInvite(supabase, matchId))}
            disabled={loading}
            style={{ background: 'green', color: 'white', border: 'none', padding: '0.5rem 1rem', marginRight: '0.5rem' }}
          >
            {loading ? 'Accepting...' : isNominated ? 'Accept Nomination' : 'Accept Invite'}
          </button>
        )}

        {/* Re-confirm after match edit: self-requested, org already approved, accepted_at cleared */}
        {needsReconfirm && (
          <button
            onClick={() => handleAction(() => acceptMatchInvite(supabase, matchId))}
            disabled={loading}
            style={{ background: '#2d8a4e', color: 'white', border: 'none', padding: '0.5rem 1rem', marginRight: '0.5rem' }}
          >
            {loading ? 'Confirming...' : 'Confirm Attendance'}
          </button>
        )}

        {/* Status info */}
        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          {needsReconfirm && (
            <span>Match details have changed. Please confirm you can still attend.</span>
          )}
          {!needsReconfirm && (
            <>
              {isSelfRequested && (
                <span>
                  {mp.org_approved_at
                    ? 'Waiting for host confirmation.'
                    : 'Waiting for host confirmation.'}
                </span>
              )}
              {isInvited && (
                <span>
                  {hasUserAccepted
                    ? (mp.org_approved_at
                        ? 'Both confirmed — reconciling...'
                        : 'Accepted. Waiting for host confirmation.')
                    : (mp.org_approved_at
                        ? 'Host confirmed. Accept to confirm.'
                        : 'Waiting for your acceptance and host confirmation.')}
                </span>
              )}
              {isNominated && (
                <span>
                  {hasUserAccepted
                    ? (mp.org_approved_at
                        ? 'Both confirmed — reconciling...'
                        : 'You accepted. Waiting for host confirmation.')
                    : (mp.org_approved_at
                        ? 'Host confirmed. Accept to confirm.'
                        : 'You were nominated. Accept and wait for host confirmation.')}
                </span>
              )}
            </>
          )}
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  // ── §4.4 Confirmed participant ────────────────────────────────────────────
  if (isWaitingList) {
    return (
      <div>
        <p style={{ color: '#b45309', fontSize: '0.92rem', margin: '0 0 0.35rem' }}>
          You&apos;re on the waiting list.
        </p>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
          You&apos;re fully confirmed and will be notified if a spot opens up.
        </p>
      </div>
    )
  }

  if (isConfirmedDerived) {
    return null
  }

  return null
}
