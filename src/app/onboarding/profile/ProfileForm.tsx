'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { initProfile } from '@/lib/api/identities'
import type { Profile } from '@/lib/types/database'

interface Props {
  userId: string
  existing: Profile | null
  next: string
}

export function ProfileForm({ userId: _userId, existing, next }: Props) {
  const [displayName, setDisplayName] = useState(existing?.display_name || '')
  const [firstName, setFirstName] = useState(existing?.first_name || '')
  const [lastName, setLastName] = useState(existing?.last_name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Display name is required')
      return
    }

    setError(null)
    setLoading(true)

    const supabase = createSupabaseBrowserClient()

    try {
      await initProfile(supabase, {
        display_name: trimmed,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      })
      router.push(next)
      router.refresh()
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message
      const details = (err as { details?: string })?.details
      const msg = message || details || 'Failed to save profile'
      console.error('Profile onboarding save failed', err)
      // already_initialized means the user skipped back — treat as success
      if (msg.includes('already_initialized')) {
        router.push(next)
        router.refresh()
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>
          Display Name *
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          placeholder="How others will see you"
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box', fontSize: '1rem' }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>First Name</label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Optional"
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>Last Name</label>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Optional"
          style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '0.75rem 2rem',
          fontSize: '1rem',
          background: '#333',
          color: 'white',
          border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Saving...' : 'Continue'}
      </button>

      {error && <p style={{ color: 'red', marginTop: '0.75rem' }}>{error}</p>}
    </form>
  )
}
