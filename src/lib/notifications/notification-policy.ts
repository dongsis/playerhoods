import type { Match, MatchParticipant } from '@/lib/types/database'

export type CriticalChangeSet = Record<string, { old?: unknown; new?: unknown } | unknown>

const CRITICAL_FIELDS = new Set([
  'match_date',
  'start_time',
  'end_time',
  'duration_minutes',
  'venue_id',
  'location',
  'court',
  'court_ids',
  'match_courts',
  'status',
])

export const NotificationPolicy = {
  isParticipantAccepted(participant: Pick<MatchParticipant, 'participant_accepted_at'>): boolean {
    return participant.participant_accepted_at != null
  },

  isOrganizerApproved(participant: Pick<MatchParticipant, 'org_approved_at'>): boolean {
    return participant.org_approved_at != null
  },

  isParticipantDeclinedOrRemoved(participant: Pick<MatchParticipant, 'status' | 'removed_at'>): boolean {
    return participant.status === 'removed' || participant.removed_at != null
  },

  isSelectedToPlay(participant: Pick<MatchParticipant, 'status'>): boolean {
    return participant.status === 'confirmed'
  },

  isParticipantConfirmed(
    participant: Pick<MatchParticipant, 'participant_accepted_at' | 'org_approved_at' | 'status' | 'removed_at'>,
  ): boolean {
    return (
      participant.participant_accepted_at != null &&
      participant.org_approved_at != null &&
      participant.status === 'confirmed' &&
      participant.removed_at == null
    )
  },

  isGameFormed(match: Pick<Match, 'formed_at' | 'status'>): boolean {
    return match.formed_at != null && match.status === 'active'
  },

  isCriticalChange(changeSet: CriticalChangeSet | null | undefined): boolean {
    if (!changeSet) return false
    return Object.keys(changeSet).some((key) => CRITICAL_FIELDS.has(key))
  },

  shouldSendInviteNotification(
    participant: Pick<MatchParticipant, 'invite_notification_sent_at' | 'participant_accepted_at' | 'org_approved_at' | 'removed_at' | 'status'>,
  ): boolean {
    return (
      participant.invite_notification_sent_at == null &&
      participant.participant_accepted_at == null &&
      participant.org_approved_at != null &&
      participant.removed_at == null &&
      participant.status !== 'removed'
    )
  },

  shouldSendConfirmedLineupNotification(
    match: Pick<Match, 'formed_at' | 'status'>,
    participant: Pick<MatchParticipant, 'confirmed_lineup_notification_sent_at' | 'participant_accepted_at' | 'org_approved_at' | 'status' | 'removed_at'>,
  ): boolean {
    return (
      this.isGameFormed(match) &&
      this.isParticipantConfirmed(participant) &&
      participant.confirmed_lineup_notification_sent_at == null
    )
  },

  shouldSendCriticalUpdateNotification(
    match: Pick<Match, 'formed_at' | 'status'>,
    participant: Pick<MatchParticipant, 'participant_accepted_at' | 'org_approved_at' | 'status' | 'removed_at'>,
    changeSet: CriticalChangeSet | null | undefined,
  ): boolean {
    return this.isGameFormed(match) && this.isParticipantConfirmed(participant) && this.isCriticalChange(changeSet)
  },
}
