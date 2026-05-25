import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type RpcClient = SupabaseClient<Database> & {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export async function handleInboundSms(
  supabase: SupabaseClient<Database>,
  input: { from: string | null; body: string | null },
): Promise<string> {
  const from = input.from?.trim()
  const body = input.body?.trim()

  if (!from || !body) {
    return 'Reply YES to join, NO to decline, or DETAILS for the match link.'
  }

  const { data, error } = await (supabase as unknown as RpcClient).rpc('rpc_sms_reply_handle', {
    p_from_phone: from,
    p_body: body,
  })

  if (error) {
    console.error('[sms] inbound handler failed:', error)
    return 'We could not process that reply. Reply YES to join, NO to decline, or DETAILS for the match link.'
  }

  return typeof data === 'string' ? data : 'Reply YES to join, NO to decline, or DETAILS for the match link.'
}
