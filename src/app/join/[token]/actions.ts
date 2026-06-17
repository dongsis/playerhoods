'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { renderPublicJoinRequestSms } from '@/lib/notifications/channels/sms/render-notification-sms'
import { sendSms } from '@/lib/sms/send'

type PublicSignupSmsStartRow = {
  sms_intent_id: string | null
  status: string | null
  sms_send_required: boolean | null
  sms_token: string | null
  phone_normalized: string | null
  recipient_name: string | null
  match_id: string
  game_type: string | null
  sport_name: string | null
  match_date: string | null
  start_time: string | null
  venue_name: string | null
  host_display_name: string | null
  level_label: string | null
  match_summary_sms: string | null
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

function getSignupErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('display_name_required')) return 'name-required'
  if (message.includes('phone_required')) return 'phone-required'
  if (message.includes('phone_invalid')) return 'phone-invalid'
  if (message.includes('sms_opted_out')) return 'sms-opted-out'
  if (message.includes('sms_throttled')) return 'request-throttled'
  if (message.includes('signup_link_not_found')) return 'link-not-found'
  if (message.includes('match_not_active')) return 'match-not-active'
  if (message.includes('supabase_service_role_client_not_configured')) return 'sms-delivery-unavailable'
  return 'failed'
}

function getRegisteredRequestErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('not_authenticated')) return 'sign-in-required'
  if (message.includes('organizer_cannot_request_own_match')) return 'organizer-cannot-request'
  if (message.includes('signup_link_not_found')) return 'link-not-found'
  if (message.includes('match_not_active')) return 'match-not-active'
  return 'failed'
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

async function recordSmsDeliveryResult(
  smsIntentId: string,
  deliveryStatus: 'sent' | 'failed' | 'skipped',
  error: string | null,
) {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { error: auditError } = await supabase.rpc('rpc_public_match_signup_record_sms_delivery_result', {
      p_sms_intent_id: smsIntentId,
      p_delivery_status: deliveryStatus,
      p_error: error,
    })
    if (auditError) throw auditError
  } catch (auditError) {
    console.error('[public-signup-sms] delivery result audit failed', {
      sms_intent_id: smsIntentId,
      delivery_status: deliveryStatus,
      has_error: true,
      error: auditError instanceof Error ? auditError.message : String(auditError),
    })
  }
}

export async function startPublicMatchSignupAction(token: string, formData: FormData): Promise<void> {
  const displayName = String(formData.get('display_name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()

  if (!phone) {
    redirectToSignup(token, { error: 'phone-required' })
  }

  let signup: PublicSignupSmsStartRow | null = null

  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase.rpc('rpc_public_match_signup_start_sms', {
      p_public_token: token,
      p_display_name: displayName,
      p_phone: phone,
    })
    if (error) throw error
    signup = Array.isArray(data) ? (data[0] as PublicSignupSmsStartRow | undefined) ?? null : null
  } catch (error) {
    console.error('[public-signup-sms] start failed', {
      safe_error_code: getSignupErrorCode(error),
      has_error: true,
    })
    redirectToSignup(token, { error: getSignupErrorCode(error) })
  }

  if (!signup) {
    redirectToSignup(token, { error: 'failed' })
  }

  if (signup.status === 'already_requested') {
    redirectToSignup(token, { notice: 'request-sent' })
  }

  if (signup.status === 'sms_throttled') {
    redirectToSignup(token, { error: 'request-throttled' })
  }

  if (signup.sms_send_required) {
    if (!signup.sms_intent_id || !signup.sms_token || !signup.phone_normalized) {
      redirectToSignup(token, { error: 'sms-delivery-unavailable' })
    }

    const smsBody = renderPublicJoinRequestSms({
      hostDisplayName: signup.host_display_name ?? 'Someone',
      recipientName: signup.recipient_name,
      gameType: signup.game_type ?? signup.sport_name ?? 'match',
      sportName: signup.sport_name,
      matchDate: signup.match_date,
      startTime: signup.start_time,
      venueName: signup.venue_name,
      levelLabel: signup.level_label,
      matchSummarySms: signup.match_summary_sms,
      smsJoinPath: `/j/${signup.sms_token}`,
      siteUrl: '',
    })
    const smsResult = await sendSms(signup.phone_normalized, smsBody)
    await recordSmsDeliveryResult(
      signup.sms_intent_id,
      smsResult.ok ? 'sent' : 'failed',
      smsResult.ok ? null : smsResult.error,
    )

    if (!smsResult.ok) {
      console.error('[public-signup-sms] send failed', {
        sms_intent_id: signup.sms_intent_id,
        match_id: signup.match_id,
        has_error: true,
      })
      redirectToSignup(token, { error: 'sms-delivery-unavailable' })
    }
  }

  redirectToSignup(token, { notice: 'sms-pending' })
}

export async function requestRegisteredPublicMatchSpotAction(token: string): Promise<void> {
  if (!isUuid(token)) {
    redirectToSignup(token, { error: 'link-not-found' })
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('rpc_public_match_registered_request_join', {
      p_public_token: token,
    })

    if (error) throw error
  } catch (error) {
    console.error('[public-signup] registered request failed', {
      action: 'requestRegisteredPublicMatchSpotAction',
      safe_error_code: getRegisteredRequestErrorCode(error),
      has_error: true,
    })
    redirectToSignup(token, { error: getRegisteredRequestErrorCode(error) })
  }

  redirectToSignup(token, { notice: 'registered-requested' })
}

export async function verifyPublicMatchSignupByLink(
  publicToken: string,
  signupId: string,
  verificationToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createSupabaseServiceRoleClient()
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

  redirectToSignup(publicToken, { notice: 'request-sent' })
}
