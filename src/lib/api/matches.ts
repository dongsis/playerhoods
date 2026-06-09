import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Match,
  MatchSummary,
  MatchCourt,
  MatchCourtOffer,
  MatchCourtOfferStatus,
  MatchCourtPlanMode,
  MatchDoublesFormat,
  MatchParticipant,
  MatchParticipantWithDetails,
  MatchParticipantAction,
  MatchMessage,
  MatchParticipantActionWithProfile,
  MatchFormed,
  PersonMatchProxy,
  MatchGroupInvitation,
  ProfileDisplay,
  Venue,
  Court,
  Profile,
  Guest,
} from '@/lib/types/database'
import { deriveMatchCourtStatus, type MatchCourtState } from '@/lib/utils/match-court'
import { deriveMatchRosterInsight, normalizeMatchGender, type MatchRosterInsight } from '@/lib/utils/match-roster'

type Client = SupabaseClient<Database>

export type { MatchCourtOffer, MatchCourtOfferStatus }

const MATCH_LIST_BATCH_SIZE = 80

function chunkValues<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return []

  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function logMatchDetailSoftFailure(matchId: string, label: string, error: unknown) {
  console.warn(`[MatchDetail] ${label} soft-failed for match ${matchId}:`, error)
}

function logMatchListSoftFailure(label: string, error: unknown) {
  console.warn(`[MatchList] ${label} soft-failed:`, error)
}

function isActiveConfirmedParticipant(participant: Pick<MatchParticipant, 'status' | 'removed_at'>): boolean {
  return participant.status === 'confirmed' && participant.removed_at === null
}

function isCanonicalConfirmedParticipant(
  participant: Pick<MatchParticipant, 'participant_accepted_at' | 'org_approved_at' | 'removed_at'>,
): boolean {
  return participant.participant_accepted_at !== null
    && participant.org_approved_at !== null
    && participant.removed_at === null
}

function isActivePendingParticipant(participant: Pick<MatchParticipant, 'status' | 'removed_at'>): boolean {
  return participant.status === 'pending' && participant.removed_at === null
}

function isActiveWaitingListParticipant(participant: Pick<MatchParticipant, 'status' | 'removed_at'>): boolean {
  return participant.status === 'waiting_list' && participant.removed_at === null
}

// ============================================================================
// v1.4.1 enriched types
// ============================================================================

/** Participant with display_name and avatar_url resolved via venue handle / profile. */
export type MatchParticipantEnriched = MatchParticipant & {
  display_name: string
  avatar_url?: string | null
  gender?: Profile['gender'] | null
  participant_kind?: 'registered_user' | 'contact_player'
  invited_by_name?: string | null
  manual_confirmed_by_name?: string | null
  shares_group_with_viewer?: boolean
  proxy_manageable_by_viewer?: boolean
  saved_by_viewer?: boolean
  contact_player_person_id?: string | null
  linked_user_id?: string | null
  public_signup_source?: 'public_match_signup' | null
  public_signup_email_verified?: boolean
  public_signup_phone_confirmed?: boolean
  public_signup_status?: string | null
  public_signup_contact_state?: string | null
}

type PublicSignupParticipantMetadata = {
  match_participant_id: string
  match_id: string
  source: 'public_match_signup'
  email_verified: boolean
  signup_status: string
  phone_confirmed?: boolean
  contact_state?: string | null
}

/** Host-facing summary for formed matches that became short after a lineup exit. */
export type MatchLineupShortWarning = {
  playerName: string
  happenedAt: string
  actionLabel: 'left' | 'declined' | 'was removed'
  confirmedCount: number
  targetCount: number
  leftCount: number
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

export type MatchMessageEnriched = MatchMessage & {
  author_name: string
  author_avatar_url: string | null
  is_organizer_author: boolean
}

export type MatchListItem = {
  match: Match
  venueTimezone: string | null
  venueName: string | null
  sportName: string | null
  courtState: MatchCourtState
  confirmedCount: number
  pendingCount: number
  waitingCount: number
  isFormed: boolean
  participants: MatchParticipantEnriched[]
  myParticipant: MatchParticipantEnriched | null
  rosterInsight: MatchRosterInsight
  lineupShortWarning: MatchLineupShortWarning | null
}

export type MatchDetailData = {
  match: Match
  venueTimezone: string | null
  venueName: string | null
  participants: MatchParticipantEnriched[]
  myParticipant: MatchParticipantEnriched | null
  myParticipantNeedsReconfirm: boolean
  isOrganizer: boolean
  confirmedCount: number
  pendingCount: number
  waitingCount: number
  activities: ActivityItem[]
  messages: MatchMessageEnriched[]
  organizerName: string
  scopeGroups: { id: string; name: string }[]
  groupInvitations: MatchGroupInvite[]
  myGroupInvites: MatchGroupInvite[]
  sportName: string  // v1.6.3
  rosterInsight: MatchRosterInsight
  lineupShortWarning: MatchLineupShortWarning | null
}

export type MatchProxyDashboardRow = PersonMatchProxy & {
  principal_name: string
  principal_linked_user_id: string | null
  proxy_name: string
  relationship_role: 'for_me' | 'i_act_for' | 'related'
  can_approve: boolean
  can_decline: boolean
  can_revoke: boolean
}

export type MatchGroupInvite = Pick<MatchGroupInvitation, 'group_id' | 'status' | 'created_at'> & {
  group_name: string
  member_count?: number
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
    return guest?.display_name?.trim() || 'Contact Player'
  }
  if (userId) {
    const p = profileMap.get(userId)
    if (p?.display_name) return p.display_name
    return userId.slice(0, 6)
  }
  return 'Unknown'
}

async function fetchContactPlayerLookup(
  supabase: Client,
  guestIds: string[],
) {
  if (guestIds.length === 0) {
    return new Map<string, Guest>()
  }

  const { data, error } = await supabase.rpc('rpc_contact_player_lookup', {
    p_guest_ids: guestIds,
  })
  if (error) throw error

  const rows = (data ?? []) as {
    guest_id: string
    display_name: string
    person_id: string | null
  }[]

  let ownedContactNameByGuestId = new Map<string, string>()
  try {
    const { data: ownedContacts, error: ownedContactsError } = await supabase.rpc('rpc_contact_player_resolution')
    if (!ownedContactsError) {
      ownedContactNameByGuestId = new Map(
        ((ownedContacts ?? []) as Array<{ guest_id: string; display_name: string | null }>)
          .map((contact) => [contact.guest_id, contact.display_name?.trim() ?? ''])
          .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
      )
    }
  } catch (error) {
    logMatchListSoftFailure('owned_contact_name_overlay', error)
  }

  return new Map(
    rows.map((row) => [
      row.guest_id,
      {
        id: row.guest_id,
        display_name: ownedContactNameByGuestId.get(row.guest_id) ?? row.display_name,
        person_id: row.person_id,
      } as Guest,
    ]),
  )
}

