'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { addContactPlayerToGroup } from '@/lib/api/groups'

interface Props {
  groupId: string
  contacts: { guest_id: string; display_name: string }[]
}

export function AddContactPlayerForm({ groupId, contacts }: Props) {
  const [guestId, setGuestId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const normalizeError = (message?: string) => {
    if (message === 'not_authorized') return 'You need to be an active member of this Shared Group.'
    if (message === 'guest_not_accessible') return 'You can only add contact players you can already view.'
    return message ?? 'Failed to add contact'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guestId) return
    setError(null)
    setMessage(null)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      await addContactPlayerToGroup(supabase, groupId, guestId)
      setGuestId('')
      setMessage('Added to group.')
      router.refresh()
    } catch (err: unknown) {
      setError(normalizeError((err as { message?: string })?.message))
    } finally {
      setLoading(false)
    }
  }

  if (contacts.length === 0) {
    return (
      <p style={{ color: '#98a2b3', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
        No contact players available.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <select
          value={guestId}
          onChange={(e) => setGuestId(e.target.value)}
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
          <option value="">Select a contact</option>
          {contacts.map((contact) => (
            <option key={contact.guest_id} value={contact.guest_id}>{contact.display_name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !guestId}
          style={{
            width: '100%',
            padding: '0.7rem 0.9rem',
            borderRadius: '12px',
            border: '1px solid #d0d5dd',
            background: '#fff',
            color: '#0f172a',
            fontSize: '0.88rem',
            fontWeight: 700,
            opacity: loading || !guestId ? 0.55 : 1,
          }}
        >
          {loading ? 'Adding...' : 'Add Contact'}
        </button>
      </div>
      {error && <p style={{ color: '#b42318', fontSize: '0.78rem', margin: '0.38rem 0 0' }}>{error}</p>}
      {message && <p style={{ color: '#15803d', fontSize: '0.78rem', margin: '0.38rem 0 0' }}>{message}</p>}
    </form>
  )
}
