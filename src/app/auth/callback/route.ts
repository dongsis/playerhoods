import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
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

function buildRedirectWithNotice(target: URL, notice?: string) {
  if (notice) {
    target.searchParams.set('notice', notice)
  }
  return target
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie)
  })
}

function buildPostAuthRedirect({
  requestUrl,
  next,
  notice,
  onboardingCompleted,
  onboardingProfileCompleted,
  hasLegalAgreement,
}: {
  requestUrl: URL
  next: string
  notice?: string
  onboardingCompleted: boolean
  onboardingProfileCompleted: boolean
  hasLegalAgreement: boolean
}) {
  const onboardingFullyComplete = onboardingCompleted && hasLegalAgreement

  if (!onboardingFullyComplete) {
    if (onboardingProfileCompleted && hasLegalAgreement) {
      const nextStepsUrl = new URL('/onboarding/next-steps', requestUrl.origin)
      nextStepsUrl.searchParams.set('next', next)
      if (notice) nextStepsUrl.searchParams.set('notice', notice)
      return nextStepsUrl
    }

    const onboardingUrl = new URL('/onboarding/profile', requestUrl.origin)
    onboardingUrl.searchParams.set('next', next)
    if (notice) onboardingUrl.searchParams.set('notice', notice)
    return onboardingUrl
  }

  return buildRedirectWithNotice(new URL(next, requestUrl.origin), notice)
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const otpType = type as EmailOtpType | null
  const defaultNext = type === 'recovery' ? '/reset-password' : '/dashboard'
  const next = sanitizeNextPath(requestUrl.searchParams.get('next'), defaultNext)
  const providerError = requestUrl.searchParams.get('error')
  const isRecoveryFlow = type === 'recovery'
  const isEmailVerificationFlow = !isRecoveryFlow && (type === 'signup' || type === 'email' || type === 'magiclink')

  if (providerError) {
    console.error('[auth:callback]', providerError, requestUrl.searchParams.get('error_description'))
    return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
  }

  if (!code && !tokenHash) {
    if (next === '/reset-password') {
      return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
    }
    return NextResponse.redirect(new URL(next, requestUrl.origin))
  }

  try {
    const initialRedirectUrl = new URL(next, requestUrl.origin)
    const response = NextResponse.redirect(initialRedirectUrl)
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

    const authResult = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : tokenHash && otpType
        ? await supabase.auth.verifyOtp({
          type: otpType,
          token_hash: tokenHash,
        })
        : { error: new Error('auth_callback_payload_missing') }

    const { error } = authResult
    if (error) {
      console.error('[auth:callback]', error)
      const errorCode = 'code' in error && typeof error.code === 'string' ? error.code : null
      if (errorCode === 'pkce_code_verifier_not_found' && code && next !== '/reset-password') {
        return NextResponse.redirect(buildClientOAuthRedirect(requestUrl, next, code))
      }
      if (next === '/reset-password') {
        return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
      }
      return NextResponse.redirect(buildLoginRedirect(requestUrl))
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    let redirectUrl = new URL(next, requestUrl.origin)
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'onboarding_completed, onboarding_profile_completed, age_confirmed_at, terms_accepted_at, privacy_accepted_at, responsible_use_accepted_at',
        )
        .eq('id', user.id)
        .maybeSingle()
      const hasLegalAgreement = Boolean(
        profile?.age_confirmed_at &&
          profile?.terms_accepted_at &&
          profile?.privacy_accepted_at &&
          profile?.responsible_use_accepted_at,
      )

      redirectUrl = buildPostAuthRedirect({
        requestUrl,
        next,
        notice: isEmailVerificationFlow ? 'email-verified' : undefined,
        onboardingCompleted: Boolean(profile?.onboarding_completed),
        onboardingProfileCompleted: Boolean(profile?.onboarding_profile_completed),
        hasLegalAgreement,
      })
    }

    const finalResponse = NextResponse.redirect(redirectUrl)
    copyCookies(response, finalResponse)
    return finalResponse
  } catch (err) {
    console.error('[auth:callback]', err)
    if (next === '/reset-password') {
      return NextResponse.redirect(buildLoginRedirect(requestUrl, 'reset-link-invalid'))
    }
    return NextResponse.redirect(buildLoginRedirect(requestUrl))
  }
}
