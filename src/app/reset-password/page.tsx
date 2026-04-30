'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AUTH_SUBMIT_THROTTLE_MS,
  MIN_PASSWORD_LENGTH,
  mapAuthErrorToUiMessage,
} from '@/lib/auth-ui'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [canReset, setCanReset] = useState(false)
  const lastSubmitAtRef = useRef(0)
  const router = useRouter()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let active = true

    async function checkSession() {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active) return

      if (sessionError) {
        console.error('[auth:reset:session]', sessionError)
      }

      const hasSession = Boolean(data.session)
      setCanReset(hasSession)
      setInfo(
        hasSession
          ? null
          : 'Please open the password reset link from your email to set a new password.',
      )
      setReady(true)
    }

    void checkSession()

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setCanReset(Boolean(session))
      setInfo(session ? null : 'Please open the password reset link from your email to set a new password.')
      setReady(true)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  function guardAgainstRapidSubmit() {
    const now = Date.now()
    if (now - lastSubmitAtRef.current < AUTH_SUBMIT_THROTTLE_MS) {
      setError('Please wait a moment and try again.')
      return false
    }

    lastSubmitAtRef.current = now
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!canReset) {
      setError('Your reset link is missing or has expired. Please request a new one.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    if (!guardAgainstRapidSubmit()) return

    setLoading(true)
    const supabase = createSupabaseBrowserClient()

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        console.error('[auth:reset]', updateError)
        setError(mapAuthErrorToUiMessage('reset'))
        return
      }

      await supabase.auth.signOut()
      router.replace('/login?notice=password-updated')
      router.refresh()
    } catch (err) {
      console.error('[auth:reset]', err)
      setError(mapAuthErrorToUiMessage('reset'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ph-page-narrow">
      <section className="ph-card px-6 py-6">
        <div className="ph-kicker mb-2">Account Recovery</div>
        <h1 className="ph-title">Set new password</h1>
        <p className="ph-subtitle mb-6 mt-2">
          Choose a new password with at least {MIN_PASSWORD_LENGTH} characters.
        </p>

        <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8' }}>
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            disabled={!ready || !canReset || loading}
            autoComplete="new-password"
            className="ph-input"
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8' }}>
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            disabled={!ready || !canReset || loading}
            autoComplete="new-password"
            className="ph-input"
          />
        </div>

        {info && (
          <div style={{ color: '#166534', marginBottom: '1rem', border: '1px solid #bbf7d0', background: '#F0FDF4', borderRadius: '16px', padding: '0.75rem 0.9rem', fontSize: '0.84rem' }}>
            {info}
          </div>
        )}

        {error && (
          <div style={{ color: '#b91c1c', marginBottom: '1rem', border: '1px solid #fecaca', background: '#FEF2F2', borderRadius: '16px', padding: '0.75rem 0.9rem', fontSize: '0.84rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!ready || !canReset || loading}
          className="ph-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Updating...' : 'Update password'}
        </button>
        </form>
      </section>
    </div>
  )
}
