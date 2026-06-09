'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

function redirectToSmsJoin(token: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params)
  redirect(`/j/${encodeURIComponent(token)}?${query.toString()}`)
}

function getSmsJoinErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('sms_token_invalid')) return 'invalid'
  if (message.includes('sms_intent_not_found')) return 'not-found'
  if (message.includes('sms_intent_not_confirmable')) return 'not-available'
  if (message.includes('match_not_active')) return 'match-not-active'
  return 'failed'
}

export async function requestPublicJoinSmsSpotAction(token: string): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase.rpc('rpc_public_match_signup_confirm_sms', {
      p_sms_token: token,
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : null
    if (result?.status === 'expired') {
      redirectToSmsJoin(token, { error: 'expired' })
    }
  } catch (error) {
    console.error('[public-join-sms] confirm failed', {
      safe_error_code: getSmsJoinErrorCode(error),
      has_error: true,
    })
    redirectToSmsJoin(token, { error: getSmsJoinErrorCode(error) })
  }

  redirectToSmsJoin(token, { notice: 'request-sent' })
}

export async function declinePublicJoinSmsSpotAction(token: string): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase.rpc('rpc_public_match_signup_decline_sms', {
      p_sms_token: token,
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : null
    if (result?.status === 'expired') {
      redirectToSmsJoin(token, { error: 'expired' })
    }
  } catch (error) {
    console.error('[public-join-sms] decline failed', {
      safe_error_code: getSmsJoinErrorCode(error),
      has_error: true,
    })
    redirectToSmsJoin(token, { error: getSmsJoinErrorCode(error) })
  }

  redirectToSmsJoin(token, { notice: 'declined' })
}
