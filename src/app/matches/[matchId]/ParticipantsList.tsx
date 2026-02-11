'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  orgApproveParticipant,
  removeParticipant,
  inviteUserToMatch,
} from '@/lib/api/matches'
import type { MatchParticipantWithDetails, MatchStatus } from '@/lib/types/database'

interface Props {
  title: string
  matchId: string
  participants: MatchParticipantWithDetails[]
  canManage: boolean
  isOrganizer: boolean
  matchStatus: MatchStatus
  color: string
  showApproveButton?: boolean
}

export function ParticipantsList({
  title,
  matchId,
  participants,
  canManage,
  isOrganizer,
  matchStatus,
  color,
  showApproveButton,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleAction = async (participantId: string, action: () => Promise<void>) => {
    setError(null)
    setLoading(participantId)
    try {
      await action()
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message || 'Action failed')
    } finally {
      setLoading(null)
    }
  }

  const supabase = createSupabaseBrowserClient()
  const isActive = matchStatus === 'active'

  if (participants.length === 0 && title) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ color }}>{title} (0)</h4>
        <p style={{ color: '#666' }}>None</p>
      </div>
    )
  }

  const getDisplayName = (p: MatchParticipantWithDetails) => {
    if (p.guest) {
      return `${p.guest.display_name} (Guest)`
    }
    return p.profile?.display_name || p.user_id || 'Unknown'
  }

  // Use consistent date format to avoid hydration mismatch
  const formatDate = (dateStr: string) => {
    return dateStr.split('T')[0] // Returns YYYY-MM-DD
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {title && <h4 style={{ color }}>{title} ({participants.length})</h4>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {participants.map((p) => (
          <li
            key={p.id}
            style={{
              padding: '0.5rem',
              border: `1px solid ${color}`,
              marginBottom: '0.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: p.status === 'removed' ? 0.6 : 1,
            }}
          >
            <div>
              <strong>{getDisplayName(p)}</strong>
              {p.nominated_by && (
                <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: '0.5rem' }}>
                  (nominated)
                </span>
              )}
              <br />
              <small>
                {p.join_method}
                {/* v1.3: Dual confirmation status */}
                {p.status === 'pending' && (
                  <>
                    {p.user_accepted_at ? ' | User: accepted' : ' | User: waiting'}
                    {p.org_approved_at ? ' | ORG: approved' : ' | ORG: waiting'}
                  </>
                )}
                {p.confirmed_at && ` | Confirmed: ${formatDate(p.confirmed_at)}`}
                {p.status === 'removed' && p.removal_note && ` | ${p.removal_note}`}
                {p.removed_at && ` | ${formatDate(p.removed_at)}`}
              </small>
            </div>

            {isActive && (
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {/* v1.3: Approve button for pending participants (ORG only) */}
                {showApproveButton && isOrganizer && p.status === 'pending' && !p.org_approved_at && (
                  <button
                    onClick={() =>
                      handleAction(p.id, () => orgApproveParticipant(supabase, p.id))
                    }
                    disabled={loading === p.id}
                    style={{
                      background: 'green',
                      color: 'white',
                      border: 'none',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    {loading === p.id ? '...' : 'Approve'}
                  </button>
                )}
                {/* Remove button for pending/confirmed (canManage = ORG or MP with permission) */}
                {canManage && p.status !== 'removed' && (
                  <button
                    onClick={() =>
                      handleAction(p.id, () => removeParticipant(supabase, p.id))
                    }
                    disabled={loading === p.id}
                    style={{
                      background: 'red',
                      color: 'white',
                      border: 'none',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    {loading === p.id ? '...' : 'Remove'}
                  </button>
                )}
                {/* v1.3: For removed participants — ORG can re-invite any removed user */}
                {isOrganizer && p.status === 'removed' && p.user_id && (
                  <button
                    onClick={() =>
                      handleAction(p.id, () => inviteUserToMatch(supabase, matchId, p.user_id!))
                    }
                    disabled={loading === p.id}
                    style={{
                      background: '#4a90d9',
                      color: 'white',
                      border: 'none',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    {loading === p.id ? '...' : 'Invite'}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
