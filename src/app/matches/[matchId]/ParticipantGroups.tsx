'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  orgApproveParticipant,
  manualConfirmParticipant,
  removeParticipant,
  inviteUserToMatch,
  delegateConfirmGuest,
  delegateConfirmParticipant,
} from '@/lib/api/matches'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
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
  myUserId: string | null
  /** v1.7: non-org can delegate confirm nominated user participants */
  canDelegateConfirmUserParticipants?: boolean
}

// Dual-confirmation status tags (organizer view, not shown for guests)
function ConfirmationTags({ p }: { p: MatchParticipantEnriched }) {
  if (p.status !== 'pending' || p.guest_id !== null) return null
  // 'requested' join_method: user accepted implicitly by requesting — treat as always accepted
  const userAccepted =
    p.join_method === 'requested'
      ? (p.participant_accepted_at ?? p.created_at)
      : p.participant_accepted_at
  return (
    <span style={{ fontSize: '0.72rem', marginLeft: '0.4rem' }}>
      <span style={{ color: userAccepted ? '#2d8a4e' : '#d97706' }}>
        User:{userAccepted ? '✓' : '⏳'}
      </span>
      {' '}
      <span style={{ color: p.org_approved_at ? '#2d8a4e' : '#d97706' }}>
        Org:{p.org_approved_at ? '✓' : '⏳'}
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
  adderName,
  viewerIsParticipant,
  canDelegateConfirmUserParticipants,
}: {
  p: MatchParticipantEnriched
  matchId: string
  matchStatus: MatchStatus
  isOrganizer: boolean
  isMe: boolean
  adderName?: string
  viewerIsParticipant: boolean
  canDelegateConfirmUserParticipants?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const isActive = matchStatus === 'active'

  const act = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Action failed')
      }
    })
  }

  const isGuest = p.guest_id !== null
  // Approve: organizer only, pending participant. For users, require they have accepted;
  // for guests, ORG may approve before or after delegate confirm.
  const participantAccepted =
    p.join_method === 'requested'
      ? (p.participant_accepted_at ?? p.created_at)
      : p.participant_accepted_at
  const canApprove =
    isOrganizer &&
    isActive &&
    p.status === 'pending' &&
    (isGuest || participantAccepted !== null) &&
    p.org_approved_at === null

  // Manual Confirm (users only): organizer only, any pending user participant
  // (invited/nominated not yet accepted, or request-joined needing re-confirm after match edit)
  const canManualConfirm =
    isOrganizer &&
    isActive &&
    p.status === 'pending' &&
    p.user_id !== null   // guests use delegate-confirm flow

  // Guest delegate confirm: any active participant (including organizer) can confirm a guest can come.
  const canConfirmGuest =
    isGuest &&
    isActive &&
    p.status === 'pending' &&
    viewerIsParticipant

  // v1.7: User delegate confirm: non-org can confirm invited or nominated user (participant_accepted_at null, share group enforced by RPC)
  const canDelegateConfirmUser =
    !isGuest &&
    p.user_id !== null &&
    isActive &&
    p.status === 'pending' &&
    (p.join_method === 'invited' || p.join_method === 'nominated') &&
    !p.participant_accepted_at &&
    canDelegateConfirmUserParticipants &&
    viewerIsParticipant

  // Remove: organizer only (v1.5: participants cannot remove anyone)
  const canRemove =
    isOrganizer && isActive && p.status !== 'removed'

  // Invite back a removed participant (organizer only; uses rpc_match_invite_user)
  const canInviteBack =
    isOrganizer && isActive && p.status === 'removed' && p.user_id !== null

  return (
    <div style={{ padding: '0.5rem 0', borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: isMe ? 700 : 500, fontSize: '0.9rem' }}>
            {p.display_name}
            {isMe && <span style={{ fontWeight: 400, color: '#888', fontSize: '0.75rem', marginLeft: '0.3rem' }}>(you)</span>}
          </span>

          {p.guest_id !== null ? (
            <span style={{ fontSize: '0.72rem', color: '#555', marginLeft: '0.4rem' }}>
              (Contact Player)
            </span>
          ) : (
            <>
              {p.join_method === 'invited' && (
                <span style={{ fontSize: '0.72rem', color: '#888', marginLeft: '0.4rem' }}>invited</span>
              )}
              {p.nominated_by && (
                <span style={{ fontSize: '0.72rem', color: '#888', marginLeft: '0.4rem' }}>nominated</span>
              )}
              <ConfirmationTags p={p} />
            </>
          )}

          {p.status === 'removed' && p.removal_note && (
            <span style={{ fontSize: '0.72rem', color: '#c00', marginLeft: '0.4rem' }}>
              — {p.removal_note}
            </span>
          )}

          <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: '0.1rem' }}>
            {p.join_method}
            {p.confirmed_at && ` · confirmed ${p.confirmed_at.slice(0, 10)}`}
            {p.removed_at && ` · removed ${p.removed_at.slice(0, 10)}`}
          </div>
        </div>

        {/* Organizer / participant action controls */}
        {(canApprove || canManualConfirm || canConfirmGuest || canDelegateConfirmUser || canRemove || canInviteBack) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
            {canApprove && (
              <button
                onClick={() => act(() => orgApproveParticipant(supabase, p.id))}
                disabled={isPending}
                style={{ background: '#2d8a4e', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Approve
              </button>
            )}

            {canManualConfirm && (
              <button
                onClick={() => act(() => manualConfirmParticipant(supabase, p.id))}
                disabled={isPending}
                style={{ background: '#6d28d9', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Manual Confirm
              </button>
            )}

            {canConfirmGuest && (
              <button
                onClick={() => act(() => delegateConfirmGuest(supabase, p.id))}
                disabled={isPending}
                style={{ background: '#2563eb', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Confirm can come
              </button>
            )}

            {canDelegateConfirmUser && (
              <button
                onClick={() => act(() => delegateConfirmParticipant(supabase, p.id))}
                disabled={isPending}
                style={{ background: '#2563eb', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Confirm can come
              </button>
            )}

            {canRemove && (
              <button
                onClick={() => act(() => removeParticipant(supabase, p.id))}
                disabled={isPending}
                style={{ background: '#c00', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Remove
              </button>
            )}

            {canInviteBack && (
              <button
                onClick={() => act(() => inviteUserToMatch(supabase, matchId, p.user_id!))}
                disabled={isPending}
                style={{ background: '#4a90d9', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Invite back
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p style={{ color: 'red', fontSize: '0.75rem', margin: '0.2rem 0 0' }}>{error}</p>}
    </div>
  )
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
      <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: badgeColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title} ({badge})
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
  myUserId,
  canDelegateConfirmUserParticipants,
}: Props) {
  // Build name map: user_id → display_name (for resolving guest adders)
  const nameMap = new Map(
    participants
      .filter(p => p.user_id !== null)
      .map(p => [p.user_id!, p.display_name])
  )

  const viewerIsParticipant = participants.some(
    p => p.user_id === myUserId && p.status !== 'removed'
  )

  // Confirmed participants (guests with status confirmed count too)
  const confirmed = participants.filter(p =>
    p.status === 'confirmed' || (p.join_method === 'guest_add' && p.status !== 'removed')
  )

  // Pending and removed — only present in props when isOrganizer (page.tsx filters for non-org)
  const pending = participants.filter(p => p.status === 'pending' && p.join_method !== 'guest_add')
  const removed = participants.filter(p => p.status === 'removed')

  const rowProps = (p: MatchParticipantEnriched) => ({
    p,
    matchId,
    matchStatus,
    isOrganizer,
    isMe: p.user_id === myUserId,
    adderName: p.join_method === 'guest_add' ? (nameMap.get(p.created_by ?? '') ?? undefined) : undefined,
    viewerIsParticipant,
    canDelegateConfirmUserParticipants,
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

      {/* Pending — organizer sees full list; non-org sees pending nominated users (for delegate confirm) or count only */}
      {isOrganizer ? (
        <Section title="Pending" badge={pending.length} badgeColor="#d97706">
          {pending.length === 0
            ? <p style={{ color: '#aaa', fontSize: '0.85rem' }}>None.</p>
            : pending.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)
        }
      </Section>
      ) : pending.length > 0 ? (
        <Section title="Pending" badge={pending.length} badgeColor="#d97706">
          {pending.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)}
        </Section>
      ) : (
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Pending ({pendingCount})
          </h4>
        </div>
      )}

      {/* Removed — organizer only (§3.3). Always expanded for clarity. */}
      {isOrganizer && (
        <Section title="Removed" badge={removed.length} badgeColor="#999">
          {removed.length === 0
            ? <p style={{ color: '#aaa', fontSize: '0.85rem' }}>None.</p>
            : removed.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)
          }
        </Section>
      )}
    </div>
  )
}
