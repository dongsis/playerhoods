'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { sendPublicMatchSignupVerificationEmail } from '@/lib/notifications/workers/process-queued-notification-deliveries'

type PublicSignupStartRow = {
  signup_id: string
  status: string | null
  verification_required: boolean | null
  verification_token: string | null
  email_normalized: string | null
  recipient_name: string | null
  match_id: string
  game_type: string | null
  sport_name: string | null
  match_date: string | null
  start_time: string | null
  venue_name: string | null
}

type PublicSignupLogStage =
  | 'service_client_not_configured'
  | 'rpc_start_failed'
  | 'email_delivery_disabled'
  | 'email_template_failed'
  | 'email_send_failed'
  | 'delivery_result_record_failed'
  | 'unexpected_runtime_error'

type PublicSignupSafeErrorCode =
  | 'service_client_not_configured'
  | 'rpc_start_failed'
  | 'display_name_required'
  | 'email_required'
  | 'email_invalid'
  | 'signup_link_not_found'
  | 'match_not_active'
  | 'verification_email_unavailable'
  | 'email_send_failed'
  | 'email_template_render_failed'
  | 'delivery_result_record_failed'
  | 'unexpected_public_signup_start_error'

type PublicSignupActionError = Error & {
  safeCode?: PublicSignupSafeErrorCode
}

function createPublicSignupMutationClient() {
  const serverUrl = process.env.SUPABASE_SERVER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serverUrl || !serviceKey) {
    throw new Error('public_signup_service_client_not_configured')
  }
  return createClient<Database>(serverUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function getSignupErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('public_signup_email_delivery_unavailable')) return 'email-delivery-unavailable'
  if (message.includes('public_signup_email_delivery_failed')) return 'email-delivery-unavailable'
  if (message.includes('display_name_required')) return 'name-required'
  if (message.includes('email_required')) return 'contact-required'
  if (message.includes('email_invalid')) return 'email-invalid'
  if (message.includes('signup_link_not_found')) return 'link-not-found'
  if (message.includes('match_not_active')) return 'match-not-active'
  return 'failed'
}

function createPublicSignupActionError(message: string, safeCode: PublicSignupSafeErrorCode): PublicSignupActionError {
  const error = new Error(message) as PublicSignupActionError
  error.safeCode = safeCode
  return error
}

function getPublicSignupSafeErrorCode(error: unknown): PublicSignupSafeErrorCode | null {
  if (
    error &&
    typeof error === 'object' &&
    'safeCode' in error &&
    typeof (error as { safeCode?: unknown }).safeCode === 'string'
  ) {
    const safeCode = (error as { safeCode: string }).safeCode
    switch (safeCode) {
      case 'service_client_not_configured':
      case 'rpc_start_failed':
      case 'display_name_required':
      case 'email_required':
      case 'email_invalid':
      case 'signup_link_not_found':
      case 'match_not_active':
      case 'verification_email_unavailable':
      case 'email_send_failed':
      case 'email_template_render_failed':
      case 'delivery_result_record_failed':
      case 'unexpected_public_signup_start_error':
        return safeCode
      default:
        return null
    }
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message
    if (message.includes('public_signup_service_client_not_configured')) return 'service_client_not_configured'
    if (message.includes('public_signup_email_delivery_unavailable')) return 'verification_email_unavailable'
    if (message.includes('public_signup_email_delivery_failed')) return 'email_send_failed'
    if (message.includes('display_name_required')) return 'display_name_required'
    if (message.includes('email_required')) return 'email_required'
    if (message.includes('email_invalid')) return 'email_invalid'
    if (message.includes('signup_link_not_found')) return 'signup_link_not_found'
    if (message.includes('match_not_active')) return 'match_not_active'
  }

  return null
}

function logPublicSignupActionFailure(
  stage: PublicSignupLogStage,
  context?: {
    safeErrorCode?: PublicSignupSafeErrorCode | null
    matchId?: string | null
    signupId?: string | null
    status?: string | null
    hasError?: boolean
    isProviderError?: boolean
  },
) {
  console.error('[public-signup] action failed', {
    stage,
    operation: 'public_match_signup_start',
    action: 'startPublicMatchSignupAction',
    ...(context?.safeErrorCode ? { safe_error_code: context.safeErrorCode } : {}),
    ...(context?.hasError ? { has_error: true } : {}),
    ...(context?.isProviderError ? { is_provider_error: true } : {}),
    ...(context?.matchId ? { match_id: context.matchId } : {}),
    ...(context?.signupId ? { signup_id: context.signupId } : {}),
    ...(context?.status ? { status: context.status } : {}),
  })
}

