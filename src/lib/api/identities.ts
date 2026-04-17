import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AvailabilityStatus,
  Database,
  Group,
  GroupMember,
  SharedGroupJoinPreference,
  Venue,
  VenueHandleCheckResult,
  VenueIdentity,
} from '@/lib/types/database'

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

/** Update profile fields (name, contact preferences, global preference switches). */
export async function updateProfile(
  supabase: Client,
  params: {
    first_name?: string
    last_name?: string
    gender?: 'male' | 'female' | 'unspecified' | null
    contact_channel?: 'email' | 'sms'
    contact_email?: string | null
    contact_phone?: string | null
    show_in_venue_member_discovery?: boolean
    allow_non_group_invites?: boolean
    shared_group_join_preference?: SharedGroupJoinPreference
    looking_to_play?: string | null
    preferred_play_times?: string[]
    availability_status?: AvailabilityStatus | null
    availability_note?: string | null
    availability_until?: string | null
  }
): Promise<void> {
  const rpcParams: Record<string, unknown> = {
    p_first_name: params.first_name ?? null,
    p_last_name: params.last_name ?? null,
    p_contact_channel: params.contact_channel ?? null,
  }
  if (params.contact_email !== undefined) rpcParams.p_contact_email = params.contact_email
  if (params.contact_phone !== undefined) rpcParams.p_contact_phone = params.contact_phone
  if (params.show_in_venue_member_discovery !== undefined) rpcParams.p_show_in_venue_member_discovery = params.show_in_venue_member_discovery
  if (params.allow_non_group_invites !== undefined) rpcParams.p_allow_non_group_invites = params.allow_non_group_invites
  if (params.shared_group_join_preference !== undefined) rpcParams.p_shared_group_join_preference = params.shared_group_join_preference
  if (params.looking_to_play !== undefined) rpcParams.p_looking_to_play = params.looking_to_play
  if (params.preferred_play_times !== undefined) rpcParams.p_preferred_play_times = params.preferred_play_times
  if (params.gender !== undefined) rpcParams.p_gender = params.gender
  if (params.availability_status !== undefined) rpcParams.p_availability_status = params.availability_status
  if (params.availability_note !== undefined) rpcParams.p_availability_note = params.availability_note
  if (params.availability_until !== undefined) rpcParams.p_availability_until = params.availability_until
  const { error } = await supabase.rpc('rpc_profile_update', rpcParams)
  if (error) throw error
}

/** Set venue-scoped preference overrides. 'inherit' = use global (NULL). Omit = don't change. */
export async function setVenueIdentityPreferences(
  supabase: Client,
  venueId: string,
  params: {
    visible_in_venue_member_discovery?: 'true' | 'false' | 'inherit'
    accept_non_group_invites_in_venue?: 'true' | 'false' | 'inherit'
  }
): Promise<void> {
  const rpcParams: {
    p_venue_id: string
    p_visible_in_venue_member_discovery?: string | null
    p_accept_non_group_invites_in_venue?: string | null
  } = { p_venue_id: venueId }
  if (params.visible_in_venue_member_discovery !== undefined) rpcParams.p_visible_in_venue_member_discovery = params.visible_in_venue_member_discovery
  if (params.accept_non_group_invites_in_venue !== undefined) rpcParams.p_accept_non_group_invites_in_venue = params.accept_non_group_invites_in_venue
  const { error } = await supabase.rpc('rpc_venue_identity_set_preferences', rpcParams)
  if (error) throw error
}

/** v1.8: Set avatar URL (from storage upload). Pass null to clear. */
export async function setAvatarUrl(supabase: Client, avatarUrl: string | null): Promise<void> {
  const { error } = await supabase.rpc('rpc_profile_set_avatar_url', {
    p_avatar_url: avatarUrl ?? '',
  })
  if (error) throw error
}

