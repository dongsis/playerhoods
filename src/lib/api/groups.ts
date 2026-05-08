import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Group,
  GroupContact,
  GroupJoinRequest,
  GroupMessage,
  GroupResource,
  GroupResourceTag,
  GroupMember,
  GroupMemberWithProfile,
  ProfileDisplay,
} from '@/lib/types/database'

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
  primarySportId: number | null
  createdAt: string | null
  requestId: string | null
  invitedBy: string | null
  invitedByName: string | null
  pendingKind: 'invite' | 'approval_request'
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
  const { data: requestData, error: requestError } = await supabase.rpc('rpc_group_join_requests_for_user')
  if (requestError) throw requestError

  const requestRows = (requestData ?? []) as {
    id: string
    group_id: string
    group_name_snapshot: string
    sport_id: number | null
    sport_name_snapshot: string | null
    requester_user_id: string
    requester_display_name_snapshot: string | null
    created_at: string
    note: string | null
    status: GroupJoinRequest['status']
  }[]

  const groupIds = Array.from(new Set(rows.map(r => r.group_id)))
  let groupMetaMap = new Map<string, { name: string; primarySportId: number | null }>()
  if (groupIds.length > 0) {
    const { data: groupsData, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, primary_sport_id')
      .in('id', groupIds)

    if (groupsError) throw groupsError

    groupMetaMap = new Map<string, { name: string; primarySportId: number | null }>(
      ((groupsData ?? []) as { id: string; name: string; primary_sport_id: number | null }[]).map((group) => [
        group.id,
        { name: group.name, primarySportId: group.primary_sport_id },
      ]),
    )
  }

  const inviterIds = Array.from(new Set([
    ...rows.map((row) => row.invited_by).filter((id): id is string => !!id),
    ...requestRows.map((row) => row.requester_user_id).filter((id): id is string => !!id),
  ]))

  let inviterNameMap = new Map<string, string>()
  if (inviterIds.length > 0) {
    const { data: inviterData, error: inviterError } = await supabase
      .from('profile_display')
      .select('id, display_name')
      .in('id', inviterIds)

    if (inviterError) throw inviterError

    inviterNameMap = new Map(
      ((inviterData ?? []) as { id: string; display_name: string }[]).map((profile) => [
        profile.id,
        profile.display_name,
      ]),
    )
  }

  const result: MyPendingGroupInvite[] = []

  for (const row of rows) {
    result.push({
      groupId: row.group_id,
      groupName: groupMetaMap.get(row.group_id)?.name ?? row.group_id,
      primarySportId: groupMetaMap.get(row.group_id)?.primarySportId ?? null,
      createdAt: row.created_at,
      requestId: null,
      invitedBy: row.invited_by,
      invitedByName: row.invited_by ? inviterNameMap.get(row.invited_by) ?? null : null,
      pendingKind: 'invite',
    })
  }

  for (const row of requestRows) {
    result.push({
      groupId: row.group_id,
      groupName: row.group_name_snapshot,
      primarySportId: row.sport_id,
      createdAt: row.created_at,
      requestId: row.id,
      invitedBy: row.requester_user_id,
      invitedByName: row.requester_display_name_snapshot ?? inviterNameMap.get(row.requester_user_id) ?? null,
      pendingKind: 'approval_request',
    })
  }

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
  data: {
    name: string
    description?: string | null
    primary_sport_id?: number | null
    venue_id?: string | null
    open_to_club_members?: boolean
    icon_key?: string | null
  }
) {
  const { error } = await supabase.rpc('rpc_group_update', {
    p_group_id: groupId,
    p_name: data.name.trim(),
    p_description: data.description != null ? String(data.description).trim() || null : null,
    p_primary_sport_id: data.primary_sport_id ?? null,
    p_venue_id: data.venue_id ?? null,
    p_open_to_club_members: data.open_to_club_members ?? null,
    p_icon_key: data.icon_key ?? null,
  })
  if (error) throw error
}

// Group creation via RPC (SECURITY DEFINER): creates group + adds creator as active member
// Direct INSERT fails because the SELECT RLS policy (is_group_member_any) evaluates false
// on the RETURNING clause before any group_members row exists.
export async function createGroup(
  supabase: Client,
  data: { name: string; description?: string; primary_sport_id?: number | null; venue_id?: string | null; icon_key?: string | null }
) {
  const { data: group, error } = await supabase.rpc('rpc_group_create', {
    p_name: data.name.trim(),
    p_description: (data.description ?? '').trim() || null,
    p_primary_sport_id: data.primary_sport_id ?? null,
    p_venue_id: data.venue_id ?? null,
    p_icon_key: data.icon_key ?? null,
  })

  if (error) throw error
  return group as Group
}

