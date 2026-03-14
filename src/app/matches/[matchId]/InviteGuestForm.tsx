'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { nominateGuest } from '@/lib/api/matches'
import { processDeliveriesAction } from './process-deliveries-action'

interface ContactTarget {
  guest_id: string
  display_name: string
  email: string | null
}

interface Props {
  matchId: string
  contactTargets: ContactTarget[]
}

/** Phase 3: Uses unified admission targets (contact_player rows from rpc_match_admission_targets). */
export function InviteGuestForm({ matchId, contactTargets }: Props) {
  const [guestId, setGuestId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guestId) return
    setError(null)
    setSuccess(false)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      await nominateGuest(supabase, matchId, guestId)
      await processDeliveriesAction()
      setSuccess(true)
      setGuestId('')
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to invite contact player')
    } finally {
      setLoading(false)
    }
  }

  if (contactTargets.length === 0) {
    return (
      <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
        No contact players in your favorites. Add some from the Contacts tab.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={guestId}
          onChange={e => setGuestId(e.target.value)}
          required
          style={{ padding: '0.4rem 0.5rem', flex: 1, minWidth: '160px', fontSize: '0.9rem' }}
        >
          <option value="">-- Select a Contact Player --</option>
          {contactTargets.map(r => (
            <option key={r.guest_id} value={r.guest_id}>
              {r.display_name}
              {(!r.email || !r.email.trim()) ? ' (no email — won\'t get notifications)' : ''}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading || !guestId} style={{ padding: '0.4rem 0.8rem', background: '#0e7490', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? 'Nominating...' : 'Nominate'}
        </button>
      </div>
      {error   && <p style={{ color: 'red',   fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Contact Player nominated!</p>}
    </form>
  )
}
