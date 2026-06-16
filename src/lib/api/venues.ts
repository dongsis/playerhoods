import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Venue,
  VenueAccessType,
  VenueAdmin,
  VenueAdminWithDetails,
  VenueCostType,
  VenueFacilityType,
  VenueIndoorOutdoor,
  VenueKind,
  VenueSport,
  Court,
  ProfileDisplay,
  AdminUserSearchResult,
} from '@/lib/types/database'
import { inferVenueTimezone } from '@/lib/venues/timezone'

type Client = SupabaseClient<Database>

export type PublicVenueSitemapRow = {
  venue_id: string
  canonical_path: string
  name: string
  city: string | null
  province: string | null
  country: string | null
  supports_tennis: boolean
  supports_pickleball: boolean
  created_at: string
}

// ============================================================================
// Auth helpers
// ============================================================================

export async function isSuperAdmin(supabase: Client): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return false

  const { data, error } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return false
  return (data as { is_super_admin: boolean })?.is_super_admin === true
}

export async function isVenueAdmin(supabase: Client, venueId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_venue_admin', { p_venue_id: venueId })
  if (error) return false
  return data === true
}

// ============================================================================
// Read operations
// ============================================================================

export async function getAllVenues(supabase: Client): Promise<Venue[]> {
  const pageSize = 1000
  const rows: Venue[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error

    const page = (data ?? []) as Venue[]
    rows.push(...page)

    if (page.length < pageSize) break
  }

  return rows
}

export type VenueOptionRow = Pick<Venue, 'id' | 'name' | 'abbreviation' | 'city' | 'province' | 'country' | 'location_text' | 'venue_kind'>

export async function listVenueOptions(supabase: Client): Promise<VenueOptionRow[]> {
  const pageSize = 1000
  const rows: VenueOptionRow[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, abbreviation, city, province, country, location_text, venue_kind')
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error

    const page = (data ?? []) as VenueOptionRow[]
    rows.push(...page)

    if (page.length < pageSize) break
  }

  return rows
}

export async function getVenue(supabase: Client, venueId: string): Promise<Venue> {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('id', venueId)
    .single()
  if (error) throw error
  return data as Venue
}

export async function getVenueByCanonicalPath(
  supabase: Client,
  params: { country: string; province: string; city: string; slug: string },
): Promise<Venue | null> {
  const rpcClient = supabase as SupabaseClient<any>
  const { data, error } = await rpcClient.rpc('rpc_public_venue_by_canonical_path', {
    p_country: params.country,
    p_province: params.province,
    p_city: params.city,
    p_slug: params.slug,
  })
  if (error) throw error

  return ((data ?? []) as Venue[])[0] ?? null
}

export async function listPublicVenueSitemapRows(supabase: Client): Promise<PublicVenueSitemapRow[]> {
  const rpcClient = supabase as SupabaseClient<any>
  const pageSize = 1000
  const rows: PublicVenueSitemapRow[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await rpcClient
      .rpc('rpc_public_venue_sitemap')
      .range(from, from + pageSize - 1)
    if (error) throw error

    const page = (data ?? []) as PublicVenueSitemapRow[]
    rows.push(...page)

    if (page.length < pageSize) break
  }

  return rows
}

export async function getVenueCourts(supabase: Client, venueId: string): Promise<Court[]> {
  const { data, error } = await supabase
    .from('courts')
    .select('*')
    .eq('venue_id', venueId)
    .order('sport_id', { ascending: true })
    .order('court_code', { ascending: true })
  if (error) throw error
  return data as Court[]
}

export async function getVenueSports(supabase: Client, venueId: string): Promise<VenueSport[]> {
  const { data, error } = await supabase
    .from('venue_sports')
    .select('*')
    .eq('venue_id', venueId)
    .order('sport_id', { ascending: true })
  if (error) throw error
  return data as VenueSport[]
}

