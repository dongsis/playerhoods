import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Match,
  MatchSummary,
  MatchCourt,
  MatchParticipant,
  MatchParticipantWithDetails,
  MatchParticipantAction,
  MatchParticipantActionWithProfile,
  MatchFormed,
  ProfileDisplay,
  Club,
  Court,
  Profile,
  Guest,
} from '@/lib/types/database'

type Client = SupabaseClient<Database>

// ============================================================================
// v1.4.1 enriched types
// ============================================================================

/** Participant with display_name and avatar_url resolved via club handle / profile. */
export type MatchParticipantEnriched = MatchParticipant & {
  display_name: string
  avatar_url?: string | null
}

/** Flattened activity row for ActivityFeed — all names resolved server-side. */
export type ActivityItem = {
  id: string
  action_type: string
  note: string | null
  actor_name: string
  subject_name: string
  created_at: string
}

export type MatchListItem = {
  match: Match
  clubTimezone: string | null
  clubName: string | null
  confirmedCount: number
  pendingCount: number
  isFormed: boolean
  participants: MatchParticipantEnriched[]
  myParticipant: MatchParticipantEnriched | null
}

export type MatchDetailData = {
  match: Match
  clubTimezone: string | null
  clubName: string | null
  participants: MatchParticipantEnriched[]
  myParticipant: MatchParticipantEnriched | null
  isOrganizer: boolean
  confirmedCount: number
  pendingCount: number
  activities: ActivityItem[]
  organizerName: string
  scopeGroups: { id: string; name: string }[]
  sportName: string  // v1.6.3
}

// Read operations (respect RLS)

export async function getMatches(supabase: Client) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('match_date', { ascending: true })

  if (error) throw error
  return data as Match[]
}

function getDisplayName(
  userId: string | null,
  guestId: string | null,
  profileMap: Map<string, ProfileDisplay>,
  guestMap: Map<string, Guest>,
): string {
  if (guestId) {
    const guest = guestMap.get(guestId)
    return guest ? `${guest.display_name} (Not registered)` : 'Not registered'
  }
  if (userId) {
    const p = profileMap.get(userId)
    if (p?.display_name) return p.display_name
    return userId.slice(0, 6)
  }
  return 'Unknown'
}

