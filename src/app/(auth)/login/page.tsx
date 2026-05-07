'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AUTH_SUBMIT_THROTTLE_MS,
  MIN_PASSWORD_LENGTH,
  getConfiguredSiteOrigin,
  mapAuthErrorToUiMessage,
  sanitizeNextPath,
  shouldUseCanonicalLocalAuthHost,
} from '@/lib/auth-ui'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Mode = 'login' | 'register' | 'forgot'
type NoticeKey = 'password-updated' | 'reset-link-invalid' | 'email-verified' | null

export default function LoginPage() {
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [authSettling, setAuthSettling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const lastSubmitAtRef = useRef<Record<Mode, number>>({
    login: 0,
    register: 0,
    forgot: 0,
  })
  const redirectingRef = useRef(false)

  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next'), '/dashboard'),
    [searchParams],
  )
  const oauthCode = searchParams.get('code')
  const oauthAccessToken = searchParams.get('access_token')
  const canonicalSiteOrigin = getConfiguredSiteOrigin()
  const currentHost =
    typeof window === 'undefined' ? null : window.location.hostname
  const shouldRouteGoogleThroughCanonicalHost = shouldUseCanonicalLocalAuthHost(currentHost)

  function redirectToNext() {
    if (redirectingRef.current) return
    redirectingRef.current = true
    window.location.replace(nextPath)
  }

  useEffect(() => {
    const nextMode = searchParams.get('mode')
    const notice = (searchParams.get('notice') as NoticeKey) ?? null

    if (nextMode === 'login' || nextMode === 'register' || nextMode === 'forgot') {
      setMode(nextMode)
    }

    if (notice === 'password-updated') {
      setMode('login')
      setError(null)
      setInfo('Your password has been updated. Please sign in.')
      return
    }

    if (notice === 'reset-link-invalid') {
      setMode('forgot')
      setInfo(null)
      setError('That reset link is invalid or has expired. Please request a new one.')
      return
    }

    if (notice === 'email-verified') {
      setMode('login')
      setError(null)
      setInfo('Email verified. Welcome to PlayerHoods.')
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    const supabase = createSupabaseBrowserClient()
    const shouldSettleOAuth = !!oauthCode || !!oauthAccessToken

    if (shouldSettleOAuth) {
      setAuthSettling(true)
      setError(null)
      setInfo('Finishing sign-in…')
    }

    async function settleOAuthSession() {
      if (oauthCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(oauthCode)
        if (cancelled) return
        if (exchangeError) {
          console.error('[auth:oauth:settle]', exchangeError)
          setError('Unable to finish Google sign in. Please try again.')
          setInfo(null)
          setAuthSettling(false)
          setLoading(false)
          return
        }
      }

      const { data } = await supabase.auth.getSession()
      if (!cancelled && data.session) {
        redirectToNext()
        return
      }

      if (!cancelled) {
        setAuthSettling(false)
        if (shouldSettleOAuth) {
          setInfo(null)
        }
      }
    }

    void settleOAuthSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || !session) return
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        redirectToNext()
      }
    })

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [nextPath, oauthAccessToken, oauthCode])

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
    setPassword('')
    setConfirmPassword('')
  }

  function normalizeEmail(value: string) {
    return value.trim().toLowerCase()
  }

  function guardAgainstRapidSubmit(target: Mode) {
    const now = Date.now()
    if (now - lastSubmitAtRef.current[target] < AUTH_SUBMIT_THROTTLE_MS) {
      setError('Please wait a moment and try again.')
      return false
    }

    lastSubmitAtRef.current[target] = now
    return true
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!guardAgainstRapidSubmit('login')) return

    setLoading(true)
    const supabase = createSupabaseBrowserClient()

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      })

      if (signInError) {
        console.error('[auth:login]', signInError)
        setError(mapAuthErrorToUiMessage('login'))
        return
      }

      window.location.assign(nextPath)
    } catch (err) {
      console.error('[auth:login]', err)
      setError(mapAuthErrorToUiMessage('login'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleAuth(targetMode: 'login' | 'register') {
    setError(null)
    setInfo(null)

    if (!guardAgainstRapidSubmit(targetMode)) return

    if (shouldRouteGoogleThroughCanonicalHost && canonicalSiteOrigin) {
      const canonicalLoginUrl = new URL('/login', canonicalSiteOrigin)
      canonicalLoginUrl.searchParams.set('next', nextPath)
      if (targetMode === 'register') {
        canonicalLoginUrl.searchParams.set('mode', 'register')
      }
      window.location.assign(canonicalLoginUrl.toString())
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowserClient()

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })

      if (oauthError) {
        console.error('[auth:google]', oauthError)
        setError('Unable to continue with Google right now. Please try again.')
        setLoading(false)
      }
    } catch (err) {
      console.error('[auth:google]', err)
      setError('Unable to continue with Google right now. Please try again.')
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    if (!guardAgainstRapidSubmit('register')) return

    setLoading(true)
    const supabase = createSupabaseBrowserClient()

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      })

      if (signUpError) {
        console.error('[auth:register]', signUpError)
        setError(mapAuthErrorToUiMessage('register'))
        return
      }

      if (data.session) {
        window.location.assign('/onboarding/profile')
        return
      }

      setInfo('We sent you a confirmation email. Please verify your email.')
    } catch (err) {
      console.error('[auth:register]', err)
      setError(mapAuthErrorToUiMessage('register'))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!guardAgainstRapidSubmit('forgot')) return

    setLoading(true)
    const supabase = createSupabaseBrowserClient()

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizeEmail(email),
        { redirectTo },
      )

      if (resetError) {
        console.error('[auth:forgot]', resetError)
      }

      setInfo('If that email is registered, we have sent a password reset link.')
    } catch (err) {
      console.error('[auth:forgot]', err)
      setError(mapAuthErrorToUiMessage('forgot'))
    } finally {
      setLoading(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Sign in',
    register: 'Create account',
    forgot: 'Reset password',
  }

  return (
    <div
      className="min-h-screen bg-[#EEF1F7] px-4 py-10"
      style={pageShellStyle}
    >
      <div className="ph-page-narrow" style={pageNarrowStyle}>
        <div className="mb-6 flex justify-center" style={logoWrapStyle}>
          <img
            src="/playerhoods-logo-transparent.png"
            alt="PlayerHoods"
            width={1122}
            height={1402}
            className="h-auto w-full max-w-[220px] object-contain"
            style={logoStyle}
          />
        </div>

        <section className="ph-card px-6 py-6" style={cardStyle}>
          <h1 className="ph-title" style={titleStyle}>{titles[mode]}</h1>
          <p className="ph-subtitle mb-6 mt-2" style={subtitleStyle}>
            {mode === 'login'
              ? 'Sign in to manage matches, groups, and player coordination.'
              : mode === 'register'
                ? 'Create your account and get your player profile ready.'
                : 'Enter your email and we will send a reset link if the account exists.'}
          </p>

        {authSettling ? (
          <div style={settlingWrapStyle}>
            <div style={settlingBadgeStyle}>Google sign-in</div>
            <h2 style={settlingTitleStyle}>Finishing sign-in…</h2>
            <p style={settlingBodyStyle}>
              We are finishing your Google session and taking you to your dashboard.
            </p>
            {error && <p style={errorStyle}>{error}</p>}
            {!error && info && <p style={infoStyle}>{info}</p>}
            <button
              type="button"
              onClick={() => window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`)}
              style={secondaryBtnStyle}
            >
              Back to sign in
            </button>
          </div>
        ) : mode === 'login' && (
          <form onSubmit={handleLogin}>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleAuth('login')}
            style={secondaryBtnStyle}
          >
            <GoogleIcon />
            <span>{loading ? 'Opening Google...' : 'Continue with Google'}</span>
          </button>
          <p style={oauthHintStyle}>
            {shouldRouteGoogleThroughCanonicalHost
              ? 'Google sign-in will reopen on localhost for local testing.'
              : 'For local Google sign-in, use localhost.'}
          </p>

          <div style={separatorStyle}>
            <span style={separatorLineStyle} />
            <span style={separatorTextStyle}>or</span>
            <span style={separatorLineStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Email</label>
            <input
              data-testid="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Password</label>
            <PasswordInput
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
            <button type="button" onClick={() => switchMode('forgot')} style={linkBtnStyle}>
              Forgot password?
            </button>
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          {info && <p style={infoStyle}>{info}</p>}
          <button data-testid="login-submit" type="submit" disabled={loading} style={primaryBtnStyle}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555', textAlign: 'center' }}>
            Need an account?{' '}
            <button type="button" onClick={() => switchMode('register')} style={linkBtnStyle}>
              Create one
            </button>
          </p>
          </form>
        )}

        {!authSettling && mode === 'register' && (
          <form onSubmit={handleRegister}>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleAuth('register')}
            style={{
              ...secondaryBtnStyle,
              opacity: loading ? 0.55 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <GoogleIcon />
            <span>{loading ? 'Opening Google...' : 'Continue with Google'}</span>
          </button>
          <p style={oauthHintStyle}>
            {shouldRouteGoogleThroughCanonicalHost
              ? 'Google sign-in will reopen on localhost for local testing.'
              : 'For local Google sign-in, use localhost.'}
          </p>

          <div style={separatorStyle}>
            <span style={separatorLineStyle} />
            <span style={separatorTextStyle}>or</span>
            <span style={separatorLineStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '0.35rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
              Password
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          <p style={helperTextStyle}>At least {MIN_PASSWORD_LENGTH} characters.</p>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
              Confirm password
            </label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          {info && <p style={infoStyle}>{info}</p>}
          {!info && (
            <button
              type="submit"
              disabled={loading}
              style={{
                ...primaryBtnStyle,
                opacity: loading ? 0.55 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          )}
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555', textAlign: 'center' }}>
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('login')} style={linkBtnStyle}>
              Back to sign in
            </button>
          </p>
          </form>
        )}

        {!authSettling && mode === 'forgot' && (
          <form onSubmit={handleForgot}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          {info && <p style={infoStyle}>{info}</p>}
          {!info && (
            <button type="submit" disabled={loading} style={primaryBtnStyle}>
              {loading ? 'Sending...' : 'Send reset email'}
            </button>
          )}
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555', textAlign: 'center' }}>
            <button type="button" onClick={() => switchMode('login')} style={linkBtnStyle}>
              Back to sign in
            </button>
          </p>
          </form>
        )}
        </section>
      </div>
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
        onClick={() => setIsVisible((current) => !current)}
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.5 0-.72-.06-1.41-.19-2.08H12z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.05-.91 6.73-2.48l-3.3-2.56c-.91.61-2.08.97-3.43.97-2.64 0-4.88-1.78-5.68-4.18l-3.42 2.64C4.57 19.71 8 22 12 22z" />
      <path fill="#4A90E2" d="M6.32 13.75A5.98 5.98 0 016 12c0-.61.11-1.2.32-1.75L2.9 7.61A9.95 9.95 0 002 12c0 1.6.38 3.12 1.05 4.39l3.27-2.64z" />
      <path fill="#FBBC05" d="M12 6.07c1.5 0 2.84.52 3.9 1.54l2.92-2.92C17.04 3.04 14.75 2 12 2 8 2 4.57 4.29 2.9 7.61l3.42 2.64C7.12 7.85 9.36 6.07 12 6.07z" />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.8rem 0.95rem',
  fontSize: '0.85rem',
  boxSizing: 'border-box',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  background: '#fff',
  color: '#1E293B',
}

const pageShellStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#EEF1F7',
  padding: '2.5rem 1rem',
}

const pageNarrowStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '760px',
  margin: '0 auto',
}

const logoWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '275px',
  marginBottom: '1.5rem',
}

const logoStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '220px',
  height: 'auto',
  display: 'block',
  aspectRatio: '1122 / 1402',
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #D9E3F2',
  borderRadius: '28px',
  boxShadow: '0 18px 42px rgba(30, 41, 59, 0.08)',
  padding: '1.5rem',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: '#0F172A',
  fontSize: '2rem',
  lineHeight: 1.05,
  fontWeight: 800,
  letterSpacing: '-0.03em',
}

const subtitleStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  marginBottom: '1.5rem',
  color: '#64748B',
  fontSize: '0.95rem',
  lineHeight: 1.45,
}

const settlingWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '0.85rem',
  padding: '1rem 0 0.5rem',
}

const settlingBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  padding: '0.4rem 0.8rem',
  background: '#E8F0FE',
  color: '#365DA8',
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const settlingTitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#0F172A',
  fontSize: '1.45rem',
  lineHeight: 1.1,
  fontWeight: 800,
}

const settlingBodyStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: '29rem',
  color: '#64748B',
  fontSize: '0.92rem',
  lineHeight: 1.55,
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
  color: '#94A3B8',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.85rem 1rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
  background: '#C25E46',
  color: '#fff',
  border: 'none',
  borderRadius: '999px',
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  boxShadow: '0 12px 28px rgba(194, 94, 70, 0.28)',
}

const secondaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.8rem 1rem',
  marginBottom: '1rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.7rem',
  fontSize: '0.84rem',
  cursor: 'pointer',
  background: '#fff',
  color: '#1E293B',
  border: '1px solid #E2E8F0',
  borderRadius: '999px',
  fontWeight: 700,
}

const oauthHintStyle: React.CSSProperties = {
  marginTop: '-0.35rem',
  marginBottom: '1rem',
  color: '#64748B',
  fontSize: '0.74rem',
  textAlign: 'center',
}

const separatorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  marginBottom: '1rem',
}

const separatorLineStyle: React.CSSProperties = {
  flex: 1,
  height: '1px',
  background: '#E2E8F0',
}

const separatorTextStyle: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '0.76rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#C25E46',
  cursor: 'pointer',
  fontSize: 'inherit',
  textDecoration: 'none',
  fontWeight: 700,
}

const helperTextStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: '0.9rem',
  color: '#64748B',
  fontSize: '0.76rem',
}

const inlineLegalLinkStyle: React.CSSProperties = {
  color: '#C25E46',
  fontWeight: 700,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
}

const errorStyle: React.CSSProperties = {
  color: '#b91c1c',
  fontSize: '0.84rem',
  marginBottom: '0.75rem',
  padding: '0.75rem 0.9rem',
  background: '#FEF2F2',
  borderRadius: '16px',
  border: '1px solid #fecaca',
}

const infoStyle: React.CSSProperties = {
  color: '#166534',
  fontSize: '0.84rem',
  marginBottom: '0.75rem',
  padding: '0.75rem 0.9rem',
  background: '#F0FDF4',
  borderRadius: '16px',
  border: '1px solid #bbf7d0',
}
