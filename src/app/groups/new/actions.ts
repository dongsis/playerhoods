'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

interface GroupResult {
  id: string
  name: string
  description: string | null
  boundary_keeper_id: string
  created_by: string
  created_at: string
}

export async function createGroupAction(input: { name: string; description?: string }): Promise<GroupResult> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr) throw userErr
  if (!user) throw new Error('not_authenticated')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('rpc_group_create', {
    p_name: input.name.trim(),
    p_description: (input.description ?? '').trim() || null,
  })

  console.log('[createGroupAction] RPC result:', JSON.stringify(data))

  if (error) throw error
  if (!data) throw new Error('No data returned from RPC')

  // RPC returns a groups row - ensure we return it as GroupResult
  const group = data as GroupResult
  if (!group.id) {
    throw new Error(`Invalid group data returned: ${JSON.stringify(data)}`)
  }

  return group
}
