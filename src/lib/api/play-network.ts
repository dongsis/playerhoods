/**
 * Phase 1 Play Network Core API
 * Venue Members discovery, Invite Circle, match admission targets/admit
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type InviteCircleSource =
  | 'manual'
  | 'venue_member'
  | 'group_member'
  | 'match_player'
  | 'played_with_auto'

export type ContactPlayerSaveSource =
  | 'manual'
  | 'direct_contact'
  | 'shared_match'
  | 'group_contact'

// ============================================================================
// Venue Members discovery
// ============================================================================

export type VenueMemberDiscoveryRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  venue_handle: string | null
}

export type VenueInvitableMemberRow = {
  user_id: string
  display_name: string | null
  venue_handle: string | null
}

/** Phase 1: Venue Members discovery. Caller must be club member. */
export async function getVenueMembersDiscovery(
  supabase: Client,
  venueId: string,
  search?: string | null
): Promise<VenueMemberDiscoveryRow[]> {
  const { data, error } = await supabase.rpc('rpc_venue_members_discovery', {
    p_venue_id: venueId,
    p_search: search ?? null,
  })
  if (error) throw error
  return (data ?? []) as VenueMemberDiscoveryRow[]
}

/** Venue members who allow direct non-group invites in this venue. */
export async function getVenueInvitableMembers(
  supabase: Client,
  venueId: string,
  currentUserId?: string | null,
): Promise<VenueInvitableMemberRow[]> {
  const { data: identities, error: identitiesError } = await supabase
    .from('venue_identities')
    .select('user_id, venue_handle, accept_non_group_invites_in_venue, visible_in_venue_member_discovery')
    .eq('venue_id', venueId)
  if (identitiesError) throw identitiesError

  const rows = (identities ?? []) as {
    user_id: string
    venue_handle: string | null
    accept_non_group_invites_in_venue: boolean | null
    visible_in_venue_member_discovery: boolean | null
  }[]

  if (rows.length === 0) return []
  if (currentUserId && !rows.some((row) => row.user_id === currentUserId)) return []

  const userIds = rows.map((row) => row.user_id)
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, show_in_venue_member_discovery, allow_non_group_invites')
    .in('id', userIds)
  if (profilesError) throw profilesError

  const profileMap = new Map(
    ((
      profiles ?? []
    ) as {
      id: string
      display_name: string | null
      show_in_venue_member_discovery: boolean | null
      allow_non_group_invites: boolean | null
    }[])
      .map((profile) => [profile.id, profile]),
  )

  return rows
    .filter((row) => row.user_id !== currentUserId)
    .filter((row) => {
      const profile = profileMap.get(row.user_id)
      if (!profile) return false
      if (profile.show_in_venue_member_discovery !== true) return false
      if (row.visible_in_venue_member_discovery === false) return false
      if (profile.allow_non_group_invites !== true) return false
      if (row.accept_non_group_invites_in_venue === false) return false
      return true
    })
    .map((row) => {
      const profile = profileMap.get(row.user_id)
      return {
        user_id: row.user_id,
        display_name: profile?.display_name ?? null,
        venue_handle: row.venue_handle,
      }
    })
}

// ============================================================================
// Invite Circle
// ============================================================================

export type InviteCircleRow = {
  id: string
  owner_user_id: string
  target_user_id: string
  source: InviteCircleSource | string
  created_at: string
  target_display_name: string | null
  target_avatar_url: string | null
}

export function getInviteCircleSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'venue_member':
      return 'Venue member'
    case 'group_member':
      return 'Group member'
    case 'match_player':
      return 'Shared match'
    case 'played_with_auto':
      return 'Played with'
    case 'manual':
    default:
      return 'Saved manually'
  }
}

/** Phase 1: List caller's Invite Circle. */
export async function getInviteCircleList(supabase: Client): Promise<InviteCircleRow[]> {
  const { data, error } = await supabase.rpc('rpc_invite_circle_list')
  if (error) throw error
  return (data ?? []) as InviteCircleRow[]
}

/** Phase 1: Save user to Invite Circle. Idempotent. */
export async function saveToInviteCircle(
  supabase: Client,
  targetUserId: string,
  source?: InviteCircleSource
): Promise<void> {
  const { error } = await supabase.rpc('rpc_invite_circle_save_user', {
    p_target_user_id: targetUserId,
    p_source: source ?? 'manual',
  })
  if (!error) return

  const message = error.message ?? ''
  if (source && source !== 'manual' && message.includes('invalid_source')) {
    const fallback = await supabase.rpc('rpc_invite_circle_save_user', {
      p_target_user_id: targetUserId,
      p_source: 'manual',
    })
    if (!fallback.error) return
    throw fallback.error
  }

  throw error
}

/** Phase 1: Remove user from Invite Circle. */
export async function removeFromInviteCircle(
  supabase: Client,
  targetUserId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_invite_circle_remove_user', {
    p_target_user_id: targetUserId,
  })
  if (error) throw error
  const rows = (data ?? []) as { removed: boolean }[]
  return rows[0]?.removed ?? false
}

export async function saveContactPlayer(
  supabase: Client,
  guestId: string,
  options?: {
    source?: ContactPlayerSaveSource
    groupId?: string | null
    matchId?: string | null
  },
): Promise<void> {
  const { error } = await supabase.rpc('rpc_contact_player_save', {
    p_guest_id: guestId,
    p_source: options?.source ?? 'manual',
    p_group_id: options?.groupId ?? null,
    p_match_id: options?.matchId ?? null,
  })
  if (error) throw error
}

