import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function formatInvitationToken(invitationId: string): string {
  const compact = invitationId.replace(/-/g, '').toLowerCase()
  return compact.length >= 12 ? compact.slice(0, 12) : invitationId
}

export async function resolveInvitationToken(
  supabase: SupabaseClient,
  token: string,
): Promise<string | null> {
  const normalized = token.trim()
  if (!normalized) return null
  if (UUID_PATTERN.test(normalized)) return normalized

  const rpcClient = supabase as SupabaseClient<any>
  const { data, error } = await rpcClient.rpc('rpc_email_invitation_resolve_token', {
    p_token: normalized,
  })
  if (error) throw error

  const rows = (data ?? []) as Array<{ invitation_id: string }>
  return rows[0]?.invitation_id ?? null
}
