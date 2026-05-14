import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type UserSaveRequest = {
  request_id: string
  requester_user_id: string
  requester_display_name: string
  requester_avatar_url: string | null
  status: string
  created_at: string
}

export async function getUserSaveRequests(supabase: Client): Promise<UserSaveRequest[]> {
  const { data, error } = await supabase.rpc('rpc_user_save_request_list')
  if (error) throw error
  return (data ?? []) as UserSaveRequest[]
}

export async function respondToUserSaveRequest(
  supabase: Client,
  requestId: string,
  allow: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_user_save_request_respond', {
    p_request_id: requestId,
    p_allow: allow,
  })
  if (error) throw error
}
