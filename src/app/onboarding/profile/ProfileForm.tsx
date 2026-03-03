'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { initProfile } from '@/lib/api/identities'
import type { Profile } from '@/lib/types/database'

interface Props {
  userId: string
  existing: Profile | null
  next: string
}

export function ProfileForm({ userId, existing, next }: Props) {
  const router = useRouter()

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
    console.log('clicked') // 你用它来确认：handler 真的被触发了

    // 先做同步校验（不要先 setLoading(true)）
    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Display name is required')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const supabase = createSupabaseBrowserClient()

      // 写库（成功后 middleware 才不会拦回 onboarding）
      await initProfile(supabase, {
        // 如果你的 initProfile 需要 userId，就把它加进去：
        // user_id: userId,
        display_name: trimmed,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      } as any)

      // 写库成功 → 真正跳转
      router.replace(next)
    } catch (e: unknown) {
      // 把错误信息尽量“可读化”显示出来
      const msg =
        (e as any)?.message ||
        (e as any)?.details ||
        (e as any)?.error_description ||
        'Failed to save profile'
      console.error('initProfile failed:', e)
      setError(String(msg))
      // 不要在这里强制 push('/dashboard')，否则会被 middleware 拦回
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

      {/* 用 submit：onSubmit 会走 handleClick；避免 button type/button 的混乱 */}
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