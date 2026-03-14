'use client'

import { useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { initProfile } from '@/lib/api/identities'
import type { Profile } from '@/lib/types/database'

interface Props {
  userId: string
  existing: Profile | null
  next: string
}

export function ProfileForm({ userId, existing, next }: Props) {
  const initialDisplayName = useMemo(
    () => (existing as any)?.display_name ?? '',
    [existing]
  )

  const [displayName, setDisplayName] = useState<string>(initialDisplayName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Display name is required')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const supabase = createSupabaseBrowserClient()
      await initProfile(supabase, { display_name: trimmed })

      const target = next || '/dashboard'
      window.location.href = target
    } catch (e: unknown) {
      const msg =
        (e as any)?.message ??
        (e as any)?.details ??
        (e as any)?.hint ??
        (e as any)?.error_description ??
        (e instanceof Error ? e.message : 'Failed to save profile')
      const displayMsg = typeof msg === 'string' ? msg : 'Failed to save profile'
      console.error('ProfileForm: Save failed', e)
      setError(displayMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleClick()
      }}
      style={{ maxWidth: 520 }}
    >
      <label style={{ display: 'block', marginBottom: 6 }}>
        Display Name <span style={{ color: 'crimson' }}>*</span>
      </label>
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={loading}
        placeholder="How other players see you"
        style={{ width: '100%', padding: 10, marginBottom: 20 }}
      />

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

      {error && (
        <p style={{ color: 'red', marginTop: '0.75rem' }}>{error}</p>
      )}
    </form>
  )
}