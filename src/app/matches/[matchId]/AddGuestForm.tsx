'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { addGuestOrg, addGuestParticipant } from '@/lib/api/matches'

interface Props {
  matchId: string
  isOrganizer: boolean
}

/**
 * Add a nonregistered player to a match.
 * v1.3: Split into two RPCs based on caller role:
 * - ORG: rpc_match_add_guest_org (immediately confirmed)
 * - Participant: rpc_match_add_guest_participant (pending, needs ORG approval)
 */
export function AddGuestForm({ matchId, isOrganizer }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [guestNotes, setGuestNotes] = useState('')
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
      if (isOrganizer) {
        await addGuestOrg(supabase, matchId, displayName, guestNotes || undefined)
      } else {
        await addGuestParticipant(supabase, matchId, displayName, guestNotes || undefined)
      }
      setSuccess(true)
      setDisplayName('')
      setGuestNotes('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="Player name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={guestNotes}
          onChange={(e) => setGuestNotes(e.target.value)}
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Adding...' : 'Add Nonregistered Player'}
      </button>
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginTop: '0.5rem' }}>Player added!</p>}
    </form>
  )
}
