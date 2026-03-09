'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { acceptInvitation } from '@/lib/invitations/accept-invitation'
import { declineInvitation } from '@/lib/invitations/decline-invitation'

interface Props {
  invitationId: string
  targetEmail: string
  callerEmailMatches: boolean
  isLoggedIn: boolean
}

export function InvitationActions({ invitationId, targetEmail, callerEmailMatches, isLoggedIn }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)
  const [acceptLoading, setAcceptLoading] = useState(false)
  const [declineLoading, setDeclineLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setMagicLinkError(null)
    const supabase = createSupabaseBrowserClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invitations/${invitationId}`)}`
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    })
    if (error) {
      setMagicLinkError(error.message)
      return
    }
    setMagicLinkSent(true)
  }

  async function handleAccept() {
    setActionError(null)
    setAcceptLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      await acceptInvitation(supabase, invitationId)
      router.refresh()
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Failed to accept'
      setActionError(msg)
    } finally {
      setAcceptLoading(false)
    }
  }

  async function handleDecline() {
    setActionError(null)
    setDeclineLoading(true)
    const supabase = createSupabaseBrowserClient()
    try {
      await declineInvitation(supabase, invitationId)
      router.refresh()
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Failed to decline'
      setActionError(msg)
    } finally {
      setDeclineLoading(false)
    }
  }

  if (!isLoggedIn) {
    return (
      <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: 8 }}>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#555' }}>
          Verify your email to accept or decline.
        </p>
        {magicLinkSent ? (
          <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>
            Check your inbox for a sign-in link. Click it to return here.
          </p>
        ) : (
          <form onSubmit={handleSendMagicLink}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter the email you were invited with"
              required
              style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
            />
            <button type="submit" style={{ padding: '0.4rem 0.8rem' }}>
              Send sign-in link
            </button>
            {magicLinkError && <p style={{ color: 'red', fontSize: '0.85rem', marginTop: '0.5rem' }}>{magicLinkError}</p>}
          </form>
        )}
      </div>
    )
  }

  if (!callerEmailMatches) {
    return (
      <div style={{ padding: '0.75rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8 }}>
        <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>
          The email you signed in with doesn&apos;t match this invitation. Sign out and sign in with {targetEmail} to respond.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleAccept}
          disabled={acceptLoading || declineLoading}
          style={{ padding: '0.5rem 1rem', background: '#0369a1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {acceptLoading ? 'Accepting…' : 'Accept'}
        </button>
        <button
          onClick={handleDecline}
          disabled={acceptLoading || declineLoading}
          style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {declineLoading ? 'Declining…' : 'Decline'}
        </button>
      </div>
      {actionError && <p style={{ color: 'red', fontSize: '0.85rem', margin: 0 }}>{actionError}</p>}
    </div>
  )
}
