'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  orgApproveParticipant,
  removeParticipant,
  inviteUserToMatch,
} from '@/lib/api/matches'
import type { MatchParticipantWithDetails, MatchParticipantActionWithProfile, MatchStatus } from '@/lib/types/database'

interface Props {
  title: string
  matchId: string
  participants: MatchParticipantWithDetails[]
  canManage: boolean
  isOrganizer: boolean
  matchStatus: MatchStatus
  color: string
  showApproveButton?: boolean
  actionsRecord?: Record<string, MatchParticipantActionWithProfile[]>
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
  actionsRecord,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({})
  const router = useRouter()

  const handleAction = async (participantId: string, action: () => Promise<void>) => {
    setError(null)
    setLoading(participantId)
    try {
      await action()
      setNoteInputs(prev => ({ ...prev, [participantId]: '' }))
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message || 'Action failed')
    } finally {
      setLoading(null)
    }
  }

  const getNote = (id: string) => noteInputs[id] || undefined

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

  const formatDate = (dateStr: string) => {
    return dateStr.split('T')[0]
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {title && <h4 style={{ color }}>{title} ({participants.length})</h4>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {participants.map((p) => {
          const actions = actionsRecord?.[p.id] || []
          return (
            <li
              key={p.id}
              style={{
                padding: '0.5rem',
                border: `1px solid ${color}`,
                marginBottom: '0.25rem',
                opacity: p.status === 'removed' ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    {/* Note input for ORG actions */}
                    {(isOrganizer || canManage) && p.status !== 'removed' && (
                      <input
                        type="text"
                        placeholder="Note"
                        value={noteInputs[p.id] || ''}
                        onChange={(e) => setNoteInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem', width: '120px' }}
                      />
                    )}
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
                    {/* Re-invite removed user (with note) */}
                    {isOrganizer && p.status === 'removed' && p.user_id && (
                      <>
                        <input
                          type="text"
                          placeholder="Note"
                          value={noteInputs[p.id] || ''}
                          onChange={(e) => setNoteInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem', width: '120px' }}
                        />
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
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Action history */}
              {actions.length > 0 && (
                <details style={{ marginTop: '0.25rem' }}>
                  <summary style={{ fontSize: '0.75rem', cursor: 'pointer', color: '#888' }}>
                    History ({actions.length})
                  </summary>
                  <ul style={{ fontSize: '0.75rem', color: '#666', paddingLeft: '1rem', margin: '0.25rem 0' }}>
                    {actions.map(action => (
                      <li key={action.id}>
                        <strong>{action.action_type}</strong>
                        {' by '}{action.profile?.display_name || action.created_by.slice(0, 8)}
                        {' · '}{formatDate(action.created_at)}
                        {action.note && <em> — &quot;{action.note}&quot;</em>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
