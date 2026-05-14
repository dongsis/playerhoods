import {
  admissionTargetsToScopeUsers,
  type ActivityItem,
  type MatchMessageEnriched,
} from '@/lib/api/matches'
import { isCurrentLineupSnapshot, parseMatchLineupSnapshot, type MatchLineupSnapshot } from '@/lib/match-lineup'
import { deriveMatchCourtStatus, type MatchCourtState } from '@/lib/utils/match-court'
import type { MatchRosterInsight } from '@/lib/utils/match-roster'
import { formatTimeWindow } from '@/lib/utils/format-time'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import type { IdentityLinkCandidate } from '@/lib/types/database'
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
  canParticipantInvite: boolean
  canParticipantInviteContact: boolean
  confirmedCount: number
  pendingCount: number
  waitingCount: number
  rosterInsight: MatchRosterInsight
  timeLabel: string
  spotsNeeded: number
  savedPlayerIds: string[]
  scopeUsersForInvite: ReturnType<typeof admissionTargetsToScopeUsers>
  scopeUsersForParticipantInvite: ReturnType<typeof admissionTargetsToScopeUsers>
  contactTargets: MatchDetailLoaderData['contactPersonTargets']
  showSelfActionsSection: boolean
  showParticipantInviteSection: boolean
  showParticipantInviteContactSection: boolean
  showOrganizerAdminSection: boolean
  showOrganizerEditSection: boolean
  canAccessCommunication: boolean
  canPostCommunication: boolean
  canEditOrganizerNote: boolean
  savedLineup: MatchLineupSnapshot | null
  canViewLineup: boolean
  isFormed: boolean
  identityLinkCandidates: IdentityLinkCandidate[]
  hasLinkedGuestIdentity: boolean
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
  const isFormed = Boolean(match.formed_at) || confirmedCount >= match.required_count
  const canParticipantInvite = !isOrganizer && match.can_participants_invite_users && (inScope || isMatchAssociated)
  const canParticipantInviteContact = isOrganizer || (match.can_participants_invite_users && (inScope || isMatchAssociated))
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

  const hasActiveParticipantAccess = Boolean(
    myParticipant &&
    myParticipant.removed_at === null &&
    ['pending', 'confirmed', 'waiting_list'].includes(myParticipant.status),
  )
  const hasConfirmedParticipantAccess = Boolean(
    myParticipant &&
    myParticipant.removed_at === null &&
    myParticipant.status === 'confirmed',
  )
  const hasPreviewAccess = Boolean(
    user?.id &&
    !myParticipant &&
    (myGroupInvites.length > 0 || inScope),
  )
  const canAccessCommunication = Boolean(
    user?.id &&
    (
      isOrganizer ||
      (isFormed ? hasConfirmedParticipantAccess : (hasActiveParticipantAccess || hasPreviewAccess))
    ),
  )
  const savedLineup = parseMatchLineupSnapshot(match.lineup_snapshot)
  const confirmedPlayerIds = participants
    .filter((participant) => participant.status === 'confirmed')
    .map((participant) => participant.id)
  const canViewLineup = isOrganizer || isCurrentLineupSnapshot(savedLineup, confirmedPlayerIds)
  const savedAdmissionTargets = admissionTargets.filter((target) => target.source === 'invite_circle')
  const hasLinkedGuestIdentity = Boolean(
    myParticipant &&
    myParticipant.guest_id &&
    myParticipant.linked_user_id &&
    myParticipant.linked_user_id === user?.id,
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
    canParticipantInvite,
    canParticipantInviteContact,
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
    scopeUsersForInvite: admissionTargetsToScopeUsers(savedAdmissionTargets, { requireCanAdmit: true }),
    scopeUsersForParticipantInvite: admissionTargetsToScopeUsers(savedAdmissionTargets, { requireCanAdmit: true }),
    contactTargets: loaderData.contactPersonTargets,
    showSelfActionsSection: match.status === 'active' && !isOrganizer && selfNeedsTopAction && loaderData.identityLinkCandidates.length === 0,
    showParticipantInviteSection: match.status === 'active' && canParticipantInvite,
    showParticipantInviteContactSection: match.status === 'active' && canParticipantInviteContact && !isOrganizer,
    showOrganizerAdminSection: match.status === 'active' && isOrganizer,
    showOrganizerEditSection: match.status === 'active' && isOrganizer,
    canAccessCommunication,
    canPostCommunication: canAccessCommunication,
    canEditOrganizerNote: match.status === 'active' && isOrganizer,
    savedLineup,
    canViewLineup,
    isFormed,
    identityLinkCandidates: loaderData.identityLinkCandidates,
    hasLinkedGuestIdentity,
  }
}
