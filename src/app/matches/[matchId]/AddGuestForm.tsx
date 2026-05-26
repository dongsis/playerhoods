'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createRosterGuest } from '@/lib/api/roster'
import { inviteContactGuestToMatch } from '@/lib/api/matches'
import { processDeliveriesAction } from './process-deliveries-action'

interface Props {
  matchId: string
}

/**
 * Create a Contact Player and immediately invite them to a match.
 * Uses roster creation + the compatibility Contact Player invite RPC.
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
      setError('Email or phone required.')
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
      // 2) Invite that Contact Player into this match
      await inviteContactGuestToMatch(supabase, matchId, guest.id)
      setSuccess(true)
      setDisplayName('')
      setEmail('')
      setPhone('')
      setGuestNotes('')
      router.refresh()
      processDeliveriesAction().catch(() => {})
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to create contact player')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '0.25rem' }}>
          Name
        </label>
        <input
          type="text"
          placeholder="Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '0.25rem' }}>
            Email
          </label>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '0.25rem' }}>
            Phone
          </label>
          <input
            type="tel"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#666', margin: '-0.25rem 0 0.5rem' }}>
        Email or phone required.
      </p>
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '0.25rem' }}>
          Notes
        </label>
        <input
          type="text"
          placeholder="Notes"
          value={guestNotes}
          onChange={(e) => setGuestNotes(e.target.value)}
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      <button type="submit" disabled={loading || (!email.trim() && !phone.trim())}>
        {loading ? 'Creating...' : 'Create & add'}
      </button>
      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginTop: '0.5rem' }}>Contact added.</p>}
    </form>
  )
}