export async function listVenueSports(supabase: Client): Promise<VenueSport[]> {
  const pageSize = 1000
  const rows: VenueSport[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('venue_sports')
      .select('*')
      .order('venue_id', { ascending: true })
      .order('sport_id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error

    const page = (data ?? []) as VenueSport[]
    rows.push(...page)

    if (page.length < pageSize) break
  }

  return rows
}

// Returns venue_admins rows for a given venue, enriched with display names
export async function getVenueAdmins(supabase: Client, venueId: string): Promise<VenueAdminWithDetails[]> {
  const { data, error } = await supabase
    .from('venue_admins')
    .select('*')
    .eq('venue_id', venueId)
    .order('granted_at', { ascending: true })
  if (error) throw error

  const rows = (data || []) as VenueAdmin[]
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map(r => r.user_id))]
  const { data: profilesData } = await supabase
    .from('profile_display')
    .select('*')
    .in('id', userIds)

  const profileMap = new Map(((profilesData || []) as ProfileDisplay[]).map(p => [p.id, p]))

  return rows.map(r => ({
    ...r,
    profile: profileMap.get(r.user_id) || null,
  }))
}

// Returns venues that the current user is admin of.
export async function getMyAdminVenues(supabase: Client): Promise<(VenueAdmin & { venue: Venue })[]> {
  const { data, error } = await supabase
    .from('venue_admins')
    .select('*')
    .order('granted_at', { ascending: true })
  if (error) throw error

  const rows = (data || []) as VenueAdmin[]
  if (rows.length === 0) return []

  const venueIds = rows.map(r => r.venue_id)
  const { data: venuesData, error: venuesError } = await supabase
    .from('venues')
    .select('*')
    .in('id', venueIds)
  if (venuesError) throw venuesError

  const venueMap = new Map(((venuesData || []) as Venue[]).map(venue => [venue.id, venue]))

  return rows
    .filter(r => venueMap.has(r.venue_id))
    .map(r => ({ ...r, venue: venueMap.get(r.venue_id)! }))
}

// ============================================================================
// Super admin operations
// ============================================================================

export async function searchUsersForAdmin(supabase: Client, query: string): Promise<AdminUserSearchResult[]> {
  const { data, error } = await supabase.rpc('rpc_admin_user_search', { p_query: query })
  if (error) throw error
  return (data || []) as AdminUserSearchResult[]
}

export async function grantVenueAdmin(supabase: Client, userId: string, venueId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_admin_grant', {
    p_user_id: userId,
    p_venue_id: venueId,
  })
  if (error) throw error
}

export async function revokeVenueAdmin(supabase: Client, userId: string, venueId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_admin_revoke', {
    p_user_id: userId,
    p_venue_id: venueId,
  })
  if (error) throw error
}

export async function createVenue(
  supabase: Client,
  data: {
    name: string
    abbreviation?: string
    location_text?: string
    city?: string
    province?: string
    postal_code?: string
    country?: string
    website_url?: string
    contact_name?: string
    contact_phone?: string
    contact_email?: string
    venue_phone?: string
    venue_email?: string
    latitude?: number | null
    longitude?: number | null
    indoor_outdoor?: VenueIndoorOutdoor | null
    facility_type?: VenueFacilityType | null
    booking_required?: boolean | null
    cost_type?: VenueCostType | null
    supports_tennis?: boolean
    supports_pickleball?: boolean
    timezone?: string
    notes?: string
    venue_kind?: VenueKind
    access_type?: VenueAccessType
  }
): Promise<Venue> {
  const { data: venue, error } = await supabase.rpc('rpc_venue_create', {
    p_name: data.name,
    p_abbreviation: data.abbreviation ?? null,
    p_location_text: data.location_text ?? null,
    p_city: data.city ?? null,
    p_province: data.province ?? null,
    p_postal_code: data.postal_code ?? null,
    p_country: data.country ?? null,
    p_website_url: data.website_url ?? null,
    p_contact_name: data.contact_name ?? null,
    p_contact_phone: data.contact_phone ?? null,
    p_contact_email: data.contact_email ?? null,
    p_venue_phone: data.venue_phone ?? null,
    p_venue_email: data.venue_email ?? null,
    p_latitude: data.latitude ?? null,
    p_longitude: data.longitude ?? null,
    p_indoor_outdoor: data.indoor_outdoor ?? null,
    p_facility_type: data.facility_type ?? null,
    p_booking_required: data.booking_required ?? null,
    p_cost_type: data.cost_type ?? null,
    p_supports_tennis: data.supports_tennis ?? false,
    p_supports_pickleball: data.supports_pickleball ?? false,
    p_timezone: data.timezone ?? inferVenueTimezone(data),
    p_notes: data.notes ?? null,
    p_venue_kind: data.venue_kind ?? 'club',
    p_access_type: data.access_type ?? 'members',
  })
  if (error) throw error
  return venue as Venue
}

