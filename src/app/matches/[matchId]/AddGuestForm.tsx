'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createRosterGuest } from '@/lib/api/roster'
import { nominateGuest } from '@/lib/api/matches'
import { processDeliveriesAction } from './process-deliveries-action'

interface Props {
  matchId: string
}

/**
 * Create a Contact Player and immediately direct-invite them to a match.
 * Uses roster creation + rpc_match_nominate_guest.
 */
export function AddGuestForm({ matchId }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
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

    const emailVal = email.trim() || null
    const phoneVal = phone.trim() || null
    if (!emailVal && !phoneVal) {
      setError('Please enter either email or phone number.')
      setLoading(false)
      return
    }

    try {
      const supabase = createSupabaseBrowserClient()
      // 1) Create Contact Player in caller's roster
      const guest = await createRosterGuest(supabase, {
        display_name: displayName,
        email: emailVal,
        phone: phoneVal,
        notes: guestNotes || null,
      })
      // 2) Direct-invite that Contact Player into this match
      await nominateGuest(supabase, matchId, guest.id)
      await processDeliveriesAction()
      setSuccess(true)
      setDisplayName('')
      setEmail('')
      setPhone('')
      setGuestNotes('')
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to create contact player')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="Player name *"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: '0.5rem', boxSizing: 'border-box' }}
        />
        <input
          type="tel"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ flex: 1, padding: '0.5rem', boxSizing: 'border-box' }}
        />
      </div>
      <p style={{ fontSize: '0.75rem', color: '#666', margin: '-0.25rem 0 0.5rem' }}>
        Email or phone required. <strong>Email needed for match notifications.</strong>
      </p>
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={guestNotes}
          onChange={(e) => setGuestNotes(e.target.value)}
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      <button type="submit" disabled={loading || (!email.trim() && !phone.trim())}>
        {loading ? 'Creating...' : 'Create & Direct Invite'}
      </button>
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginTop: '0.5rem' }}>Contact Player created and invited.</p>}
    </form>
  )
}
