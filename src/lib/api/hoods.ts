import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, GuestSport, UserSport } from '@/lib/types/database'
import {
  getGroupContacts,
  type GroupContactWithDisplay,
} from '@/lib/api/groups'
import {
  getPublicPlayerProfile,
  type PublicPlayerProfile,
} from '@/lib/api/player-profiles'

type Client = SupabaseClient<Database>

export type GuestLookupRow = {
  guest_id: string
  person_id: string | null
  display_name: string
  avatar_url: string | null
  primary_sport_id: number | null
  linked_user_id?: string | null
}

export async function fetchPublicPlayerProfiles(
  supabase: Client,
  userIds: string[],
  context = 'passive_recommendation',
): Promise<Map<string, PublicPlayerProfile | null>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  const result = new Map<string, PublicPlayerProfile | null>()

  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      try {
        const profile = await getPublicPlayerProfile(supabase, userId, context)
        result.set(userId, profile)
      } catch (error) {
        console.error(`[hoods] failed to load public profile ${userId}:`, error)
        result.set(userId, null)
      }
    }),
  )

  return result
}

export async function fetchGroupContactsByGroup(
  supabase: Client,
  groupIds: string[],
): Promise<Map<string, GroupContactWithDisplay[]>> {
  const uniqueGroupIds = Array.from(new Set(groupIds.filter(Boolean)))
  const entries: Array<[string, GroupContactWithDisplay[]]> = await Promise.all(
    uniqueGroupIds.map(async (groupId) => {
      try {
        const contacts = await getGroupContacts(supabase, groupId)
        return [groupId, contacts]
      } catch (error) {
        console.error(`[hoods] failed to load group contacts ${groupId}:`, error)
        return [groupId, []]
      }
    }),
  )

  return new Map(entries)
}

export async function fetchGuestLookupMap(
  supabase: Client,
  guestIds: string[],
): Promise<Map<string, GuestLookupRow>> {
  const uniqueGuestIds = Array.from(new Set(guestIds.filter(Boolean)))
  if (uniqueGuestIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase.rpc('rpc_contact_player_lookup_v2', {
    p_guest_ids: uniqueGuestIds,
  })
  if (error) throw error

  return new Map(
    ((data ?? []) as GuestLookupRow[]).map((row) => [row.guest_id, row]),
  )
}

export async function fetchGuestSportsMap(
  supabase: Client,
  guestIds: string[],
): Promise<Map<string, number[]>> {
  const uniqueGuestIds = Array.from(new Set(guestIds.filter(Boolean)))
  if (uniqueGuestIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('guest_sports')
    .select('*')
    .in('guest_id', uniqueGuestIds)

  if (error) {
    console.error('[hoods] failed to load guest sports:', error)
    return new Map()
  }

  const result = new Map<string, number[]>()
  for (const row of (data ?? []) as GuestSport[]) {
    const current = result.get(row.guest_id) ?? []
    current.push(row.sport_id)
    result.set(row.guest_id, current)
  }

  return result
}

export async function fetchUserSportsMap(
  supabase: Client,
  userIds: string[],
): Promise<Map<string, number[]>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  if (uniqueUserIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('user_sports')
    .select('*')
    .in('user_id', uniqueUserIds)

  if (error) {
    console.error('[hoods] failed to load user sports:', error)
    return new Map()
  }

  const result = new Map<string, number[]>()
  for (const row of (data ?? []) as UserSport[]) {
    const current = result.get(row.user_id) ?? []
    current.push(row.sport_id)
    result.set(row.user_id, current)
  }

  return result
}