// ============================================================================
// Venue admin operations
// ============================================================================

export async function updateVenue(
  supabase: Client,
  venueId: string,
  data: {
    name?: string
    abbreviation?: string | null
    location_text?: string
    city?: string
    province?: string
    postal_code?: string
    country?: string
    website_url?: string
    contact_name?: string
    contact_phone?: string
    contact_email?: string
    venue_phone?: string
    venue_email?: string
    latitude?: number | null
    longitude?: number | null
    indoor_outdoor?: VenueIndoorOutdoor | null
    facility_type?: VenueFacilityType | null
    booking_required?: boolean | null
    cost_type?: VenueCostType | null
    supports_tennis?: boolean
    supports_pickleball?: boolean
    timezone?: string
    notes?: string
    venue_kind?: VenueKind
    access_type?: VenueAccessType
  }
): Promise<void> {
  const { error } = await supabase.rpc('rpc_venue_update', {
    p_venue_id: venueId,
    p_name: data.name ?? null,
    p_abbreviation: data.abbreviation === undefined ? null : data.abbreviation,
    p_location_text: data.location_text ?? null,
    p_city: data.city ?? null,
    p_province: data.province ?? null,
    p_postal_code: data.postal_code ?? null,
    p_country: data.country ?? null,
    p_website_url: data.website_url ?? null,
    p_contact_name: data.contact_name ?? null,
    p_contact_phone: data.contact_phone ?? null,
    p_contact_email: data.contact_email ?? null,
    p_venue_phone: data.venue_phone ?? null,
    p_venue_email: data.venue_email ?? null,
    p_latitude: data.latitude ?? null,
    p_longitude: data.longitude ?? null,
    p_indoor_outdoor: data.indoor_outdoor ?? null,
    p_facility_type: data.facility_type ?? null,
    p_booking_required: data.booking_required ?? null,
    p_cost_type: data.cost_type ?? null,
    p_supports_tennis: data.supports_tennis ?? null,
    p_supports_pickleball: data.supports_pickleball ?? null,
    p_timezone: data.timezone ?? (
      data.country !== undefined || data.province !== undefined || data.city !== undefined
        ? inferVenueTimezone(data)
        : null
    ),
    p_notes: data.notes ?? null,
    p_venue_kind: data.venue_kind ?? null,
    p_access_type: data.access_type ?? null,
  })
  if (error) throw error
}

export async function createCourt(
  supabase: Client,
  venueId: string,
  data: { sport_id: number; court_code: string; surface?: string; notes?: string }
): Promise<Court> {
  const { data: court, error } = await supabase.rpc('rpc_court_create', {
    p_venue_id: venueId,
    p_sport_id: data.sport_id,
    p_court_code: data.court_code,
    p_surface: data.surface ?? null,
    p_notes: data.notes ?? null,
  })
  if (error) throw error
  return court as Court
}

export async function updateCourt(
  supabase: Client,
  courtId: string,
  data: { sport_id?: number; court_code?: string; surface?: string; notes?: string }
): Promise<void> {
  const { error } = await supabase.rpc('rpc_court_update', {
    p_court_id: courtId,
    p_sport_id: data.sport_id ?? null,
    p_court_code: data.court_code ?? null,
    p_surface: data.surface ?? null,
    p_notes: data.notes ?? null,
  })
  if (error) throw error
}

export async function deleteCourt(supabase: Client, courtId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_court_delete', { p_court_id: courtId })
  if (error) throw error
}
