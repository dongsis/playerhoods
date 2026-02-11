'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { nominateUser } from '@/lib/api/matches'

interface Props {
  matchId: string
}

/**
 * Nominate a user to join a match.
 * v1.3: Calls rpc_match_nominate_user
 * - NOT restricted by scope (unlike request join)
 * - Creates pending participant with nominated_by set
 * - Requires both user accept + ORG approve to become confirmed
 */
export function NominateUserForm({ matchId }: Props) {
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      setError(err instanceof Error ? err.message : 'Failed to nominate user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        <input
          type="text"
          placeholder="User ID (UUID)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          required
          style={{ padding: '0.5rem', flex: 1 }}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Nominating...' : 'Nominate'}
        </button>
      </div>
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginTop: '0.5rem' }}>Nomination sent! Needs user acceptance and organizer approval.</p>}
    </form>
  )
}
