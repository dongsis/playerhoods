'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { acceptGroupInvite } from '@/lib/api/groups'

interface Props {
  groupId: string
}

/**
 * Accept a pending group invite.
 * Calls RPC: rpc_group_accept_invite
 * - Transitions membership status: pending -> active
 */
export function AcceptInviteButton({ groupId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleAccept = async () => {
    setError(null)
    setLoading(true)

    const supabase = createSupabaseBrowserClient()

    try {
      await acceptGroupInvite(supabase, groupId)
      router.refresh()
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || String(err)
      console.error('AcceptInvite error:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleAccept} disabled={loading} style={{ marginRight: '0.5rem' }}>
        {loading ? 'Accepting...' : 'Accept Invite'}
      </button>
      {error && <span style={{ color: 'red' }}>{error}</span>}
    </div>
  )
}
