import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

type RpcClient = {
  rpc: <T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message?: string } | null }>
}

function rpcClient(supabase: Client): RpcClient {
  return supabase as unknown as RpcClient
}

export type ContactIntroShare = {
  share_id: string
  direction: 'inbound' | 'outbound'
  status: 'pending' | 'saved' | 'dismissed' | 'revoked'
  sender_user_id: string
  sender_display_name: string | null
  recipient_user_id: string
  recipient_display_name: string | null
  person_id: string
  person_display_name: string | null
  person_avatar_url: string | null
  person_primary_sport_id: number | null
  optional_message: string | null
  already_saved: boolean
  created_at: string
  saved_at: string | null
  dismissed_at: string | null
  revoked_at: string | null
}

export async function getContactIntroShares(supabase: Client): Promise<ContactIntroShare[]> {
  const { data, error } = await rpcClient(supabase).rpc<ContactIntroShare[]>('rpc_contact_intro_share_list')
  if (error) throw error
  return data ?? []
}

export async function saveContactIntroShare(supabase: Client, shareId: string): Promise<void> {
  const { error } = await rpcClient(supabase).rpc('rpc_contact_intro_share_accept_or_save', {
    p_share_id: shareId,
  })
  if (error) throw error
}

export async function dismissContactIntroShare(supabase: Client, shareId: string): Promise<void> {
  const { error } = await rpcClient(supabase).rpc('rpc_contact_intro_share_dismiss', {
    p_share_id: shareId,
  })
  if (error) throw error
}
