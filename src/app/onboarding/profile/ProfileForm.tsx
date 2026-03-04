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
  // 初始化：如果已有值就回填
  const initialDisplayName = useMemo(
    () => (existing as any)?.display_name ?? '',
    [existing]
  )
  const initialFirstName = useMemo(
    () => (existing as any)?.first_name ?? '',
    [existing]
  )
  const initialLastName = useMemo(
    () => (existing as any)?.last_name ?? '',
    [existing]
  )

  const [displayName, setDisplayName] = useState<string>(initialDisplayName)
  const [firstName, setFirstName] = useState<string>(initialFirstName)
  const [lastName, setLastName] = useState<string>(initialLastName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    console.log('ProfileForm: Continue clicked')

    // 1. Validate display_name before any async work
    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Display name is required')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const supabase = createSupabaseBrowserClient()

      // 2. Create/init profile in DB (RPC)
      await initProfile(supabase, {
        display_name: trimmed,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      } as any)

      // 3. Navigate to "next" or dashboard (full load so middleware sees updated profile)
      const target = next || '/dashboard'
      console.log('ProfileForm: Profile saved, navigating to', target)
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
    // 关键：用 onSubmit 统一入口，回车也能提交；并 preventDefault
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
        style={{ width: '100%', padding: 10, marginBottom: 16 }}
      />

      <label style={{ display: 'block', marginBottom: 6 }}>First Name</label>
      <input
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        disabled={loading}
        style={{ width: '100%', padding: 10, marginBottom: 16 }}
        placeholder="Optional"
      />

      <label style={{ display: 'block', marginBottom: 6 }}>Last Name</label>
      <input
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        disabled={loading}
        style={{ width: '100%', padding: 10, marginBottom: 20 }}
        placeholder="Optional"
      />

      <button
        type="button"
        disabled={loading}
        onClick={() => void handleClick()}
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