'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { addMemberToGroup, type GroupAddMemberResult } from '@/lib/api/groups'

interface Props {
  groupId: string
  invitableUsers: { id: string; display_name: string }[]
}

export function InviteUserForm({ groupId, invitableUsers }: Props) {
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'info'; message: string } | null>(null)
  const router = useRouter()

  const getFeedback = (result: GroupAddMemberResult): { tone: 'success' | 'info'; message: string } | null => {
    switch (result.result) {
      case 'direct_add_success':
        return { tone: 'success', message: 'Added to group.' }
      case 'approval_required_request_created':
        return null
      case 'already_member':
        return { tone: 'info', message: 'Already a member.' }
      case 'already_pending':
        return null
      case 'not_allowed':
      default:
        return { tone: 'info', message: result.message || 'Could not add this person to the group.' }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setError(null)
    setFeedback(null)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      const result = await addMemberToGroup(supabase, groupId, userId)
      setFeedback(getFeedback(result))
      setUserId('')
      router.refresh()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to add member')
    } finally {
      setLoading(false)
    }
  }

  if (invitableUsers.length === 0) {
    return (
      <p style={{ color: '#98a2b3', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
        Everyone is already a member or there are no other users on the platform.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <select
          value={userId}
          onChange={e => setUserId(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '0.7rem 0.8rem',
            minWidth: '160px',
            fontSize: '0.88rem',
            borderRadius: '12px',
            border: '1px solid #d0d5dd',
            color: '#0f172a',
            background: '#fff',
          }}
        >
          <option value="">Select a person</option>
          {invitableUsers.map(u => (
            <option key={u.id} value={u.id}>{u.display_name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !userId}
          style={{
            width: '100%',
            padding: '0.7rem 0.9rem',
            borderRadius: '12px',
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            fontSize: '0.88rem',
            fontWeight: 700,
            opacity: loading || !userId ? 0.55 : 1,
          }}
        >
          {loading ? 'Adding...' : 'Add Member'}
        </button>
      </div>
      {error   && <p style={{ color: '#b42318',   fontSize: '0.78rem', margin: '0.38rem 0 0' }}>{error}</p>}
      {feedback && (
        <p
          style={{
            color: feedback.tone === 'success' ? '#15803d' : '#475467',
            fontSize: '0.78rem',
            margin: '0.38rem 0 0',
          }}
        >
          {feedback.message}
        </p>
      )}
    </form>
  )
}
