import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Club, Group } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type ClubMember = { userId: string; handle: string }

export type ClubWithMembers = {
  club: Club
  members: ClubMember[]
}

export type GroupMemberRow = { userId: string; displayName: string }

export type GroupWithMembers = {
  group: Group
  members: GroupMemberRow[]
}

export type PlayersData = {
  clubs: ClubWithMembers[]
  groups: GroupWithMembers[]
  noClub: { id: string; display_name: string }[]
}

/**
 * Returns all platform players grouped by club and by group.
 * Users with no club identity appear in noClub list.
 * 5 parallel queries merged in JS — no nested WHERE.
 */
export async function getAllPlayersGroupedByClub(supabase: Client): Promise<PlayersData> {
  const [identitiesRes, clubsRes, profilesRes, groupsRes, groupMembersRes] = await Promise.all([
    supabase
      .from('club_identities')
      .select('user_id, club_id, club_handle')
      .order('club_handle', { ascending: true }),
    supabase
      .from('clubs')
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
      .select('group_id, user_id')
      .eq('status', 'active'),
  ])

  const identities = (identitiesRes.data ?? []) as {
    user_id: string
    club_id: string
    club_handle: string
  }[]
  const clubs = (clubsRes.data ?? []) as Club[]
  const profiles = (profilesRes.data ?? []) as { id: string; display_name: string }[]
  const groups = (groupsRes.data ?? []) as Group[]
  const groupMembers = (groupMembersRes.data ?? []) as { group_id: string; user_id: string }[]

  // Build club map
  const clubMap = new Map(clubs.map(c => [c.id, c]))
  void clubMap // unused but kept for future use

  // Group identity rows by club_id
  const membersByClub = new Map<string, ClubMember[]>()
  const usersWithClub = new Set<string>()
  for (const row of identities) {
    usersWithClub.add(row.user_id)
    const list = membersByClub.get(row.club_id) ?? []
    list.push({ userId: row.user_id, handle: row.club_handle })
    membersByClub.set(row.club_id, list)
  }

  // Build ClubWithMembers list in club name order
  const clubsResult: ClubWithMembers[] = []
  for (const club of clubs) {
    const members = membersByClub.get(club.id)
    if (members && members.length > 0) {
      clubsResult.push({ club, members })
    }
  }

  // Users not in any club
  const noClub = profiles.filter(p => !usersWithClub.has(p.id))

  // Build profile display name map
  const profileMap = new Map(profiles.map(p => [p.id, p.display_name]))

  // Group group_members rows by group_id
  const membersByGroup = new Map<string, GroupMemberRow[]>()
  for (const row of groupMembers) {
    const list = membersByGroup.get(row.group_id) ?? []
    list.push({
      userId: row.user_id,
      displayName: profileMap.get(row.user_id) ?? '',
    })
    membersByGroup.set(row.group_id, list)
  }

  // Build GroupWithMembers list in group name order (only groups with members)
  const groupsResult: GroupWithMembers[] = []
  for (const group of groups) {
    const members = membersByGroup.get(group.id)
    if (members && members.length > 0) {
      groupsResult.push({ group, members })
    }
  }

  return { clubs: clubsResult, groups: groupsResult, noClub }
}
