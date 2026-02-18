'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { inviteUserToMatch } from '@/lib/api/matches'

interface Props {
  matchId: string
}

/**
 * Invite a user to a match.
 * Calls RPC: rpc_match_invite_user
 * - Caller must be organizer OR confirmed with can_participants_invite_users
 */
export function InviteUserForm({ matchId }: Props) {
  const [userId, setUserId] = useState('')
  const [note, setNote] = useState('')
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
      await inviteUserToMatch(supabase, matchId, userId, note || undefined)
      setSuccess(true)
      setUserId('')
      setNote('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite user')
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
          {loading ? 'Inviting...' : 'Invite'}
        </button>
      </div>
      <input
        type="text"
        placeholder="Add a note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ padding: '0.4rem', marginTop: '0.5rem', width: '100%', boxSizing: 'border-box' as const }}
      />
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginTop: '0.5rem' }}>Invitation sent!</p>}
    </form>
  )
}
