import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { sanitizeNextPath } from '@/lib/auth-ui'

export async function middleware(request: NextRequest) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const requestHost = request.headers.get('host')?.split(':')[0] ?? null
  if (requestHost === '0.0.0.0' && configuredSiteUrl) {
    const canonicalUrl = new URL(request.url)
    const targetBase = new URL(configuredSiteUrl)
    canonicalUrl.protocol = targetBase.protocol
    canonicalUrl.host = targetBase.host
    const redirectResponse = NextResponse.redirect(canonicalUrl)
    redirectResponse.headers.set('x-ph-middleware', 'canonical-host')
    return redirectResponse
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const pathname = request.nextUrl.pathname
  const isSupabaseProxy = pathname.startsWith('/supabase/')
  if (isSupabaseProxy) {
    response.headers.set('x-ph-middleware', 'supabase-proxy')
    return response
  }
  const isLoginRoute = pathname.startsWith('/login')
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isResetPasswordRoute = pathname.startsWith('/reset-password')
  const isInvitationPage = pathname.startsWith('/invitations/')
  const isOnboarding = pathname.startsWith('/onboarding')
  const isPublicRoute = pathname === '/'
    || isLoginRoute
    || isAuthCallback
    || isResetPasswordRoute
    || isInvitationPage
  const isProtectedRoute = !isPublicRoute && !isOnboarding
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
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', safeNext)
    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.headers.set('x-ph-middleware', 'auth-required')
    return redirectResponse
  }

  if (user && isLoginRoute) {
    const safeNext = sanitizeNextPath(request.nextUrl.searchParams.get('next'), '/dashboard')
    const redirectResponse = NextResponse.redirect(new URL(safeNext, request.url))
    redirectResponse.headers.set('x-ph-middleware', 'already-authed')
    return redirectResponse
  }

  if (user && isProtectedRoute && !isInvitationPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.display_name) {
      const next = sanitizeNextPath(
        `${pathname}${request.nextUrl.search || ''}`,
        '/dashboard',
      )
      const redirectResponse = NextResponse.redirect(
        new URL(`/onboarding/profile?next=${encodeURIComponent(next)}`, request.url),
      )
      redirectResponse.headers.set('x-ph-middleware', 'needs-onboarding')
      return redirectResponse
    }
  }

  response.headers.set('x-ph-middleware', 'pass')
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|supabase/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
