'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { nominateUser } from '@/lib/api/matches'
import type { ScopeUser } from '@/lib/api/matches'

// v1.5: Nominate = participant-only flow.
// Shown only when: active participant (removed_at IS NULL) + not organizer
//                 + match.can_participants_invite_users = true.
// After nomination: nominee must Accept → organizer must Approve → confirmed.

interface Props {
  matchId: string
  scopeUsers: ScopeUser[]
}

export function NominateUserForm({ matchId, scopeUsers }: Props) {
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setError(null)
    setSuccess(false)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      await nominateUser(supabase, matchId, userId)
      setSuccess(true)
      setUserId('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to nominate')
    } finally {
      setLoading(false)
    }
  }

  if (scopeUsers.length === 0) {
    return (
      <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
        No eligible users in scope.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={userId}
          onChange={e => setUserId(e.target.value)}
          required
          style={{ padding: '0.4rem 0.5rem', flex: 1, minWidth: '160px', fontSize: '0.9rem' }}
        >
          <option value="">— Select a person —</option>
          {scopeUsers.map(u => (
            <option key={u.id} value={u.id}>{u.display_name}</option>
          ))}
        </select>
        <button type="submit" disabled={loading || !userId} style={{ padding: '0.4rem 0.8rem' }}>
          {loading ? 'Nominating…' : 'Nominate'}
        </button>
      </div>
      {error   && <p style={{ color: 'red',   fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Nominated! They must accept, then organizer approves to confirm.</p>}
    </form>
  )
}
