'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { inviteContactPersonToMatch, type ContactPersonAdmissionTarget } from '@/lib/api/matches'
import { processDeliveriesAction } from './process-deliveries-action'

interface Props {
  matchId: string
  contactTargets: ContactPersonAdmissionTarget[]
}

/** P4: Uses person-level Contact Player targets. */
export function InviteGuestForm({ matchId, contactTargets }: Props) {
  const [personId, setPersonId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!personId) return
    setError(null)
    setSuccess(false)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      await inviteContactPersonToMatch(supabase, matchId, personId)
      await processDeliveriesAction()
      setSuccess(true)
      setPersonId('')
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to invite contact')
    } finally {
      setLoading(false)
    }
  }

  if (contactTargets.length === 0) {
    return (
      <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
        No contact people available.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={personId}
          onChange={e => setPersonId(e.target.value)}
          required
          style={{ padding: '0.4rem 0.5rem', flex: 1, minWidth: '160px', fontSize: '0.9rem' }}
        >
          <option value="">Select a contact person</option>
          {contactTargets.filter((target) => target.can_invite).map((target) => (
          <option key={target.person_id} value={target.person_id}>
              {`${target.display_name}${target.sourceLabel ? ` - ${target.sourceLabel}` : ''}`}
          </option>
          ))}
        </select>
        <button type="submit" disabled={loading || !personId} style={{ padding: '0.4rem 0.8rem', background: '#0e7490', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? 'Inviting...' : 'Invite'}
        </button>
      </div>
      {error   && <p style={{ color: 'red',   fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Contact invited.</p>}
    </form>
  )
}
