'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { inviteUserToGroup } from '@/lib/api/groups'

interface Props {
  groupId: string
}

export function InviteUserForm({ groupId }: Props) {
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
      await inviteUserToGroup(supabase, groupId, userId)
      setSuccess(true)
      setUserId('')
      router.refresh()
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || String(err)
      console.error('InviteUser error:', err)
      setError(message)
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
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginTop: '0.5rem' }}>Invitation sent!</p>}
    </form>
  )
}
