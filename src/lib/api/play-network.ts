/**
 * Phase 1 Play Network Core API
 * Club Members discovery, Invite Circle, match admission targets/admit
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

// ============================================================================
// Club Members discovery
// ============================================================================

export type ClubMemberDiscoveryRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  club_handle: string | null
}

/** Phase 1: Club Members discovery. Caller must be club member. */
export async function getClubMembersDiscovery(
  supabase: Client,
  clubId: string,
  search?: string | null
): Promise<ClubMemberDiscoveryRow[]> {
  const { data, error } = await supabase.rpc('rpc_club_members_discovery', {
    p_club_id: clubId,
    p_search: search ?? null,
  })
  if (error) throw error
  return (data ?? []) as ClubMemberDiscoveryRow[]
}

// ============================================================================
// Invite Circle
// ============================================================================

export type InviteCircleRow = {
  id: string
  owner_user_id: string
  target_user_id: string
  source: string
  created_at: string
  target_display_name: string | null
  target_avatar_url: string | null
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
  source?: 'manual' | 'played_with_auto'
): Promise<void> {
  const { error } = await supabase.rpc('rpc_invite_circle_save_user', {
    p_target_user_id: targetUserId,
    p_source: source ?? 'manual',
  })
  if (error) throw error
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

