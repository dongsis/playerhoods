'use client'

import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import {
  AUTH_SUBMIT_THROTTLE_MS,
  MIN_PASSWORD_LENGTH,
  getConfiguredSiteOrigin,
  mapAuthErrorToUiMessage,
  sanitizeNextPath,
  shouldUseCanonicalLocalAuthHost,
} from '@/lib/auth-ui'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type AuthMode = 'login' | 'register' | 'forgot'

type Slide = {
  key: string
  label: string
  title: string
  imageTitle: string
  copy: string
  cta: string
  href: string
  image?: string
  visual: 'fit' | 'join' | 'hood' | 'privacy' | 'flow'
}

const slides: Slide[] = [
  {
    key: 'fit',
    label: 'Fit',
    title: 'Find players and games that fit you',
    imageTitle: 'Help the right players find you',
    copy: 'Add your sport, city, and venues so the right playing circles can find you.',
    cta: 'Complete Your Profile',
    href: '/profile',
    image: '/home-feature-fit.png',
    visual: 'fit',
  },
  {
    key: 'join',
    label: 'Join',
    title: 'Join or invite without the group-chat mess',
    imageTitle: 'Choose how players join',
    copy: "Invite players directly, or set a match Open to Join so eligible players can say they'd like to play.",
    cta: 'Create a Match',
    href: '/matches',
    image: '/home-feature-join.png',
    visual: 'join',
  },
  {
    key: 'hood',
    label: 'Hood',
    title: 'Build your Hood after every game',
    imageTitle: 'Build your Hood',
    copy: 'Save players you enjoyed playing with, then invite them again next time.',
    cta: 'Start Your Hood',
    href: '/dashboard?tab=players',
    image: '/home-feature-hood.png',
    visual: 'hood',
  },
  {
    key: 'privacy',
    label: 'Privacy',
    title: 'Stay visible without exposing everything',
    imageTitle: "You're in control",
    copy: 'Choose where others can discover you. Keep email and phone private.',
    cta: 'Set Privacy',
    href: '/dashboard?tab=profile',
    image: '/home-feature-privacy.png',
    visual: 'privacy',
  },
  {
    key: 'flow',
    label: 'Flow',
    title: 'One clear place for every game',
    imageTitle: 'Clear match flow',
    copy: "See who's invited, who's confirmed, who declined, and who still needs a reply.",
    cta: 'See Match Flow',
    href: '/matches',
    image: '/home-feature-flow-match-board.png',
    visual: 'flow',
  },
]

const benefits = [
  {
    title: 'Find games around your courts',
    copy: 'Discover players and matches near the places you already play.',
    icon: 'chat',
  },
  {
    title: 'Organize without chasing replies',
    copy: 'Invites, open spots, requests, and player status stay attached to each match.',
    icon: 'people',
  },
  {
    title: 'Build your trusted playing circle',
    copy: 'Save good playing partners into your Hood and invite them again next time.',
    icon: 'lock',
  },
]

