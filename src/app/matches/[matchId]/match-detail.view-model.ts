import {
  admissionTargetsToContactPlayers,
  admissionTargetsToScopeUsers,
  type ActivityItem,
  type MatchMessageEnriched,
} from '@/lib/api/matches'
import { deriveMatchCourtStatus, type MatchCourtState } from '@/lib/utils/match-court'
import type { MatchRosterInsight } from '@/lib/utils/match-roster'
import { formatTimeWindow } from '@/lib/utils/format-time'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import type { MatchDetailLoaderData } from './match-detail.loader'

function isSelfWithdrawAssociated(
  userId: string | null | undefined,
  participant: MatchParticipantEnriched | null,
): boolean {
  if (!userId || !participant) {
    return false
  }

  return participant.removed_at === null || participant.removed_by === userId
}

export type MatchDetailPageViewModel = {
  matchId: string
  userId: string | null
  match: MatchDetailLoaderData['detail']['match']
  venueName: string | null
  venueTimezone: string | null
  matchCourts: MatchDetailLoaderData['matchCourts']
  venueCourts: MatchDetailLoaderData['venueCourts']
  organizerName: string
  sportName: string
  scopeGroups: MatchDetailLoaderData['detail']['scopeGroups']
  groupInvitations: MatchDetailLoaderData['detail']['groupInvitations']
  myGroupInvites: MatchDetailLoaderData['detail']['myGroupInvites']
  allGroups: MatchDetailLoaderData['allGroups']
  participants: MatchDetailLoaderData['detail']['participants']
  participantsForDisplay: MatchDetailLoaderData['detail']['participants']
  activities: ActivityItem[]
  messages: MatchMessageEnriched[]
  courtState: MatchCourtState
  myParticipant: MatchDetailLoaderData['detail']['myParticipant']
  myParticipantNeedsReconfirm: boolean
  isOrganizer: boolean
  isMatchAssociated: boolean
  inScope: boolean
  canNominate: boolean
  canNominateGuest: boolean
  confirmedCount: number
  pendingCount: number
  waitingCount: number
  rosterInsight: MatchRosterInsight
  timeLabel: string
  spotsNeeded: number
  savedPlayerIds: string[]
  scopeUsersForInvite: ReturnType<typeof admissionTargetsToScopeUsers>
  scopeUsersForNominate: ReturnType<typeof admissionTargetsToScopeUsers>
  contactTargets: ReturnType<typeof admissionTargetsToContactPlayers>
  showSelfActionsSection: boolean
  showNominateSection: boolean
  showNominateGuestSection: boolean
  showOrganizerAdminSection: boolean
  showOrganizerEditSection: boolean
  canAccessCommunication: boolean
  canPostCommunication: boolean
  canEditOrganizerNote: boolean
}

export function buildMatchDetailPageViewModel(loaderData: MatchDetailLoaderData): MatchDetailPageViewModel {
  const { detail, matchCourts, inScope, venueCourts, admissionTargets, allGroups, matchId, user } = loaderData
  const {
    match,
    venueTimezone,
    venueName,
    participants,
    myParticipant,
    myParticipantNeedsReconfirm,
    isOrganizer,
    confirmedCount,
    pendingCount,
    waitingCount,
    rosterInsight,
    activities,
    messages,
    organizerName,
    scopeGroups,
    groupInvitations,
    myGroupInvites,
    sportName,
  } = detail

  const isMatchAssociated = isSelfWithdrawAssociated(user?.id, myParticipant)
  const canNominate = !isOrganizer && match.can_participants_invite_users && (inScope || isMatchAssociated)
  const canNominateGuest = isOrganizer || (match.can_participants_invite_users && (inScope || isMatchAssociated))
  const courtState = deriveMatchCourtStatus({
    matchStatus: match.status,
    courtPlanMode: match.court_plan_mode,
    finalCourtLabel: match.final_court_label,
  })
  const selfNeedsTopAction = !myParticipant
    || myParticipant.status === 'removed'
    || (
      myParticipant.status === 'pending'
      && (
        (
          (myParticipant.join_method === 'invited' || myParticipant.join_method === 'nominated')
          && myParticipant.participant_accepted_at == null
        )
        || (
          myParticipant.join_method === 'requested'
          && myParticipant.participant_accepted_at == null
          && myParticipant.org_approved_at != null
        )
      )
    )

  const participantsForDisplay = isOrganizer
    ? participants
    : participants.filter((participant) =>
        participant.id === myParticipant?.id ||
        participant.status === 'confirmed' ||
        participant.status === 'waiting_list' ||
        (participant.guest_id !== null && participant.status === 'pending') ||
        (
          participant.user_id !== null &&
          participant.status === 'pending' &&
          (participant.join_method === 'invited' || participant.join_method === 'nominated') &&
          !participant.participant_accepted_at
        ))

  const canAccessCommunication = Boolean(
    user?.id &&
    (
      isOrganizer ||
      (
        myParticipant &&
        myParticipant.removed_at === null &&
        ['pending', 'confirmed', 'waiting_list'].includes(myParticipant.status)
      )
    ),
  )

  return {
    matchId,
    userId: user?.id ?? null,
    match,
    venueName,
    venueTimezone,
    matchCourts,
    venueCourts,
    organizerName,
    sportName,
    scopeGroups,
    groupInvitations,
    myGroupInvites,
    allGroups,
    participants,
    participantsForDisplay,
    activities,
    messages,
    courtState,
    myParticipant,
    myParticipantNeedsReconfirm,
    isOrganizer,
    isMatchAssociated,
    inScope,
    canNominate,
    canNominateGuest,
    confirmedCount,
    pendingCount,
    waitingCount,
    rosterInsight,
    timeLabel: formatTimeWindow(
      match.start_at_utc,
      match.match_date,
      match.start_time,
      match.duration_minutes,
      venueTimezone,
    ),
    spotsNeeded: Math.max(match.required_count - confirmedCount, 0),
    savedPlayerIds: loaderData.inviteCircle.map((row) => row.target_user_id),
    scopeUsersForInvite: admissionTargetsToScopeUsers(admissionTargets, { requireCanAdmit: true }),
    scopeUsersForNominate: admissionTargetsToScopeUsers(admissionTargets, { requireCanAdmit: true }),
    contactTargets: admissionTargetsToContactPlayers(admissionTargets),
    showSelfActionsSection: match.status === 'active' && !isOrganizer && selfNeedsTopAction,
    showNominateSection: match.status === 'active' && canNominate,
    showNominateGuestSection: match.status === 'active' && canNominateGuest && !isOrganizer,
    showOrganizerAdminSection: match.status === 'active' && isOrganizer,
    showOrganizerEditSection: match.status === 'active' && isOrganizer,
    canAccessCommunication,
    canPostCommunication: canAccessCommunication,
    canEditOrganizerNote: match.status === 'active' && isOrganizer,
  }
}
