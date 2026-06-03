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

function getSafeErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return String(error)
}

function getSafeErrorCode(error: unknown): string | null {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code
  }

  return null
}

function logPublicSignupActionFailure(
  stage: PublicSignupLogStage,
  error?: unknown,
  context?: { matchId?: string | null; signupId?: string | null; status?: string | null },
) {
  console.error('[public-signup] action failed', {
    stage,
    ...(context?.matchId ? { match_id: context.matchId } : {}),
    ...(context?.signupId ? { signup_id: context.signupId } : {}),
    ...(context?.status ? { status: context.status } : {}),
    ...(error ? { error_code: getSafeErrorCode(error), error_message: getSafeErrorMessage(error) } : {}),
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
    logPublicSignupActionFailure('service_client_not_configured', error)
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
    logPublicSignupActionFailure('rpc_start_failed', error)
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
      logPublicSignupActionFailure('email_delivery_disabled', undefined, {
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
        logPublicSignupActionFailure('delivery_result_record_failed', auditError, {
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
      deliveryError = deliveryResult.ok ? null : 'send_failed'
      if (!deliveryResult.ok) {
        logPublicSignupActionFailure('email_send_failed', new Error('public_signup_email_delivery_failed'), {
          matchId: signup.match_id,
          signupId: signup.signup_id,
          status,
        })
        throw new Error('public_signup_email_delivery_failed')
      }
    } catch (error) {
      if (!getSafeErrorMessage(error).includes('public_signup_email_delivery_failed')) {
        logPublicSignupActionFailure('email_template_failed', error, {
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
        logPublicSignupActionFailure('delivery_result_record_failed', auditError, {
          matchId: signup.match_id,
          signupId: signup.signup_id,
          status,
        })
      }

      redirectToSignup(token, { error: getSignupErrorCode(error) })
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
      logPublicSignupActionFailure('delivery_result_record_failed', auditError, {
        matchId: signup.match_id,
        signupId: signup.signup_id,
        status,
      })
    }
  } else if (verificationRequired) {
    const payloadError = new Error('public_signup_email_delivery_failed')
    logPublicSignupActionFailure('unexpected_runtime_error', payloadError, {
      matchId: signup?.match_id,
      signupId: signup?.signup_id,
      status,
    })
    redirectToSignup(token, { error: getSignupErrorCode(payloadError) })
  }

  redirectToSignup(token, { notice })
}

export async function verifyPublicMatchSignupAction(token: string, formData: FormData): Promise<void> {
  const signupId = String(formData.get('signup') ?? '').trim()
  const verificationToken = String(formData.get('token') ?? '').trim()

  if (!isUuid(token) || !isUuid(signupId) || !isUuid(verificationToken)) {
    redirectToVerify(token, { error: 'invalid' })
  }

  try {
    const supabase = createPublicSignupMutationClient()
    const { data, error } = await supabase.rpc('rpc_public_match_signup_verify', {
      p_public_token: token,
      p_signup_id: signupId,
      p_verification_token: verificationToken,
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : null
    if (!result) throw new Error('verification_failed')
  } catch (error) {
    redirectToVerify(token, { error: getVerifyErrorCode(error) })
  }

  redirectToVerify(token, { status: 'verified' })
}
