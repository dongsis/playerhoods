import type { MatchParticipant } from '@/lib/types/database'

type MatchParticipantRemovalSnapshot = Pick<
  MatchParticipant,
  'join_method' | 'participant_accepted_at' | 'removed_by' | 'user_id' | 'removal_note'
>

export function getMatchParticipantRemovalCopy(participant: MatchParticipantRemovalSnapshot) {
  const removalNote = (participant.removal_note ?? '').toLowerCase()

  const isSelfWithdraw =
    Boolean(
      participant.removed_by &&
      participant.user_id &&
      participant.removed_by === participant.user_id,
    ) ||
    removalNote.includes('declined') ||
    removalNote.includes('withdraw')

  const isRevokedInvite =
    !isSelfWithdraw &&
    participant.join_method === 'invited' &&
    participant.participant_accepted_at == null

  return {
    isSelfWithdraw,
    isRevokedInvite,
    badgeLabel: isSelfWithdraw ? 'Withdrawn' : isRevokedInvite ? 'Invitation revoked' : 'No longer invited',
    sentenceLabel: isSelfWithdraw ? 'You left this match.' : isRevokedInvite ? 'Invitation revoked.' : 'No longer invited.',
  }
}
