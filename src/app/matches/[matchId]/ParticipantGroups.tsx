'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  orgApproveParticipant,
  removeParticipant,
  reactivateParticipant,
  inviteUserToMatch,
} from '@/lib/api/matches'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import type { MatchStatus } from '@/lib/types/database'

interface Props {
  matchId: string
  matchStatus: MatchStatus
  participants: MatchParticipantEnriched[]
  isOrganizer: boolean
  canManage: boolean
  myUserId: string | null
}

// Dual-confirmation status tags
function ConfirmationTags({ p }: { p: MatchParticipantEnriched }) {
  if (p.status !== 'pending') return null
  return (
    <span style={{ fontSize: '0.72rem', marginLeft: '0.4rem' }}>
      <span style={{ color: p.user_accepted_at ? '#2d8a4e' : '#d97706' }}>
        User:{p.user_accepted_at ? '✓' : '⏳'}
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
  canManage,
  isMe,
}: {
  p: MatchParticipantEnriched
  matchId: string
  matchStatus: MatchStatus
  isOrganizer: boolean
  canManage: boolean
  isMe: boolean
}) {
  const [note, setNote] = useState('')
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
        setNote('')
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Action failed')
      }
    })
  }

  const canApprove =
    isOrganizer &&
    isActive &&
    p.status === 'pending' &&
    p.user_accepted_at !== null &&
    p.org_approved_at === null

  const canRemove =
    canManage && isActive && p.status !== 'removed'

  const canReactivate =
    isOrganizer && isActive && p.status === 'removed' && p.user_id !== null

  const canReinvite =
    isOrganizer && isActive && p.status === 'removed' && p.user_id !== null

  return (
    <div style={{ padding: '0.5rem 0', borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: isMe ? 700 : 500, fontSize: '0.9rem' }}>
            {p.display_name}
            {isMe && <span style={{ fontWeight: 400, color: '#888', fontSize: '0.75rem', marginLeft: '0.3rem' }}>(you)</span>}
          </span>

          {p.nominated_by && (
            <span style={{ fontSize: '0.72rem', color: '#888', marginLeft: '0.4rem' }}>nominated</span>
          )}

          <ConfirmationTags p={p} />

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

        {/* Org action controls */}
        {(canApprove || canRemove || canReactivate || canReinvite) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Note"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '100px', border: '1px solid #ddd', borderRadius: '3px' }}
            />

            {canApprove && (
              <button
                onClick={() => act(() => orgApproveParticipant(supabase, p.id, note || undefined))}
                disabled={isPending}
                style={{ background: '#2d8a4e', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Approve
              </button>
            )}

            {canRemove && (
              <button
                onClick={() => act(() => removeParticipant(supabase, p.id, note || undefined))}
                disabled={isPending}
                style={{ background: '#c00', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Remove
              </button>
            )}

            {canReactivate && (
              <button
                onClick={() => act(() => reactivateParticipant(supabase, p.id))}
                disabled={isPending}
                style={{ background: '#4a90d9', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Reactivate
              </button>
            )}

            {canReinvite && !canReactivate && (
              <button
                onClick={() => act(() => inviteUserToMatch(supabase, matchId, p.user_id!, note || undefined))}
                disabled={isPending}
                style={{ background: '#4a90d9', color: 'white', border: 'none', padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '3px', cursor: 'pointer' }}
              >
                Re-invite
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
  canManage,
  myUserId,
}: Props) {
  // Guests are folded into status sections, not shown separately
  const confirmed = participants.filter(p => p.status === 'confirmed')
  const pending   = participants.filter(p => p.status === 'pending')
  const removed   = participants.filter(p => p.status === 'removed')

  const rowProps = (p: MatchParticipantEnriched) => ({
    p,
    matchId,
    matchStatus,
    isOrganizer,
    canManage,
    isMe: p.user_id === myUserId,
  })

  return (
    <div>
      <Section title="Confirmed" badge={confirmed.length} badgeColor="#2d8a4e">
        {confirmed.length === 0
          ? <p style={{ color: '#aaa', fontSize: '0.85rem' }}>None yet.</p>
          : confirmed.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)
        }
      </Section>

      <Section title="Pending" badge={pending.length} badgeColor="#d97706">
        {pending.length === 0
          ? <p style={{ color: '#aaa', fontSize: '0.85rem' }}>None.</p>
          : pending.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)
        }
      </Section>

      <Section title="Removed" badge={removed.length} badgeColor="#999" defaultOpen={false}>
        {removed.length === 0
          ? <p style={{ color: '#aaa', fontSize: '0.85rem' }}>None.</p>
          : removed.map(p => <ParticipantRow key={p.id} {...rowProps(p)} />)
        }
      </Section>
    </div>
  )
}
