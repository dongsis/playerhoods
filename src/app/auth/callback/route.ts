import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sanitizeNextPath } from '@/lib/auth-ui'

function buildLoginRedirect(requestUrl: URL, notice?: string) {
  const loginUrl = new URL('/login', requestUrl.origin)
  if (notice) loginUrl.searchParams.set('notice', notice)
  return loginUrl
}

function buildClientOAuthRedirect(requestUrl: URL, next: string, code: string) {
  const loginUrl = new URL('/login', requestUrl.origin)
  loginUrl.searchParams.set('next', next)
  loginUrl.searchParams.set('code', code)
  return loginUrl
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const defaultNext = type === 'recovery' ? '/reset-password' : '/dashboard'
  const next = sanitizeNextPath(requestUrl.searchParams.get('next'), defaultNext)
  const providerError = requestUrl.searchParams.get('error')

  if (providerError) {
    console.error('[auth:callback]', providerError, requestUrl.searchParams.get('error_description'))
    return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
  }

  if (!code) {
    if (next === '/reset-password') {
      return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
    }
    return NextResponse.redirect(new URL(next, requestUrl.origin))
  }

  try {
    const redirectUrl = new URL(next, requestUrl.origin)
    const response = NextResponse.redirect(redirectUrl)
    const serverUrl = process.env.SUPABASE_SERVER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL

    const supabase = createServerClient(
      serverUrl!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth:callback]', error)
      if (error.code === 'pkce_code_verifier_not_found' && next !== '/reset-password') {
        return NextResponse.redirect(buildClientOAuthRedirect(requestUrl, next, code))
      }
      if (next === '/reset-password') {
        return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
      }
      return NextResponse.redirect(buildLoginRedirect(requestUrl))
    }

    return response
  } catch (err) {
    console.error('[auth:callback]', err)
    if (next === '/reset-password') {
      return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
    }
    return NextResponse.redirect(buildLoginRedirect(requestUrl))
  }
}