export async function getMatchesWithSummary(supabase: Client): Promise<MatchSummary[]> {
  // 1. Fetch matches.
  const matchesRes = await supabase.from('matches').select('*').order('match_date', { ascending: true })

  if (matchesRes.error) throw matchesRes.error

  const matches = matchesRes.data as Match[]

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
      ? fetchContactPlayerLookup(supabase, guestIds)
      : Promise.resolve(new Map<string, Guest>()),
  ])

  if (profilesRes.error) throw profilesRes.error

  profileMap = new Map(((profilesRes.data || []) as ProfileDisplay[]).map(p => [p.id, p]))
  guestMap = guestsRes

  // 4. Group participants by match and compute summaries
  const participantsByMatch = new Map<string, MatchParticipant[]>()
  for (const p of participants) {
    const list = participantsByMatch.get(p.match_id) || []
    list.push(p)
    participantsByMatch.set(p.match_id, list)
  }

  return matches.map(match => {
    const mps = participantsByMatch.get(match.id) || []
    const confirmed = mps.filter(isActiveConfirmedParticipant)
    const pending = mps.filter(isActivePendingParticipant)

    return {
      ...match,
      organizer_name: getDisplayName(match.organizer_id, null, profileMap, guestMap),
      confirmed_count: confirmed.length,
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
    guestMap = await fetchContactPlayerLookup(supabase, guestIds)
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

export async function getVenues(
  supabase: Client,
  options?: {
    relatedOnly?: boolean
  },
) {
  if (options?.relatedOnly) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) throw userError
    if (!user) return [] as Venue[]

    const { data: relationshipRows, error: relationshipError } = await supabase
      .from('venue_user_relationships')
      .select('venue_id, relationship_type')
      .eq('user_id', user.id)
      .in('relationship_type', ['member', 'starred'])

    if (relationshipError) throw relationshipError

    const venueIds = [
      ...new Set(
        ((relationshipRows ?? []) as Array<{ venue_id: string; relationship_type: 'member' | 'starred' }>)
          .map((row) => row.venue_id)
          .filter(Boolean),
      ),
    ]

    if (venueIds.length === 0) return [] as Venue[]

    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .in('id', venueIds)
      .order('name', { ascending: true })

    if (error) throw error
    return data as Venue[]
  }

  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data as Venue[]
}

export async function getCourts(supabase: Client, venueId: string, sportId?: number) {
  let query = supabase
    .from('courts')
    .select('*')
    .eq('venue_id', venueId)
    .order('sport_id', { ascending: true })
    .order('court_code', { ascending: true })

  if (sportId !== undefined) {
    query = query.eq('sport_id', sportId)
  }

  const { data, error } = await query

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
 * when match_date or start_time change (requires match to have a venue_id).
 */
export async function updateMatchDetails(
  supabase: Client,
  matchId: string,
  data: {
    match_date?: string | null
    start_time?: string | null
    duration_minutes?: number | null
    player_reminder_minutes?: number | null
    required_count?: number | null
    invitation_scope_group_ids?: string[] | null
    invitation_scope_user_ids?: string[] | null
    doubles_format?: MatchDoublesFormat | null
    organizer_note?: string | null
  }
): Promise<void> {
  const updateData: Record<string, unknown> = {}
  if (data.match_date !== undefined) updateData.match_date = data.match_date
  if (data.start_time !== undefined) updateData.start_time = data.start_time
  if (data.duration_minutes !== undefined) updateData.duration_minutes = data.duration_minutes
  if (data.player_reminder_minutes !== undefined) updateData.player_reminder_minutes = data.player_reminder_minutes
  if (data.required_count !== undefined) updateData.required_count = data.required_count
  if (data.invitation_scope_group_ids !== undefined) updateData.invitation_scope_group_ids = data.invitation_scope_group_ids
  if (data.invitation_scope_user_ids !== undefined) updateData.invitation_scope_user_ids = data.invitation_scope_user_ids
  if (data.doubles_format !== undefined) updateData.doubles_format = data.doubles_format
  if (data.organizer_note !== undefined) updateData.organizer_note = data.organizer_note
  if (Object.keys(updateData).length === 0) return
  const { error } = await supabase.from('matches').update(updateData).eq('id', matchId)
  if (error) throw error
}

export async function getMatchCourtOffers(supabase: Client, matchId: string) {
  const { data, error } = await supabase
    .from('match_court_offers')
    .select('*')
    .eq('match_id', matchId)
    .neq('status', 'released')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as MatchCourtOffer[]
}

export async function submitMatchCourtOffer(
  supabase: Client,
  matchId: string,
  courtLabel: string,
  note?: string | null,
) {
  const { data, error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_court_submit_offer',
      args: { p_match_id: string; p_court_label: string; p_note: string | null }
    ) => Promise<{ data: MatchCourtOffer | null; error: Error | null }>
  }).rpc('rpc_match_court_submit_offer', {
    p_match_id: matchId,
    p_court_label: courtLabel,
    p_note: note ?? null,
  })

  if (error) throw error
  return data as MatchCourtOffer
}

export async function updateMatchCourtOffer(
  supabase: Client,
  offerId: string,
  data: {
    court_label?: string
    note?: string | null
    status?: MatchCourtOfferStatus
  },
) {
  const updateData: Record<string, unknown> = {}
  if (data.court_label !== undefined) updateData.court_label = data.court_label.trim()
  if (data.note !== undefined) updateData.note = data.note?.trim() || null
  if (data.status !== undefined) updateData.status = data.status

  const { data: updated, error } = await supabase
    .from('match_court_offers')
    .update(updateData)
    .eq('id', offerId)
    .select('*')
    .single()

  if (error) throw error
  return updated as MatchCourtOffer
}

export async function releaseMatchCourtOffer(supabase: Client, offerId: string) {
  return updateMatchCourtOffer(supabase, offerId, { status: 'released' })
}

export async function selectMatchCourtOffer(supabase: Client, matchId: string, offerId: string) {
  const { error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_court_select_offer',
      args: { p_match_id: string; p_offer_id: string }
    ) => Promise<{ error: Error | null }>
  }).rpc('rpc_match_court_select_offer', {
    p_match_id: matchId,
    p_offer_id: offerId,
  })
  if (error) throw error
}

export async function sendMatchMessage(
  supabase: Client,
  matchId: string,
  authorUserId: string,
  body: string,
): Promise<MatchMessage> {
  const trimmedBody = body.trim()
  if (!trimmedBody) {
    throw new Error('message_body_required')
  }

  const { data, error } = await supabase
    .from('match_messages')
    .insert({
      match_id: matchId,
      author_user_id: authorUserId,
      body: trimmedBody,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as MatchMessage
}

export async function updateMatchCourtPlan(
  supabase: Client,
  matchId: string,
  userId: string,
  data: {
    court_plan_mode: MatchCourtPlanMode
    court_note?: string | null
    final_court_label?: string | null
    court_labels?: string[] | null
  },
): Promise<void> {
  const normalizedCourtLabels =
    data.court_plan_mode === 'secured'
      ? (data.court_labels ?? [])
          .map((label) => label?.trim())
          .filter((label): label is string => Boolean(label))
      : []
  const finalCourtLabel =
    data.court_plan_mode === 'secured'
      ? normalizedCourtLabels[0] ?? (data.final_court_label?.trim() || null)
      : null

  const updateData: Record<string, unknown> = {
    court_plan_mode: data.court_plan_mode,
    court_note: data.court_note?.trim() || null,
    final_court_label: finalCourtLabel,
    finalized_by_user_id: finalCourtLabel || data.court_plan_mode === 'secured' ? userId : null,
    finalized_at: finalCourtLabel || data.court_plan_mode === 'secured' ? new Date().toISOString() : null,
  }

  const { error } = await supabase.from('matches').update(updateData).eq('id', matchId)
  if (error) throw error

  await setMatchCourts(supabase, matchId, normalizedCourtLabels.length > 0 ? normalizedCourtLabels : (finalCourtLabel ? [finalCourtLabel] : []), userId)
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

async function rebalanceMatchRoster(supabase: Client, matchId: string): Promise<void> {
  const { error } = await (supabase as Client & {
    rpc: (fn: 'rpc_match_rebalance_roster', args: { p_match_id: string }) => Promise<{ error: { message?: string } | null }>
  }).rpc('rpc_match_rebalance_roster', { p_match_id: matchId })
  if (error) throw error
}

export async function rebalanceMatchRosterAfterEdit(supabase: Client, matchId: string): Promise<void> {
  await rebalanceMatchRoster(supabase, matchId)
}

async function getParticipantMatchId(supabase: Client, participantId: string): Promise<string> {
  const { data, error } = await supabase
    .from('match_participants')
    .select('match_id')
    .eq('id', participantId)
    .single()
  if (error) throw error
  return (data as { match_id: string }).match_id
}

/** v1.5: Request to join a match. Requester must be in scope groups. Empty scope → rejected. */
export async function requestJoinMatch(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_request_join', { p_match_id: matchId })
  if (error) throw error
}

/** Canonical admission write. Organizer → invite (org_approved_at set). Returns participant. */
export async function admitUserToMatch(
  supabase: Client,
  matchId: string,
  targetUserId: string
): Promise<MatchParticipant> {
  const { data, error } = await supabase.rpc('rpc_match_admit_user', {
    p_match_id: matchId,
    p_target_user_id: targetUserId,
  })
  if (error) throw error
  return data as MatchParticipant
}

/** v1.5: ORG-only invite. Thin wrapper around rpc_match_admit_user. */
export async function inviteUserToMatch(supabase: Client, matchId: string, userId: string) {
  await admitUserToMatch(supabase, matchId, userId)
}

/** Participant-suggested registered-user invite. Compatibility RPC writes join_method=nominated. */
export async function inviteParticipantUserToMatch(supabase: Client, matchId: string, userId: string) {
  const { error } = await supabase.rpc('rpc_match_nominate_user', {
    p_match_id: matchId,
    p_user_id: userId,
  })
  if (error) throw error
}

/** v1.5: Accept a pending invitation. Writes participant_accepted_at + via=in_app. */
export async function acceptMatchInvite(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_accept_invite', { p_match_id: matchId })
  if (error) throw error
  await rebalanceMatchRoster(supabase, matchId)
}

/** v1.5: ORG approves a pending participant. Writes org_approved_at. */
export async function orgApproveParticipant(supabase: Client, participantId: string) {
  const { error } = await supabase.rpc('rpc_match_org_approve_participant', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
  await rebalanceMatchRoster(supabase, await getParticipantMatchId(supabase, participantId))
}

/** Legacy helper retained only to fail loudly after manual-confirm retirement. */
export async function manualConfirmUser(supabase: Client, matchId: string, userId: string) {
  void supabase
  void matchId
  void userId
  throw new Error('manual_confirm_retired_use_self_or_match_proxy')
}

/** Legacy helper retained only to fail loudly after manual-confirm retirement. */
export async function manualConfirmParticipant(supabase: Client, participantId: string, _note?: string) {
  void supabase
  void participantId
  throw new Error('manual_confirm_retired_use_self_or_match_proxy')
}

/** v1.5: User withdraws (decline invite or leave). Sets removed_at. */
export async function userWithdraw(supabase: Client, matchId: string, note?: string | null) {
  const trimmedNote = note?.trim() ? note.trim() : null
  const { error } = trimmedNote
    ? await (supabase as Client & {
        rpc: (
          fn: 'rpc_match_user_withdraw',
          args: { p_match_id: string; p_note?: string | null }
        ) => Promise<{ error: Error | null }>
      }).rpc('rpc_match_user_withdraw', {
        p_match_id: matchId,
        p_note: trimmedNote,
      })
    : await supabase.rpc('rpc_match_user_withdraw', {
        p_match_id: matchId,
      })

  if (error && trimmedNote && isMissingNoteRpcError(error)) {
    const { error: fallbackError } = await supabase.rpc('rpc_match_user_withdraw', {
      p_match_id: matchId,
    })
    if (fallbackError) throw fallbackError
    return
  }

  if (error) throw error
}

/** v1.5: ORG/manager removes participant. Sets removed_at. */
export async function removeParticipant(
  supabase: Client,
  participantId: string,
  note?: string | null,
) {
  const trimmedNote = note?.trim() ? note.trim() : null
  const { error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_remove_participant',
      args: { p_match_participant_id: string; p_note?: string | null }
    ) => Promise<{ error: Error | null }>
  }).rpc('rpc_match_remove_participant', {
    p_match_participant_id: participantId,
    p_note: trimmedNote,
  })

  if (error && isMissingRemoveNoteRpcError(error)) {
    const { error: fallbackError } = await supabase.rpc('rpc_match_remove_participant', {
      p_match_participant_id: participantId,
    })
    if (fallbackError) throw fallbackError
    return
  }

  if (error) throw error
}

// Deprecated addGuestOrg/addGuestParticipant paths have been replaced by the
// Invite People Contact Player model.

/** Invite an existing Contact Player into a match. Compatibility RPC keeps its historical name. */
export async function inviteContactGuestToMatch(
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

/** P4: Person-first Contact Player match invite wrapper. */
export async function inviteContactPersonToMatch(
  supabase: Client,
  matchId: string,
  personId: string,
) {
  const { error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_invite_contact_person',
      args: { p_match_id: string; p_person_id: string }
    ) => Promise<{ error: Error | null }>
  }).rpc('rpc_match_invite_contact_person', {
    p_match_id: matchId,
    p_person_id: personId,
  })
  if (error) throw error
}

/** Host-managed offline confirmation for a saved registered player. */
export async function hostAddUserAsConfirmed(
  supabase: Client,
  matchId: string,
  userId: string,
) {
  const { error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_host_add_user_confirmed',
      args: { p_match_id: string; p_target_user_id: string }
    ) => Promise<{ error: Error | null }>
  }).rpc('rpc_match_host_add_user_confirmed', {
    p_match_id: matchId,
    p_target_user_id: userId,
  })
  if (error) throw error
}

