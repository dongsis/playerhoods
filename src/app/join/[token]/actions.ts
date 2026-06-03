'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { sendPublicMatchSignupVerificationEmail } from '@/lib/notifications/workers/process-queued-notification-deliveries'

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

  if (message.includes('display_name_required')) return 'name-required'
  if (message.includes('email_required')) return 'contact-required'
  if (message.includes('email_invalid')) return 'email-invalid'
  if (message.includes('signup_link_not_found')) return 'link-not-found'
  if (message.includes('match_not_active')) return 'match-not-active'
  return 'failed'
}

function redirectToSignup(token: string, params: Record<string, string>) {
  const query = new URLSearchParams(params)
  redirect(`/join/${encodeURIComponent(token)}?${query.toString()}`)
}

export async function startPublicMatchSignupAction(token: string, formData: FormData): Promise<void> {
  const displayName = String(formData.get('display_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const marketingOptIn = formData.get('marketing_email_opt_in') === 'on'
  let notice = 'check-email'

  if (!email && !phone) {
    redirectToSignup(token, { error: 'contact-required' })
  }

  if (!email && phone) {
    redirectToSignup(token, { error: 'sms-coming-next' })
  }

  try {
    const supabase = createPublicSignupMutationClient()
    const { data, error } = await supabase.rpc('rpc_public_match_signup_start', {
      p_public_token: token,
      p_display_name: displayName,
      p_email: email,
      p_phone: phone || null,
      p_marketing_email_opt_in: marketingOptIn,
    })
    if (error) throw error
    const status = Array.isArray(data) ? data[0]?.status : null
    const verificationRequired = Array.isArray(data) ? data[0]?.verification_required === true : false
    const signup = Array.isArray(data) ? data[0] : null
    if (status === 'already_verified') {
      notice = 'already-submitted'
    }
    if (
      verificationRequired &&
      signup?.email_normalized &&
      signup?.verification_token
    ) {
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
      if (!deliveryResult.ok) {
        console.error('[public-signup] verification email send failed')
      }
      const { error: deliveryAuditError } = await supabase.rpc('rpc_public_match_signup_record_delivery_result', {
        p_signup_id: signup.signup_id,
        p_delivery_status: deliveryResult.ok ? 'sent' : 'failed',
        p_error: deliveryResult.ok ? null : 'send_failed',
      })
      if (deliveryAuditError) {
        console.error('[public-signup] verification email delivery audit failed:', deliveryAuditError.message)
      }
    }
  } catch (error) {
    redirectToSignup(token, { error: getSignupErrorCode(error) })
  }

  redirectToSignup(token, { notice })
}
