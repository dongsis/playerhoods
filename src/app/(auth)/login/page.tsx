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

      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setInfo(null)
        setError('This email is already verified with Google. Please continue with Google to sign in.')
        return
      }

      if (data.session) {
        window.location.assign('/onboarding/intro')
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

  const subtitles: Record<Mode, string> = {
    login: 'Sign in to manage matches, groups, and player coordination.',
    register: 'Create your account and get your player profile ready.',
    forgot: 'Enter your email and we will send a reset link if the account exists.',
  }

  return (
    <main style={pageShellStyle}>
      <style>{`
        body:has(.ph-login-card-stage) footer {
          display: none !important;
        }
        @media (max-width: 980px) {
          .ph-login-hero-copy { display: none !important; }
          .ph-login-card-stage {
            position: relative !important;
            inset: auto !important;
            min-height: 100svh !important;
            width: 100% !important;
            padding: 1rem !important;
          }
          .ph-login-card {
            width: min(100%, 31rem) !important;
            padding: 2rem 1.4rem !important;
          }
        }
        @media (max-width: 520px) {
          .ph-login-card { border-radius: 24px !important; }
          .ph-login-card h2 { font-size: 2rem !important; }
        }
      `}</style>
      <div style={backdropStyle} aria-hidden="true" />
      <section className="ph-login-hero-copy" style={heroCopyStyle} aria-hidden="true">
        <div style={brandRowStyle}>
          <img src="/playerhoods-logo-transparent.png" alt="" style={brandMarkStyle} />
          <span style={brandNameStyle}>PlayerHoods</span>
        </div>
        <h1 style={heroTitleStyle}>
          <strong>Bring players together.</strong>
          <span>Keep the game going.</span>
        </h1>
        <p style={heroSubtitleStyle}>
          Find partners, join matches, and build a stronger racket sports community.
        </p>
        <div style={featureCardsStyle}>
          <FeatureCard icon={<ConnectIcon />} title="Connect" body="Find partners and groups" />
          <FeatureCard icon={<CalendarIcon />} title="Play" body="Organize matches with ease" />
          <FeatureCard icon={<TrophyIcon />} title="Grow" body="Be part of a thriving community" />
        </div>
        <div style={trustRowStyle}>
          <TrustItem text="Trusted by players everywhere" />
          <TrustItem text="Built for racket sports communities" />
          <TrustItem text="Safe, secure, and player-first" />
        </div>
      </section>

      <section className="ph-login-card-stage" style={cardStageStyle} aria-label={titles[mode]}>
        <div className="ph-login-card" style={cardStyle}>
          <img
            src="/playerhoods-logo-transparent.png"
            alt="PlayerHoods"
            width={1122}
            height={1402}
            style={logoStyle}
          />
          <h2 style={titleStyle}>{titles[mode]}</h2>
          <p style={subtitleStyle}>{subtitles[mode]}</p>

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

          <div style={separatorStyle}>
            <span style={separatorLineStyle} />
            <span style={separatorTextStyle}>OR</span>
            <span style={separatorLineStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Email</label>
            <IconInput icon={<MailIcon />} data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="Enter your email" />
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={labelStyle}>Password</label>
            <PasswordInput
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
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
            <span>{loading ? 'Signing in...' : 'Sign In'}</span>
            <span style={primaryArrowStyle} aria-hidden="true">→</span>
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

          <div style={separatorStyle}>
            <span style={separatorLineStyle} />
            <span style={separatorTextStyle}>OR</span>
            <span style={separatorLineStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Email</label>
            <IconInput icon={<MailIcon />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="Enter your email" />
          </div>
          <div style={{ marginBottom: '0.35rem' }}>
            <label style={labelStyle}>Password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder="Enter your password"
            />
          </div>
          <p style={helperTextStyle}>At least {MIN_PASSWORD_LENGTH} characters.</p>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Confirm password</label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder="Confirm your password"
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
            <label style={labelStyle}>Email</label>
            <IconInput icon={<MailIcon />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="Enter your email" />
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
      </div>
      </section>
    </main>
  )
}

type PasswordInputProps = {
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  autoComplete?: string
  required?: boolean
  minLength?: number
  placeholder?: string
  'data-testid'?: string
}

type IconInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ReactNode
}

function IconInput({ icon, style, ...props }: IconInputProps) {
  return (
    <div style={iconFieldStyle}>
      <span style={fieldIconStyle} aria-hidden="true">{icon}</span>
      <input {...props} style={{ ...inputStyle, ...style }} />
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article style={featureCardStyle}>
      <span style={featureIconStyle}>{icon}</span>
      <span style={featureTextStyle}>
        <strong style={featureTitleStyle}>{title}</strong>
        <span style={featureBodyStyle}>{body}</span>
      </span>
    </article>
  )
}

function TrustItem({ text }: { text: string }) {
  return (
    <span style={trustItemStyle}>
      <CheckIcon />
      <span>{text}</span>
    </span>
  )
}

function PasswordInput(props: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div style={passwordFieldStyle}>
      <span style={fieldIconStyle} aria-hidden="true">
        <LockIcon />
      </span>
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

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10V8a5 5 0 0110 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 10h11A1.5 1.5 0 0119 11.5v6A1.5 1.5 0 0117.5 19h-11A1.5 1.5 0 015 17.5v-6A1.5 1.5 0 016.5 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6.75h16v10.5H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4.75 7.5L12 13l7.25-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ConnectIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M11 15.5a5 5 0 100-10 5 5 0 000 10zM21 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM3.5 26.5c.8-4.8 3.4-7.2 7.5-7.2s6.7 2.4 7.5 7.2M16.5 25.5c.9-3.7 2.7-5.5 5.2-5.5 3.2 0 5.2 2.1 6 6.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M7 8h18a2 2 0 012 2v15a2 2 0 01-2 2H7a2 2 0 01-2-2V10a2 2 0 012-2zM5 14h22M11 5v6M21 5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 18h3M16 18h3M22 18h1M10 23h3M16 23h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M10 6h12v4c0 5-2.4 8-6 8s-6-3-6-8V6zM16 18v5M11 26h10M8 9H5.5c0 4 1.8 6.4 5 7.2M24 9h2.5c0 4-1.8 6.4-5 7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill="#9AC43D" />
      <path d="M5.2 9.1l2.2 2.2 5.4-5.6" stroke="#153B20" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.92rem 3rem',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  border: '1px solid #D7E0EC',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.96)',
  color: '#102653',
  outline: 'none',
}

const pageShellStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100svh',
  overflow: 'hidden',
  background: '#D9EBF7',
  color: '#0A285C',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const backdropStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'linear-gradient(90deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 42%, rgba(255,255,255,0.02) 100%), url("/login-playerhoods-hero-final.png")',
  backgroundSize: 'auto 98%',
  backgroundPosition: 'left center',
  backgroundRepeat: 'no-repeat',
}

const heroCopyStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'none',
  width: '55vw',
  maxWidth: '58rem',
  minHeight: '100svh',
  padding: '7vh 0 2.5rem 8vw',
  flexDirection: 'column',
  alignItems: 'flex-start',
}

const brandRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1.35rem',
  marginBottom: '2rem',
}