/** Host-managed offline confirmation for a visible Contact Player/person. */
export async function hostAddContactPersonAsConfirmed(
  supabase: Client,
  matchId: string,
  personId: string,
) {
  const { error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_host_add_contact_person_confirmed',
      args: { p_match_id: string; p_person_id: string }
    ) => Promise<{ error: Error | null }>
  }).rpc('rpc_match_host_add_contact_person_confirmed', {
    p_match_id: matchId,
    p_person_id: personId,
  })
  if (error) throw error
}

/** Host-managed offline confirmation for an existing match participant. */
export async function hostConfirmParticipantOffline(
  supabase: Client,
  participantId: string,
) {
  const { error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_host_confirm_participant_offline',
      args: { p_match_participant_id: string }
    ) => Promise<{ error: Error | null }>
  }).rpc('rpc_match_host_confirm_participant_offline', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
}

/** Player acknowledgement after being added through host-managed offline confirmation. */
export async function reconfirmMatchParticipation(supabase: Client, matchId: string) {
  const { error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_reconfirm_participation',
      args: { p_match_id: string }
    ) => Promise<{ error: Error | null }>
  }).rpc('rpc_match_reconfirm_participation', {
    p_match_id: matchId,
  })
  if (error) throw error
}

/** Canonical Match Proxy confirm. Current authority source must be an explicit Match Proxy binding. */
export async function proxyConfirmParticipant(
  supabase: Client,
  matchParticipantId: string,
) {
  const { error } = await supabase.rpc('rpc_match_proxy_confirm_participant', {
    p_match_participant_id: matchParticipantId,
  })
  if (error) throw error
  await rebalanceMatchRoster(supabase, await getParticipantMatchId(supabase, matchParticipantId))
}

export async function proxyDeclineParticipant(
  supabase: Client,
  matchParticipantId: string,
  note?: string | null,
) {
  const trimmedNote = note?.trim() ? note.trim() : null
  const { error } = trimmedNote
    ? await (supabase as Client & {
        rpc: (
          fn: 'rpc_match_proxy_decline_participant',
          args: { p_match_participant_id: string; p_note?: string | null }
        ) => Promise<{ error: Error | null }>
      }).rpc('rpc_match_proxy_decline_participant', {
        p_match_participant_id: matchParticipantId,
        p_note: trimmedNote,
      })
    : await supabase.rpc('rpc_match_proxy_decline_participant', {
        p_match_participant_id: matchParticipantId,
      })

  if (error && trimmedNote && isMissingNoteRpcError(error)) {
    const { error: fallbackError } = await supabase.rpc('rpc_match_proxy_decline_participant', {
      p_match_participant_id: matchParticipantId,
    })
    if (fallbackError) throw fallbackError
    return
  }

  if (error) throw error
}

export async function proxyWithdrawParticipant(
  supabase: Client,
  matchParticipantId: string,
  note?: string | null,
) {
  const trimmedNote = note?.trim() ? note.trim() : null
  const { error } = trimmedNote
    ? await (supabase as Client & {
        rpc: (
          fn: 'rpc_match_proxy_withdraw_participant',
          args: { p_match_participant_id: string; p_note?: string | null }
        ) => Promise<{ error: Error | null }>
      }).rpc('rpc_match_proxy_withdraw_participant', {
        p_match_participant_id: matchParticipantId,
        p_note: trimmedNote,
      })
    : await supabase.rpc('rpc_match_proxy_withdraw_participant', {
        p_match_participant_id: matchParticipantId,
      })

  if (error && trimmedNote && isMissingNoteRpcError(error)) {
    const { error: fallbackError } = await supabase.rpc('rpc_match_proxy_withdraw_participant', {
      p_match_participant_id: matchParticipantId,
    })
    if (fallbackError) throw fallbackError
    return
  }

  if (error) throw error
}

function isMissingNoteRpcError(error: Error) {
  return error.message.includes('Could not find the function public.rpc_match_user_withdraw(p_match_id, p_note)')
    || error.message.includes('Could not find the function public.rpc_match_proxy_decline_participant(p_match_participant_id, p_note)')
    || error.message.includes('Could not find the function public.rpc_match_proxy_withdraw_participant(p_match_participant_id, p_note)')
}

function isMissingRemoveNoteRpcError(error: Error) {
  return error.message.includes('Could not find the function public.rpc_match_remove_participant(p_match_participant_id, p_note)')
    || error.message.includes('Could not choose the best candidate function between: public.rpc_match_remove_participant(p_match_participant_id => uuid), public.rpc_match_remove_participant(p_match_participant_id => uuid, p_note => text)')
}

export async function requestMatchProxyBindingSelf(
  supabase: Client,
  proxyUserId: string,
) {
  const { data, error } = await supabase.rpc('rpc_match_proxy_request_self', {
    p_proxy_user_id: proxyUserId,
  })
  if (error) throw error
  return data as PersonMatchProxy
}