export async function getMatchesWithSummary(supabase: Client): Promise<MatchSummary[]> {
  // 1. Fetch matches + formed counts in parallel
  const [matchesRes, formedRes] = await Promise.all([
    supabase.from('matches').select('*').order('match_date', { ascending: true }),
    supabase.from('match_formed').select('*'),
  ])

  if (matchesRes.error) throw matchesRes.error
  if (formedRes.error) throw formedRes.error

  const matches = matchesRes.data as Match[]
  const formedRows = formedRes.data as MatchFormed[]
  const formedMap = new Map(formedRows.map(f => [f.match_id, f]))

  if (matches.length === 0) return []

  // 2. Fetch all active participants for these matches
  const matchIds = matches.map(m => m.id)
  const { data: participantsData, error: participantsError } = await supabase
    .from('match_participants')
    .select('*')
    .in('match_id', matchIds)
    .in('status', ['pending', 'confirmed'])

  if (participantsError) throw participantsError
  const participants = (participantsData || []) as MatchParticipant[]

  // 3. Fetch profiles + guests for display names (include organizer IDs)
  const organizerIds = matches.map(m => m.organizer_id)
  const userIds = [...new Set([
    ...participants.filter(p => p.user_id).map(p => p.user_id as string),
    ...organizerIds,
  ])]
  const guestIds = [...new Set(participants.filter(p => p.guest_id).map(p => p.guest_id as string))]

  let profileMap = new Map<string, ProfileDisplay>()
  let guestMap = new Map<string, Guest>()

  const [profilesRes, guestsRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profile_display').select('*').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    guestIds.length > 0
      ? supabase.from('guests').select('*').in('id', guestIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (profilesRes.error) throw profilesRes.error
  if (guestsRes.error) throw guestsRes.error

  profileMap = new Map(((profilesRes.data || []) as ProfileDisplay[]).map(p => [p.id, p]))
  guestMap = new Map(((guestsRes.data || []) as Guest[]).map(g => [g.id, g]))

  // 4. Group participants by match and compute summaries
  const participantsByMatch = new Map<string, MatchParticipant[]>()
  for (const p of participants) {
    const list = participantsByMatch.get(p.match_id) || []
    list.push(p)
    participantsByMatch.set(p.match_id, list)
  }

  return matches.map(match => {
    const formed = formedMap.get(match.id)
    const mps = participantsByMatch.get(match.id) || []
    const confirmed = mps.filter(p => p.status === 'confirmed')
    const pending = mps.filter(p => p.status === 'pending')

    return {
      ...match,
      organizer_name: getDisplayName(match.organizer_id, null, profileMap, guestMap),
      confirmed_count: formed?.confirmed_count ?? confirmed.length,
      pending_count: pending.length,
      confirmed_names: confirmed.slice(0, 3).map(p =>
        getDisplayName(p.user_id, p.guest_id, profileMap, guestMap)
      ),
      pending_names: pending.slice(0, 3).map(p =>
        getDisplayName(p.user_id, p.guest_id, profileMap, guestMap)
      ),
    }
  })
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

  let profileMap = new Map<string, ProfileDisplay>()
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from('profile_display')
      .select('*')
      .in('id', userIds)

    if (profilesError) throw profilesError
    const profiles = (profilesData || []) as ProfileDisplay[]
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

/** v1.5: Self-only scope check. Uses is_caller_in_match_scope (safe, granted to authenticated). */
export async function isCallerInMatchScope(supabase: Client, matchId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_caller_in_match_scope', {
    p_match_id: matchId,
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
// match_courts operations
// ============================================================================

export async function getMatchCourts(supabase: Client, matchId: string) {
  const { data, error } = await supabase
    .from('match_courts')
    .select('*')
    .eq('match_id', matchId)
    .order('slot_index', { ascending: true })

  if (error) throw error
  return data as MatchCourt[]
}

export async function addMatchCourt(
  supabase: Client,
  data: { match_id: string; slot_index: number; court_label: string; created_by: string; court_location?: string; court_notes?: string }
) {
  const { error } = await supabase
    .from('match_courts')
    .insert(data)

  if (error) throw error
}

export async function removeMatchCourt(supabase: Client, matchCourtId: string) {
  const { error } = await supabase
    .from('match_courts')
    .delete()
    .eq('id', matchCourtId)

  if (error) throw error
}

// ============================================================================
// Organizer match-level mutations (direct update, allowed by RLS)
// ============================================================================

/** Cancel a match. Organizer only — allowed by matches_update_organizer RLS policy. */
export async function cancelMatch(supabase: Client, matchId: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('id', matchId)
  if (error) throw error
}

/**
 * Update match schedule fields. Organizer only.
 * The `trg_compute_match_start_at_utc` trigger auto-recomputes start_at_utc
 * when match_date or start_time change (requires match to have a club_id).
 */
export async function updateMatchDetails(
  supabase: Client,
  matchId: string,
  data: {
    match_date?: string | null
    start_time?: string | null
    duration_minutes?: number | null
    invitation_scope_group_ids?: string[] | null
  }
): Promise<void> {
  const updateData: Record<string, unknown> = {}
  if (data.match_date !== undefined) updateData.match_date = data.match_date
  if (data.start_time !== undefined) updateData.start_time = data.start_time
  if (data.duration_minutes !== undefined) updateData.duration_minutes = data.duration_minutes
  if (data.invitation_scope_group_ids !== undefined) updateData.invitation_scope_group_ids = data.invitation_scope_group_ids
  if (Object.keys(updateData).length === 0) return
  const { error } = await supabase.from('matches').update(updateData).eq('id', matchId)
  if (error) throw error
}

/**
 * Replace all court slots with a single court label. Pass null to clear.
 * Organizer only — match_courts RLS allows organizer to insert/delete.
 */
export async function setMatchSingleCourt(
  supabase: Client,
  matchId: string,
  courtLabel: string | null,
  userId: string
): Promise<void> {
  return setMatchCourts(supabase, matchId, courtLabel ? [courtLabel] : [], userId)
}

/**
 * Replace all court slots with the given list of court labels (slot_index 1, 2, 3…).
 * Organizer only — match_courts RLS allows organizer to insert/delete.
 */
export async function setMatchCourts(
  supabase: Client,
  matchId: string,
  courtLabels: string[],
  userId: string
): Promise<void> {
  const { error: delErr } = await supabase
    .from('match_courts')
    .delete()
    .eq('match_id', matchId)
  if (delErr) throw delErr

  const labels = courtLabels.map(l => l?.trim()).filter(Boolean)
  if (labels.length > 0) {
    const rows = labels.map((court_label, i) => ({
      match_id: matchId,
      slot_index: i + 1,
      court_label,
      created_by: userId,
    }))
    const { error: insErr } = await supabase.from('match_courts').insert(rows)
    if (insErr) throw insErr
  }
}

// ============================================================================
// v1.3 Write operations (via RPC only)
// ============================================================================

/** v1.5: Request to join a match. Requester must be in scope groups. Empty scope → rejected. */
export async function requestJoinMatch(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_request_join', { p_match_id: matchId })
  if (error) throw error
}

/** v1.5: ORG-only invite. Invited user must be in scope groups. */
export async function inviteUserToMatch(supabase: Client, matchId: string, userId: string) {
  const { error } = await supabase.rpc('rpc_match_invite_user', {
    p_match_id: matchId,
    p_user_id: userId,
  })
  if (error) throw error
}

/** v1.5: Nominate a user. join_method=nominated. Scope enforced. ORG or non-removed participant. */
export async function nominateUser(supabase: Client, matchId: string, userId: string) {
  const { error } = await supabase.rpc('rpc_match_nominate_user', {
    p_match_id: matchId,
    p_user_id: userId,
  })
  if (error) throw error
}

/** v1.5: Accept a pending invitation or nomination. Writes participant_accepted_at + via=in_app. */
export async function acceptMatchInvite(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_accept_invite', { p_match_id: matchId })
  if (error) throw error
}

/** v1.5: ORG approves a pending participant. Writes org_approved_at. */
export async function orgApproveParticipant(supabase: Client, participantId: string) {
  const { error } = await supabase.rpc('rpc_match_org_approve_participant', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
}

/**
 * v1.5: ORG directly confirms a scope user who has not joined yet.
 * join_method=manual; participant_accepted_at + org_approved_at set simultaneously → confirmed.
 * Handles reenter (removed → manual confirm) and fresh insert.
 */
export async function manualConfirmUser(supabase: Client, matchId: string, userId: string) {
  const { error } = await supabase.rpc('rpc_match_manual_confirm_user', {
    p_match_id: matchId,
    p_user_id: userId,
  })
  if (error) throw error
}

/** v1.5: ORG manually confirms an existing pending participant (sets participant_accepted_at via=manual + org_approved_at). */
export async function manualConfirmParticipant(supabase: Client, participantId: string, note?: string) {
  const { error } = await supabase.rpc('rpc_match_manual_confirm', {
    p_match_participant_id: participantId,
    ...(note ? { p_note: note } : {}),
  })
  if (error) throw error
}

/** v1.5: User withdraws (decline invite or leave). Sets removed_at. */
export async function userWithdraw(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_user_withdraw', { p_match_id: matchId })
  if (error) throw error
}

/** v1.5: ORG/manager removes participant. Sets removed_at. */
export async function removeParticipant(supabase: Client, participantId: string) {
  const { error } = await supabase.rpc('rpc_match_remove_participant', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
}

/** v1.5: ORG adds guest (join_method=manual, confirmed immediately). */
// Deprecated addGuestOrg/addGuestParticipant paths have been replaced by the
// unified nominate-guest model. Use rpc_match_nominate_guest + rpc_match_delegate_confirm_participant.

/** Nominate an existing Contact Player (guest) into a match. */
export async function nominateGuest(
  supabase: Client,
  matchId: string,
  guestId: string,
) {
  const { error } = await supabase.rpc('rpc_match_nominate_guest', {
    p_match_id: matchId,
    p_guest_id: guestId,
  })
  if (error) throw error
}

/** v1.7: Delegate-confirm an existing pending participant (user or guest). Sets participant_accepted_at. */
export async function delegateConfirmParticipant(
  supabase: Client,
  matchParticipantId: string,
) {
  const { error } = await supabase.rpc('rpc_match_delegate_confirm_participant', {
    p_match_participant_id: matchParticipantId,
  })
  if (error) throw error
}

/** Fetch all action logs for a match, grouped by participant. */
export async function getMatchActions(
  supabase: Client,
  matchId: string
): Promise<Map<string, MatchParticipantActionWithProfile[]>> {
  const { data, error } = await supabase
    .from('match_participant_actions')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })

  if (error) throw error
  const actions = (data || []) as MatchParticipantAction[]
  if (actions.length === 0) return new Map()

  // Fetch display names for all actors via public view
  const userIds = [...new Set(actions.map(a => a.created_by))]
  const { data: profilesData } = await supabase
    .from('profile_display')
    .select('*')
    .in('id', userIds)

  const profileMap = new Map((profilesData || []).map((p: ProfileDisplay) => [p.id, p]))

  // Group by participant_id
  const result = new Map<string, MatchParticipantActionWithProfile[]>()
  for (const action of actions) {
    const enriched: MatchParticipantActionWithProfile = {
      ...action,
      profile: profileMap.get(action.created_by) || null,
    }
    const list = result.get(action.match_participant_id) || []
    list.push(enriched)
    result.set(action.match_participant_id, list)
  }
  return result
}

// Match creation via RPC (creates match + auto-adds organizer as confirmed participant)
// Court slots are inserted separately into match_courts after creation.
export async function createMatch(
  supabase: Client,
  data: {
    required_count?: number
    match_date?: string
    start_time?: string
    duration_minutes?: number
    game_type?: string
    club_id?: string
    court_slots?: { court_label: string }[]
    invitation_scope_group_ids?: string[]
    can_participants_invite_users?: boolean
    can_participants_add_guests?: boolean
    can_participants_manage_participants?: boolean
    sport_id?: number  // v1.6.3: rpc_match_create doesn't accept p_sport_id; we update after create
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
  if (data.invitation_scope_group_ids?.length) args.p_invitation_scope_group_ids = data.invitation_scope_group_ids
  if (data.can_participants_invite_users != null) args.p_can_participants_invite_users = data.can_participants_invite_users
  if (data.can_participants_add_guests != null) args.p_can_participants_add_guests = data.can_participants_add_guests
  if (data.can_participants_manage_participants != null) args.p_can_participants_manage_participants = data.can_participants_manage_participants

  const { data: match, error } = await supabase.rpc('rpc_match_create', args)

  if (error) throw error
  const created = match as Match

  // Insert court slots into match_courts table
  if (data.court_slots?.length) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const rows = data.court_slots.map((slot, i) => ({
        match_id: created.id,
        slot_index: i + 1,
        court_label: slot.court_label,
        created_by: user.id,
      }))
      const { error: courtError } = await supabase
        .from('match_courts')
        .insert(rows)
      if (courtError) throw courtError
    }
  }

  // v1.6.3: rpc_match_create doesn't accept p_sport_id; update after create if non-default
  if (data.sport_id != null && data.sport_id !== 1) {
    const { error: sportError } = await supabase
      .from('matches')
      .update({ sport_id: data.sport_id })
      .eq('id', created.id)
    if (sportError) throw sportError
    created.sport_id = data.sport_id
  }

  return created
}

// ============================================================================
// v1.4.1 enriched data loaders
// ============================================================================

/** Builds identity map: `${clubId}:${userId}` → club_handle */
async function fetchIdentityMap(
  supabase: Client,
  clubIds: string[],
  userIds: string[],
): Promise<Map<string, string>> {
  if (clubIds.length === 0 || userIds.length === 0) return new Map()
  const { data } = await supabase
    .from('club_identities')
    .select('club_id, user_id, club_handle')
    .in('club_id', clubIds)
    .in('user_id', userIds)
  return new Map(
    ((data ?? []) as { club_id: string; user_id: string; club_handle: string }[])
      .map(i => [`${i.club_id}:${i.user_id}`, i.club_handle])
  )
}

function resolveNameFromMaps(
  userId: string | null,
  guestId: string | null,
  clubId: string | null,
  identityMap: Map<string, string>,
  profileMap: Map<string, string>,
  guestMap: Map<string, string>,
): string {
  if (guestId) return `${guestMap.get(guestId) ?? 'Not registered'} (Not registered)`
  if (!userId) return 'Unknown'
  if (clubId) {
    const handle = identityMap.get(`${clubId}:${userId}`)
    if (handle) return handle
  }
  return profileMap.get(userId) ?? 'Unknown'
}

/**
 * Fetch all visible matches for the list page, enriched with:
 * - club timezone (for time formatting)
 * - per-participant display names (club handle preferred, profile fallback)
 * - confirmed/pending counts
 * - caller's own participant row
 */
export async function getMatchListData(
  supabase: Client,
  userId: string | null,
): Promise<MatchListItem[]> {
  const matchesRes = await supabase
    .from('matches')
    .select('*')
    .neq('status', 'cancelled')
    .order('start_at_utc', { ascending: true })
  if (matchesRes.error) throw matchesRes.error

  const matches = matchesRes.data as Match[]
  if (matches.length === 0) return []

  const matchIds = matches.map(m => m.id)
  const clubIds = [...new Set(matches.filter(m => m.club_id).map(m => m.club_id as string))]

  const [participantsRes, clubsRes] = await Promise.all([
    supabase.from('match_participants').select('*').in('match_id', matchIds),
    clubIds.length > 0
      ? supabase.from('clubs').select('id, name, timezone').in('id', clubIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (participantsRes.error) throw participantsRes.error
  if (clubsRes.error) throw clubsRes.error

  const allParticipants = (participantsRes.data ?? []) as MatchParticipant[]
  const clubMap = new Map(
    ((clubsRes.data ?? []) as { id: string; name: string; timezone: string }[])
      .map(c => [c.id, c])
  )

  const userIds = [...new Set(allParticipants.filter(p => p.user_id).map(p => p.user_id as string))]
  const guestIds = [...new Set(allParticipants.filter(p => p.guest_id).map(p => p.guest_id as string))]
  const guestParticipantIds = allParticipants.filter(p => p.guest_id).map(p => p.id)

  const [profilesRes, identityMap, guestsRes, identityLinksRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profile_display').select('*').in('id', userIds)
      : Promise.resolve({ data: [] }),
    fetchIdentityMap(supabase, clubIds, userIds),
    guestIds.length > 0
      ? supabase.from('guests').select('id, display_name').in('id', guestIds)
      : Promise.resolve({ data: [] }),
    userId && guestParticipantIds.length > 0
      ? (async () => {
          const r = await supabase.from('identity_links').select('linked_id, user_id').eq('user_id', userId).eq('linked_type', 'guest_participant').in('linked_id', guestParticipantIds)
          return r.error ? { data: [] } : r
        })()
      : Promise.resolve({ data: [] }),
  ])

  const profileDisplayMap = new Map(
    ((profilesRes.data ?? []) as ProfileDisplay[]).map(p => [p.id, p])
  )
  const profileMap = new Map(
    ((profilesRes.data ?? []) as ProfileDisplay[]).map(p => [p.id, p.display_name])
  )
  const guestMap = new Map(
    ((guestsRes.data ?? []) as { id: string; display_name: string }[]).map(g => [g.id, g.display_name])
  )
  const participantLinkedToUser = new Map(
    ((identityLinksRes.data ?? []) as { linked_id: string; user_id: string }[]).map((r) => [r.linked_id, r.user_id])
  )

  const byMatch = new Map<string, MatchParticipant[]>()
  for (const p of allParticipants) {
    const arr = byMatch.get(p.match_id) ?? []
    arr.push(p)
    byMatch.set(p.match_id, arr)
  }

  return matches.map(match => {
    const club = match.club_id ? (clubMap.get(match.club_id) ?? null) : null
    const mps = byMatch.get(match.id) ?? []

    const enriched: MatchParticipantEnriched[] = mps.map(p => {
      const linkedUserId = p.guest_id ? participantLinkedToUser.get(p.id) : null
      const effectiveUserId = p.user_id ?? linkedUserId
      const displayName = effectiveUserId
        ? (profileMap.get(effectiveUserId) ?? resolveNameFromMaps(p.user_id, p.guest_id, match.club_id, identityMap, profileMap, guestMap))
        : resolveNameFromMaps(p.user_id, p.guest_id, match.club_id, identityMap, profileMap, guestMap)
      const profileDisplay = effectiveUserId ? profileDisplayMap.get(effectiveUserId) : null
      return {
        ...p,
        display_name: displayName,
        avatar_url: profileDisplay?.avatar_url ?? null,
      }
    })

    const confirmed = enriched.filter(p =>
      p.status === 'confirmed' ||
      (p.user_id === match.organizer_id && p.status !== 'removed')
    )
    const pending = enriched.filter(p => p.status === 'pending')
    const myParticipant = userId
      ? (enriched.find(p => p.user_id === userId || participantLinkedToUser.get(p.id) === userId) ?? null)
      : null

    return {
      match,
      clubTimezone: club?.timezone ?? null,
      clubName: club?.name ?? null,
      // Use status-based local counts — more reliable than confirmed_at-based view
      // (old participants may have status='confirmed' but confirmed_at=NULL; view undercounts them).
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      isFormed: confirmed.length >= match.required_count,
      participants: enriched,
      myParticipant,
    }
  })
}

/**
 * Fetch all data for the match detail page:
 * - enriched participants (display names resolved)
 * - flat activity feed (actor + subject names resolved, newest first)
 */
export async function getMatchDetailData(
  supabase: Client,
  matchId: string,
  userId: string | null,
): Promise<MatchDetailData> {
  const [matchRes, participantsRes, actionsRes, formedRes] = await Promise.all([
    supabase.from('matches').select('*').eq('id', matchId).single(),
    supabase.from('match_participants').select('*').eq('match_id', matchId).order('created_at', { ascending: true }),
    supabase.from('match_participant_actions').select('*').eq('match_id', matchId).order('created_at', { ascending: false }),
    supabase.from('match_formed').select('*').eq('match_id', matchId).maybeSingle(),
  ])
  if (matchRes.error) throw matchRes.error

  const match = matchRes.data as Match
  const participants = (participantsRes.data ?? []) as MatchParticipant[]
  const actions = (actionsRes.data ?? []) as MatchParticipantAction[]

  // Fetch club
  type ClubRow = { id: string; name: string; timezone: string }
  let club: ClubRow | null = null
  if (match.club_id) {
    const { data } = await supabase
      .from('clubs')
      .select('id, name, timezone')
      .eq('id', match.club_id)
      .single()
    club = data as unknown as ClubRow | null
  }

  // Collect IDs needed for name resolution (include organizer, participants, linked users for identity display)
  const userIds = [...new Set([
    match.organizer_id,
    ...participants.filter(p => p.user_id).map(p => p.user_id as string),
    ...actions.map(a => a.created_by),
    ...(userId ? [userId] : []),
  ])]
  const guestIds = [...new Set(participants.filter(p => p.guest_id).map(p => p.guest_id as string))]
  const guestParticipantIds = participants.filter(p => p.guest_id).map(p => p.id)
  const clubIds = match.club_id ? [match.club_id] : []

  const [profilesRes, identityMap, guestsRes, identityLinksRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profile_display').select('*').in('id', userIds)
      : Promise.resolve({ data: [] }),
    fetchIdentityMap(supabase, clubIds, userIds),
    guestIds.length > 0
      ? supabase.from('guests').select('id, display_name').in('id', guestIds)
      : Promise.resolve({ data: [] }),
    userId && guestParticipantIds.length > 0
      ? (async () => {
          const r = await supabase.from('identity_links').select('linked_id, user_id').eq('user_id', userId).eq('linked_type', 'guest_participant').in('linked_id', guestParticipantIds)
          return r.error ? { data: [] } : r
        })()
      : Promise.resolve({ data: [] }),
  ])

  const profileDisplayMap = new Map(
    ((profilesRes.data ?? []) as ProfileDisplay[]).map(p => [p.id, p])
  )
  const profileMap = new Map(
    ((profilesRes.data ?? []) as ProfileDisplay[]).map(p => [p.id, p.display_name])
  )
  const guestMap = new Map(
    ((guestsRes.data ?? []) as { id: string; display_name: string }[]).map(g => [g.id, g.display_name])
  )

  const participantLinkedToUser = new Map(
    ((identityLinksRes.data ?? []) as { linked_id: string; user_id: string }[]).map((r) => [r.linked_id, r.user_id])
  )

  const scopeGroupIds = match.invitation_scope_group_ids ?? []
  const [scopeGroupsRes, sportRes] = await Promise.all([
    scopeGroupIds.length > 0
      ? supabase.from('groups').select('id, name').in('id', scopeGroupIds)
      : Promise.resolve({ data: [] }),
    supabase.from('sports').select('display_name').eq('id', match.sport_id).single(),
  ])

  const resolve = (uid: string | null, gid: string | null) =>
    resolveNameFromMaps(uid, gid, match.club_id, identityMap, profileMap, guestMap)

  const enriched: MatchParticipantEnriched[] = participants.map(p => {
    const linkedUserId = p.guest_id ? participantLinkedToUser.get(p.id) : null
    const effectiveUserId = p.user_id ?? linkedUserId
    const profileDisplay = effectiveUserId ? profileDisplayMap.get(effectiveUserId) : null
    const displayName = effectiveUserId
      ? (profileDisplay?.display_name ?? profileMap.get(effectiveUserId) ?? 'Unknown')
      : resolve(p.user_id, p.guest_id)
    return {
      ...p,
      display_name: displayName,
      avatar_url: profileDisplay?.avatar_url ?? null,
    }
  })

  const participantById = new Map(participants.map(p => [p.id, p]))

  // v1.7: For actions whose subject we don't have (RLS may hide), fetch display names via RPC
  const missingParticipantIds = actions
    .map(a => a.match_participant_id)
    .filter((id): id is string => !!id && !participantById.has(id))
  const participantDisplayNames = new Map<string, string>()
  if (missingParticipantIds.length > 0) {
    const { data: namesData } = await supabase.rpc('rpc_match_participant_display_names', {
      p_match_id: matchId,
      p_participant_ids: missingParticipantIds,
    })
    for (const row of (namesData ?? []) as { participant_id: string; display_name: string }[]) {
      participantDisplayNames.set(row.participant_id, row.display_name)
    }
  }

  const activities: ActivityItem[] = actions.map(a => {
    const subject = participantById.get(a.match_participant_id)
    const subjectName = subject
      ? resolve(subject.user_id, subject.guest_id)
      : (participantDisplayNames.get(a.match_participant_id) ?? 'Unknown')
    return {
      id: a.id,
      action_type: a.action_type,
      note: a.note,
      actor_name: resolve(a.created_by, null),
      subject_name: subjectName,
      created_at: a.created_at,
    }
  })

  const confirmed = enriched.filter(p =>
    p.status === 'confirmed' ||
    (p.user_id === match.organizer_id && p.status !== 'removed')
  )
  const pending = enriched.filter(p => p.status === 'pending' && p.removed_at === null)
  const isOrganizer = userId === match.organizer_id
  const myParticipant = userId
    ? (enriched.find(p => p.user_id === userId || participantLinkedToUser.get(p.id) === userId) ?? null)
    : null
  const scopeGroups = ((scopeGroupsRes.data ?? []) as { id: string; name: string }[])

  return {
    match,
    clubTimezone: club?.timezone ?? null,
    clubName: club?.name ?? null,
    participants: enriched,
    myParticipant,
    isOrganizer,
    // Use status-based local count for confirmedCount — more reliable than confirmed_at-based view
    // (old participants may have status='confirmed' but confirmed_at=NULL; view undercounts them).
    confirmedCount: confirmed.length,
    // For organizer (sees all participants): use local count.
    // For non-organizer (RLS hides other pending): use view aggregate to show total pending count.
    pendingCount: isOrganizer ? pending.length : (formedRes.data?.pending_count ?? 0),
    activities,
    organizerName: resolve(match.organizer_id, null),
    scopeGroups,
    sportName: (sportRes.data as { display_name: string } | null)?.display_name ?? 'Unknown',
  }
}

// ============================================================================
// v1.6.1 Role-specific roster RPCs (replace rpc_match_scope_users)
// ============================================================================

export type ScopeUser = { id: string; display_name: string }

/** Phase 3: Mixed admission target (user or Contact Player). */
export type AdmissionTarget = {
  target_kind: 'user' | 'contact_player'
  target_id: string
  display_name: string | null
  avatar_url: string | null
  club_handle: string | null
  source: string
  action_kind: 'admit_user' | 'nominate_contact_player'
  can_admit: boolean
  eligible_via: string | null
  sort_name: string | null
  contact_email: string | null
}

/** Phase 3: Unified mixed admission targets (users + Contact Players). */
export async function getAdmissionTargets(
  supabase: Client,
  matchId: string,
  search?: string | null
): Promise<AdmissionTarget[]> {
  const { data, error } = await supabase.rpc('rpc_match_admission_targets', {
    p_match_id: matchId,
    p_search: search ?? null,
  })
  if (error) throw error
  return (data ?? []) as AdmissionTarget[]
}

/** Phase 3: User targets only (for InviteUserForm / NominateUserForm). Maps to ScopeUser for backward compat. */
export function admissionTargetsToScopeUsers(targets: AdmissionTarget[]): ScopeUser[] {
  return targets
    .filter(t => t.action_kind === 'admit_user')
    .map(t => ({ id: t.target_id, display_name: t.display_name ?? '' }))
}

/** Phase 3: Contact Player targets only (for InviteGuestForm). */
export function admissionTargetsToContactPlayers(targets: AdmissionTarget[]): { guest_id: string; display_name: string; email: string | null }[] {
  return targets
    .filter(t => t.action_kind === 'nominate_contact_player')
    .map(t => ({ guest_id: t.target_id, display_name: t.display_name ?? '', email: t.contact_email ?? null }))
}

