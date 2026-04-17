'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { leaveGroup } from '@/lib/api/groups'

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return

    setError(null)
    setLoading(true)

    const supabase = createSupabaseBrowserClient()

    try {
      await leaveGroup(supabase, groupId)
      router.push('/groups')
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleLeave}
        disabled={loading}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#b42318',
          padding: 0,
          fontSize: '0.84rem',
          fontWeight: 700,
        }}
      >
        {loading ? 'Leaving...' : 'Leave Group'}
      </button>
      {error && <span style={{ color: '#b42318', marginLeft: '0.5rem', fontSize: '0.78rem' }}>{error}</span>}
    </div>
  )
}