/**
 * v1.5 Identity: directly set the user's global display_name.
 * Does not sync venue_identities (venue handle is legacy in v1.5).
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
// Venue handle RPCs
// ============================================================================

/** Check if a handle is available in a venue; returns suggestions if taken. */
export async function checkVenueHandle(
  supabase: Client,
  venueId: string,
  handle: string
): Promise<VenueHandleCheckResult> {
  const { data, error } = await supabase.rpc('rpc_venue_handle_check', {
    p_venue_id: venueId,
    p_handle: handle,
  })
  if (error) throw error
  // RPC returns a table row as array; take first element
  const row = (data as VenueHandleCheckResult[])?.[0]
  return row ?? { available: false, suggestions: [] }
}

/** Join a venue with the given handle. */
export async function joinVenue(
  supabase: Client,
  venueId: string,
  handle: string
): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_join', {
    p_venue_id: venueId,
    p_handle: handle,
  })
  if (error) throw error
}

/** Leave a venue the current user has joined. */
export async function leaveVenue(
  supabase: Client,
  venueId: string
): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_leave', {
    p_venue_id: venueId,
  })
  if (error) throw error
}

/** Rename the user's handle in a specific venue. Updates display_name if primary venue. */
export async function setVenueHandle(
  supabase: Client,
  venueId: string,
  newHandle: string
): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_handle_set', {
    p_venue_id: venueId,
    p_new_handle: newHandle,
  })
  if (error) throw error
}

/** Change the user's primary venue; syncs display_name to that venue's handle. */
export async function setPrimaryVenue(supabase: Client, venueId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_profile_set_primary_venue', {
    p_venue_id: venueId,
  })
  if (error) throw error
}

// ============================================================================
// Queries
// ============================================================================

/** Get all venue memberships for the current user. */
export async function getMyVenueIdentities(
  supabase: Client,
  userId: string,
): Promise<(VenueIdentity & { venue: Venue })[]> {
  const { data, error } = await supabase
    .from('venue_identities')
    .select('*, venue:venues(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as (VenueIdentity & { venue: Venue })[]
}

/** Get all venues the user has NOT yet joined (for the join UI). */
export async function getJoinableVenues(
  supabase: Client,
  userId: string,
): Promise<Venue[]> {
  // First get venues this user has joined
  const { data: myIds, error: err1 } = await supabase
    .from('venue_identities')
    .select('venue_id')
    .eq('user_id', userId)
  if (err1) throw err1

  const joinedIds = (myIds ?? []).map(r => r.venue_id)

  const query = supabase
    .from('venues')
    .select('*')
    .order('name', { ascending: true })

  if (joinedIds.length > 0) {
    const { data, error } = await query.not('id', 'in', `(${joinedIds.join(',')})`)
    if (error) throw error
    return (data ?? []) as Venue[]
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Venue[]
}

// ============================================================================
// Venue preferences (secondary_venue_ids — lightweight "save" without a handle)
// ============================================================================

/** Return the venues stored in profiles.secondary_venue_ids for the user. */
export async function getMyVenuePreferences(
  supabase: Client,
  userId: string,
): Promise<Venue[]> {
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('secondary_venue_ids')
    .eq('id', userId)
    .single()
  if (profErr) throw profErr

  const ids: string[] = profile?.secondary_venue_ids ?? []
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .in('id', ids)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Venue[]
}

/** Add a venue to profiles.secondary_venue_ids (idempotent). */
export async function addVenuePreference(
  supabase: Client,
  userId: string,
  venueId: string,
): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('profiles')
    .select('secondary_venue_ids')
    .eq('id', userId)
    .single()
  if (fetchErr) throw fetchErr

  const current: string[] = data?.secondary_venue_ids ?? []
  if (current.includes(venueId)) return

  const { error } = await supabase
    .from('profiles')
    .update({ secondary_venue_ids: [...current, venueId] })
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

/** Remove a venue from profiles.secondary_venue_ids (idempotent). */
export async function removeVenuePreference(
  supabase: Client,
  userId: string,
  venueId: string,
): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('profiles')
    .select('secondary_venue_ids')
    .eq('id', userId)
    .single()
  if (fetchErr) throw fetchErr

  const current: string[] = data?.secondary_venue_ids ?? []
  const updated = current.filter(id => id !== venueId)

  const { error } = await supabase
    .from('profiles')
    .update({ secondary_venue_ids: updated })
    .eq('id', userId)
  if (error) throw error
}
