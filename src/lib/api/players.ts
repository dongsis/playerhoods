import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Venue, Group } from '@/lib/types/database'
import { listMyPendingGroupInvites, type MyPendingGroupInvite } from '@/lib/api/groups'

type Client = SupabaseClient<Database>

export type VenueMember = { userId: string; handle: string }

export type VenueWithMembers = {
  venue: Venue
  members: VenueMember[]
}

export type GroupMemberRow = { userId: string; displayName: string; status: 'active' | 'pending' }

export type GroupWithMembers = {
  group: Group
  members: GroupMemberRow[]
}

// Re-export the canonical pending-invite shape from groups API
export type PendingGroupInvite = MyPendingGroupInvite

export type PlayersData = {
  venues: VenueWithMembers[]
  groups: GroupWithMembers[]
  noVenue: { id: string; display_name: string }[]
  pendingGroupInvites: PendingGroupInvite[]
  proxyPendingCount: number
}

/**
 * Returns all platform players grouped by venue and by group.
 * Users with no venue identity appear in noVenue list.
 * 5 parallel queries merged in JS — no nested WHERE.
 */
export async function getAllPlayersGroupedByVenue(
  supabase: Client,
  userId: string,
): Promise<PlayersData> {
  const [identitiesRes, venuesRes, profilesRes, groupsRes, groupMembersRes, peopleRes] = await Promise.all([
    supabase
      .from('venue_identities')
      .select('user_id, venue_id, venue_handle')
      .order('venue_handle', { ascending: true }),
    supabase
      .from('venues')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('profile_display')
      .select('id, display_name')
      .order('display_name', { ascending: true }),
    supabase
      .from('groups')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('group_members')
      .select('group_id, user_id, status, accepted_at, removed_at')
      .eq('status', 'active')
      .not('accepted_at', 'is', null)
      .is('removed_at', null),
    supabase
      .from('people')
      .select('person_id')
      .eq('linked_user_id', userId)
      .maybeSingle(),
  ])

  const identities = (identitiesRes.data ?? []) as {
    user_id: string
    venue_id: string
    venue_handle: string
  }[]
  const venues = (venuesRes.data ?? []) as Venue[]
  const profiles = (profilesRes.data ?? []) as { id: string; display_name: string }[]
  const groups = (groupsRes.data ?? []) as Group[]
  const groupMembers = (groupMembersRes.data ?? []) as {
    group_id: string
    user_id: string
    status: 'active'
    accepted_at: string
    removed_at: string | null
  }[]
  const myPersonId = (peopleRes.data as { person_id: string } | null)?.person_id ?? null

  // Group identity rows by venue_id
  const membersByVenue = new Map<string, VenueMember[]>()
  const usersWithVenue = new Set<string>()
  for (const row of identities) {
    usersWithVenue.add(row.user_id)
    const list = membersByVenue.get(row.venue_id) ?? []
    list.push({ userId: row.user_id, handle: row.venue_handle })
    membersByVenue.set(row.venue_id, list)
  }

  // Build VenueWithMembers list in venue name order
  const venuesResult: VenueWithMembers[] = []
  for (const venue of venues) {
    const members = membersByVenue.get(venue.id)
    if (members && members.length > 0) {
      venuesResult.push({ venue, members })
    }
  }

  // Users not in any venue
  const noVenue = profiles.filter(p => !usersWithVenue.has(p.id))

  // Build profile display name map
  const profileMap = new Map(profiles.map(p => [p.id, p.display_name]))

  // Group group_members rows by group_id (only active, non-removed members)
  const membersByGroup = new Map<string, GroupMemberRow[]>()
  for (const row of groupMembers) {
    const list = membersByGroup.get(row.group_id) ?? []
    list.push({
      userId: row.user_id,
      displayName: profileMap.get(row.user_id) ?? '',
      status: row.status,
    })
    membersByGroup.set(row.group_id, list)
  }

  // Resolve pending group invites via helper (self-scope, pending+invited+not-removed)
  const pendingGroupInvites = await listMyPendingGroupInvites(supabase, userId)
  const { count: proxyPendingCount } = myPersonId
    ? await supabase
        .from('person_match_proxies')
        .select('binding_id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('principal_person_id', myPersonId)
    : { count: 0 }

  // Build GroupWithMembers list in group name order, excluding pending-invite groups
  // (those are surfaced as banners via pendingGroupInvites, not in the roster list)
  const pendingInviteGroupIds = new Set(pendingGroupInvites.map(inv => inv.groupId))
  const groupsResult: GroupWithMembers[] = []
  for (const group of groups) {
    if (pendingInviteGroupIds.has(group.id)) continue
    const members = membersByGroup.get(group.id) ?? []
    groupsResult.push({ group, members })
  }

  return {
    venues: venuesResult,
    groups: groupsResult,
    noVenue,
    pendingGroupInvites,
    proxyPendingCount: proxyPendingCount ?? 0,
  }
}
