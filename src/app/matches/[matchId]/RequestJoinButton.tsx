'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { requestJoinMatch } from '@/lib/api/matches'

interface Props {
  matchId: string
}

export function RequestJoinButton({ matchId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleClick = async () => {
    setError(null)
    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      await requestJoinMatch(supabase, matchId)
      router.refresh()
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Request failed'
      console.error('RequestJoinButton error:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        data-testid="request-join"
        onClick={handleClick}
        disabled={loading}
        style={{ padding: '0.5rem 1rem' }}
      >
        {loading ? 'Requesting...' : 'Request to Join'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