const brandMarkStyle: React.CSSProperties = {
  width: '5.3rem',
  height: '6.45rem',
  objectFit: 'contain',
}

const brandNameStyle: React.CSSProperties = {
  color: '#061D4F',
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '3.05rem',
  fontWeight: 700,
}

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#082A64',
  fontSize: 'clamp(2.8rem, 4.6vw, 5.4rem)',
  lineHeight: 1.05,
  fontWeight: 500,
  letterSpacing: 0,
  display: 'flex',
  flexDirection: 'column',
}

const heroSubtitleStyle: React.CSSProperties = {
  maxWidth: '33rem',
  margin: '1.2rem 0 0',
  color: '#2F4466',
  fontSize: '1.18rem',
  lineHeight: 1.45,
}

const featureCardsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(10rem, 1fr))',
  gap: '0.8rem',
  width: 'min(100%, 37rem)',
  marginTop: 'auto',
  marginLeft: '11.5rem',
  marginBottom: '1rem',
}

const featureCardStyle: React.CSSProperties = {
  minHeight: '5.25rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.85rem',
  padding: '0.85rem 1rem',
  borderRadius: '8px',
  background: 'rgba(15, 42, 79, 0.9)',
  color: '#FFFFFF',
  boxShadow: '0 12px 24px rgba(6, 25, 57, 0.24)',
  backdropFilter: 'blur(12px)',
}

