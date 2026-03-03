import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Group, GroupMember, GroupMemberWithProfile, ProfileDisplay } from '@/lib/types/database'

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

  // Then get display names for all user_ids via public view
  const userIds = members.map(m => m.user_id)
  const { data: profilesData, error: profilesError } = await supabase
    .from('profile_display')
    .select('*')
    .in('id', userIds)

  if (profilesError) throw profilesError

  // Join them manually
  const profiles = (profilesData || []) as ProfileDisplay[]
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
 * Accept a pending group invite via RPC (SECURITY DEFINER),
 * avoids coupling to client-side RLS update policies.
 */
export async function acceptGroupInvite(supabase: Client, groupId: string) {
  const { error } = await supabase.rpc('rpc_group_accept_invite', {
    p_group_id: groupId,
  })
  if (error) throw error
}


/** Leave a group. Boundary keeper cannot leave. */
export async function leaveGroup(supabase: Client, groupId: string) {
  const { error } = await supabase.rpc('rpc_group_leave', {
    p_group_id: groupId,
  })
  if (error) throw error
}

// Group creation via RPC (SECURITY DEFINER): creates group + adds creator as active member
// Direct INSERT fails because the SELECT RLS policy (is_group_member_any) evaluates false
// on the RETURNING clause before any group_members row exists.
export async function createGroup(
  supabase: Client,
  data: { name: string; description?: string }
) {
  const { data: group, error } = await supabase.rpc('rpc_group_create', {
    p_name: data.name.trim(),
    p_description: (data.description ?? '').trim() || null,
  })

  if (error) throw error
  return group as Group
}

/**
 * All users who can be invited to a group (not already an active/pending member).
 * Returns sorted list of { id, display_name }.
 */
export async function getInvitableUsers(
  supabase: Client,
  groupId: string,
): Promise<{ id: string; display_name: string }[]> {
  const [membersRes, usersRes] = await Promise.all([
    supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .neq('status', 'removed'),
    supabase
      .from('profile_display')
      .select('id, display_name')
      .order('display_name', { ascending: true }),
  ])

  const existingIds = new Set((membersRes.data ?? []).map(m => m.user_id))
  return ((usersRes.data ?? []) as { id: string; display_name: string }[])
    .filter(u => !existingIds.has(u.id))
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
