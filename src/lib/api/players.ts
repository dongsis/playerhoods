import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Club } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type ClubMember = { userId: string; handle: string }

export type ClubWithMembers = {
  club: Club
  members: ClubMember[]
}

export type PlayersData = {
  clubs: ClubWithMembers[]
  noClub: { id: string; display_name: string }[]
}

/**
 * Returns all platform players grouped by club.
 * Users with no club identity appear in noClub list.
 * 3 parallel queries merged in JS — no nested WHERE.
 */
export async function getAllPlayersGroupedByClub(supabase: Client): Promise<PlayersData> {
  const [identitiesRes, clubsRes, profilesRes] = await Promise.all([
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
  ])

  const identities = (identitiesRes.data ?? []) as {
    user_id: string
    club_id: string
    club_handle: string
  }[]
  const clubs = (clubsRes.data ?? []) as Club[]
  const profiles = (profilesRes.data ?? []) as { id: string; display_name: string }[]

  // Build club map
  const clubMap = new Map(clubs.map(c => [c.id, c]))

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
  const result: ClubWithMembers[] = []
  for (const club of clubs) {
    const members = membersByClub.get(club.id)
    if (members && members.length > 0) {
      result.push({ club, members })
    }
  }

  // Users not in any club
  const noClub = profiles.filter(p => !usersWithClub.has(p.id))

  return { clubs: result, noClub }
}