export default function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const searchParams = useSearchParams()
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next'), '/dashboard'),
    [searchParams],
  )

  useEffect(() => {
    const requestedAuthMode = searchParams.get('auth')
    if (
      requestedAuthMode === 'login' ||
      requestedAuthMode === 'register' ||
      requestedAuthMode === 'forgot'
    ) {
      setAuthMode(requestedAuthMode)
    }
  }, [searchParams])

  function openAuth(mode: AuthMode) {
    setAuthMode(mode)
    setIsMenuOpen(false)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('auth', mode)
    window.history.pushState({}, '', url)
  }

  function closeAuth() {
    setAuthMode(null)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.delete('auth')
    window.history.pushState({}, '', url)
  }

  return (
    <main className="min-h-screen bg-[#F0F7FF] text-[#12213A]">
      <nav className="sticky top-0 z-50 w-full border-b border-[#D8E4F2] bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLogo variant="horizontal" imageClassName="h-[52px] w-[236px] sm:h-14 sm:w-[250px]" />

          <div className="hidden items-center gap-7 md:flex">
            <a href="#players" className="text-sm font-bold text-[#30445F] hover:text-[#0d6efd]">
              For Players
            </a>
            <a href="#benefits" className="text-sm font-bold text-[#30445F] hover:text-[#0d6efd]">
              Benefits
            </a>
            <a href="#clubs" className="text-sm font-bold text-[#30445F] hover:text-[#0d6efd]">
              For Organizers
            </a>
            <a href="/venues" className="text-sm font-bold text-[#30445F] hover:text-[#0d6efd]">
              Venues
            </a>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="text-sm font-bold text-[#071A44] hover:text-[#0d6efd]"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => openAuth('register')}
              className="rounded-full bg-[#0d6efd] px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-[#0b5ed7]"
            >
              Join Free Today
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen((value) => !value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D8E4F2] text-[#071A44] md:hidden"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {isMenuOpen ? (
          <div className="border-t border-[#D8E4F2] bg-white px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              <a className="rounded-lg px-3 py-2 font-bold text-[#30445F]" href="#players">
                For Players
              </a>
              <a className="rounded-lg px-3 py-2 font-bold text-[#30445F]" href="#benefits">
                Benefits
              </a>
              <a className="rounded-lg px-3 py-2 font-bold text-[#30445F]" href="#clubs">
                For Organizers
              </a>
              <a className="rounded-lg px-3 py-2 font-bold text-[#30445F]" href="/venues">
                Venues
              </a>
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="rounded-lg px-3 py-2 text-left font-bold text-[#30445F]"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => openAuth('register')}
                className="mt-2 rounded-lg bg-[#0d6efd] px-3 py-3 text-center font-black text-white"
              >
                Join Free Today
              </button>
            </div>
          </div>
        ) : null}
      </nav>

      <div className="relative overflow-hidden bg-[#F0F7FF]">
        <div className="absolute inset-0">
          <img
            src="/homepage-hero-close-player-group-mobile-20260601.png"
            alt=""
            aria-hidden="true"
            className="h-auto w-full object-contain object-top sm:hidden"
          />
          <img
            src="/homepage-hero-players-clean-safe-area-20260530.png"
            alt=""
            aria-hidden="true"
            className="hidden h-full w-full object-cover object-center sm:block"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/82 via-white/48 to-[#071A44]/10" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/36 via-white/8 to-[#F0F7FF]/62" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_16%,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0.58)_30%,rgba(255,255,255,0.14)_58%,rgba(7,26,68,0.14)_100%)]" />
        </div>

        <div className="relative z-10">
          <HeroSection />
        </div>
      </div>

      <section id="benefits" className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-3">
            {benefits.map((benefit) => (
              <article
                key={benefit.title}
                className="rounded-lg border border-[#D8E4F2] bg-[#F8FBFF] p-6 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.24)]"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[#0d6efd] shadow-sm">
                  <Icon name={benefit.icon} className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black text-[#071A44]">{benefit.title}</h3>
                <p className="mt-3 text-sm font-medium leading-6 text-[#52667F]">{benefit.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="clubs" className="bg-[#EAF3FF] px-4 py-16 text-[#071A44] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="text-xs font-black uppercase text-[#0d6efd]">
              For Organizers
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-[#071A44] md:text-4xl">
              Help your players find the next game without turning every match into message chasing.
            </h2>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#52667F]">
              Built for hosts, captains, and community organizers who need a simpler way to gather
              players, fill spots, and keep familiar groups active.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openAuth('register')}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0d6efd] px-7 text-sm font-black text-white shadow-[0_14px_30px_rgba(13,110,253,0.24)] transition hover:bg-[#0b5ed7]"
          >
            Create Your First Match
          </button>
        </div>
      </section>
      {authMode ? (
        <HomeAuthOverlay initialMode={authMode} nextPath={nextPath} onClose={closeAuth} />
      ) : null}
    </main>
  )
}

function HomeAuthOverlay({
  initialMode,
  nextPath,
  onClose,
}: {
  initialMode: AuthMode
  nextPath: string
  onClose: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const lastSubmitAtRef = useRef<Record<AuthMode, number>>({
    login: 0,
    register: 0,
    forgot: 0,
  })

  useEffect(() => {
    setMode(initialMode)
    setError(null)
    setInfo(null)
  }, [initialMode])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const canonicalSiteOrigin = getConfiguredSiteOrigin()
  const currentHost = typeof window === 'undefined' ? null : window.location.hostname
  const shouldRouteGoogleThroughCanonicalHost = shouldUseCanonicalLocalAuthHost(currentHost)
  const title = mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Sign in'
  const subtitle =
    mode === 'register'
      ? 'Create your account and get your player profile ready.'
      : mode === 'forgot'
        ? 'Enter your email and we will send a reset link if the account exists.'
        : 'Welcome back to PlayerHoods.'

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError(null)
    setInfo(null)
    setPassword('')
    setConfirmPassword('')
  }

  function normalizeEmail(value: string) {
    return value.trim().toLowerCase()
  }

  function guardAgainstRapidSubmit(target: AuthMode) {
    const now = Date.now()
    if (now - lastSubmitAtRef.current[target] < AUTH_SUBMIT_THROTTLE_MS) {
      setError('Please wait a moment and try again.')
      return false
    }
    lastSubmitAtRef.current[target] = now
    return true
  }

  async function handleGoogleAuth(targetMode: 'login' | 'register') {
    setError(null)
    setInfo(null)
    if (!guardAgainstRapidSubmit(targetMode)) return

    if (shouldRouteGoogleThroughCanonicalHost && canonicalSiteOrigin) {
      const canonicalLoginUrl = new URL('/', canonicalSiteOrigin)
      canonicalLoginUrl.searchParams.set('auth', targetMode)
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
        console.error('[home-auth:google]', oauthError)
        setError('Unable to continue with Google right now. Please try again.')
        setLoading(false)
      }
    } catch (err) {
      console.error('[home-auth:google]', err)
      setError('Unable to continue with Google right now. Please try again.')
      setLoading(false)
    }
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
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
        console.error('[home-auth:login]', signInError)
        setError(mapAuthErrorToUiMessage('login'))
        return
      }

      window.location.assign(nextPath)
    } catch (err) {
      console.error('[home-auth:login]', err)
      setError(mapAuthErrorToUiMessage('login'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault()
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
        console.error('[home-auth:register]', signUpError)
        setError(mapAuthErrorToUiMessage('register', signUpError))
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
      console.error('[home-auth:register]', err)
      setError(mapAuthErrorToUiMessage('register', err))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault()
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
      if (resetError) console.error('[home-auth:forgot]', resetError)
      setInfo('If that email is registered, we have sent a password reset link.')
    } catch (err) {
      console.error('[home-auth:forgot]', err)
      setError(mapAuthErrorToUiMessage('forgot'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#071A44]/42 px-4 py-6 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close sign in"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative mx-auto flex min-h-[calc(100svh-3rem)] max-w-[980px] items-center justify-center">
        <div className="relative w-full max-w-[430px] rounded-[28px] bg-white px-8 py-8 shadow-[0_28px_80px_rgba(7,26,68,0.28)] sm:px-9">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-[#71849D] transition hover:bg-[#F0F7FF] hover:text-[#071A44]"
          >
            <CloseIcon />
          </button>

          <div className="mx-auto flex flex-col items-center gap-1">
            <img
              src="/playerhoods-brand-stacked-cropped.png"
              alt="PlayerHoods"
              className="h-[62px] w-[220px] object-contain"
            />
          </div>
          <h2 className="mt-1 text-center text-xl font-black text-[#071A44]">{title}</h2>
          <p className="mx-auto mt-2 max-w-[250px] text-center text-sm font-medium leading-5 text-[#52667F]">
            {subtitle}
          </p>

          {mode !== 'forgot' ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGoogleAuth(mode)}
              className="mt-6 flex min-h-11 w-full items-center justify-center gap-3 rounded-full border border-[#C8D7EA] bg-white px-4 text-sm font-black text-[#071A44] transition hover:bg-[#F8FBFF] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <HomeGoogleIcon />
              {loading ? 'Opening Google...' : 'Continue with Google'}
            </button>
          ) : null}

          {mode !== 'forgot' ? (
            <div className="my-6 flex items-center gap-3 text-xs font-black uppercase text-[#71849D]">
              <span className="h-px flex-1 bg-[#D8E4F2]" />
              OR
              <span className="h-px flex-1 bg-[#D8E4F2]" />
            </div>
          ) : null}

          <form onSubmit={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleForgot}>
            <label className="mb-2 block text-xs font-black text-[#071A44]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="Enter your email"
              className="mb-4 min-h-12 w-full rounded-lg border border-[#C8D7EA] px-4 text-sm font-semibold text-[#071A44] outline-none placeholder:text-[#9AA9BC] focus:border-[#0d6efd]"
            />

            {mode !== 'forgot' ? (
              <>
                <label className="mb-2 block text-xs font-black text-[#071A44]">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={mode === 'register' ? MIN_PASSWORD_LENGTH : undefined}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder="Enter your password"
                  className="mb-2 min-h-12 w-full rounded-lg border border-[#C8D7EA] px-4 text-sm font-semibold text-[#071A44] outline-none placeholder:text-[#9AA9BC] focus:border-[#0d6efd]"
                />
              </>
            ) : null}

            {mode === 'login' ? (
              <div className="mb-4 text-right">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-black text-[#0d6efd] hover:text-[#0d6efd]"
                >
                  Forgot password?
                </button>
              </div>
            ) : null}

            {mode === 'register' ? (
              <>
                <p className="mb-3 text-xs font-semibold text-[#52667F]">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
                <label className="mb-2 block text-xs font-black text-[#071A44]">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  className="mb-4 min-h-12 w-full rounded-lg border border-[#C8D7EA] px-4 text-sm font-semibold text-[#071A44] outline-none placeholder:text-[#9AA9BC] focus:border-[#0d6efd]"
                />
              </>
            ) : null}

            {error ? <p className="mb-3 text-sm font-bold text-[#B42318]">{error}</p> : null}
            {info ? <p className="mb-3 text-sm font-bold text-[#176C3A]">{info}</p> : null}

            {!info || mode !== 'register' ? (
              <button
                type="submit"
                disabled={loading}
                className="min-h-12 w-full rounded-full bg-[#0d6efd] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(7,91,215,0.28)] transition hover:bg-[#0b5ed7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? mode === 'register'
                    ? 'Creating account...'
                    : mode === 'forgot'
                      ? 'Sending...'
                      : 'Signing in...'
                  : mode === 'register'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send reset email'
                      : 'Sign In'}
              </button>
            ) : null}
          </form>

          <p className="mt-4 text-center text-sm font-medium text-[#52667F]">
            {mode === 'register' ? 'Already have an account?' : mode === 'forgot' ? 'Remembered it?' : 'Need an account?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'register' || mode === 'forgot' ? 'login' : 'register')}
              className="font-black text-[#0d6efd] underline-offset-2 hover:text-[#0d6efd] hover:underline"
            >
              {mode === 'register' || mode === 'forgot' ? 'Back to sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function HeroSection() {
  return (
    <section id="players" className="relative overflow-hidden">
      <div className="mx-auto flex min-h-[calc(100svh-72px)] max-w-7xl flex-col justify-start px-4 pb-8 pt-8 text-[#071A44] sm:px-6 lg:px-8">
        <div className="max-w-4xl text-left">
          <p className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-[#A9CE23] bg-[#D8F64C] px-5 py-2.5 text-sm font-black uppercase text-[#071A44] shadow-[0_12px_32px_rgba(7,26,68,0.18)]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[#071A44]/15 bg-white shadow-[0_0_12px_rgba(255,255,255,0.75)]" aria-hidden="true" />
            <span className="whitespace-nowrap">For Tennis + Pickleball Players</span>
          </p>
          <h1 className="max-w-4xl text-4xl font-black leading-[1.02] text-[#071A44] drop-shadow-[0_2px_18px_rgba(255,255,255,0.72)] md:text-6xl">
            Find your courts.
            <span className="block">
              Join more games.
            </span>
            <span className="block text-white drop-shadow-[0_2px_14px_rgba(7,26,68,0.55)]">
              Host with less work.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#243A56] drop-shadow-[0_1px_10px_rgba(255,255,255,0.55)] md:text-lg">
            PlayerHoods covers 4,000+ tennis and pickleball courts and clubs across Canada,
            helping players find games, organize matches, and build trusted player circles
            around the places they already play.
          </p>
        </div>

        <div className="mt-5 w-full">
          <FeatureCarousel />
        </div>
      </div>
    </section>
  )
}

function FeatureCarousel() {
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<'visible' | 'exit' | 'enter'>('enter')
  const [isPaused, setIsPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (isPaused) return undefined

    const delayByPhase = {
      visible: 7000,
      exit: 500,
      enter: 40,
    }

    const timer = window.setTimeout(() => {
      if (phase === 'visible') {
        setPhase('exit')
        return
      }

      if (phase === 'exit') {
        setCurrent((value) => (value + 1) % slides.length)
        setPhase('enter')
        return
      }

      setPhase('visible')
    }, delayByPhase[phase])

    return () => window.clearTimeout(timer)
  }, [isPaused, phase])

  const activeSlide = slides[current]
  const progressWidth = useMemo(() => `${((current + 1) / slides.length) * 100}%`, [current])

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null
    setIsPaused(true)
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartX.current
    const endX = event.changedTouches[0]?.clientX ?? null
    touchStartX.current = null

    if (startX != null && endX != null) {
      const distance = endX - startX
      if (Math.abs(distance) > 40) {
        setCurrent((value) => (
          distance < 0 ? (value + 1) % slides.length : (value - 1 + slides.length) % slides.length
        ))
        setPhase('visible')
      }
    }

    window.setTimeout(() => setIsPaused(false), 900)
  }

  const motionClass = {
    visible: 'translate-x-0 opacity-100',
    exit: '-translate-x-[120%] opacity-100',
    enter: 'translate-x-[120%] opacity-100',
  }[phase]

  return (
    <div
      className="relative mx-auto min-h-[414px] w-full max-w-5xl overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`absolute inset-0 overflow-hidden rounded-lg border border-white/80 bg-white/95 shadow-[0_30px_74px_-38px_rgba(7,26,68,0.48)] backdrop-blur-md transition-all duration-500 ease-in-out ${motionClass}`}
      >
        <div className="grid min-h-[413px] gap-0 lg:grid-cols-[0.76fr_1fr]">
          <div className="order-2 flex flex-col justify-center px-6 py-5 sm:px-8 lg:order-1 lg:px-9">
            <p className="text-xs font-black uppercase text-[#0d6efd]">{activeSlide.imageTitle}</p>
            <h2 className="mt-3 max-w-xl text-2xl font-black leading-tight text-[#071A44] md:text-3xl">
              {activeSlide.title}
            </h2>
            <p className="mt-4 max-w-lg text-base font-medium leading-7 text-[#52667F]">
              {activeSlide.copy}
            </p>
            <a
              href={activeSlide.href}
              className="mt-5 inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-[#071A44] px-6 text-sm font-black text-white shadow-sm transition hover:bg-[#10285E]"
            >
              {activeSlide.cta}
            </a>

            <div className="mt-5 flex flex-wrap gap-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.key}
                  type="button"
                  onClick={() => {
                    setCurrent(index)
                    setPhase('visible')
                  }}
                  className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                    current === index
                      ? 'border-[#0d6efd] bg-[#0d6efd] text-white'
                      : 'border-[#D8E4F2] bg-white text-[#52667F] hover:border-[#0d6efd]/45 hover:text-[#071A44]'
                  }`}
                  aria-label={`Show ${slide.label} slide`}
                  aria-current={current === index ? 'true' : undefined}
                >
                  {slide.label}
                </button>
              ))}
            </div>
          </div>

          <div className="order-1 bg-white/72 p-4 sm:p-5 lg:order-2">
            <CarouselVisual slide={activeSlide} />
          </div>
        </div>
        <div className="h-1 bg-[#EAF1F8]">
          <div className="h-full bg-[#0d6efd] transition-all duration-500" style={{ width: progressWidth }} />
        </div>
      </div>
    </div>
  )
}

function CarouselVisual({ slide }: { slide: Slide }) {
  return (
    <div className="relative flex h-full min-h-[306px] items-center justify-center overflow-hidden rounded-lg border border-[#C8D7EA] bg-white p-3 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.36)] sm:p-4">
      {slide.image ? (
        <img
          src={slide.image}
          alt=""
          aria-hidden="true"
          className="h-full max-h-[366px] w-full object-contain"
        />
      ) : null}
    </div>
  )
}

function Icon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  if (name === 'people') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }

  if (name === 'lock') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function HomeGoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.5 0-.72-.06-1.41-.19-2.08H12z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.05-.91 6.73-2.48l-3.3-2.56c-.91.61-2.08.97-3.43.97-2.64 0-4.88-1.78-5.68-4.18l-3.42 2.64C4.57 19.71 8 22 12 22z" />
      <path fill="#4A90E2" d="M6.32 13.75A5.98 5.98 0 016 12c0-.61.11-1.2.32-1.75L2.9 7.61A9.95 9.95 0 002 12c0 1.6.38 3.12 1.05 4.39l3.27-2.64z" />
      <path fill="#FBBC05" d="M12 6.07c1.5 0 2.84.52 3.9 1.54l2.92-2.92C17.04 3.04 14.75 2 12 2 8 2 4.57 4.29 2.9 7.61l3.42 2.64C7.12 7.85 9.36 6.07 12 6.07z" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
