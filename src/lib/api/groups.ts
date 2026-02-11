import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Group, GroupMember, GroupMemberWithProfile, Profile } from '@/lib/types/database'

type Client = SupabaseClient<Database>

// Read operations (respect RLS)

export async function getGroups(supabase: Client) {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Group[]
}

export async function getGroup(supabase: Client, groupId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single()

  if (error) throw error
  return data as Group
}

export async function getGroupMembers(supabase: Client, groupId: string): Promise<GroupMemberWithProfile[]> {
  // First get members
  const { data: membersData, error: membersError } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })

  if (membersError) throw membersError

  const members = (membersData || []) as GroupMember[]
  if (members.length === 0) return []

  // Then get profiles for all user_ids
  const userIds = members.map(m => m.user_id)
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', userIds)

  if (profilesError) throw profilesError

  // Join them manually
  const profiles = (profilesData || []) as Profile[]
  const profileMap = new Map(profiles.map(p => [p.id, p]))

  const result: GroupMemberWithProfile[] = members.map(member => ({
    ...member,
    profile: profileMap.get(member.user_id) || null,
  }))

  return result
}

export async function getMyGroupMembership(supabase: Client, groupId: string, userId: string) {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data as GroupMember | null
}

// Write operations (via RPC only)

/**
 * Accept a pending group invite.
 * RPC: rpc_group_accept_invite
 * - Caller must have pending membership
 * - Transitions status: pending -> active
 */
export async function acceptGroupInvite(supabase: Client, groupId: string) {
  const { data, error } = await supabase.rpc('rpc_group_accept_invite', {
    p_group_id: groupId,
  })

  console.log('acceptGroupInvite response:', { data, error })
  if (error) throw error
}

/** Leave a group. Boundary keeper cannot leave. */
export async function leaveGroup(supabase: Client, groupId: string) {
  const { error } = await supabase.rpc('rpc_group_leave', {
    p_group_id: groupId,
  })
  if (error) throw error
}

// Group creation (direct insert, allowed by RLS for authenticated users)
export async function createGroup(
  supabase: Client,
  data: { name: string; description?: string }
) {
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw authErr

  const user = authData?.user
  if (!user) throw new Error('not_authenticated')

  const payload = {
    name: data.name.trim(),
    description: (data.description ?? '').trim() || null,
    boundary_keeper_id: user.id,
    created_by: user.id,
  }

  const { data: group, error } = await supabase
    .from('groups')
    .insert(payload)
    .select('id, name, description, boundary_keeper_id, created_by, created_at')
    .single()

  if (error) throw error
  return group as Group
}

/** Invite user to group. Handles re-invite of removed members. */
export async function inviteUserToGroup(
  supabase: Client,
  groupId: string,
  userId: string
) {
  const { error } = await supabase.rpc('rpc_group_invite_user', {
    p_group_id: groupId,
    p_user_id: userId,
  })
  if (error) throw error
}