export async function revokeMatchProxyBindingSelf(
  supabase: Client,
  bindingId: string,
) {
  const { data, error } = await supabase.rpc('rpc_match_proxy_revoke_self', {
    p_binding_id: bindingId,
  })
  if (error) throw error
  return data as PersonMatchProxy
}

export async function getMatchProxyDashboard(supabase: Client): Promise<MatchProxyDashboardRow[]> {
  const { data, error } = await supabase.rpc('rpc_match_proxy_dashboard')
  if (error) throw error
  return (data ?? []) as MatchProxyDashboardRow[]
}

export async function approveMatchProxyBinding(supabase: Client, bindingId: string) {
  const { data, error } = await supabase.rpc('rpc_match_proxy_approve_binding', {
    p_binding_id: bindingId,
  })
  if (error) throw error
  return data as PersonMatchProxy
}

export async function declineMatchProxyBinding(supabase: Client, bindingId: string) {
  const { data, error } = await supabase.rpc('rpc_match_proxy_decline_binding', {
    p_binding_id: bindingId,
  })
  if (error) throw error
  return data as PersonMatchProxy
}

export async function requestMatchProxyBindingForContactPlayer(
  supabase: Client,
  guestId: string,
) {
  const { data, error } = await supabase.rpc('rpc_match_proxy_request_contact_player', {
    p_guest_id: guestId,
  })
  if (error) throw error
  return data as PersonMatchProxy
}

export async function inviteGroupToMatch(supabase: Client, matchId: string, groupId: string): Promise<MatchGroupInvite | null> {
  const { data, error } = await supabase.rpc('rpc_match_invite_group', {
    p_match_id: matchId,
    p_group_id: groupId,
  })
  if (error) throw error
  return ((data ?? [])[0] ?? null) as MatchGroupInvite | null
}

export async function revokeGroupInvite(supabase: Client, matchId: string, groupId: string): Promise<MatchGroupInvite | null> {
  const { data, error } = await supabase.rpc('rpc_match_revoke_group_invite', {
    p_match_id: matchId,
    p_group_id: groupId,
  })
  if (error) throw error
  return ((data ?? [])[0] ?? null) as MatchGroupInvite | null
}

export async function getMatchGroupInvitations(supabase: Client, matchId: string): Promise<MatchGroupInvite[]> {
  const { data, error } = await supabase.rpc('rpc_match_group_invitations', {
    p_match_id: matchId,
  })
  if (error) throw error
  return (data ?? []) as MatchGroupInvite[]
}

export async function getMyMatchGroupInvites(supabase: Client, matchId: string): Promise<MatchGroupInvite[]> {
  const { data, error } = await supabase.rpc('rpc_match_my_group_invites', {
    p_match_id: matchId,
  })
  if (error) throw error
  return (data ?? []) as MatchGroupInvite[]
}

export async function acceptGroupMatchInvite(supabase: Client, matchId: string) {
  const { error } = await supabase.rpc('rpc_match_accept_group_invite', {
    p_match_id: matchId,
  })
  if (error) throw error
}

export async function getProxyManageableParticipantIds(
  supabase: Client,
  matchId: string,
) {
  const { data, error } = await supabase.rpc('rpc_match_proxy_manageable_participants', {
    p_match_id: matchId,
  })
  if (error) throw error
  return new Set(((data ?? []) as { match_participant_id: string }[]).map((row) => row.match_participant_id))
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
    player_reminder_minutes?: number | null
    game_type?: string
    venue_id?: string
    court_slots?: { court_label: string }[]
    invitation_scope_group_ids?: string[]
    invitation_scope_user_ids?: string[]
    can_participants_invite_users?: boolean
    can_participants_manage_participants?: boolean
    sport_id?: number  // v1.6.3: rpc_match_create doesn't accept p_sport_id; we update after create
    court_plan_mode?: MatchCourtPlanMode
    court_note?: string | null
    required_court_count?: number
    final_court_label?: string | null
    court_labels?: string[] | null
    doubles_format?: MatchDoublesFormat | null
    organizer_note?: string | null
    recurring_series_id?: string | null
    recurring_instance_index?: number | null
  }
) {
  // Only pass explicitly-set values; omitted args use RPC/DB defaults as single source of truth
  const args: Record<string, unknown> = {}
  if (data.required_count != null) args.p_required_count = data.required_count
  if (data.game_type) args.p_game_type = data.game_type
  if (data.match_date) args.p_match_date = data.match_date
  if (data.start_time) args.p_start_time = data.start_time
  if (data.duration_minutes != null) args.p_duration_minutes = data.duration_minutes
  if (data.venue_id) args.p_venue_id = data.venue_id
  if (data.invitation_scope_group_ids?.length) args.p_invitation_scope_group_ids = data.invitation_scope_group_ids
  // Always pass the direct-user scope when this caller knows about it so PostgREST
  // resolves the newer rpc_match_create signature instead of the legacy overload.
  if (Object.prototype.hasOwnProperty.call(data, 'invitation_scope_user_ids')) {
    args.p_invitation_scope_user_ids = data.invitation_scope_user_ids ?? []
  }
  if (data.can_participants_invite_users != null) args.p_can_participants_invite_users = data.can_participants_invite_users
  if (data.can_participants_manage_participants != null) args.p_can_participants_manage_participants = data.can_participants_manage_participants

  const { data: match, error } = await supabase.rpc('rpc_match_create', args)

  if (error) throw error
  const created = match as Match

  // The latest request-scope overload of rpc_match_create currently inserts the
  // organizer participant without reconciling status. Reconcile it here so the
  // organizer lands as confirmed immediately after creation.
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: organizerParticipant, error: organizerParticipantError } = await supabase
      .from('match_participants')
      .select('id')
      .eq('match_id', created.id)
      .eq('user_id', user.id)
      .is('removed_at', null)
      .maybeSingle()
    if (organizerParticipantError) throw organizerParticipantError
    if (organizerParticipant?.id) {
      const { error: reconcileError } = await (supabase as Client & {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: Error | null }>
      }).rpc('match_participant_reconcile_status', {
        p_mp_id: organizerParticipant.id,
      })
      if (reconcileError) throw reconcileError
    }
  }

  // Insert court slots into match_courts table
  if (data.court_slots?.length) {
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

  if (data.doubles_format !== undefined) {
    const { error: doublesFormatError } = await supabase
      .from('matches')
      .update({ doubles_format: data.doubles_format })
      .eq('id', created.id)
    if (doublesFormatError) throw doublesFormatError
    created.doubles_format = data.doubles_format
  }

  if (data.organizer_note !== undefined) {
    const organizerNote = data.organizer_note?.trim() || null
    const { error: organizerNoteError } = await supabase
      .from('matches')
      .update({ organizer_note: organizerNote })
      .eq('id', created.id)
    if (organizerNoteError) throw organizerNoteError
    created.organizer_note = organizerNote
  }

  if (data.player_reminder_minutes !== undefined) {
    const { error: reminderError } = await supabase
      .from('matches')
      .update({ player_reminder_minutes: data.player_reminder_minutes })
      .eq('id', created.id)
    if (reminderError) throw reminderError
    created.player_reminder_minutes = data.player_reminder_minutes
  }

  if (data.required_court_count !== undefined) {
    const requiredCourtCount = Math.min(6, Math.max(1, data.required_court_count))
    const { error: requiredCourtCountError } = await supabase
      .from('matches')
      .update({ required_court_count: requiredCourtCount })
      .eq('id', created.id)
    if (requiredCourtCountError) throw requiredCourtCountError
    created.required_court_count = requiredCourtCount
  }

  if (data.recurring_series_id !== undefined || data.recurring_instance_index !== undefined) {
    const { error: recurringError } = await supabase
      .from('matches')
      .update({
        recurring_series_id: data.recurring_series_id ?? null,
        recurring_instance_index: data.recurring_instance_index ?? null,
      })
      .eq('id', created.id)
    if (recurringError) throw recurringError
    created.recurring_series_id = data.recurring_series_id ?? null
    created.recurring_instance_index = data.recurring_instance_index ?? null
  }

  if (data.court_plan_mode) {
    if (user) {
      await updateMatchCourtPlan(supabase, created.id, user.id, {
        court_plan_mode: data.court_plan_mode,
        court_note: data.court_note ?? null,
        final_court_label: data.final_court_label ?? null,
        court_labels: data.court_labels ?? data.court_slots?.map((slot) => slot.court_label) ?? null,
      })
      created.court_plan_mode = data.court_plan_mode
      created.court_note = data.court_note ?? null
      created.final_court_label = data.court_plan_mode === 'secured'
        ? ((data.court_labels ?? data.court_slots?.map((slot) => slot.court_label) ?? []).find((label) => label?.trim())?.trim() || (data.final_court_label?.trim() || null))
        : null
      created.finalized_by_user_id = data.court_plan_mode === 'secured' ? user.id : null
      created.finalized_at = data.court_plan_mode === 'secured' ? new Date().toISOString() : null
    }
  }

  return created
}

