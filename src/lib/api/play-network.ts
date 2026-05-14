/**
 * Phase 1 Play Network Core API
 * Venue Members discovery, saved registered-player storage, and match admission helpers.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, VenueRelationshipType } from '@/lib/types/database'

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
  relationship_type?: VenueRelationshipType | null
}

export type VenueInvitableMemberRow = {
  user_id: string
  display_name: string | null
}

// Canonical note:
// Use the venue_user_relationships-backed rpc_venue_people_discovery_v2 path.
// See docs/db_canonical_paths.md.
/** Phase 1: Venue Members discovery. Caller must hold the discovery relationship for the venue kind. */
export async function getVenueMembersDiscovery(
  supabase: Client,
  venueId: string,
  search?: string | null
): Promise<VenueMemberDiscoveryRow[]> {
  const next = await supabase.rpc('rpc_venue_people_discovery_v2', {
    p_venue_id: venueId,
    p_search: search ?? null,
  })

  if (!next.error) {
    return ((next.data ?? []) as {
      user_id: string
      display_name: string | null
      avatar_url: string | null
      relationship_type: VenueRelationshipType
    }[]).map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      relationship_type: row.relationship_type,
    }))
  }

  throw next.error
}

/** Venue people who allow direct non-group invites in this venue. */
export async function getVenueInvitableMembers(
  supabase: Client,
  venueId: string,
  currentUserId?: string | null,
): Promise<VenueInvitableMemberRow[]> {
  const discovered = await getVenueMembersDiscovery(supabase, venueId, null)

  if (discovered.length === 0) return []
  if (currentUserId && !discovered.some((row) => row.user_id === currentUserId)) return []

  const userIds = discovered.map((row) => row.user_id)
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, allow_non_group_invites')
    .in('id', userIds)
  if (profilesError) throw profilesError

  const profileMap = new Map(
    ((profiles ?? []) as {
      id: string
      display_name: string | null
      allow_non_group_invites: boolean | null
    }[]).map((profile) => [profile.id, profile]),
  )

  return discovered
    .filter((row) => row.user_id !== currentUserId)
    .filter((row) => profileMap.get(row.user_id)?.allow_non_group_invites === true)
    .map((row) => ({
      user_id: row.user_id,
      display_name: profileMap.get(row.user_id)?.display_name ?? row.display_name ?? null,
    }))
}

// ============================================================================
// Saved registered-player storage (legacy internal Invite Circle table / RPC names)
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
      return 'Saved from venue'
    case 'group_member':
      return 'Saved from group'
    case 'match_player':
      return 'Saved from shared match'
    case 'played_with_auto':
      return 'Saved after playing together'
    case 'manual':
    default:
      return 'Saved'
  }
}

/** Phase 1: List caller's saved registered players from legacy Invite Circle storage. */
export async function getInviteCircleList(supabase: Client): Promise<InviteCircleRow[]> {
  const { data, error } = await supabase.rpc('rpc_invite_circle_list')
  if (error) throw error
  return (data ?? []) as InviteCircleRow[]
}

/** Phase 1: Save a registered user into legacy Invite Circle storage. Idempotent. */
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

/** Phase 1: Remove a registered user from legacy Invite Circle storage. */
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

