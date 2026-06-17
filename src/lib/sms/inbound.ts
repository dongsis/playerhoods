import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type RpcClient = SupabaseClient<Database> & {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

const GENERIC_SMS_REPLY_HELP =
  'Reply with the command from your PlayerHoods text. Private invites use YES or NO, public join texts use JOIN or NO, confirmed matches use OUT, and DETAILS returns the match link.'

export async function handleInboundSms(
  supabase: SupabaseClient<Database>,
  input: { from: string | null; body: string | null },
): Promise<string> {
  const from = input.from?.trim()
  const body = input.body?.trim()

  if (!from || !body) {
    return GENERIC_SMS_REPLY_HELP
  }

  const { data, error } = await (supabase as unknown as RpcClient).rpc('rpc_sms_reply_handle', {
    p_from_phone: from,
    p_body: body,
  })

  if (error) {
    console.error('[sms] inbound handler failed:', error)
    return `We could not process that reply. ${GENERIC_SMS_REPLY_HELP}`
  }

  return typeof data === 'string'
    ? data
    : GENERIC_SMS_REPLY_HELP
}
