'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { addContactPlayerToGroup, addMemberToGroup, type GroupAddMemberResult } from '@/lib/api/groups'

type Props = {
  groupId: string
  invitableUsers: { id: string; display_name: string }[]
  contacts: { guest_id: string; display_name: string }[]
}

export function AddGroupMemberPanel({ groupId, invitableUsers, contacts }: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'player' | 'contact'>('player')
  const [userId, setUserId] = useState('')
  const [guestId, setGuestId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const normalizeInviteFeedback = (result: GroupAddMemberResult) => {
    switch (result.result) {
      case 'direct_add_success':
        return 'Added to group.'
      case 'approval_required_request_created':
        return 'Request sent.'
      case 'already_member':
        return 'Already a member.'
      case 'already_pending':
        return 'Already pending.'
      case 'not_allowed':
      default:
        return result.message || 'Could not add this player.'
    }
  }

  const normalizeContactError = (message?: string) => {
    if (message === 'not_authorized') return 'You need to be an active member of this Shared Group.'
    if (message === 'guest_not_accessible') return 'You can only add contact players you can already view.'
    return message ?? 'Failed to add contact.'
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (mode === 'player' && !userId) return
    if (mode === 'contact' && !guestId) return

    setLoading(true)
    setError(null)
    setFeedback(null)
    const supabase = createSupabaseBrowserClient()

    try {
      if (mode === 'player') {
        const result = await addMemberToGroup(supabase, groupId, userId)
        setFeedback(normalizeInviteFeedback(result))
        setUserId('')
      } else {
        await addContactPlayerToGroup(supabase, groupId, guestId)
        setFeedback('Added to group.')
        setGuestId('')
      }
      router.refresh()
    } catch (submitError) {
      setError(
        mode === 'contact'
          ? normalizeContactError((submitError as { message?: string })?.message)
          : ((submitError as { message?: string })?.message ?? 'Failed to add member.')
      )
    } finally {
      setLoading(false)
    }
  }

  const nothingToAdd = invitableUsers.length === 0 && contacts.length === 0

  return (
    <section
      style={{
        borderRadius: '18px',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        padding: '0.8rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          width: '100%',
          borderRadius: '14px',
          background: '#1e293b',
          color: '#fff',
          border: 'none',
          padding: '0.9rem 1rem',
          fontSize: '0.98rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span>
        Add member
      </button>

      {isOpen ? (
        nothingToAdd ? (
          <div style={{ color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.5 }}>
            No more players or contacts available to add right now.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.65rem' }}>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <button
                type="button"
                onClick={() => {
                  setMode('player')
                  setError(null)
                  setFeedback(null)
                }}
                style={{
                  flex: 1,
                  borderRadius: '999px',
                  border: mode === 'player' ? '1px solid #c7d2fe' : '1px solid #dbe4ee',
                  background: mode === 'player' ? '#eef2ff' : '#fff',
                  color: mode === 'player' ? '#4338ca' : '#475569',
                  padding: '0.42rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Registered player
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('contact')
                  setError(null)
                  setFeedback(null)
                }}
                style={{
                  flex: 1,
                  borderRadius: '999px',
                  border: mode === 'contact' ? '1px solid #c7d2fe' : '1px solid #dbe4ee',
                  background: mode === 'contact' ? '#eef2ff' : '#fff',
                  color: mode === 'contact' ? '#4338ca' : '#475569',
                  padding: '0.42rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Contact
              </button>
            </div>

            {mode === 'player' ? (
              <select
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.72rem 0.8rem',
                  fontSize: '0.88rem',
                  borderRadius: '12px',
                  border: '1px solid #d0d5dd',
                  color: '#0f172a',
                  background: '#fff',
                }}
              >
                <option value="">Select a player</option>
                {invitableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.display_name}</option>
                ))}
              </select>
            ) : (
              <select
                value={guestId}
                onChange={(event) => setGuestId(event.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.72rem 0.8rem',
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
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'player' ? !userId : !guestId)}
              style={{
                width: '100%',
                padding: '0.72rem 0.9rem',
                borderRadius: '12px',
                border: 'none',
                background: '#0f172a',
                color: '#fff',
                fontSize: '0.86rem',
                fontWeight: 700,
                opacity: loading || (mode === 'player' ? !userId : !guestId) ? 0.55 : 1,
                cursor: 'pointer',
              }}
            >
              {loading ? 'Adding...' : 'Confirm'}
            </button>

            {error ? <p style={{ color: '#b42318', fontSize: '0.78rem', margin: 0 }}>{error}</p> : null}
            {feedback ? <p style={{ color: '#15803d', fontSize: '0.78rem', margin: 0 }}>{feedback}</p> : null}
          </form>
        )
      ) : null}
    </section>
  )
}
