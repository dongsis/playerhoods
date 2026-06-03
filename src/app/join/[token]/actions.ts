'use server'

import { redirect } from 'next/navigation'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import { drainQueuedNotificationDeliveries } from '@/lib/notifications/workers/process-queued-notification-deliveries'

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
  const supabase = createSupabasePublicServerClient()
  let notice = 'check-email'

  if (!email && !phone) {
    redirectToSignup(token, { error: 'contact-required' })
  }

  if (!email && phone) {
    redirectToSignup(token, { error: 'sms-coming-next' })
  }

  try {
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
    if (status === 'already_verified') {
      notice = 'already-submitted'
    }
    if (verificationRequired) {
      await drainQueuedNotificationDeliveries(supabase, {
        batchSize: 5,
        maxBatches: 2,
        templateType: 'public_match_signup_verification',
        channel: 'email',
      }).catch((deliveryError) => {
        console.error('[public-signup] verification delivery drain failed:', deliveryError)
      })
    }
  } catch (error) {
    redirectToSignup(token, { error: getSignupErrorCode(error) })
  }

  redirectToSignup(token, { notice })
}