/**
 * Saved registered players who can be added to a group (not already active/pending).
 * This mirrors the registered-player scope used by match invite.
 */
export async function getInvitableUsers(
  supabase: Client,
  groupId: string,
): Promise<{ id: string; display_name: string }[]> {
  const [membersRes, pendingRequestsRes, usersRes] = await Promise.all([
    supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .neq('status', 'removed'),
    supabase
      .from('group_join_requests')
      .select('target_user_id')
      .eq('group_id', groupId)
      .eq('status', 'pending'),
    supabase.rpc('rpc_invite_circle_list'),
  ])

  const existingIds = new Set((membersRes.data ?? []).map(m => m.user_id))
  for (const request of ((pendingRequestsRes.data ?? []) as { target_user_id: string }[])) {
    existingIds.add(request.target_user_id)
  }

  return ((usersRes.data ?? []) as {
    target_user_id: string
    target_display_name: string | null
  }[])
    .filter(u => !existingIds.has(u.target_user_id))
    .map((u) => ({
      id: u.target_user_id,
      display_name: u.target_display_name ?? 'Player',
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
}

/**
 * Saved registered players available during new group creation.
 * This mirrors match invite's registered-player scope before a group exists.
 */
export async function getSavedRegisteredPlayerCandidates(
  supabase: Client,
): Promise<{ id: string; display_name: string }[]> {
  const { data, error } = await supabase.rpc('rpc_invite_circle_list')
  if (error) throw error

  return ((data ?? []) as {
    target_user_id: string
    target_display_name: string | null
  }[])
    .map((row) => ({
      id: row.target_user_id,
      display_name: row.target_display_name ?? 'Player',
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
}

export type GroupAddMemberResult = {
  result: 'already_member' | 'already_pending' | 'direct_add_success' | 'approval_required_request_created' | 'not_allowed'
  group_id: string
  target_user_id: string
  request_id: string | null
  message: string
}

export async function addMemberToGroup(
  supabase: Client,
  groupId: string,
  userId: string,
  note?: string,
): Promise<GroupAddMemberResult> {
  const { data, error } = await supabase.rpc('rpc_group_add_member', {
    p_group_id: groupId,
    p_target_user_id: userId,
    p_note: note ?? null,
  })
  if (error) throw error
  const row = (data as GroupAddMemberResult[] | null)?.[0]
  if (!row) throw new Error('Failed to add member to Shared Group')
  return row
}

/** Backward-compatible alias for older callers still using the legacy name. */
export async function inviteUserToGroup(
  supabase: Client,
  groupId: string,
  userId: string,
) {
  await addMemberToGroup(supabase, groupId, userId)
}

export type GroupJoinRequestSummary = GroupJoinRequest & {
  requester_name: string | null
}

export async function listGroupJoinRequests(
  supabase: Client,
  groupId: string,
): Promise<GroupJoinRequestSummary[]> {
  const { data, error } = await supabase
    .from('group_join_requests')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as GroupJoinRequest[]
  if (rows.length === 0) return []

  const requesterIds = Array.from(new Set(rows.map((row) => row.requester_user_id)))
  const { data: requesterProfiles, error: requesterError } = await supabase
    .from('profile_display')
    .select('id, display_name')
    .in('id', requesterIds)

  if (requesterError) throw requesterError

  const requesterMap = new Map(
    ((requesterProfiles ?? []) as { id: string; display_name: string }[]).map((profile) => [
      profile.id,
      profile.display_name,
    ]),
  )

  return rows.map((row) => ({
    ...row,
    requester_name: row.requester_display_name_snapshot ?? requesterMap.get(row.requester_user_id) ?? null,
  }))
}

export async function acceptGroupJoinRequest(supabase: Client, requestId: string) {
  const { error } = await supabase.rpc('rpc_group_join_request_accept', {
    p_request_id: requestId,
  })
  if (error) throw error
}

export async function declineGroupJoinRequest(supabase: Client, requestId: string) {
  const { error } = await supabase.rpc('rpc_group_join_request_decline', {
    p_request_id: requestId,
  })
  if (error) throw error
}

export type GroupContactWithDisplay = {
  group_contact_id: string
  guest_id: string
  person_id: string
  display_name: string
  avatar_url: string | null
  gender?: string | null
  membership_type: string
  created_by: string
  created_at: string
  created_by_name?: string | null
  saved_by_viewer?: boolean
}

export async function addContactPlayerToGroup(
  supabase: Client,
  groupId: string,
  guestId: string,
) {
  const { data, error } = await supabase.rpc('rpc_group_add_contact_player', {
    p_group_id: groupId,
    p_guest_id: guestId,
  })
  if (error) throw error
  return data as GroupContact
}

export async function getGroupContacts(
  supabase: Client,
  groupId: string,
): Promise<GroupContactWithDisplay[]> {
  const { data, error } = await supabase.rpc('rpc_group_contact_list', {
    p_group_id: groupId,
  })
  if (error) throw error
  const contacts = (data ?? []) as GroupContactWithDisplay[]
  if (contacts.length === 0) return []

  const creatorIds = Array.from(new Set(contacts.map((contact) => contact.created_by)))
  const personIds = Array.from(new Set(contacts.map((contact) => contact.person_id)))

  const [creatorProfilesRes, savedRelationshipsRes] = await Promise.all([
    creatorIds.length > 0
      ? supabase.from('profile_display').select('id, display_name').in('id', creatorIds)
      : Promise.resolve({ data: [], error: null }),
    personIds.length > 0
      ? supabase
          .from('person_relationships')
          .select('person_id')
          .eq('relationship_type', 'saved')
          .in('person_id', personIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if ('error' in creatorProfilesRes && creatorProfilesRes.error) throw creatorProfilesRes.error
  if ('error' in savedRelationshipsRes && savedRelationshipsRes.error) throw savedRelationshipsRes.error

  const creatorNameMap = new Map(
    (((creatorProfilesRes.data ?? []) as { id: string; display_name: string | null }[]))
      .map((profile) => [profile.id, profile.display_name ?? null]),
  )
  const savedPersonIds = new Set(
    (((savedRelationshipsRes.data ?? []) as { person_id: string }[]))
      .map((relationship) => relationship.person_id),
  )

  return contacts.map((contact) => ({
    ...contact,
    created_by_name: creatorNameMap.get(contact.created_by) ?? null,
    saved_by_viewer: savedPersonIds.has(contact.person_id),
  }))
}

export type GroupMessageEnriched = GroupMessage & {
  author_name: string
  author_avatar_url: string | null
  is_keeper_author: boolean
}

export type GroupResourceEnriched = GroupResource & {
  owner_name: string | null
}

function ensureGroupResourceTitle(title: string) {
  const trimmed = title.trim()
  if (!trimmed) {
    throw new Error('resource_title_required')
  }
  if (trimmed.length > 120) {
    throw new Error('resource_title_too_long')
  }
  return trimmed
}

function ensureGroupResourceTag(tag: GroupResourceTag): GroupResourceTag {
  const validTags = new Set<GroupResourceTag>(['Rules', 'Fees', 'Schedule', 'Venue', 'Photo', 'Other'])
  if (!validTags.has(tag)) {
    throw new Error('invalid_resource_tag')
  }
  return tag
}

async function getGroupResourceCounts(supabase: Client, groupId: string) {
  const { data, error } = await supabase
    .from('group_resources')
    .select('id, is_pinned, archived_at')
    .eq('group_id', groupId)
    .is('deleted_at', null)

  if (error) throw error

  const rows = (data ?? []) as Pick<GroupResource, 'id' | 'is_pinned' | 'archived_at'>[]
  return {
    activeCount: rows.filter((row) => row.archived_at == null).length,
    pinnedCount: rows.filter((row) => row.archived_at == null && row.is_pinned).length,
  }
}

export async function listGroupMessages(
  supabase: Client,
  groupId: string,
  keeperUserId: string | null,
): Promise<GroupMessageEnriched[]> {
  const { data, error } = await supabase
    .from('group_messages')
    .select('*')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw error

  const messages = (data ?? []) as GroupMessage[]
  if (messages.length === 0) return []

  const authorIds = Array.from(new Set(messages.map((message) => message.author_user_id)))
  const { data: profiles, error: profilesError } = await supabase
    .from('profile_display')
    .select('id, display_name, avatar_url')
    .in('id', authorIds)

  if (profilesError) throw profilesError

  const profileMap = new Map(
    ((profiles ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]).map((profile) => [
      profile.id,
      profile,
    ]),
  )

  return messages.map((message) => {
    const profile = profileMap.get(message.author_user_id)
    return {
      ...message,
      author_name: profile?.display_name?.trim() || 'Group member',
      author_avatar_url: profile?.avatar_url ?? null,
      is_keeper_author: keeperUserId != null && message.author_user_id === keeperUserId,
    }
  })
}

export async function postGroupMessage(
  supabase: Client,
  groupId: string,
  authorUserId: string,
  body: string,
): Promise<GroupMessage> {
  const trimmedBody = body.trim()
  if (!trimmedBody) {
    throw new Error('message_body_required')
  }

  const { data, error } = await supabase
    .from('group_messages')
    .insert({
      group_id: groupId,
      author_user_id: authorUserId,
      body: trimmedBody,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as GroupMessage
}

export async function listGroupResources(
  supabase: Client,
  groupId: string,
): Promise<GroupResourceEnriched[]> {
  await supabase.rpc('rpc_group_resources_archive_stale', {
    p_group_id: groupId,
  })

  const { data, error } = await supabase
    .from('group_resources')
    .select('*')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  const resources = (data ?? []) as GroupResource[]
  if (resources.length === 0) return []

  const ownerIds = Array.from(new Set(resources.map((resource) => resource.owner_user_id)))
  const { data: profiles, error: profilesError } = await supabase
    .from('profile_display')
    .select('id, display_name')
    .in('id', ownerIds)

  if (profilesError) throw profilesError

  const ownerNameMap = new Map(
    ((profiles ?? []) as { id: string; display_name: string | null }[]).map((profile) => [
      profile.id,
      profile.display_name ?? null,
    ]),
  )

  return resources.map((resource) => ({
    ...resource,
    owner_name: ownerNameMap.get(resource.owner_user_id) ?? null,
  }))
}

export async function createGroupLinkResource(
  supabase: Client,
  groupId: string,
  ownerUserId: string,
  data: {
    title: string
    tag: GroupResourceTag
    link_url: string
  },
): Promise<GroupResource> {
  const title = ensureGroupResourceTitle(data.title)
  const tag = ensureGroupResourceTag(data.tag)
  let linkUrl: string

  try {
    linkUrl = new URL(data.link_url.trim()).toString()
  } catch {
    throw new Error('invalid_resource_link')
  }

  const counts = await getGroupResourceCounts(supabase, groupId)
  if (counts.activeCount >= 15) {
    throw new Error('group_resource_limit_reached')
  }

  const { data: resource, error } = await supabase
    .from('group_resources')
    .insert({
      group_id: groupId,
      owner_user_id: ownerUserId,
      resource_type: 'link',
      title,
      tag,
      link_url: linkUrl,
    })
    .select('*')
    .single()

  if (error) throw error
  return resource as GroupResource
}

export async function createGroupFileResource(
  supabase: Client,
  groupId: string,
  ownerUserId: string,
  data: {
    title: string
    tag: GroupResourceTag
    storage_bucket: string
    storage_path: string
    public_url: string
    mime_type: string | null
    byte_size: number | null
  },
): Promise<GroupResource> {
  const title = ensureGroupResourceTitle(data.title)
  const tag = ensureGroupResourceTag(data.tag)

  const counts = await getGroupResourceCounts(supabase, groupId)
  if (counts.activeCount >= 15) {
    throw new Error('group_resource_limit_reached')
  }

  const { data: resource, error } = await supabase
    .from('group_resources')
    .insert({
      group_id: groupId,
      owner_user_id: ownerUserId,
      resource_type: 'file',
      title,
      tag,
      storage_bucket: data.storage_bucket,
      storage_path: data.storage_path,
      public_url: data.public_url,
      mime_type: data.mime_type,
      byte_size: data.byte_size,
    })
    .select('*')
    .single()

  if (error) throw error
  return resource as GroupResource
}

export async function setGroupResourcePinned(
  supabase: Client,
  resourceId: string,
  isPinned: boolean,
): Promise<GroupResource> {
  const { data: existing, error: existingError } = await supabase
    .from('group_resources')
    .select('*')
    .eq('id', resourceId)
    .is('deleted_at', null)
    .single()

  if (existingError) throw existingError

  const resource = existing as GroupResource
  if (resource.archived_at != null && isPinned) {
    throw new Error('cannot_pin_archived_resource')
  }

  if (isPinned) {
    const counts = await getGroupResourceCounts(supabase, resource.group_id)
    const nextPinnedCount = resource.is_pinned ? counts.pinnedCount : counts.pinnedCount + 1
    if (nextPinnedCount > 3) {
      throw new Error('group_pinned_resource_limit_reached')
    }
  }

  const { data, error } = await supabase
    .from('group_resources')
    .update({
      is_pinned: isPinned,
      pinned_at: isPinned ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    })
    .eq('id', resourceId)
    .select('*')
    .single()

  if (error) throw error
  return data as GroupResource
}

export async function setGroupResourceArchived(
  supabase: Client,
  resourceId: string,
  archived: boolean,
): Promise<GroupResource> {
  const nextValues: Partial<GroupResource> = {
    archived_at: archived ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  }
  if (archived) {
    nextValues.is_pinned = false
    nextValues.pinned_at = null
  }

  const { data, error } = await supabase
    .from('group_resources')
    .update(nextValues)
    .eq('id', resourceId)
    .select('*')
    .single()

  if (error) throw error
  return data as GroupResource
}

export async function deleteGroupResource(
  supabase: Client,
  resourceId: string,
): Promise<void> {
  const { error } = await supabase
    .from('group_resources')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_pinned: false,
      pinned_at: null,
    })
    .eq('id', resourceId)

  if (error) throw error
}