function redirectToSignup(token: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params)
  redirect(`/join/${encodeURIComponent(token)}?${query.toString()}`)
}

function redirectToVerify(token: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params)
  redirect(`/join/${encodeURIComponent(token)}/verify?${query.toString()}`)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function getVerifyErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('verification_token_expired')) return 'expired'
  if (message.includes('verification_token_invalid')) return 'invalid'
  if (message.includes('match_not_active')) return 'match-not-active'
  if (message.includes('signup_link_not_found')) return 'link-not-found'
  return 'failed'
}

function publicSignupVerificationEmailDeliveryEnabled(): boolean {
  const configured = process.env.PUBLIC_MATCH_SIGNUP_VERIFICATION_EMAIL_DELIVERY?.trim().toLowerCase()
  if (configured) {
    return ['1', 'true', 'enabled', 'on'].includes(configured)
  }
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'production'
  }
  return false
}

export async function startPublicMatchSignupAction(token: string, formData: FormData): Promise<void> {
  const displayName = String(formData.get('display_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const marketingOptIn = formData.get('marketing_email_opt_in') === 'on'
  let notice = 'check-email'
  let supabase: ReturnType<typeof createPublicSignupMutationClient>

  if (!email && !phone) {
    redirectToSignup(token, { error: 'contact-required' })
  }

  if (!email && phone) {
    redirectToSignup(token, { error: 'sms-coming-next' })
  }

  try {
    supabase = createPublicSignupMutationClient()
  } catch (error) {
    logPublicSignupActionFailure('service_client_not_configured', {
      safeErrorCode: getPublicSignupSafeErrorCode(error) ?? 'service_client_not_configured',
      hasError: true,
    })
    redirectToSignup(token, { error: getSignupErrorCode(error) })
  }

  let data: unknown
  try {
    const result = await supabase.rpc('rpc_public_match_signup_start', {
      p_public_token: token,
      p_display_name: displayName,
      p_email: email,
      p_phone: phone || null,
      p_marketing_email_opt_in: marketingOptIn,
    })

    if (result.error) {
      throw result.error
    }
    data = result.data
  } catch (error) {
    logPublicSignupActionFailure('rpc_start_failed', {
      safeErrorCode: getPublicSignupSafeErrorCode(error) ?? 'rpc_start_failed',
      hasError: true,
    })
    redirectToSignup(token, { error: getSignupErrorCode(error) })
  }

  const signup = Array.isArray(data) ? data[0] as PublicSignupStartRow | undefined : null
  const status = signup?.status ?? null
  const verificationRequired = signup?.verification_required === true

  if (status === 'already_verified') {
    notice = 'already-submitted'
  }

  if (
    verificationRequired &&
    signup?.email_normalized &&
    signup?.verification_token
  ) {
    let deliveryStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
    let deliveryError: string | null = 'delivery_disabled'

    if (!publicSignupVerificationEmailDeliveryEnabled()) {
      logPublicSignupActionFailure('email_delivery_disabled', {
        safeErrorCode: 'verification_email_unavailable',
        matchId: signup.match_id,
        signupId: signup.signup_id,
        status,
      })
      try {
        const { error: deliveryAuditError } = await supabase.rpc('rpc_public_match_signup_record_delivery_result', {
          p_signup_id: signup.signup_id,
          p_delivery_status: deliveryStatus,
          p_error: deliveryError,
        })
        if (deliveryAuditError) {
          throw deliveryAuditError
        }
      } catch (auditError) {
        logPublicSignupActionFailure('delivery_result_record_failed', {
          safeErrorCode: getPublicSignupSafeErrorCode(auditError) ?? 'delivery_result_record_failed',
          hasError: true,
          matchId: signup.match_id,
          signupId: signup.signup_id,
          status,
        })
      }
      redirectToSignup(token, { error: getSignupErrorCode(new Error('public_signup_email_delivery_unavailable')) })
    }

    try {
      const deliveryResult = await sendPublicMatchSignupVerificationEmail({
        destination: signup.email_normalized,
        recipientName: signup.recipient_name ?? displayName,
        publicToken: token,
        signupId: signup.signup_id,
        verificationToken: signup.verification_token,
        matchInfo: {
          matchId: signup.match_id,
          gameType: signup.game_type ?? signup.sport_name ?? 'Match',
          matchDate: signup.match_date ?? null,
          startTime: signup.start_time ?? null,
          venueName: signup.venue_name ?? null,
          siteUrl: '',
        },
      })
      deliveryStatus = deliveryResult.ok ? 'sent' : 'failed'
      deliveryError = deliveryResult.ok ? null : 'email_send_failed'
      if (!deliveryResult.ok) {
        logPublicSignupActionFailure('email_send_failed', {
          safeErrorCode: 'email_send_failed',
          hasError: true,
          isProviderError: true,
          matchId: signup.match_id,
          signupId: signup.signup_id,
          status,
        })
        throw createPublicSignupActionError('public_signup_email_delivery_failed', 'email_send_failed')
      }
    } catch (error) {
      const safeErrorCode = getPublicSignupSafeErrorCode(error) ?? 'email_template_render_failed'
      deliveryStatus = 'failed'
      deliveryError = safeErrorCode === 'email_send_failed' ? 'email_send_failed' : 'email_template_render_failed'

      if (safeErrorCode !== 'email_send_failed') {
        logPublicSignupActionFailure('email_template_failed', {
          safeErrorCode,
          hasError: true,
          matchId: signup.match_id,
          signupId: signup.signup_id,
          status,
        })
      }

      try {
        const { error: deliveryAuditError } = await supabase.rpc('rpc_public_match_signup_record_delivery_result', {
          p_signup_id: signup.signup_id,
          p_delivery_status: deliveryStatus,
          p_error: deliveryError,
        })
        if (deliveryAuditError) {
          throw deliveryAuditError
        }
      } catch (auditError) {
        logPublicSignupActionFailure('delivery_result_record_failed', {
          safeErrorCode: getPublicSignupSafeErrorCode(auditError) ?? 'delivery_result_record_failed',
          hasError: true,
          matchId: signup.match_id,
          signupId: signup.signup_id,
          status,
        })
      }

      redirectToSignup(token, { error: 'email-delivery-unavailable' })
    }

    try {
      const { error: deliveryAuditError } = await supabase.rpc('rpc_public_match_signup_record_delivery_result', {
        p_signup_id: signup.signup_id,
        p_delivery_status: deliveryStatus,
        p_error: deliveryError,
      })
      if (deliveryAuditError) {
        throw deliveryAuditError
      }
    } catch (auditError) {
      logPublicSignupActionFailure('delivery_result_record_failed', {
        safeErrorCode: getPublicSignupSafeErrorCode(auditError) ?? 'delivery_result_record_failed',
        hasError: true,
        matchId: signup.match_id,
        signupId: signup.signup_id,
        status,
      })
    }
  } else if (verificationRequired) {
    const payloadError = createPublicSignupActionError(
      'public_signup_email_delivery_failed',
      'unexpected_public_signup_start_error',
    )
    logPublicSignupActionFailure('unexpected_runtime_error', {
      safeErrorCode: getPublicSignupSafeErrorCode(payloadError) ?? 'unexpected_public_signup_start_error',
      hasError: true,
      matchId: signup?.match_id,
      signupId: signup?.signup_id,
      status,
    })
    redirectToSignup(token, { error: getSignupErrorCode(payloadError) })
  }

  redirectToSignup(token, { notice })
}

export async function verifyPublicMatchSignupByLink(
  publicToken: string,
  signupId: string,
  verificationToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createPublicSignupMutationClient()
    const { data, error } = await supabase.rpc('rpc_public_match_signup_verify', {
      p_public_token: publicToken,
      p_signup_id: signupId,
      p_verification_token: verificationToken,
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : null
    if (!result) throw new Error('verification_failed')
  } catch (error) {
    return { ok: false, error: getVerifyErrorCode(error) }
  }

  return { ok: true }
}

export async function verifyPublicMatchSignupAction(publicToken: string, formData: FormData): Promise<void> {
  const signupId = String(formData.get('signup') ?? '').trim()
  const verificationToken = String(formData.get('verification_token') ?? formData.get('token') ?? '').trim()

  if (!isUuid(publicToken) || !isUuid(signupId) || !isUuid(verificationToken)) {
    redirectToVerify(publicToken, { error: 'invalid' })
  }

  const result = await verifyPublicMatchSignupByLink(publicToken, signupId, verificationToken)
  if (!result.ok) {
    redirectToVerify(publicToken, { error: result.error })
  }

  redirectToVerify(publicToken, { status: 'verified' })
}
