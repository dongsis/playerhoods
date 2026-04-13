'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Mode = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
    setPassword('')
    setConfirmPassword('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.replace('/dashboard')
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) { setError('两次密码不一致'); return }
    if (password.length < 6) { setError('密码至少需要 6 位'); return }
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    // If session exists immediately, redirect to onboarding; otherwise prompt email confirmation
    if (data.session) {
      router.replace('/onboarding/profile')
    } else {
      setInfo('注册成功！请查收确认邮件，点击链接后即可登录。')
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)
    if (error) { setError(error.message); return }
    setInfo('重置密码邮件已发送，请查收邮件并点击链接。')
  }

  const titles: Record<Mode, string> = {
    login: '登录',
    register: '注册',
    forgot: '找回密码',
  }

  return (
    <div style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Playerhoods</h1>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 500, color: '#444' }}>
        {titles[mode]}
      </h2>

      {/* ── Login ──────────────────────────────────────────────────────── */}
      {mode === 'login' && (
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>邮箱</label>
            <input
              data-testid="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>密码</label>
            <PasswordInput
              data-testid="login-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
            <button type="button" onClick={() => switchMode('forgot')} style={linkBtnStyle}>
              忘记密码？
            </button>
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          <button data-testid="login-submit" type="submit" disabled={loading} style={primaryBtnStyle}>
            {loading ? '登录中…' : '登录'}
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555', textAlign: 'center' }}>
            没有账号？{' '}
            <button type="button" onClick={() => switchMode('register')} style={linkBtnStyle}>
              立即注册
            </button>
          </p>
        </form>
      )}

      {/* ── Register ───────────────────────────────────────────────────── */}
      {mode === 'register' && (
        <form onSubmit={handleRegister}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>密码（至少 6 位）</label>
            <PasswordInput
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>确认密码</label>
            <PasswordInput
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          {info  && <p style={infoStyle}>{info}</p>}
          {!info && (
            <button type="submit" disabled={loading} style={primaryBtnStyle}>
              {loading ? '注册中…' : '注册'}
            </button>
          )}
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555', textAlign: 'center' }}>
            已有账号？{' '}
            <button type="button" onClick={() => switchMode('login')} style={linkBtnStyle}>
              返回登录
            </button>
          </p>
        </form>
      )}

      {/* ── Forgot password ────────────────────────────────────────────── */}
      {mode === 'forgot' && (
        <form onSubmit={handleForgot}>
          <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '1rem' }}>
            输入注册邮箱，我们将发送密码重置链接。
          </p>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          {info  && <p style={infoStyle}>{info}</p>}
          {!info && (
            <button type="submit" disabled={loading} style={primaryBtnStyle}>
              {loading ? '发送中…' : '发送重置邮件'}
            </button>
          )}
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555', textAlign: 'center' }}>
            <button type="button" onClick={() => switchMode('login')} style={linkBtnStyle}>
              ← 返回登录
            </button>
          </p>
        </form>
      )}
    </div>
  )
}

type PasswordInputProps = {
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  autoComplete?: string
  required?: boolean
  minLength?: number
  'data-testid'?: string
}

function PasswordInput(props: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div style={passwordFieldStyle}>
      <input
        {...props}
        type={isVisible ? 'text' : 'password'}
        style={passwordInputStyle}
      />
      <button
        type="button"
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        title={isVisible ? 'Hide password' : 'Show password'}
        onClick={() => setIsVisible(current => !current)}
        style={passwordToggleStyle}
      >
        <EyeIcon isVisible={isVisible} />
      </button>
    </div>
  )
}

function EyeIcon({ isVisible }: { isVisible: boolean }) {
  if (isVisible) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M10.58 10.58A2 2 0 0013.42 13.42"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M9.88 5.09A10.94 10.94 0 0112 4.91c5 0 9.27 3.11 11 7.09a12.37 12.37 0 01-4.14 5.1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.61 6.61A12.28 12.28 0 001 12c1.16 2.67 3.58 4.93 6.61 6.1A11.4 11.4 0 0012 19.09c1.31 0 2.58-.22 3.77-.62"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12C2.73 8.02 7 4.91 12 4.91S21.27 8.02 23 12c-1.73 3.98-6 7.09-11 7.09S2.73 15.98 1 12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  border: '1px solid #ccc',
  borderRadius: '4px',
}

const passwordFieldStyle: React.CSSProperties = {
  position: 'relative',
}

const passwordInputStyle: React.CSSProperties = {
  ...inputStyle,
  paddingRight: '2.75rem',
}

const passwordToggleStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: '0.55rem',
  transform: 'translateY(-50%)',
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: '#666',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem',
  fontSize: '0.95rem',
  cursor: 'pointer',
  background: '#1a1a1a',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#0070f3',
  cursor: 'pointer',
  fontSize: 'inherit',
  textDecoration: 'underline',
}

const errorStyle: React.CSSProperties = {
  color: 'red',
  fontSize: '0.85rem',
  marginBottom: '0.75rem',
}

const infoStyle: React.CSSProperties = {
  color: '#2d8a4e',
  fontSize: '0.85rem',
  marginBottom: '0.75rem',
  padding: '0.6rem 0.8rem',
  background: '#f0faf4',
  borderRadius: '4px',
  border: '1px solid #b7e4c7',
}
