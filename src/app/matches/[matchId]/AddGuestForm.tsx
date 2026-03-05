'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createRosterGuest } from '@/lib/api/roster'
import { nominateGuest } from '@/lib/api/matches'

interface Props {
  matchId: string
}

/**
 * Add a nonregistered player to a match.
 * v1.7: Uses rpc_match_nominate_guest (create roster guest + nominate).
 *       Old rpc_match_add_guest_org / add_guest_participant / invite_guest_from_roster are deprecated.
 */
export function AddGuestForm({ matchId }: Props) {
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

    try {
      const supabase = createSupabaseBrowserClient()
      // 1) Create Contact Player in caller's roster
      const guest = await createRosterGuest(supabase, {
        display_name: displayName,
        notes: guestNotes || null,
      })
      // 2) Nominate that Contact Player into this match
      await nominateGuest(supabase, matchId, guest.id)
      setSuccess(true)
      setDisplayName('')
      setGuestNotes('')
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to add player')
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
        {loading ? 'Creating...' : 'Create & Nominate'}
      </button>
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginTop: '0.5rem' }}>Player added!</p>}
    </form>
  )
}
