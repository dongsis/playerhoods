'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { delegateConfirmUser } from '@/lib/api/matches'
import type { ScopeUser } from '@/lib/api/matches'

interface Props {
  matchId: string
  scopeUsers: ScopeUser[]
}

export function DelegateConfirmUserForm({ matchId, scopeUsers }: Props) {
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
      await delegateConfirmUser(supabase, matchId, userId)
      setSuccess(true)
      setUserId('')
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to confirm user')
    } finally {
      setLoading(false)
    }
  }

  if (scopeUsers.length === 0) {
    return (
      <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
        No eligible users in your shared groups.
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
        <button type="submit" disabled={loading || !userId} style={{ padding: '0.4rem 0.8rem', background: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>
          {loading ? 'Confirming…' : 'Confirm for Them'}
        </button>
      </div>
      {error   && <p style={{ color: 'red',   fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Confirmed on their behalf. Waiting for organizer approval.</p>}
    </form>
  )
}
