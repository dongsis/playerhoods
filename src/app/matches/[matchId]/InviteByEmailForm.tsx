'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createMatchEmailInvitationAndSend } from './invite-actions'

interface Props {
  matchId: string
}

export function InviteByEmailForm({ matchId }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setSuccess(false)
    setLoading(true)
    try {
      await createMatchEmailInvitationAndSend({
        matchId,
        targetEmail: email.trim(),
        targetName: name.trim() || null,
      })
      setSuccess(true)
      setEmail('')
      setName('')
      router.refresh()
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Failed to send invitation'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={{ padding: '0.4rem 0.5rem', minWidth: 200, fontSize: '0.9rem' }}
        />
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name (optional)"
          style={{ padding: '0.4rem 0.5rem', minWidth: 200, fontSize: '0.9rem' }}
        />
        <button type="submit" disabled={loading || !email.trim()} style={{ padding: '0.4rem 0.8rem' }}>
          {loading ? 'Sending…' : 'Invite by email'}
        </button>
      </div>
      {error && <p style={{ color: 'red', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>Invitation sent!</p>}
    </form>
  )
}
