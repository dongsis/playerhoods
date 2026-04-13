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
  source: string
  sourceLabel: string
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
  const selectedTarget = contactTargets.find((target) => target.guest_id === guestId) ?? null

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
        No Contact Players are available from your saved or trusted circles yet. Add one in Contacts, save one from a shared match, or save one from a group.
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
          {contactTargets.map((target) => (
            <option key={target.guest_id} value={target.guest_id}>
              {`${target.display_name}${target.sourceLabel ? ` - ${target.sourceLabel}` : ''}${(!target.email || !target.email.trim()) ? ' (no email - won\'t get notifications)' : ''}`}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading || !guestId} style={{ padding: '0.4rem 0.8rem', background: '#0e7490', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? 'Sending...' : 'Send direct invite'}
        </button>
      </div>
      {selectedTarget && (
        <p style={{ color: '#667085', fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
          Relationship source: {selectedTarget.sourceLabel}
        </p>
      )}
      {error   && <p style={{ color: 'red',   fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Direct invite sent to Contact Player.</p>}
    </form>
  )
}
