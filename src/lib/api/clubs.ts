import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Club,
  ClubAdmin,
  ClubAdminWithDetails,
  Court,
  ProfileDisplay,
  AdminUserSearchResult,
} from '@/lib/types/database'

type Client = SupabaseClient<Database>

// ============================================================================
// Auth helpers
// ============================================================================

export async function isSuperAdmin(supabase: Client): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .single()
  if (error) return false
  return (data as { is_super_admin: boolean })?.is_super_admin === true
}

export async function isClubAdmin(supabase: Client, clubId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_club_admin', { p_club_id: clubId })
  if (error) return false
  return data === true
}

// ============================================================================
// Read operations
// ============================================================================

export async function getAllClubs(supabase: Client): Promise<Club[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data as Club[]
}

export async function getClub(supabase: Client, clubId: string): Promise<Club> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .single()
  if (error) throw error
  return data as Club
}

export async function getClubCourts(supabase: Client, clubId: string): Promise<Court[]> {
  const { data, error } = await supabase
    .from('courts')
    .select('*')
    .eq('club_id', clubId)
    .order('court_code', { ascending: true })
  if (error) throw error
  return data as Court[]
}

// Returns club_admins rows for a given club, enriched with display names
export async function getClubAdmins(supabase: Client, clubId: string): Promise<ClubAdminWithDetails[]> {
  const { data, error } = await supabase
    .from('club_admins')
    .select('*')
    .eq('club_id', clubId)
    .order('granted_at', { ascending: true })
  if (error) throw error

  const rows = (data || []) as ClubAdmin[]
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

// Returns clubs that the current user is admin of
export async function getMyAdminClubs(supabase: Client): Promise<(ClubAdmin & { club: Club })[]> {
  const { data, error } = await supabase
    .from('club_admins')
    .select('*')
    .order('granted_at', { ascending: true })
  if (error) throw error

  const rows = (data || []) as ClubAdmin[]
  if (rows.length === 0) return []

  const clubIds = rows.map(r => r.club_id)
  const { data: clubsData, error: clubsError } = await supabase
    .from('clubs')
    .select('*')
    .in('id', clubIds)
  if (clubsError) throw clubsError

  const clubMap = new Map(((clubsData || []) as Club[]).map(c => [c.id, c]))

  return rows
    .filter(r => clubMap.has(r.club_id))
    .map(r => ({ ...r, club: clubMap.get(r.club_id)! }))
}

// ============================================================================
// Super admin operations
// ============================================================================

export async function searchUsersForAdmin(supabase: Client, query: string): Promise<AdminUserSearchResult[]> {
  const { data, error } = await supabase.rpc('rpc_admin_user_search', { p_query: query })
  if (error) throw error
  return (data || []) as AdminUserSearchResult[]
}

export async function grantClubAdmin(supabase: Client, userId: string, clubId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_club_admin_grant', {
    p_user_id: userId,
    p_club_id: clubId,
  })
  if (error) throw error
}

export async function revokeClubAdmin(supabase: Client, userId: string, clubId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_club_admin_revoke', {
    p_user_id: userId,
    p_club_id: clubId,
  })
  if (error) throw error
}

export async function createClub(
  supabase: Client,
  data: { name: string; location_text?: string; timezone?: string; notes?: string }
): Promise<Club> {
  const { data: club, error } = await supabase.rpc('rpc_club_create', {
    p_name: data.name,
    p_location_text: data.location_text ?? null,
    p_timezone: data.timezone ?? 'America/Toronto',
    p_notes: data.notes ?? null,
  })
  if (error) throw error
  return club as Club
}

// ============================================================================
// Club admin operations
// ============================================================================

export async function updateClub(
  supabase: Client,
  clubId: string,
  data: { name?: string; location_text?: string; timezone?: string; notes?: string }
): Promise<void> {
  const { error } = await supabase.rpc('rpc_club_update', {
    p_club_id: clubId,
    p_name: data.name ?? null,
    p_location_text: data.location_text ?? null,
    p_timezone: data.timezone ?? null,
    p_notes: data.notes ?? null,
  })
  if (error) throw error
}

export async function createCourt(
  supabase: Client,
  clubId: string,
  data: { court_code: string; surface?: string; notes?: string }
): Promise<Court> {
  const { data: court, error } = await supabase.rpc('rpc_court_create', {
    p_club_id: clubId,
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
  data: { court_code?: string; surface?: string; notes?: string }
): Promise<void> {
  const { error } = await supabase.rpc('rpc_court_update', {
    p_court_id: courtId,
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
