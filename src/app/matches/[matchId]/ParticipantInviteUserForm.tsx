'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { inviteParticipantUserToMatch } from '@/lib/api/matches'
import type { ScopeUser } from '@/lib/api/matches'
import { processDeliveriesAction } from './process-deliveries-action'

interface Props {
  matchId: string
  scopeUsers: ScopeUser[]
}

export function ParticipantInviteUserForm({ matchId, scopeUsers }: Props) {
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId) return
    setError(null)
    setSuccess(false)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      await inviteParticipantUserToMatch(supabase, matchId, userId)
      await processDeliveriesAction()
      setSuccess(true)
      setUserId('')
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to invite person')
    } finally {
      setLoading(false)
    }
  }

  if (scopeUsers.length === 0) {
    return (
      <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
        No registered players available.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          required
          style={{ padding: '0.4rem 0.5rem', flex: 1, minWidth: '160px', fontSize: '0.9rem' }}
        >
          <option value="">Select a person</option>
          {scopeUsers.map((user) => (
            <option
              key={user.id}
              value={user.id}
              title={`${user.display_name}: ${user.sourceLabel}`}
            >
              {user.display_name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading || !userId} style={{ padding: '0.4rem 0.8rem' }}>
          {loading ? 'Inviting...' : 'Invite'}
        </button>
      </div>
      {error && <p style={{ color: 'red', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Person invited.</p>}
    </form>
  )
}
