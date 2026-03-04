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
  // First get members: only active, non-removed rows count as "joined"
  const { data: membersData, error: membersError } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
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

// ---------------------------------------------------------------------------
// Pending group invites (self scope)
// ---------------------------------------------------------------------------

export type MyPendingGroupInvite = {
  groupId: string
  groupName: string
  createdAt: string | null
  invitedBy: string | null
  invitedByName: string | null
}

/**
 * List the caller's pending group invites (status=pending, invited, not accepted/removed).
 * RLS ensures only auth.uid() rows are visible.
 */
export async function listMyPendingGroupInvites(
  supabase: Client,
  userId: string,
): Promise<MyPendingGroupInvite[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, created_at, invited_by')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('join_method', 'invited')
    .is('accepted_at', null)
    .is('removed_at', null)

  if (error) throw error

  const rows = (data ?? []) as {
    group_id: string
    created_at: string | null
    invited_by: string | null
  }[]

  if (rows.length === 0) return []

  // Fetch basic group info for the invited group_ids
  const groupIds = Array.from(new Set(rows.map(r => r.group_id)))
  const { data: groupsData, error: groupsError } = await supabase
    .from('groups')
    .select('id, name')
    .in('id', groupIds)

  if (groupsError) throw groupsError

  const groupNameMap = new Map<string, string>(
    ((groupsData ?? []) as { id: string; name: string }[]).map(g => [g.id, g.name])
  )

  // Fetch inviter display names (optional)
  const inviterIds = Array.from(
    new Set(rows.map(r => r.invited_by).filter((id): id is string => !!id))
  )
  let inviterNameMap = new Map<string, string>()
  if (inviterIds.length > 0) {
    const { data: inviterData, error: inviterError } = await supabase
      .from('profile_display')
      .select('id, display_name')
      .in('id', inviterIds)

    if (inviterError) throw inviterError

    inviterNameMap = new Map(
      ((inviterData ?? []) as { id: string; display_name: string }[]).map(p => [
        p.id,
        p.display_name,
      ])
    )
  }

  // Deduplicate by group_id; keep the earliest invite we saw for each group
  const byGroup = new Map<
    string,
    { createdAt: string | null; invitedBy: string | null }
  >()
  for (const row of rows) {
    if (!byGroup.has(row.group_id)) {
      byGroup.set(row.group_id, { createdAt: row.created_at, invitedBy: row.invited_by })
    }
  }

  const result: MyPendingGroupInvite[] = []
  for (const [groupId, meta] of byGroup.entries()) {
    result.push({
      groupId,
      groupName: groupNameMap.get(groupId) ?? groupId,
      createdAt: meta.createdAt,
      invitedBy: meta.invitedBy,
      invitedByName: meta.invitedBy ? inviterNameMap.get(meta.invitedBy) ?? null : null,
    })
  }

  // Sort newest first (optional, but stable for UI)
  result.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return result
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


/** Reject a pending group invite (invitee declines). */
export async function rejectGroupInvite(supabase: Client, groupId: string) {
  const { error } = await supabase.rpc('rpc_group_reject_invite', {
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

/** Boundary keeper only: update group name and optional description. */
export async function updateGroup(
  supabase: Client,
  groupId: string,
  data: { name: string; description?: string | null }
) {
  const { error } = await supabase.rpc('rpc_group_update', {
    p_group_id: groupId,
    p_name: data.name.trim(),
    p_description: data.description != null ? String(data.description).trim() || null : null,
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