const featureIconStyle: React.CSSProperties = {
  color: '#A6C83B',
  flex: '0 0 auto',
}

const featureTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.12rem',
}

const featureTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  lineHeight: 1.1,
}

const featureBodyStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  lineHeight: 1.2,
}

const trustRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(10rem, 1fr))',
  gap: '1.3rem',
  width: 'min(100%, 40rem)',
  marginLeft: '16rem',
  color: '#FFFFFF',
}

const trustItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.65rem',
  minWidth: 0,
  fontSize: '0.76rem',
  lineHeight: 1.25,
}

const cardStageStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 2,
  top: 0,
  right: 0,
  bottom: 0,
  width: '43.5vw',
  minWidth: '34rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4vh 7vw 4vh 1.5rem',
}

const logoStyle: React.CSSProperties = {
  width: '5.4rem',
  height: '6.7rem',
  objectFit: 'contain',
  display: 'block',
  margin: '0 auto 0.25rem',
}

const cardStyle: React.CSSProperties = {
  width: 'min(100%, 34.8rem)',
  minHeight: '46rem',
  maxHeight: '92svh',
  overflowY: 'auto',
  background: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.72)',
  borderRadius: '26px',
  boxShadow: '0 26px 60px rgba(12, 33, 71, 0.28)',
  padding: '2.35rem 2.55rem 2rem',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: '#071D46',
  fontSize: '2.28rem',
  lineHeight: 1.08,
  fontWeight: 850,
  letterSpacing: 0,
  textAlign: 'center',
}

const subtitleStyle: React.CSSProperties = {
  maxWidth: '19rem',
  margin: '0.8rem auto 1.8rem',
  color: '#5D6D8E',
  fontSize: '0.96rem',
  lineHeight: 1.45,
  textAlign: 'center',
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
  paddingRight: '3rem',
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
  minHeight: '3rem',
  padding: '0.5rem 0.55rem 0.5rem 1.4rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  position: 'relative',
  fontSize: '0.98rem',
  cursor: 'pointer',
  background: '#064CB7',
  color: '#fff',
  border: 'none',
  borderRadius: '999px',
  fontWeight: 800,
  letterSpacing: 0,
  boxShadow: '0 14px 24px rgba(4, 58, 145, 0.28)',
}

const primaryArrowStyle: React.CSSProperties = {
  position: 'absolute',
  right: '0.45rem',
  width: '2.25rem',
  height: '2.25rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  background: '#FFFFFF',
  color: '#064CB7',
  fontSize: '1.55rem',
  fontWeight: 600,
}

const secondaryBtnStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '3.05rem',
  padding: '0.8rem 1rem',
  marginBottom: '1.8rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  fontSize: '0.95rem',
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.92)',
  color: '#0C1D42',
  border: '1px solid #BFCBE0',
  borderRadius: '999px',
  fontWeight: 800,
}

const separatorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  marginBottom: '1.25rem',
}

const separatorLineStyle: React.CSSProperties = {
  flex: 1,
  height: '1px',
  background: '#E2E8F0',
}

const separatorTextStyle: React.CSSProperties = {
  color: '#697894',
  fontSize: '0.76rem',
  fontWeight: 800,
  letterSpacing: 0,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.42rem',
  color: '#0C1D42',
  fontSize: '0.84rem',
  fontWeight: 800,
}

const iconFieldStyle: React.CSSProperties = {
  position: 'relative',
}

const fieldIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '0.9rem',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 1,
  color: '#8DA0BD',
  display: 'inline-flex',
  alignItems: 'center',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#064CB7',
  cursor: 'pointer',
  fontSize: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
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

