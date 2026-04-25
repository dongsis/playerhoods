import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AvailabilityStatus,
  Database,
  Group,
  GroupMember,
  SharedGroupJoinPreference,
  Venue,
  VenueIdentity,
  VenueUserRelationship,
} from '@/lib/types/database'

type Client = SupabaseClient<Database>

function shouldFallbackToLegacyVenueStorage(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === '42P01'
    || message.includes('does not exist')
    || message.includes('could not find the table')
    || message.includes('could not find the function')
    || message.includes('schema cache')
}

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
// Venue membership RPCs
// ============================================================================

/** Join a venue as a member without creating a venue-scoped handle. */
export async function joinVenue(
  supabase: Client,
  venueId: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_member_join_v2', {
    p_venue_id: venueId,
  })
  if (error) throw error
}

/** Leave a venue the current user has joined. */
export async function leaveVenue(
  supabase: Client,
  venueId: string
): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_member_leave_v2', {
    p_venue_id: venueId,
  })
  if (error) throw error
}

/** Change the user's primary venue. */
export async function setPrimaryVenue(supabase: Client, venueId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_profile_set_primary_venue', {
    p_venue_id: venueId,
  })
  if (error) throw error
}

// ============================================================================
// Queries
// ============================================================================

/** v1 venue relationships. Falls back to legacy member rows until all environments are migrated. */
export async function getMyVenueRelationships(
  supabase: Client,
  userId: string,
): Promise<(VenueUserRelationship & { venue: Venue })[]> {
  const next = await supabase
    .from('venue_user_relationships')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!next.error) {
    const rows = (next.data ?? []) as VenueUserRelationship[]
    if (rows.length === 0) return []

    const venueIds = [...new Set(rows.map((row) => row.venue_id))]
    const { data: venuesData, error: venuesError } = await supabase
      .from('venues')
      .select('*')
      .in('id', venueIds)
    if (venuesError) throw venuesError

    const venueMap = new Map(((venuesData ?? []) as Venue[]).map((venue) => [venue.id, venue]))
    return rows
      .filter((row) => venueMap.has(row.venue_id))
      .map((row) => ({
        ...row,
        venue: venueMap.get(row.venue_id)!,
      }))
  }

  if (!shouldFallbackToLegacyVenueStorage(next.error)) throw next.error

  const legacy = await supabase
    .from('venue_identities')
    .select('*, venue:venues(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (legacy.error) throw legacy.error

  return ((legacy.data ?? []) as unknown as (VenueIdentity & { venue: Venue })[]).map((row) => ({
    id: row.id,
    venue_id: row.venue_id,
    user_id: row.user_id,
    relationship_type: 'member',
    created_at: row.created_at,
    updated_at: row.created_at,
    venue: row.venue,
  }))
}

/** Get all venue memberships for the current user. */
export async function getMyVenueIdentities(
  supabase: Client,
  userId: string,
): Promise<(VenueIdentity & { venue: Venue })[]> {
  const next = await getMyVenueRelationships(supabase, userId)
  const memberRows = next.filter((row) => row.relationship_type === 'member')

  if (memberRows.length > 0) {
    const venueIds = memberRows.map((row) => row.venue_id)
    const legacy = await supabase
      .from('venue_identities')
      .select('id, venue_id, user_id, created_at, visible_in_venue_member_discovery, accept_non_group_invites_in_venue')
      .eq('user_id', userId)
      .in('venue_id', venueIds)

    if (legacy.error && !shouldFallbackToLegacyVenueStorage(legacy.error)) throw legacy.error

    const legacyMap = new Map(
      (((legacy.data ?? []) as {
        id: string
        venue_id: string
        user_id: string
        created_at: string
        visible_in_venue_member_discovery?: boolean | null
        accept_non_group_invites_in_venue?: boolean | null
      }[])).map((row) => [row.venue_id, row]),
    )

    return memberRows.map((row) => {
      const legacyRow = legacyMap.get(row.venue_id)
      return {
        id: legacyRow?.id ?? row.id,
        venue_id: row.venue_id,
        user_id: row.user_id,
        created_at: legacyRow?.created_at ?? row.created_at,
        visible_in_venue_member_discovery: legacyRow?.visible_in_venue_member_discovery ?? null,
        accept_non_group_invites_in_venue: legacyRow?.accept_non_group_invites_in_venue ?? null,
        venue: row.venue,
      }
    })
  }

  const { data, error } = await supabase
    .from('venue_identities')
    .select('*, venue:venues(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as (VenueIdentity & { venue: Venue })[]).map((row) => ({
    id: row.id,
    venue_id: row.venue_id,
    user_id: row.user_id,
    created_at: row.created_at,
    visible_in_venue_member_discovery: row.visible_in_venue_member_discovery ?? null,
    accept_non_group_invites_in_venue: row.accept_non_group_invites_in_venue ?? null,
    venue: row.venue,
  }))
}

/** Get all venues the user has NOT yet joined (for the join UI). */
export async function getJoinableVenues(
  supabase: Client,
  userId: string,
): Promise<Venue[]> {
  const relationshipRows = await supabase
    .from('venue_user_relationships')
    .select('venue_id')
    .eq('user_id', userId)
    .eq('relationship_type', 'member')

  let joinedIds: string[] = []
  if (!relationshipRows.error) {
    joinedIds = ((relationshipRows.data ?? []) as { venue_id: string }[]).map((row) => row.venue_id)
  } else {
    if (!shouldFallbackToLegacyVenueStorage(relationshipRows.error)) throw relationshipRows.error

    const { data: myIds, error: err1 } = await supabase
      .from('venue_identities')
      .select('venue_id')
      .eq('user_id', userId)
    if (err1) throw err1

    joinedIds = (myIds ?? []).map(r => r.venue_id)
  }

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

/** Return the venues starred by the user. Falls back to legacy secondary_venue_ids until all environments are migrated. */
export async function getMyVenuePreferences(
  supabase: Client,
  userId: string,
): Promise<Venue[]> {
  const relationshipRows = await supabase
    .from('venue_user_relationships')
    .select('venue_id')
    .eq('user_id', userId)
    .eq('relationship_type', 'starred')
    .order('created_at', { ascending: true })

  if (!relationshipRows.error) {
    const ids = [...new Set(((relationshipRows.data ?? []) as { venue_id: string }[]).map((row) => row.venue_id))]
    if (ids.length === 0) return []

    const { data: venues, error: venuesError } = await supabase
      .from('venues')
      .select('*')
      .in('id', ids)
      .order('name', { ascending: true })
    if (venuesError) throw venuesError
    return (venues ?? []) as Venue[]
  }

  if (!shouldFallbackToLegacyVenueStorage(relationshipRows.error)) throw relationshipRows.error

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

/** Add a starred relationship for the current user. Falls back to legacy secondary_venue_ids. */
export async function addVenuePreference(
  supabase: Client,
  userId: string,
  venueId: string,
): Promise<void> {
  const next = await supabase.rpc('rpc_venue_relationship_set', {
    p_venue_id: venueId,
    p_relationship_type: 'starred',
  })
  if (!next.error) return
  if (!shouldFallbackToLegacyVenueStorage(next.error)) throw next.error

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

/** Remove a starred relationship for the current user. Falls back to legacy secondary_venue_ids. */
export async function removeVenuePreference(
  supabase: Client,
  userId: string,
  venueId: string,
): Promise<void> {
  const next = await supabase.rpc('rpc_venue_relationship_remove', {
    p_venue_id: venueId,
    p_relationship_type: 'starred',
  })
  if (!next.error) return
  if (!shouldFallbackToLegacyVenueStorage(next.error)) throw next.error

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
