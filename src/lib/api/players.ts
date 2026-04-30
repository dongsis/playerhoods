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
 * Venue grouping uses venue_user_relationships(member) as the canonical source.
 * The member label is always the player's display name.
 */
export async function getAllPlayersGroupedByVenue(
  supabase: Client,
  userId: string,
): Promise<PlayersData> {
  const [memberRelationshipsRes, venuesRes, profilesRes, groupsRes, groupMembersRes, peopleRes] = await Promise.all([
    supabase
      .from('venue_user_relationships')
      .select('user_id, venue_id')
      .eq('relationship_type', 'member')
      .order('created_at', { ascending: true }),
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
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile.display_name]))

  if (memberRelationshipsRes.error) throw memberRelationshipsRes.error

  const venueMemberships = ((memberRelationshipsRes.data ?? []) as { user_id: string; venue_id: string }[]).map((row) => ({
    user_id: row.user_id,
    venue_id: row.venue_id,
    label: profileMap.get(row.user_id) ?? 'Player',
  }))

  const membersByVenue = new Map<string, VenueMember[]>()
  const usersWithVenue = new Set<string>()
  for (const row of venueMemberships) {
    usersWithVenue.add(row.user_id)
    const list = membersByVenue.get(row.venue_id) ?? []
    list.push({ userId: row.user_id, handle: row.label || 'Player' })
    membersByVenue.set(row.venue_id, list)
  }

  const venuesResult: VenueWithMembers[] = []
  for (const venue of venues) {
    const members = membersByVenue.get(venue.id)
    if (members && members.length > 0) {
      venuesResult.push({ venue, members })
    }
  }

  const noVenue = profiles.filter((profile) => !usersWithVenue.has(profile.id))

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

  const pendingGroupInvites = await listMyPendingGroupInvites(supabase, userId)
  const { count: proxyPendingCount } = myPersonId
    ? await supabase
        .from('person_match_proxies')
        .select('binding_id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('principal_person_id', myPersonId)
    : { count: 0 }

  const pendingInviteGroupIds = new Set(pendingGroupInvites.map((invite) => invite.groupId))
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