// ============================================================================
// v1.4.1 enriched data loaders
// ============================================================================

async function fetchSharedGroupMap(
  supabase: Client,
  viewerUserId: string | null,
  targetUserIds: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>()
  const uniqueTargetUserIds = Array.from(new Set(targetUserIds.filter(Boolean)))

  if (!viewerUserId || uniqueTargetUserIds.length === 0) {
    return result
  }

  for (const userId of uniqueTargetUserIds) {
    if (userId === viewerUserId) {
      result.set(userId, true)
    }
  }

  const queryUserIds = Array.from(new Set([viewerUserId, ...uniqueTargetUserIds]))
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, user_id')
    .in('user_id', queryUserIds)
    .eq('status', 'active')

  if (error) throw error

  const viewerGroupIds = new Set(
    ((data ?? []) as { group_id: string; user_id: string }[])
      .filter((row) => row.user_id === viewerUserId)
      .map((row) => row.group_id),
  )

  for (const row of (data ?? []) as { group_id: string; user_id: string }[]) {
    if (row.user_id !== viewerUserId && viewerGroupIds.has(row.group_id)) {
      result.set(row.user_id, true)
    }
  }

  return result
}

function resolveNameFromMaps(
  userId: string | null,
  guestId: string | null,
  profileMap: Map<string, string>,
  guestMap: Map<string, string>,
): string {
  if (guestId) return guestMap.get(guestId)?.trim() || 'Contact Player'
  if (!userId) return 'Unknown'
  return profileMap.get(userId) ?? 'Unknown'
}

function getExitActionLabel(
  participant: Pick<MatchParticipantEnriched, 'removed_by' | 'user_id' | 'removal_note'>,
): MatchLineupShortWarning['actionLabel'] {
  const removalNote = (participant.removal_note ?? '').toLowerCase()

  if (removalNote.includes('declined')) return 'declined'
  if (
    participant.removed_by &&
    participant.user_id &&
    participant.removed_by === participant.user_id
  ) {
    return 'left'
  }
  if (
    removalNote.includes('withdraw') ||
    removalNote.includes('left') ||
    removalNote.includes('out_after_formed') ||
    removalNote.includes('out_after_confirmed')
  ) {
    return 'left'
  }
  return 'was removed'
}

function getLineupShortWarning(
  match: Match,
  participants: MatchParticipantEnriched[],
  confirmedCount: number,
): MatchLineupShortWarning | null {
  if (match.status !== 'active' || !match.formed_at || confirmedCount >= match.required_count) {
    return null
  }

  const formedAtMs = new Date(match.formed_at).getTime()
  const exitedAfterFormation = participants
    .filter((participant) => {
      if (!participant.removed_at) return false
      const removedAtMs = new Date(participant.removed_at).getTime()
      if (Number.isNaN(removedAtMs) || removedAtMs < formedAtMs) return false

      return participant.participant_accepted_at !== null && participant.org_approved_at !== null
    })
    .sort((a, b) => {
      const aTime = a.removed_at ? new Date(a.removed_at).getTime() : 0
      const bTime = b.removed_at ? new Date(b.removed_at).getTime() : 0
      return bTime - aTime
    })

  const latestExit = exitedAfterFormation[0]
  if (!latestExit?.removed_at) {
    return null
  }

  return {
    playerName: latestExit.display_name,
    happenedAt: latestExit.removed_at,
    actionLabel: getExitActionLabel(latestExit),
    confirmedCount,
    targetCount: match.required_count,
    leftCount: exitedAfterFormation.length,
  }
}

/**
 * Fetch all visible matches for the list page, enriched with:
 * - venue timezone (for time formatting)
 * - per-participant display names (venue handle preferred, profile fallback)
 * - confirmed/pending counts
 * - caller's own participant row
 */
