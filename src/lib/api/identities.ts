import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Club, ClubIdentity, ClubHandleCheckResult, Group, GroupMember } from '@/lib/types/database'

type Client = SupabaseClient<Database>

// ============================================================================
// Profile identity RPCs
// ============================================================================

/** First-time onboarding: set display_name, first_name, last_name via RPC. */
export async function initProfile(
  supabase: Client,
  params: { display_name: string; first_name?: string; last_name?: string }
): Promise<void> {
  const { error } = await supabase.rpc('rpc_profile_init', {
    p_display_name: params.display_name,
    p_first_name: params.first_name ?? null,
    p_last_name: params.last_name ?? null,
  })
  if (error) throw error
}

/** Update non-identity profile fields (first_name, last_name only). */
export async function updateProfile(
  supabase: Client,
  params: { first_name?: string; last_name?: string }
): Promise<void> {
  const { error } = await supabase.rpc('rpc_profile_update', {
    p_first_name: params.first_name ?? null,
    p_last_name: params.last_name ?? null,
  })
  if (error) throw error
}

/**
 * v1.5 Identity: directly set the user's global display_name.
 * Does not sync club_identities (club handle is legacy in v1.5).
 * RPC: rpc_profile_set_display_name
 */
export async function setDisplayName(
  supabase: Client,
  displayName: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_profile_set_display_name', {
    p_display_name: displayName,
  })
  if (error) throw error
}

// ============================================================================
// Club handle RPCs
// ============================================================================

/** Check if a handle is available in a club; returns suggestions if taken. */
export async function checkClubHandle(
  supabase: Client,
  clubId: string,
  handle: string
): Promise<ClubHandleCheckResult> {
  const { data, error } = await supabase.rpc('rpc_club_handle_check', {
    p_club_id: clubId,
    p_handle: handle,
  })
  if (error) throw error
  // RPC returns a table row as array; take first element
  const row = (data as ClubHandleCheckResult[])?.[0]
  return row ?? { available: false, suggestions: [] }
}

/** Join a club with the given handle. */
export async function joinClub(
  supabase: Client,
  clubId: string,
  handle: string
): Promise<void> {
  const { error } = await supabase.rpc('rpc_club_join', {
    p_club_id: clubId,
    p_handle: handle,
  })
  if (error) throw error
}

/** Rename the user's handle in a specific club. Updates display_name if primary club. */
export async function setClubHandle(
  supabase: Client,
  clubId: string,
  newHandle: string
): Promise<void> {
  const { error } = await supabase.rpc('rpc_club_handle_set', {
    p_club_id: clubId,
    p_new_handle: newHandle,
  })
  if (error) throw error
}

/** Change the user's primary club; syncs display_name to that club's handle. */
export async function setPrimaryClub(supabase: Client, clubId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_profile_set_primary_club', {
    p_club_id: clubId,
  })
  if (error) throw error
}

// ============================================================================
// Queries
// ============================================================================

/** Get all club memberships (with club info) for the current user. */
export async function getMyClubIdentities(
  supabase: Client,
  userId: string,
): Promise<(ClubIdentity & { club: Club })[]> {
  const { data, error } = await supabase
    .from('club_identities')
    .select('*, club:clubs(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as (ClubIdentity & { club: Club })[]
}

/** Get all clubs the user has NOT yet joined (for the join UI). */
export async function getJoinableClubs(
  supabase: Client,
  userId: string,
): Promise<Club[]> {
  // First get clubs this user has joined
  const { data: myIds, error: err1 } = await supabase
    .from('club_identities')
    .select('club_id')
    .eq('user_id', userId)
  if (err1) throw err1

  const joinedIds = (myIds ?? []).map(r => r.club_id)

  const query = supabase
    .from('clubs')
    .select('*')
    .order('name', { ascending: true })

  if (joinedIds.length > 0) {
    const { data, error } = await query.not('id', 'in', `(${joinedIds.join(',')})`)
    if (error) throw error
    return (data ?? []) as Club[]
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Club[]
}

// ============================================================================
// Venue preferences (secondary_club_ids — lightweight "save" without a handle)
// ============================================================================

/** Return the clubs stored in profiles.secondary_club_ids for the user. */
export async function getMyVenuePreferences(
  supabase: Client,
  userId: string,
): Promise<Club[]> {
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('secondary_club_ids')
    .eq('id', userId)
    .single()
  if (profErr) throw profErr

  const ids: string[] = profile?.secondary_club_ids ?? []
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .in('id', ids)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Club[]
}

/** Add a venue to profiles.secondary_club_ids (idempotent). */
export async function addVenuePreference(
  supabase: Client,
  userId: string,
  venueId: string,
): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('profiles')
    .select('secondary_club_ids')
    .eq('id', userId)
    .single()
  if (fetchErr) throw fetchErr

  const current: string[] = data?.secondary_club_ids ?? []
  if (current.includes(venueId)) return

  const { error } = await supabase
    .from('profiles')
    .update({ secondary_club_ids: [...current, venueId] })
    .eq('id', userId)
  if (error) throw error
}

// ============================================================================
// Group display name (v1.5 Identity)
// ============================================================================

/**
 * Get all active group memberships for the user, with group info.
 * Used to render the "Group Aliases" section on the identity/profile page.
 */
export async function getMyGroupMemberships(
  supabase: Client,
  userId: string,
): Promise<(GroupMember & { group: Group })[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*, group:groups(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('removed_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as (GroupMember & { group: Group })[]
}

/**
 * Set (or clear) the calling user's group-scoped alias in a specific group.
 * Pass empty string to clear (stored as NULL).
 * RPC: rpc_group_set_display_name
 */
export async function setGroupDisplayName(
  supabase: Client,
  groupId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_group_set_display_name', {
    p_group_id: groupId,
    p_display_name: displayName,
  })
  if (error) throw error
}

/** Remove a venue from profiles.secondary_club_ids (idempotent). */
export async function removeVenuePreference(
  supabase: Client,
  userId: string,
  venueId: string,
): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('profiles')
    .select('secondary_club_ids')
    .eq('id', userId)
    .single()
  if (fetchErr) throw fetchErr

  const current: string[] = data?.secondary_club_ids ?? []
  const updated = current.filter(id => id !== venueId)

  const { error } = await supabase
    .from('profiles')
    .update({ secondary_club_ids: updated })
    .eq('id', userId)
  if (error) throw error
}
