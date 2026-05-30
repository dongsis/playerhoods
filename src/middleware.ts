import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getConfiguredSiteOrigin, sanitizeNextPath, shouldUseCanonicalLocalAuthHost } from '@/lib/auth-ui'

function applyNoStoreHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  return response
}

export async function middleware(request: NextRequest) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const requestHost = request.headers.get('host')?.split(':')[0] ?? null
  const pathname = request.nextUrl.pathname
  const isLoginRoute = pathname.startsWith('/login')
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isResetPasswordRoute = pathname.startsWith('/reset-password')
  const isUnsubscribeRoute = pathname.startsWith('/unsubscribe')
  const isShortInvitationRoute = pathname.startsWith('/i/')
  const isShortStopRoute = pathname.startsWith('/stop/')
  const isSeoFileRoute = pathname === '/robots.txt' || pathname === '/sitemap.xml'
  const isDevHelperRoute = pathname.startsWith('/dev/')
  const isNotificationDrainRoute = pathname === '/api/notifications/drain'
  const isSmsInboundRoute = pathname === '/api/sms/inbound'
  const isCanonicalLocalAuthRoute = isLoginRoute || isAuthCallback || isResetPasswordRoute

  if (shouldUseCanonicalLocalAuthHost(requestHost) && isCanonicalLocalAuthRoute) {
    const configuredOrigin = getConfiguredSiteOrigin()
    if (configuredOrigin) {
      const canonicalUrl = new URL(request.url)
      const targetBase = new URL(configuredOrigin)
      canonicalUrl.protocol = targetBase.protocol
      canonicalUrl.host = targetBase.host
      const redirectResponse = NextResponse.redirect(canonicalUrl)
      redirectResponse.headers.set('x-ph-middleware', 'canonical-local-auth-host')
      return applyNoStoreHeaders(redirectResponse)
    }
  }

  if (requestHost === '0.0.0.0' && configuredSiteUrl) {
    const canonicalUrl = new URL(request.url)
    const targetBase = new URL(configuredSiteUrl)
    canonicalUrl.protocol = targetBase.protocol
    canonicalUrl.host = targetBase.host
    const redirectResponse = NextResponse.redirect(canonicalUrl)
    redirectResponse.headers.set('x-ph-middleware', 'canonical-host')
    return applyNoStoreHeaders(redirectResponse)
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const isSupabaseProxy = pathname.startsWith('/supabase/')
  if (isSupabaseProxy) {
    response.headers.set('x-ph-middleware', 'supabase-proxy')
    return response
  }
  const isInvitationPage = pathname.startsWith('/invitations/')
  const isOnboarding = pathname.startsWith('/onboarding')
  const isPublicVenueProfile = pathname.startsWith('/venue/')
  const isPublicVenueDirectory = pathname === '/venues'
  const isPublicRoute = pathname === '/'
    || isLoginRoute
    || isAuthCallback
    || isResetPasswordRoute
    || isUnsubscribeRoute
    || isShortInvitationRoute
    || isShortStopRoute
    || isSeoFileRoute
    || isInvitationPage
    || isPublicVenueProfile
    || isPublicVenueDirectory
    || isNotificationDrainRoute
    || isSmsInboundRoute
  const isProtectedRoute = !isPublicRoute && !isOnboarding

  if (isSeoFileRoute) {
    response.headers.set('x-ph-middleware', 'seo-file')
    return response
  }

  if (isDevHelperRoute) {
    response.headers.set('x-ph-middleware', 'dev-helper')
    return response
  }

  if (isPublicVenueProfile || isPublicVenueDirectory) {
    response.headers.set('x-ph-middleware', 'public-venue')
    return response
  }

  const serverUrl = process.env.SUPABASE_SERVER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL

  const supabase = createServerClient(
    serverUrl!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && isProtectedRoute) {
    const safeNext = sanitizeNextPath(
      `${pathname}${request.nextUrl.search || ''}`,
      '/dashboard',
    )
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('auth', 'login')
    loginUrl.searchParams.set('next', safeNext)
    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.headers.set('x-ph-middleware', 'auth-required')
    return applyNoStoreHeaders(redirectResponse)
  }

  if (user && isLoginRoute) {
    const safeNext = sanitizeNextPath(request.nextUrl.searchParams.get('next'), '/dashboard')
    const redirectResponse = NextResponse.redirect(new URL(safeNext, request.url))
    redirectResponse.headers.set('x-ph-middleware', 'already-authed')
    return applyNoStoreHeaders(redirectResponse)
  }

  if (user && (isProtectedRoute || isOnboarding) && !isInvitationPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select(
        'onboarding_completed, onboarding_profile_completed, age_confirmed_at, terms_accepted_at, privacy_accepted_at, responsible_use_accepted_at',
      )
      .eq('id', user.id)
      .single()

    const hasLegalAgreement = Boolean(
      profile?.age_confirmed_at &&
        profile?.terms_accepted_at &&
        profile?.privacy_accepted_at &&
        profile?.responsible_use_accepted_at,
    )
    const onboardingFullyComplete = Boolean(profile?.onboarding_completed && hasLegalAgreement)

    if (isOnboarding) {
      const safeNext = sanitizeNextPath(request.nextUrl.searchParams.get('next'), '/dashboard')

      if (onboardingFullyComplete) {
        const redirectResponse = NextResponse.redirect(new URL(safeNext, request.url))
        redirectResponse.headers.set('x-ph-middleware', 'onboarding-already-complete')
        return applyNoStoreHeaders(redirectResponse)
      }

      if (pathname.startsWith('/onboarding/profile') && profile?.onboarding_profile_completed && hasLegalAgreement) {
        const redirectResponse = NextResponse.redirect(
          new URL(`/onboarding/next-steps?next=${encodeURIComponent(safeNext)}`, request.url),
        )
        redirectResponse.headers.set('x-ph-middleware', 'onboarding-next-step')
        return applyNoStoreHeaders(redirectResponse)
      }

      if (pathname.startsWith('/onboarding/next-steps') && (!profile?.onboarding_profile_completed || !hasLegalAgreement)) {
        const redirectResponse = NextResponse.redirect(
          new URL(`/onboarding/profile?next=${encodeURIComponent(safeNext)}`, request.url),
        )
        redirectResponse.headers.set('x-ph-middleware', 'onboarding-profile-step')
        return applyNoStoreHeaders(redirectResponse)
      }
    } else if (!onboardingFullyComplete) {
      const next = sanitizeNextPath(
        `${pathname}${request.nextUrl.search || ''}`,
        '/dashboard',
      )
      const destination = profile?.onboarding_profile_completed && hasLegalAgreement
        ? `/onboarding/next-steps?next=${encodeURIComponent(next)}`
        : `/onboarding/profile?next=${encodeURIComponent(next)}`
      const redirectResponse = NextResponse.redirect(new URL(destination, request.url))
      redirectResponse.headers.set('x-ph-middleware', 'needs-onboarding')
      return applyNoStoreHeaders(redirectResponse)
    }
  }

  response.headers.set('x-ph-middleware', 'pass')
  if (!pathname.startsWith('/_next/')) {
    applyNoStoreHeaders(response)
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|supabase/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
