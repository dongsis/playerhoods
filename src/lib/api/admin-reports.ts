import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Match, MatchParticipant, MatchParticipantAction, Profile, Venue } from '@/lib/types/database'

type AdminClient = SupabaseClient<any>

type ReportProfile = Pick<Profile, 'id' | 'display_name' | 'created_at' | 'primary_venue_id' | 'onboarding_profile_completed' | 'onboarding_completed'>
type ReportVenue = Pick<Venue, 'id' | 'name' | 'abbreviation' | 'city'>
type ReportMatch = Pick<Match, 'id' | 'organizer_id' | 'status' | 'venue_id' | 'match_date' | 'start_time' | 'game_type' | 'doubles_format' | 'created_at' | 'sport_id'>
type ReportParticipant = Pick<
  MatchParticipant,
  | 'id'
  | 'match_id'
  | 'status'
  | 'join_method'
  | 'user_id'
  | 'guest_id'
  | 'created_by'
  | 'created_at'
  | 'confirmed_at'
  | 'removed_at'
  | 'org_approved_at'
  | 'participant_accepted_at'
  | 'participant_accepted_via'
  | 'confirmation_source'
  | 'host_confirmed_at'
  | 'removal_note'
>
type ReportParticipantAction = Pick<MatchParticipantAction, 'id' | 'match_id' | 'match_participant_id' | 'action_type' | 'created_by' | 'created_at'>

type ReportGuest = {
  id: string
  display_name: string
  created_at: string
}

type ReportSport = {
  id: number
  display_name: string
}

type ReportGroup = {
  id: string
  name: string
}

