import type { SupabaseClient } from '@supabase/supabase-js'

export async function getMyParticipantRow(
  userClient: SupabaseClient,
  matchId: string
) {
  // 依赖 RLS：用户应该能读到自己那条 mp（至少 status != removed）
  const { data, error } = await userClient
    .from('match_participants')
    .select('id,status,user_accepted_at,org_approved_at,org_approved_by,join_method')
    .eq('match_id', matchId)

  if (error) throw error
  if (!data || data.length === 0) throw new Error('No participant row visible to user (RLS or flow issue)')

  // 如果你一个 match 只允许该 user 一条 mp，就取第一条
  return data[0]
}
