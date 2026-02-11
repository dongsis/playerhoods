import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Match,
  MatchParticipant,
  MatchParticipantWithDetails,
  MatchFormed,
  Club,
  Court,
  Profile,
  Guest,
} from '@/lib/types/database'

type Client = SupabaseClient<Database>

// Read operations (respect RLS)

export async function getMatches(supabase: Client) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('match_date', { ascending: true })

  if (error) throw error
  return data as Match[]
}

export async function getMatch(supabase: Client, matchId: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (error) throw error
  return data as Match
}

export async function getMatchFormed(supabase: Client, matchId: string) {
  const { data, error } = await supabase
    .from('match_formed')
    .select('*')
    .eq('match_id', matchId)
    .single()

  if (error) throw error
  return data as MatchFormed
}

export async function getMatchParticipants(supabase: Client, matchId: string): Promise<MatchParticipantWithDetails[]> {
  const { data: participantsData, error: participantsError } = await supabase
    .from('match_participants')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })

  if (participantsError) throw participantsError

  const participants = (participantsData || []) as MatchParticipant[]
  if (participants.length === 0) return []

  const userIds = participants.filter(p => p.user_id).map(p => p.user_id as string)
  const guestIds = participants.filter(p => p.guest_id).map(p => p.guest_id as string)

  let profileMap = new Map<string, Profile>()
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds)

    if (profilesError) throw profilesError
    const profiles = (profilesData || []) as Profile[]
    profileMap = new Map(profiles.map(p => [p.id, p]))
  }

  let guestMap = new Map<string, Guest>()
  if (guestIds.length > 0) {
    const { data: guestsData, error: guestsError } = await supabase
      .from('guests')
      .select('*')
      .in('id', guestIds)

    if (guestsError) throw guestsError
    const guests = (guestsData || []) as Guest[]
    guestMap = new Map(guests.map(g => [g.id, g]))
  }

  const result: MatchParticipantWithDetails[] = participants.map(participant => ({
    ...participant,
    profile: participant.user_id ? profileMap.get(participant.user_id) || null : null,
    guest: participant.guest_id ? guestMap.get(participant.guest_id) || null : null,
  }))

  return result
}

export async function isUserInMatchScope(supabase: Client, matchId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_user_in_match_scope', {
    p_match_id: matchId,
    p_user_id: userId,
  })
  if (error) throw error
  return data as boolean
}

export async function getMyParticipation(supabase: Client, matchId: string, userId: string) {
  const { data, error } = await supabase
    .from('match_participants')
    .select('*')
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data as MatchParticipant | null
}

export async function getClubs(supabase: Client) {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data as Club[]
}

export async function getCourts(supabase: Client, clubId: string) {
  const { data, error } = await supabase
    .from('courts')
    .select('*')
    .eq('club_id', clubId)
    .order('court_code', { ascending: true })

  if (error) throw error
  return data as Court[]
}

// ============================================================================
// v1.3 Write operations (via RPC only)
// ============================================================================

/** Request to join a match. v1.3: Must be in scope groups. */
export async function requestJoinMatch(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_request_join', {
    p_match_id: matchId,
  })
  if (error) throw error
}

/** Invite a user. v1.3: NOT restricted by scope. */
export async function inviteUserToMatch(supabase: Client, matchId: string, userId: string) {
  const { error } = await supabase.rpc('rpc_match_invite_user', {
    p_match_id: matchId,
    p_user_id: userId,
  })
  if (error) throw error
}

/** Nominate a user (participant action). v1.3: NOT restricted by scope. */
export async function nominateUser(supabase: Client, matchId: string, userId: string) {
  const { error } = await supabase.rpc('rpc_match_nominate_user', {
    p_match_id: matchId,
    p_user_id: userId,
  })
  if (error) throw error
}

/** Accept a pending invitation. v1.3: Sets user_accepted_at. */
export async function acceptMatchInvite(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_accept_invite', {
    p_match_id: matchId,
  })
  if (error) throw error
}

/** ORG approves a pending participant. v1.3: ORG ONLY. */
export async function orgApproveParticipant(supabase: Client, participantId: string) {
  const { error } = await supabase.rpc('rpc_match_org_approve_participant', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
}

/** User withdraws (decline invite or leave). v1.3: Unified. */
export async function userWithdraw(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_user_withdraw', {
    p_match_id: matchId,
  })
  if (error) throw error
}

/** ORG/manager removes participant. */
export async function removeParticipant(supabase: Client, participantId: string) {
  const { error } = await supabase.rpc('rpc_match_remove_participant', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
}

/** ORG reactivates removed participant. v1.3: Only changes status. */
export async function reactivateParticipant(supabase: Client, participantId: string) {
  const { error } = await supabase.rpc('rpc_match_reactivate_participant', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
}

/** ORG adds guest (immediately confirmed). */
export async function addGuestOrg(supabase: Client, matchId: string, displayName: string, notes?: string) {
  const { error } = await supabase.rpc('rpc_match_add_guest_org', {
    p_match_id: matchId,
    p_guest_display_name: displayName,
    p_guest_notes: notes ?? '',
  })
  if (error) throw error
}

/** Participant adds guest (pending, needs ORG approval). */
export async function addGuestParticipant(supabase: Client, matchId: string, displayName: string, notes?: string) {
  const { error } = await supabase.rpc('rpc_match_add_guest_participant', {
    p_match_id: matchId,
    p_guest_display_name: displayName,
    p_guest_notes: notes ?? '',
  })
  if (error) throw error
}

// Match creation via RPC (creates match + auto-adds organizer as confirmed participant)
export async function createMatch(
  supabase: Client,
  data: {
    required_count?: number
    match_date?: string
    start_time?: string
    duration_minutes?: number
    game_type?: string
    club_id?: string
    court_ids?: string[]
    invitation_scope_group_ids?: string[]
    can_participants_invite_users?: boolean
    can_participants_add_guests?: boolean
    can_participants_manage_participants?: boolean
  }
) {
  // Only pass explicitly-set values; omitted args use RPC/DB defaults as single source of truth
  const args: Record<string, unknown> = {}
  if (data.required_count != null) args.p_required_count = data.required_count
  if (data.game_type) args.p_game_type = data.game_type
  if (data.match_date) args.p_match_date = data.match_date
  if (data.start_time) args.p_start_time = data.start_time
  if (data.duration_minutes != null) args.p_duration_minutes = data.duration_minutes
  if (data.club_id) args.p_club_id = data.club_id
  if (data.court_ids?.length) args.p_court_ids = data.court_ids
  if (data.invitation_scope_group_ids?.length) args.p_invitation_scope_group_ids = data.invitation_scope_group_ids
  if (data.can_participants_invite_users != null) args.p_can_participants_invite_users = data.can_participants_invite_users
  if (data.can_participants_add_guests != null) args.p_can_participants_add_guests = data.can_participants_add_guests
  if (data.can_participants_manage_participants != null) args.p_can_participants_manage_participants = data.can_participants_manage_participants

  const { data: match, error } = await supabase.rpc('rpc_match_create', args)

  if (error) throw error
  return match as Match
}
