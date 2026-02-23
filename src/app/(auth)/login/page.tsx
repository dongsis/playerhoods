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
            <input
              data-testid="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={inputStyle}
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
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              style={inputStyle}
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  border: '1px solid #ccc',
  borderRadius: '4px',
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