type ReportGroupInvitation = {
  id: string
  match_id: string
  group_id: string
  invited_by_user_id: string
  status: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

type ReportPublicSignup = {
  id: string
  match_id: string
  match_participant_id: string | null
  display_name: string
  verification_delivery_status: string
  verification_sent_at: string | null
  verification_delivery_sent_at: string | null
  verified_at: string | null
  status: string
  created_at: string
  updated_at: string
}

type ReportPublicSmsIntent = {
  id: string
  match_id: string
  match_participant_id: string | null
  display_name: string
  sms_delivery_status: string
  sms_sent_at: string | null
  sms_delivery_sent_at: string | null
  sms_response_at: string | null
  phone_confirmed_at: string | null
  status: string
  created_at: string
  updated_at: string
}

type ReportEmailInvitation = {
  id: string
  inviter_user_id: string
  target_name: string | null
  related_type: string
  related_id: string
  status: string
  magic_link_flow_status: string
  accepted_at: string | null
  declined_at: string | null
  created_at: string
  updated_at: string
  match_participant_id: string | null
}

type ReportNotificationEvent = {
  id: string
  match_id: string
  participant_id: string
  notification_type: string
  channel: string
  delivery_id: string | null
  sent_at: string | null
  created_at: string
}

type ReportDelivery = {
  id: string
  email_invitation_id: string | null
  channel: string
  provider: string
  delivery_status: string
  attempt_count: number
  last_attempt_at: string | null
  sent_at: string | null
  created_at: string
}

export type AdminReportDay = {
  date: string
  registrations: number
  matchesCreated: number
  participantsAdded: number
  confirmedResponses: number
  removedOrWithdrawn: number
  groupInvites: number
  publicSignupStarts: number
  notificationsSent: number
  notificationsFailed: number
}

export type AdminRegistrationRow = {
  userId: string
  displayName: string
  createdAt: string
  primaryVenue: string
  onboarding: string
}

export type AdminInviteResponseRow = {
  id: string
  createdAt: string
  responseAt: string | null
  playerName: string
  matchLabel: string
  venueName: string
  inviteMethod: string
  deliveryChannel: string
  deliveryStatus: string
  replyStatus: string
}

export type AdminActivityRow = {
  id: string
  createdAt: string
  actorName: string
  activity: string
  detail: string
}

export type AdminReportsData = {
  generatedAt: string
  rangeDays: number
  since: string
  totals: {
    registrations: number
    matchesCreated: number
    participantsAdded: number
    inviteRows: number
    notificationsSent: number
    notificationsFailed: number
  }
  days: AdminReportDay[]
  registrations: AdminRegistrationRow[]
  activities: AdminActivityRow[]
  inviteResponses: AdminInviteResponseRow[]
}

export type AdminReportsParams = {
  days: number
}

function clampDays(days: number) {
  if (!Number.isFinite(days)) return 30
  return Math.max(7, Math.min(90, Math.round(days)))
}

function toDateKey(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function displayDate(value: string | null | undefined) {
  if (!value) return 'Date not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function venueLabel(venue: ReportVenue | undefined) {
  if (!venue) return 'No venue'
  return venue.abbreviation?.trim() || venue.name?.trim() || 'Venue'
}

function sportLabel(sport: ReportSport | undefined) {
  return sport?.display_name || 'Match'
}

function gameTypeLabel(gameType: string | null) {
  if (!gameType) return 'Match'
  return gameType
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function matchLabel(match: ReportMatch | undefined, sportsById: Map<number, ReportSport>) {
  if (!match) return 'Match'
  const parts = [sportLabel(sportsById.get(match.sport_id)), gameTypeLabel(match.game_type)]
  const date = match.match_date ? new Date(`${match.match_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
  return [parts.join(' / '), date].filter(Boolean).join(' / ')
}

function onboardingLabel(profile: ReportProfile) {
  if (profile.onboarding_completed) return 'Complete'
  if (profile.onboarding_profile_completed) return 'Profile complete'
  return 'Started'
}

function participantName(
  participant: ReportParticipant,
  profilesById: Map<string, ReportProfile>,
  guestsById: Map<string, ReportGuest>,
) {
  if (participant.user_id) return profilesById.get(participant.user_id)?.display_name || 'Player'
  if (participant.guest_id) return guestsById.get(participant.guest_id)?.display_name || 'Contact Player'
  return 'Player'
}

function deliveryStatusFrom(values: Array<string | null | undefined>) {
  const statuses = uniq(values)
  if (statuses.length === 0) return 'Not sent / unknown'
  return statuses.join(' + ')
}

function deliveryChannelFrom(values: Array<string | null | undefined>) {
  const channels = uniq(values.map((value) => value?.toLowerCase()))
  if (channels.length === 0) return 'Unknown'
  if (channels.includes('sms') && channels.includes('email')) return 'SMS + email'
  if (channels.includes('sms')) return 'SMS'
  if (channels.includes('email')) return 'Email'
  return channels.join(' + ')
}

function inviteMethodForParticipant(
  participant: ReportParticipant,
  publicSignupByParticipantId: Map<string, ReportPublicSignup>,
  publicSmsByParticipantId: Map<string, ReportPublicSmsIntent>,
  emailInvitationByParticipantId: Map<string, ReportEmailInvitation>,
) {
  if (publicSignupByParticipantId.has(participant.id) || publicSmsByParticipantId.has(participant.id)) return 'Invite link'
  if (emailInvitationByParticipantId.has(participant.id)) return participant.guest_id ? 'Contact player invite' : 'Saved player invite'
  if (participant.confirmation_source === 'host_managed_offline' || participant.join_method === 'manual') return 'Host-added / offline confirmation'
  if (participant.join_method === 'guest_add' || participant.guest_id) return 'Contact player invite'
  if (participant.join_method === 'nominated') return 'Player nomination'
  if (participant.join_method === 'requested') return 'Open to Join'
  if (participant.join_method === 'invited') return 'Saved player invite'
  return 'Match participant'
}

function replyStatusForParticipant(participant: ReportParticipant) {
  const note = participant.removal_note?.toLowerCase() ?? ''
  if (participant.status === 'removed') {
    if (note.includes('declin')) return 'Declined'
    if (note.includes('withdraw')) return 'Withdrawn'
    return 'Removed'
  }
  if (participant.status === 'confirmed') return 'Confirmed'
  if (participant.participant_accepted_at && !participant.org_approved_at) return 'Player replied / waiting for host'
  if (participant.org_approved_at && !participant.participant_accepted_at) return 'Host-confirmed only'
  if (participant.status === 'waiting_list') return 'Waiting list'
  return 'No response yet'
}

function responseAtForParticipant(participant: ReportParticipant) {
  if (participant.status === 'removed') return participant.removed_at
  if (participant.status === 'confirmed') return participant.confirmed_at || participant.participant_accepted_at || participant.org_approved_at
  return participant.participant_accepted_at || participant.org_approved_at || participant.host_confirmed_at
}

function replyStatusForPublicSignup(signup: ReportPublicSignup) {
  if (signup.status === 'participant_created') return 'Confirmed'
  if (signup.status === 'participant_removed') return 'Removed'
  if (signup.verified_at) return 'Verified / waiting'
  if (signup.status === 'pending_verification') return 'No response yet'
  return signup.status
}

function replyStatusForSmsIntent(intent: ReportPublicSmsIntent) {
  if (intent.status === 'request_created') return 'Confirmed'
  if (intent.status === 'declined_by_guest') return 'Declined'
  if (intent.phone_confirmed_at) return 'Phone confirmed'
  if (intent.status === 'pending_sms_response') return 'No response yet'
  return intent.status
}

function addDay(days: Map<string, AdminReportDay>, value: string | null | undefined, key: keyof Omit<AdminReportDay, 'date'>, amount = 1) {
  const dateKey = toDateKey(value)
  if (!dateKey) return
  const day = days.get(dateKey)
  if (!day) return
  day[key] += amount
}

async function readPage<T>(query: any): Promise<T[]> {
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as T[]
}

export async function getAdminReportsData(
  supabase: SupabaseClient<Database>,
  params: AdminReportsParams,
): Promise<AdminReportsData> {
  const admin = supabase as AdminClient
  const rangeDays = clampDays(params.days)
  const now = new Date()
  const sinceDate = new Date(now)
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (rangeDays - 1))
  sinceDate.setUTCHours(0, 0, 0, 0)
  const since = sinceDate.toISOString()

  const days = new Map<string, AdminReportDay>()
  for (let offset = rangeDays - 1; offset >= 0; offset--) {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - offset)
    const key = date.toISOString().slice(0, 10)
    days.set(key, {
      date: key,
      registrations: 0,
      matchesCreated: 0,
      participantsAdded: 0,
      confirmedResponses: 0,
      removedOrWithdrawn: 0,
      groupInvites: 0,
      publicSignupStarts: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
    })
  }

  const [
    profiles,
    matches,
    participants,
    participantActions,
    groupInvitations,
    publicSignups,
    publicSmsIntents,
    notificationEvents,
    emailInvitations,
  ] = await Promise.all([
    readPage<ReportProfile>(
      admin.from('profiles')
        .select('id, display_name, created_at, primary_venue_id, onboarding_profile_completed, onboarding_completed')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
    readPage<ReportMatch>(
      admin.from('matches')
        .select('id, organizer_id, status, venue_id, match_date, start_time, game_type, doubles_format, created_at, sport_id')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
    readPage<ReportParticipant>(
      admin.from('match_participants')
        .select('id, match_id, status, join_method, user_id, guest_id, created_by, created_at, confirmed_at, removed_at, org_approved_at, participant_accepted_at, participant_accepted_via, confirmation_source, host_confirmed_at, removal_note')
        .or(`created_at.gte.${since},participant_accepted_at.gte.${since},org_approved_at.gte.${since},host_confirmed_at.gte.${since},removed_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(1500),
    ),
    readPage<ReportParticipantAction>(
      admin.from('match_participant_actions')
        .select('id, match_id, match_participant_id, action_type, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1500),
    ),
    readPage<ReportGroupInvitation>(
      admin.from('match_group_invitations')
        .select('id, match_id, group_id, invited_by_user_id, status, revoked_at, created_at, updated_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
    readPage<ReportPublicSignup>(
      admin.from('public_match_signups')
        .select('id, match_id, match_participant_id, display_name, verification_delivery_status, verification_sent_at, verification_delivery_sent_at, verified_at, status, created_at, updated_at')
        .or(`created_at.gte.${since},updated_at.gte.${since},verified_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
    readPage<ReportPublicSmsIntent>(
      admin.from('public_match_signup_sms_intents')
        .select('id, match_id, match_participant_id, display_name, sms_delivery_status, sms_sent_at, sms_delivery_sent_at, sms_response_at, phone_confirmed_at, status, created_at, updated_at')
        .or(`created_at.gte.${since},updated_at.gte.${since},sms_response_at.gte.${since},phone_confirmed_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
    readPage<ReportNotificationEvent>(
      admin.from('match_participant_notification_events')
        .select('id, match_id, participant_id, notification_type, channel, delivery_id, sent_at, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1500),
    ),
    readPage<ReportEmailInvitation>(
      admin.from('email_invitations')
        .select('id, inviter_user_id, target_name, related_type, related_id, status, magic_link_flow_status, accepted_at, declined_at, created_at, updated_at, match_participant_id')
        .or(`created_at.gte.${since},updated_at.gte.${since},accepted_at.gte.${since},declined_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
  ])

  const deliveryIds = uniq(notificationEvents.map((event) => event.delivery_id))
  const deliveries = deliveryIds.length > 0
    ? await readPage<ReportDelivery>(
        admin.from('notification_deliveries')
          .select('id, email_invitation_id, channel, provider, delivery_status, attempt_count, last_attempt_at, sent_at, created_at')
          .in('id', deliveryIds)
          .limit(1500),
      )
    : []

  const emailInvitationIds = uniq(emailInvitations.map((invitation) => invitation.id))
  const emailInvitationEvents = emailInvitationIds.length > 0
    ? await readPage<{ invitation_id: string; event_type: string; created_at: string }>(
        admin.from('email_invitation_events')
          .select('invitation_id, event_type, created_at')
          .in('invitation_id', emailInvitationIds)
          .order('created_at', { ascending: false })
          .limit(1500),
      )
    : []

  const matchIds = uniq([
    ...matches.map((match) => match.id),
    ...participants.map((participant) => participant.match_id),
    ...groupInvitations.map((invite) => invite.match_id),
    ...publicSignups.map((signup) => signup.match_id),
    ...publicSmsIntents.map((intent) => intent.match_id),
    ...notificationEvents.map((event) => event.match_id),
  ])
  const missingMatchIds = matchIds.filter((id) => !matches.some((match) => match.id === id))
  const extraMatches = missingMatchIds.length > 0
    ? await readPage<ReportMatch>(
        admin.from('matches')
          .select('id, organizer_id, status, venue_id, match_date, start_time, game_type, doubles_format, created_at, sport_id')
          .in('id', missingMatchIds)
          .limit(1000),
      )
    : []
  const allMatches = [...matches, ...extraMatches]
  const matchesById = new Map(allMatches.map((match) => [match.id, match]))

  const userIds = uniq([
    ...profiles.map((profile) => profile.id),
    ...allMatches.map((match) => match.organizer_id),
    ...participants.flatMap((participant) => [participant.user_id, participant.created_by]),
    ...participantActions.map((action) => action.created_by),
    ...groupInvitations.map((invite) => invite.invited_by_user_id),
    ...emailInvitations.map((invite) => invite.inviter_user_id),
  ])
  const knownProfileIds = new Set(profiles.map((profile) => profile.id))
  const extraProfileIds = userIds.filter((id) => !knownProfileIds.has(id))
  const extraProfiles = extraProfileIds.length > 0
    ? await readPage<ReportProfile>(
        admin.from('profiles')
          .select('id, display_name, created_at, primary_venue_id, onboarding_profile_completed, onboarding_completed')
          .in('id', extraProfileIds)
          .limit(1000),
      )
    : []
  const allProfiles = [...profiles, ...extraProfiles]
  const profilesById = new Map(allProfiles.map((profile) => [profile.id, profile]))

  const guestIds = uniq(participants.map((participant) => participant.guest_id))
  const guests = guestIds.length > 0
    ? await readPage<ReportGuest>(
        admin.from('guests')
          .select('id, display_name, created_at')
          .in('id', guestIds)
          .limit(1000),
      )
    : []
  const guestsById = new Map(guests.map((guest) => [guest.id, guest]))

  const venueIds = uniq([
    ...allProfiles.map((profile) => profile.primary_venue_id),
    ...allMatches.map((match) => match.venue_id),
  ])
  const venues = venueIds.length > 0
    ? await readPage<ReportVenue>(
        admin.from('venues')
          .select('id, name, abbreviation, city')
          .in('id', venueIds)
          .limit(1000),
      )
    : []
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]))

  const sportIds = uniq(allMatches.map((match) => String(match.sport_id))).map(Number).filter((id) => Number.isFinite(id))
  const sports = sportIds.length > 0
    ? await readPage<ReportSport>(
        admin.from('sports')
          .select('id, display_name')
          .in('id', sportIds)
          .limit(100),
      )
    : []
  const sportsById = new Map(sports.map((sport) => [sport.id, sport]))

  const groupIds = uniq(groupInvitations.map((invite) => invite.group_id))
  const groups = groupIds.length > 0
    ? await readPage<ReportGroup>(
        admin.from('groups')
          .select('id, name')
          .in('id', groupIds)
          .limit(1000),
      )
    : []
  const groupsById = new Map(groups.map((group) => [group.id, group]))

  const deliveriesById = new Map(deliveries.map((delivery) => [delivery.id, delivery]))
  const notificationEventsByParticipant = new Map<string, ReportNotificationEvent[]>()
  for (const event of notificationEvents) {
    const existing = notificationEventsByParticipant.get(event.participant_id) ?? []
    existing.push(event)
    notificationEventsByParticipant.set(event.participant_id, existing)
  }
  const publicSignupByParticipantId = new Map(
    publicSignups
      .filter((signup) => signup.match_participant_id)
      .map((signup) => [signup.match_participant_id!, signup]),
  )
  const publicSmsByParticipantId = new Map(
    publicSmsIntents
      .filter((intent) => intent.match_participant_id)
      .map((intent) => [intent.match_participant_id!, intent]),
  )
  const emailInvitationByParticipantId = new Map(
    emailInvitations
      .filter((invitation) => invitation.match_participant_id)
      .map((invitation) => [invitation.match_participant_id!, invitation]),
  )
  const emailEventsByInvitationId = new Map<string, string[]>()
  for (const event of emailInvitationEvents) {
    const values = emailEventsByInvitationId.get(event.invitation_id) ?? []
    values.push(event.event_type)
    emailEventsByInvitationId.set(event.invitation_id, values)
  }

  const registrationRows = profiles.map((profile) => {
    const primaryVenue = profile.primary_venue_id ? venueLabel(venuesById.get(profile.primary_venue_id)) : 'No primary venue'
    return {
      userId: profile.id,
      displayName: profile.display_name || 'Player',
      createdAt: profile.created_at,
      primaryVenue,
      onboarding: onboardingLabel(profile),
    }
  })

  const activityRows: AdminActivityRow[] = [
    ...matches.map((match) => ({
      id: `match-${match.id}`,
      createdAt: match.created_at,
      actorName: profilesById.get(match.organizer_id)?.display_name || 'Host',
      activity: 'Match created',
      detail: `${matchLabel(match, sportsById)} / ${venueLabel(match.venue_id ? venuesById.get(match.venue_id) : undefined)}`,
    })),
    ...participantActions.map((action) => {
      const match = matchesById.get(action.match_id)
      return {
        id: `action-${action.id}`,
        createdAt: action.created_at,
        actorName: profilesById.get(action.created_by)?.display_name || 'Player',
        activity: action.action_type.split('_').join(' '),
        detail: `${matchLabel(match, sportsById)} / ${venueLabel(match?.venue_id ? venuesById.get(match.venue_id) : undefined)}`,
      }
    }),
    ...groupInvitations.map((invite) => {
      const match = matchesById.get(invite.match_id)
      const groupName = groupsById.get(invite.group_id)?.name || 'Group'
      return {
        id: `group-invite-${invite.id}`,
        createdAt: invite.created_at,
        actorName: profilesById.get(invite.invited_by_user_id)?.display_name || 'Host',
        activity: 'Group invite',
        detail: `${groupName} / ${matchLabel(match, sportsById)}`,
      }
    }),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 80)

  const inviteRowsFromParticipants = participants.map((participant) => {
    const match = matchesById.get(participant.match_id)
    const events = notificationEventsByParticipant.get(participant.id) ?? []
    const eventDeliveries = events.map((event) => event.delivery_id ? deliveriesById.get(event.delivery_id) : null).filter((value): value is ReportDelivery => Boolean(value))
    const publicSignup = publicSignupByParticipantId.get(participant.id)
    const publicSmsIntent = publicSmsByParticipantId.get(participant.id)
    const emailInvitation = emailInvitationByParticipantId.get(participant.id)
    const channels = [
      ...events.map((event) => event.channel),
      ...eventDeliveries.map((delivery) => delivery.channel),
      publicSignup ? 'email' : null,
      publicSmsIntent ? 'sms' : null,
      emailInvitation ? 'email' : null,
    ]
    const statuses = [
      ...eventDeliveries.map((delivery) => delivery.delivery_status),
      publicSignup?.verification_delivery_status,
      publicSmsIntent?.sms_delivery_status,
      emailInvitation ? emailEventsByInvitationId.get(emailInvitation.id)?.join(' + ') || emailInvitation.status : null,
    ]
    return {
      id: `participant-${participant.id}`,
      createdAt: participant.created_at,
      responseAt: responseAtForParticipant(participant) ?? null,
      playerName: participantName(participant, profilesById, guestsById),
      matchLabel: matchLabel(match, sportsById),
      venueName: venueLabel(match?.venue_id ? venuesById.get(match.venue_id) : undefined),
      inviteMethod: inviteMethodForParticipant(participant, publicSignupByParticipantId, publicSmsByParticipantId, emailInvitationByParticipantId),
      deliveryChannel: deliveryChannelFrom(channels),
      deliveryStatus: deliveryStatusFrom(statuses),
      replyStatus: replyStatusForParticipant(participant),
    }
  })

  const participantIdsWithInviteRows = new Set(participants.map((participant) => participant.id))
  const inviteRowsFromPublicSignups = publicSignups
    .filter((signup) => !signup.match_participant_id || !participantIdsWithInviteRows.has(signup.match_participant_id))
    .map((signup) => {
      const match = matchesById.get(signup.match_id)
      return {
        id: `public-signup-${signup.id}`,
        createdAt: signup.created_at,
        responseAt: signup.verified_at,
        playerName: signup.display_name || 'Player',
        matchLabel: matchLabel(match, sportsById),
        venueName: venueLabel(match?.venue_id ? venuesById.get(match.venue_id) : undefined),
        inviteMethod: 'Invite link',
        deliveryChannel: 'Email',
        deliveryStatus: signup.verification_delivery_status,
        replyStatus: replyStatusForPublicSignup(signup),
      }
    })
  const inviteRowsFromSmsIntents = publicSmsIntents
    .filter((intent) => !intent.match_participant_id || !participantIdsWithInviteRows.has(intent.match_participant_id))
    .map((intent) => {
      const match = matchesById.get(intent.match_id)
      return {
        id: `public-sms-${intent.id}`,
        createdAt: intent.created_at,
        responseAt: intent.sms_response_at || intent.phone_confirmed_at,
        playerName: intent.display_name || 'Player',
        matchLabel: matchLabel(match, sportsById),
        venueName: venueLabel(match?.venue_id ? venuesById.get(match.venue_id) : undefined),
        inviteMethod: 'Invite link',
        deliveryChannel: 'SMS',
        deliveryStatus: intent.sms_delivery_status,
        replyStatus: replyStatusForSmsIntent(intent),
      }
    })
  const inviteRowsFromGroupInvites = groupInvitations.map((invite) => {
    const match = matchesById.get(invite.match_id)
    return {
      id: `group-${invite.id}`,
      createdAt: invite.created_at,
      responseAt: invite.revoked_at,
      playerName: groupsById.get(invite.group_id)?.name || 'Group',
      matchLabel: matchLabel(match, sportsById),
      venueName: venueLabel(match?.venue_id ? venuesById.get(match.venue_id) : undefined),
      inviteMethod: 'Group invite',
      deliveryChannel: 'Group',
      deliveryStatus: invite.status,
      replyStatus: invite.revoked_at ? 'Revoked' : 'Active',
    }
  })

  const inviteResponses = [
    ...inviteRowsFromParticipants,
    ...inviteRowsFromPublicSignups,
    ...inviteRowsFromSmsIntents,
    ...inviteRowsFromGroupInvites,
  ]
    .sort((left, right) => (right.responseAt ?? right.createdAt).localeCompare(left.responseAt ?? left.createdAt))
    .slice(0, 120)

  for (const profile of profiles) addDay(days, profile.created_at, 'registrations')
  for (const match of matches) addDay(days, match.created_at, 'matchesCreated')
  for (const participant of participants) {
    addDay(days, participant.created_at, 'participantsAdded')
    if (participant.status === 'confirmed') addDay(days, responseAtForParticipant(participant), 'confirmedResponses')
    if (participant.status === 'removed') addDay(days, participant.removed_at, 'removedOrWithdrawn')
  }
  for (const invite of groupInvitations) addDay(days, invite.created_at, 'groupInvites')
  for (const signup of publicSignups) addDay(days, signup.created_at, 'publicSignupStarts')
  for (const intent of publicSmsIntents) addDay(days, intent.created_at, 'publicSignupStarts')
  for (const delivery of deliveries) {
    if (delivery.delivery_status === 'sent') addDay(days, delivery.sent_at || delivery.created_at, 'notificationsSent')
    if (delivery.delivery_status === 'failed') addDay(days, delivery.last_attempt_at || delivery.created_at, 'notificationsFailed')
  }

  const dayRows = [...days.values()].sort((left, right) => right.date.localeCompare(left.date))
  const notificationsSent = dayRows.reduce((sum, day) => sum + day.notificationsSent, 0)
  const notificationsFailed = dayRows.reduce((sum, day) => sum + day.notificationsFailed, 0)

  return {
    generatedAt: now.toISOString(),
    rangeDays,
    since,
    totals: {
      registrations: profiles.length,
      matchesCreated: matches.length,
      participantsAdded: participants.filter((participant) => participant.created_at >= since).length,
      inviteRows: inviteResponses.length,
      notificationsSent,
      notificationsFailed,
    },
    days: dayRows,
    registrations: registrationRows,
    activities: activityRows,
    inviteResponses,
  }
}

export function formatReportTime(value: string | null | undefined) {
  return value ? displayDate(value) : 'No response yet'
}