export async function getMatchListData(
  supabase: Client,
  userId: string | null,
): Promise<MatchListItem[]> {
  const matchesRes = userId
    ? await (supabase as Client & {
        rpc: (
          fn: 'rpc_my_match_list_v2',
          args?: Record<string, never>
        ) => Promise<{ data: Match[] | null; error: Error | null }>
      }).rpc('rpc_my_match_list_v2')
    : await supabase
        .from('matches')
        .select('*')
        .order('start_at_utc', { ascending: true })
  if (matchesRes.error) throw matchesRes.error

  const matches = matchesRes.data as Match[]
  if (matches.length === 0) return []

  const matchIds = matches.map(m => m.id)
  const matchIdChunks = chunkValues(matchIds, MATCH_LIST_BATCH_SIZE)
  const venueIds = [...new Set(matches.filter(m => m.venue_id).map(m => m.venue_id as string))]
  const sportIds = [...new Set(matches.map(m => m.sport_id).filter((id): id is number => id != null))]

  const [participantChunkResults, venuesRes, sportsRes] = await Promise.all([
    Promise.all(
      matchIdChunks.map((chunk) =>
        supabase.from('match_participants').select('*').in('match_id', chunk),
      ),
    ),
    venueIds.length > 0
      ? supabase.from('venues').select('id, name, timezone').in('id', venueIds)
      : Promise.resolve({ data: [], error: null }),
    sportIds.length > 0
      ? supabase.from('sports').select('id, display_name').in('id', sportIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const participantsError = participantChunkResults.find((result) => result.error)?.error ?? null
  if (participantsError) throw participantsError
  if (venuesRes.error) throw venuesRes.error
  if (sportsRes.error) throw sportsRes.error

  const allParticipants = participantChunkResults.flatMap(
    (result) => ((result.data ?? []) as MatchParticipant[]),
  )
  const venueMap = new Map(
    ((venuesRes.data ?? []) as { id: string; name: string; timezone: string }[])
      .map(venue => [venue.id, venue])
  )
  const sportMap = new Map(
    ((sportsRes.data ?? []) as { id: number; display_name: string }[])
      .map(sport => [sport.id, sport.display_name])
  )

  const userIds = [...new Set([
    ...allParticipants.filter(p => p.user_id).map(p => p.user_id as string),
    ...allParticipants.filter(p => p.manual_confirmed_by).map(p => p.manual_confirmed_by as string),
  ])]
  const guestIds = [...new Set(allParticipants.filter(p => p.guest_id).map(p => p.guest_id as string))]
  const guestParticipantIds = allParticipants.filter(p => p.guest_id).map(p => p.id)

  const [profilesRes, guestsRes, identityLinksRes, contactIdentityLinksRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profiles').select('id, display_name, avatar_url, gender').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    guestIds.length > 0
      ? (async () => {
          try {
            return await fetchContactPlayerLookup(supabase, guestIds)
          } catch (error) {
            logMatchListSoftFailure('contact_player_lookup', error)
            return new Map<string, Guest>()
          }
        })()
      : Promise.resolve(new Map<string, Guest>()),
    userId && guestParticipantIds.length > 0
      ? (async () => {
          const r = await supabase.from('identity_links').select('linked_id, user_id').eq('user_id', userId).eq('linked_type', 'guest_participant').in('linked_id', guestParticipantIds)
          return r.error ? { data: [] } : r
        })()
      : Promise.resolve({ data: [] }),
    userId && guestIds.length > 0
      ? (async () => {
          const r = await supabase
            .from('identity_links')
            .select('linked_id, user_id')
            .eq('user_id', userId)
            .eq('linked_type', 'contact')
            .in('linked_id', guestIds)
          return r.error ? { data: [] } : r
        })()
      : Promise.resolve({ data: [] }),
  ])
  if (profilesRes.error) {
    logMatchListSoftFailure('profiles', profilesRes.error)
  }

  const profileDisplayMap = new Map(
    (((profilesRes.error ? [] : (profilesRes.data ?? []))) as Array<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'gender'>>).map(p => [p.id, p]),
  )
  const profileMap = new Map(
    (((profilesRes.error ? [] : (profilesRes.data ?? []))) as Array<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'gender'>>).map(p => [p.id, p.display_name]),
  )
  const guestMap = new Map(Array.from(guestsRes.entries()).map(([guestId, guest]) => [guestId, guest.display_name]))
  const participantLinkedToUser = new Map(
    ((identityLinksRes.data ?? []) as { linked_id: string; user_id: string }[]).map((r) => [r.linked_id, r.user_id])
  )
  const contactLinkedToUser = new Map(
    ((contactIdentityLinksRes.data ?? []) as { linked_id: string; user_id: string }[]).map((r) => [r.linked_id, r.user_id])
  )

  const byMatch = new Map<string, MatchParticipant[]>()
  for (const p of allParticipants) {
    const arr = byMatch.get(p.match_id) ?? []
    arr.push(p)
    byMatch.set(p.match_id, arr)
  }

  return matches.map(match => {
    const venue = match.venue_id ? (venueMap.get(match.venue_id) ?? null) : null
    const mps = byMatch.get(match.id) ?? []

    const enriched: MatchParticipantEnriched[] = mps.map(p => {
      const linkedUserId = p.guest_id
        ? (participantLinkedToUser.get(p.id) ?? contactLinkedToUser.get(p.guest_id) ?? null)
        : null
      const effectiveUserId = p.user_id ?? linkedUserId
      const displayName = effectiveUserId
        ? (profileMap.get(effectiveUserId) ?? resolveNameFromMaps(p.user_id, p.guest_id, profileMap, guestMap))
        : resolveNameFromMaps(p.user_id, p.guest_id, profileMap, guestMap)
      const profileDisplay = effectiveUserId ? profileDisplayMap.get(effectiveUserId) : null
      return {
        ...p,
        display_name: displayName,
        avatar_url: profileDisplay?.avatar_url ?? null,
        gender: normalizeMatchGender(profileDisplay?.gender ?? null),
        manual_confirmed_by_name: p.manual_confirmed_by ? (profileMap.get(p.manual_confirmed_by) ?? null) : null,
      }
    })

    const confirmed = enriched.filter(isActiveConfirmedParticipant)
    const pending = enriched.filter(isActivePendingParticipant)
    const waiting = enriched.filter(isActiveWaitingListParticipant)
    const canonicalConfirmedCount = enriched.filter(isCanonicalConfirmedParticipant).length
    const myParticipant = userId
      ? (enriched.find(
          p =>
            p.user_id === userId ||
            participantLinkedToUser.get(p.id) === userId ||
            (p.guest_id ? contactLinkedToUser.get(p.guest_id) === userId : false),
        ) ?? null)
      : null
    const rosterInsight = deriveMatchRosterInsight(match, enriched)
    const lineupShortWarning = getLineupShortWarning(match, enriched, canonicalConfirmedCount)

    return {
      match,
      venueTimezone: venue?.timezone ?? null,
      venueName: venue?.name ?? null,
      sportName: sportMap.get(match.sport_id) ?? null,
      courtState: deriveMatchCourtStatus({
        matchStatus: match.status,
        courtPlanMode: match.court_plan_mode,
        finalCourtLabel: match.final_court_label,
      }),
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      waitingCount: waiting.length,
      isFormed: Boolean(match.formed_at),
      participants: enriched,
      myParticipant,
      rosterInsight,
      lineupShortWarning,
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
  const [matchRes, participantsRes, actionsRes, formedRes, proxyManageableRes] = await Promise.all([
    supabase.from('matches').select('*').eq('id', matchId).single(),
    supabase.from('match_participants').select('*').eq('match_id', matchId).order('created_at', { ascending: true }),
    supabase.from('match_participant_actions').select('*').eq('match_id', matchId).order('created_at', { ascending: false }),
    supabase.from('match_formed').select('*').eq('match_id', matchId).maybeSingle(),
    userId
      ? supabase.rpc('rpc_match_proxy_manageable_participants', { p_match_id: matchId })
      : Promise.resolve({ data: [] }),
  ])
  if (matchRes.error) throw matchRes.error
  if (participantsRes.error) throw participantsRes.error
  if (actionsRes.error) {
    logMatchDetailSoftFailure(matchId, 'match_participant_actions', actionsRes.error)
  }
  if (formedRes.error) {
    logMatchDetailSoftFailure(matchId, 'match_formed', formedRes.error)
  }
  if ('error' in proxyManageableRes && proxyManageableRes.error) {
    logMatchDetailSoftFailure(matchId, 'proxy_manageable_participants', proxyManageableRes.error)
  }

  const match = matchRes.data as Match
  const isOrganizerViewer = Boolean(userId && match.organizer_id === userId)
  const participants = ((participantsRes.data ?? []) as MatchParticipant[]).map((participant) => {
    const isSelfParticipant = Boolean(userId && participant.user_id === userId)
    if (isOrganizerViewer || isSelfParticipant) return participant
    if (
      participant.confirmation_source === 'host_managed_offline'
      || participant.confirmation_source === 'contact_owner_managed'
      || participant.participant_accepted_via === 'host_offline_confirmation'
    ) {
      return {
        ...participant,
        participant_accepted_via: null,
        manual_confirmed_by: null,
        confirmation_source: null,
        confirmed_by_user_id: null,
        confirmed_by_host_id: null,
        confirmed_by_host_at: null,
        host_confirmed_at: null,
        confirmation_note: null,
      }
    }
    return participant
  })
  const actions = actionsRes.error ? [] : ((actionsRes.data ?? []) as MatchParticipantAction[])

  // Fetch venue
  type VenueRow = { id: string; name: string; timezone: string }
  let venue: VenueRow | null = null
  if (match.venue_id) {
    const { data } = await supabase
      .from('venues')
      .select('id, name, timezone')
      .eq('id', match.venue_id)
      .single()
    venue = data as unknown as VenueRow | null
  }

  // Collect IDs needed for name resolution (include organizer, participants, linked users for identity display)
  const userIds = [...new Set([
    match.organizer_id,
    ...participants.filter(p => p.user_id).map(p => p.user_id as string),
    ...actions.map(a => a.created_by),
    ...participants.map(p => p.nominated_by).filter((id): id is string => Boolean(id)),
    ...participants.map(p => p.created_by).filter((id): id is string => Boolean(id)),
    ...participants.filter(p => p.confirmed_by_user_id).map(p => p.confirmed_by_user_id as string),
    ...(userId ? [userId] : []),
  ])]
  const guestIds = [...new Set(participants.filter(p => p.guest_id).map(p => p.guest_id as string))]
  const guestParticipantIds = participants.filter(p => p.guest_id).map(p => p.id)
  const [profilesRes, guestsRes, identityLinksRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profiles').select('id, display_name, avatar_url, gender').in('id', userIds)
      : Promise.resolve({ data: [] }),
    guestIds.length > 0
      ? (async () => {
          try {
            return await fetchContactPlayerLookup(supabase, guestIds)
          } catch (error) {
            logMatchDetailSoftFailure(matchId, 'contact_player_lookup', error)
            return new Map<string, Guest>()
          }
        })()
      : Promise.resolve(new Map<string, Guest>()),
    userId && guestParticipantIds.length > 0
      ? (async () => {
          const r = await supabase.from('identity_links').select('linked_id, user_id').eq('user_id', userId).eq('linked_type', 'guest_participant').in('linked_id', guestParticipantIds)
          return r.error ? { data: [] } : r
        })()
      : Promise.resolve({ data: [] }),
  ])

  const profileDisplayMap = new Map(
    ((profilesRes.data ?? []) as Array<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'gender'>>).map(p => [p.id, p]),
  )
  const profileMap = new Map(
    ((profilesRes.data ?? []) as Array<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'gender'>>).map(p => [p.id, p.display_name]),
  )
  const guestMap = new Map(Array.from(guestsRes.entries()).map(([guestId, guest]) => [guestId, guest.display_name]))
  const guestPersonIds = Array.from(
    new Set(
      Array.from(guestsRes.values())
        .map((guest) => guest.person_id ?? null)
        .filter((personId): personId is string => Boolean(personId)),
    ),
  )

  const participantLinkedToUser = new Map(
    ((identityLinksRes.data ?? []) as { linked_id: string; user_id: string }[]).map((r) => [r.linked_id, r.user_id])
  )
  const proxyManageableParticipantIds = new Set(
    ((('error' in proxyManageableRes && proxyManageableRes.error) ? [] : (proxyManageableRes.data ?? [])) as { match_participant_id: string }[])
      .map((row) => row.match_participant_id)
  )
  const [savedContactRelationshipsRes, ownedGuestsRes] = await Promise.all([
    userId && guestPersonIds.length > 0
      ? supabase
          .from('person_relationships')
          .select('person_id')
          .eq('actor_user_id', userId)
          .eq('relationship_type', 'saved')
          .in('person_id', guestPersonIds)
      : Promise.resolve({ data: [] }),
    userId && guestIds.length > 0
      ? supabase
          .from('guests')
          .select('id')
          .eq('created_by', userId)
          .in('id', guestIds)
      : Promise.resolve({ data: [] }),
  ])
  if ('error' in savedContactRelationshipsRes && savedContactRelationshipsRes.error) {
    logMatchDetailSoftFailure(matchId, 'saved_contact_relationships', savedContactRelationshipsRes.error)
  }
  if ('error' in ownedGuestsRes && ownedGuestsRes.error) {
    logMatchDetailSoftFailure(matchId, 'owned_match_contact_guests', ownedGuestsRes.error)
  }
  const savedContactPersonIdSet = new Set(
    (((('error' in savedContactRelationshipsRes && savedContactRelationshipsRes.error) ? [] : (savedContactRelationshipsRes.data ?? []))) as { person_id: string }[])
      .map((relationship) => relationship.person_id),
  )
  const ownedGuestIdSet = new Set(
    (((('error' in ownedGuestsRes && ownedGuestsRes.error) ? [] : (ownedGuestsRes.data ?? []))) as { id: string }[])
      .map((guest) => guest.id),
  )

  const scopeGroupIds = match.invitation_scope_group_ids ?? []
  const [scopeGroupsRes, sportRes, groupInvitations, myGroupInvites] = await Promise.all([
    scopeGroupIds.length > 0
      ? supabase.from('groups').select('id, name').in('id', scopeGroupIds)
      : Promise.resolve({ data: [] }),
    supabase.from('sports').select('display_name').eq('id', match.sport_id).single(),
    getMatchGroupInvitations(supabase, matchId).catch((error) => {
      logMatchDetailSoftFailure(matchId, 'match_group_invitations', error)
      return [] as MatchGroupInvite[]
    }),
    userId
      ? getMyMatchGroupInvites(supabase, matchId).catch((error) => {
          logMatchDetailSoftFailure(matchId, 'my_match_group_invites', error)
          return [] as MatchGroupInvite[]
        })
      : Promise.resolve([] as MatchGroupInvite[]),
  ])
  const sharedGroupMap = await (async () => {
    try {
      return await fetchSharedGroupMap(
        supabase,
        userId,
        participants
          .filter((participant) => participant.user_id)
          .map((participant) => participant.user_id as string),
      )
    } catch (error) {
      logMatchDetailSoftFailure(matchId, 'shared_group_map', error)
      return new Map<string, boolean>()
    }
  })()
  const publicSignupMetadataByParticipantId = new Map<string, PublicSignupParticipantMetadata>()
  if (isOrganizerViewer) {
    try {
      const { data, error } = await supabase.rpc('rpc_public_match_signup_participant_metadata', {
        p_match_id: matchId,
      })
      if (error) {
        logMatchDetailSoftFailure(matchId, 'public_match_signup_participant_metadata', error)
      } else {
        for (const row of (data ?? []) as PublicSignupParticipantMetadata[]) {
          publicSignupMetadataByParticipantId.set(row.match_participant_id, row)
        }
      }
    } catch (error) {
      logMatchDetailSoftFailure(matchId, 'public_match_signup_participant_metadata', error)
    }
  }

  const resolve = (uid: string | null, gid: string | null) =>
    resolveNameFromMaps(uid, gid, profileMap, guestMap)
  const organizerName =
    profileDisplayMap.get(match.organizer_id)?.display_name
    ?? profileMap.get(match.organizer_id)
    ?? resolve(match.organizer_id, null)

  const enriched: MatchParticipantEnriched[] = participants.map(p => {
    const publicSignupMetadata = publicSignupMetadataByParticipantId.get(p.id) ?? null
    const linkedUserId = p.guest_id ? participantLinkedToUser.get(p.id) : null
    const effectiveUserId = p.user_id ?? linkedUserId
    const profileDisplay = effectiveUserId ? profileDisplayMap.get(effectiveUserId) : null
    const displayName = effectiveUserId
      ? (profileDisplay?.display_name ?? profileMap.get(effectiveUserId) ?? 'Unknown')
      : resolve(p.user_id, p.guest_id)
    const guestPersonId = p.guest_id ? (guestsRes.get(p.guest_id)?.person_id ?? null) : null
    const invitedByUserId = p.nominated_by ?? p.created_by ?? null
    const invitedByName = isOrganizerViewer && invitedByUserId
      ? (profileMap.get(invitedByUserId) ?? null)
      : null
    return {
      ...p,
      display_name: displayName,
      avatar_url: profileDisplay?.avatar_url ?? null,
      gender: normalizeMatchGender(profileDisplay?.gender ?? null),
      participant_kind: effectiveUserId ? 'registered_user' : 'contact_player',
      invited_by_name: invitedByName,
      shares_group_with_viewer: effectiveUserId ? sharedGroupMap.get(effectiveUserId) ?? false : false,
      proxy_manageable_by_viewer: proxyManageableParticipantIds.has(p.id),
      saved_by_viewer: Boolean(
        (guestPersonId && savedContactPersonIdSet.has(guestPersonId))
        || (p.guest_id && ownedGuestIdSet.has(p.guest_id)),
      ),
      contact_player_person_id: guestPersonId,
      linked_user_id: linkedUserId,
      public_signup_source: publicSignupMetadata?.source ?? null,
      public_signup_email_verified: publicSignupMetadata?.email_verified ?? false,
      public_signup_phone_confirmed: publicSignupMetadata?.phone_confirmed ?? false,
      public_signup_status: publicSignupMetadata?.signup_status ?? null,
      public_signup_contact_state: publicSignupMetadata?.contact_state ?? null,
    }
  })

  const participantById = new Map(participants.map(p => [p.id, p]))
  const participantIdsWithPriorAcceptance = new Set(
    actions
      .filter(action =>
        action.action_type === 'accept'
        || action.action_type === 'accepted'
        || action.action_type === 'delegate_manual_confirm'
        || action.action_type === 'proxy_confirm'
        || action.action_type === 'manual_confirm'
      )
      .map(action => action.match_participant_id)
  )

  // v1.7: For actions whose subject we don't have (RLS may hide), fetch display names via RPC
  const missingParticipantIds = actions
    .map(a => a.match_participant_id)
    .filter((id): id is string => !!id && !participantById.has(id))
  const participantDisplayNames = new Map<string, string>()
  if (missingParticipantIds.length > 0) {
    try {
      const { data: namesData, error } = await supabase.rpc('rpc_match_participant_display_names', {
        p_match_id: matchId,
        p_participant_ids: missingParticipantIds,
      })
      if (error) {
        logMatchDetailSoftFailure(matchId, 'participant_display_names', error)
      } else {
        for (const row of (namesData ?? []) as { participant_id: string; display_name: string }[]) {
          participantDisplayNames.set(row.participant_id, row.display_name)
        }
      }
    } catch (error) {
      logMatchDetailSoftFailure(matchId, 'participant_display_names', error)
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

  const confirmed = enriched.filter(isActiveConfirmedParticipant)
  const pending = enriched.filter(isActivePendingParticipant)
  const waiting = enriched.filter(isActiveWaitingListParticipant)
  const isOrganizer = userId === match.organizer_id
  const myParticipant = userId
    ? (enriched.find(p => p.user_id === userId || participantLinkedToUser.get(p.id) === userId) ?? null)
    : null
  const isFormed = Boolean(match.formed_at)
  const hasActiveParticipantAccess = Boolean(
    myParticipant &&
    myParticipant.removed_at === null &&
    ['pending', 'confirmed', 'waiting_list'].includes(myParticipant.status)
  )
  const hasConfirmedParticipantAccess = Boolean(
    myParticipant &&
    myParticipant.removed_at === null &&
    myParticipant.status === 'confirmed'
  )
  const hasWaitingListParticipantAccess = Boolean(
    myParticipant &&
    myParticipant.removed_at === null &&
    myParticipant.status === 'waiting_list'
  )
  const inScopePreviewAccess = Boolean(
    userId &&
    !myParticipant &&
    (
      myGroupInvites.length > 0
      || (await isCallerInMatchScope(supabase, matchId).catch((error) => {
        logMatchDetailSoftFailure(matchId, 'is_caller_in_match_scope', error)
        return false
      }))
    )
  )
  const canAccessCommunication = Boolean(
    userId &&
    (
      isOrganizer ||
      (isFormed ? (hasConfirmedParticipantAccess || hasWaitingListParticipantAccess) : (hasActiveParticipantAccess || inScopePreviewAccess))
    ),
  )
  let messages: MatchMessageEnriched[] = []

  if (canAccessCommunication) {
    const { data: messagesData, error: messagesError } = await supabase
      .from('match_messages')
      .select('*')
      .eq('match_id', matchId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (messagesError) {
      logMatchDetailSoftFailure(matchId, 'match_messages', messagesError)
    } else {
      const rawMessages = ((messagesData ?? []) as MatchMessage[]).filter((message) => {
        if (isOrganizer) return true
        if (!userId) return false
        if (isFormed) {
          return match.formed_at !== null && message.created_at >= match.formed_at
        }
        return message.author_user_id === userId || message.author_user_id === match.organizer_id
      })
      const missingAuthorIds = Array.from(new Set(
        rawMessages
          .map((message) => message.author_user_id)
          .filter((authorId) => !profileDisplayMap.has(authorId)),
      ))
      const messageAuthorProfiles = new Map(profileDisplayMap)

      if (missingAuthorIds.length > 0) {
        const { data: authorProfiles, error: authorProfilesError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, gender')
          .in('id', missingAuthorIds)

        if (authorProfilesError) {
          logMatchDetailSoftFailure(matchId, 'message_author_profiles', authorProfilesError)
        } else {
          ;((authorProfiles ?? []) as Array<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'gender'>>)
            .forEach((profile) => {
              messageAuthorProfiles.set(profile.id, profile)
            })
        }
      }

      messages = rawMessages.map((message) => {
        const authorProfile = messageAuthorProfiles.get(message.author_user_id)
        return {
          ...message,
          author_name: authorProfile?.display_name ?? resolve(message.author_user_id, null),
          author_avatar_url: authorProfile?.avatar_url ?? null,
          is_organizer_author: message.author_user_id === match.organizer_id,
        }
      })
    }
  }

  const myParticipantNeedsReconfirm = Boolean(
    myParticipant
    && myParticipant.status === 'pending'
    && myParticipant.participant_accepted_at == null
    && myParticipant.org_approved_at != null
    && (
      participantIdsWithPriorAcceptance.has(myParticipant.id)
      || myParticipant.join_method === 'requested'
    )
  )
  const scopeGroups = ((scopeGroupsRes.data ?? []) as { id: string; name: string }[])
  const rosterInsight = deriveMatchRosterInsight(match, enriched)
  const canonicalConfirmedCount = enriched.filter(isCanonicalConfirmedParticipant).length
  const lineupShortWarning = isOrganizer
    ? getLineupShortWarning(match, enriched, canonicalConfirmedCount)
    : null
  const confirmedVisibleToParticipants = enriched
    .filter((participant) =>
      participant.status === 'confirmed' &&
      participant.removed_at === null &&
      participant.participant_accepted_at !== null &&
      participant.org_approved_at !== null)
    .map((participant) => {
      if (isOrganizer || participant.id === myParticipant?.id) return participant
      return {
        ...participant,
        user_id: null,
        guest_id: null,
        join_method: 'manual' as const,
        nominated_by: null,
        participant_accepted_at: null,
        participant_accepted_via: null,
        org_approved_at: null,
        org_approved_by: null,
        manual_confirmed_by: null,
        manual_confirmed_by_name: null,
        removed_at: null,
        removed_by: null,
        removal_note: null,
        waiting_list_at: null,
        source_contact_id: null,
        migrated_from_guest_id: null,
        source_person_id: null,
        contact_claim_id: null,
        replaced_by_participant_id: null,
        migrated_at: null,
        confirmation_source: null,
        confirmed_by_user_id: null,
        confirmed_by_host_id: null,
        confirmed_by_host_at: null,
        host_confirmed_at: null,
        confirmation_note: null,
        saved_by_viewer: false,
        proxy_manageable_by_viewer: false,
        contact_player_person_id: null,
        linked_user_id: null,
      }
    })
  const viewerOwnedPendingParticipants = userId
    ? enriched.filter((participant) =>
        participant.status === 'pending' &&
        participant.removed_at === null &&
        (
          participant.id === myParticipant?.id ||
          participant.user_id === userId ||
          participant.linked_user_id === userId ||
          participant.nominated_by === userId ||
          participant.created_by === userId
        ),
      )
    : []
  const nonOrganizerVisibleParticipants = Array.from(
    new Map(
      [...confirmedVisibleToParticipants, ...viewerOwnedPendingParticipants]
        .map((participant) => [participant.id, participant]),
    ).values(),
  )
  const participantsForViewer = isOrganizer ? enriched : nonOrganizerVisibleParticipants

  return {
    match,
    venueTimezone: venue?.timezone ?? null,
    venueName: venue?.name ?? null,
    participants: participantsForViewer,
    myParticipant,
    myParticipantNeedsReconfirm,
    isOrganizer,
    confirmedCount: confirmed.length,
      pendingCount: pending.length,
      waitingCount: waiting.length,
      activities,
      messages,
      organizerName,
      scopeGroups,
      groupInvitations,
      myGroupInvites,
    sportName: (sportRes.data as { display_name: string } | null)?.display_name ?? 'Unknown',
    rosterInsight,
    lineupShortWarning,
  }
}

// ============================================================================
// v1.6.1 Role-specific roster RPCs (replace rpc_match_scope_users)
// ============================================================================

export type ScopeUser = {
  id: string
  display_name: string
  source: string
  sourceLabel: string
}

function getAdmissionTargetSourceLabel(source: string): string {
  switch (source) {
    case 'invite_circle':
      return 'Saved'
    case 'roster_contacts':
      return 'Contacts'
    case 'direct_contact':
      return 'Contacts'
    case 'saved_contact':
      return 'Saved contacts'
    case 'group_contact':
      return 'Shared Group contacts'
    case 'direct_intro_share':
      return 'Intro'
    case 'groups':
      return 'Shared Groups'
    case 'club_members':
      return 'Venue members'
    case 'reentry':
      return 'Previously in this match'
    default:
      return source.replace(/_/g, ' ')
  }
}

/** Phase 3: Mixed admission target (user or Contact Player). */
export type AdmissionTarget = {
  target_kind: 'user' | 'contact_player'
  target_id: string
  display_name: string | null
  avatar_url: string | null
  source: string
  sourceLabel?: string
  action_kind: 'admit_user' | 'nominate_contact_player'
  can_admit: boolean
  eligible_via: string | null
  sort_name: string | null
}

/** P4: Contact Player target surfaced as a person-level card only. */
export type ContactPersonAdmissionTarget = {
  person_id: string
  display_name: string | null
  avatar_url: string | null
  source: string
  sourceLabel?: string
  can_invite: boolean
  eligible_via: string | null
  sort_name: string | null
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

/** P4: Person-level Contact Player invite targets. Does not expose guest/contact/channel IDs. */
export async function getContactPersonAdmissionTargets(
  supabase: Client,
  matchId: string,
  search?: string | null,
): Promise<ContactPersonAdmissionTarget[]> {
  const { data, error } = await (supabase as Client & {
    rpc: (
      fn: 'rpc_match_contact_person_targets',
      args: { p_match_id: string; p_search: string | null }
    ) => Promise<{ data: ContactPersonAdmissionTarget[] | null; error: Error | null }>
  }).rpc('rpc_match_contact_person_targets', {
    p_match_id: matchId,
    p_search: search ?? null,
  })
  if (error) throw error

  return (data ?? []).map((target) => ({
    ...target,
    sourceLabel: getAdmissionTargetSourceLabel(target.source),
  }))
}

/** Phase 3: User targets only (for InviteUserForm). Maps to ScopeUser for backward compat. */
export function admissionTargetsToScopeUsers(
  targets: AdmissionTarget[],
  options?: { requireCanAdmit?: boolean }
): ScopeUser[] {
  return targets
    .filter(t => t.action_kind === 'admit_user')
    .filter(t => !options?.requireCanAdmit || t.can_admit)
    .map(t => ({
      id: t.target_id,
      display_name: t.display_name ?? '',
      source: t.source,
      sourceLabel: getAdmissionTargetSourceLabel(t.source),
    }))
}

/** Legacy Contact Player target adapter. New flows should use person-level ContactPersonAdmissionTarget. */
export function admissionTargetsToContactPlayers(targets: AdmissionTarget[]): { guest_id: string; display_name: string; email: string | null; source: string; sourceLabel: string }[] {
  return targets
    .filter(t => t.action_kind === 'nominate_contact_player')
    .map(t => ({
      guest_id: t.target_id,
      display_name: t.display_name ?? '',
      email: null,
      source: t.source,
      sourceLabel: getAdmissionTargetSourceLabel(t.source),
    }))
}

