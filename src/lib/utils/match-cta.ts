/**
 * CTA state machine for match cards and detail page.
 * Pure functions — no side effects, no imports from other project modules.
 */

export type CardCTA =
  | { kind: 'accept' }
  | { kind: 'withdraw' }
  | { kind: 'request' }
  | { kind: 'approve'; participantId: string; count: number }
  | null

interface ParticipantSnapshot {
  id: string
  status: string
  join_method: string
  user_accepted_at: string | null
  org_approved_at: string | null
}

/**
 * Derives the single most important CTA for a match card in the list view.
 *
 * Priority:
 *  1. Accept  — I have an uninvited invite (user_accepted_at = null)
 *  2. Approve — I'm organizer and someone is waiting for org approval
 *  3. Withdraw — I'm pending (can cancel) or confirmed non-organizer (can leave)
 *  4. Request — match is request-mode, I'm not a participant (scope checked server-side on click)
 *  5. null
 */
export function computeCardCTA(params: {
  matchStatus: string
  admissionMode: string
  myParticipant: ParticipantSnapshot | null
  isOrganizer: boolean
  /** Participants with user_accepted_at SET but org_approved_at NULL */
  pendingApprovals: ParticipantSnapshot[]
}): CardCTA {
  if (params.matchStatus !== 'active') return null

  const mp = params.myParticipant

  // 1. Uninvited invite — must accept
  if (
    mp?.status === 'pending' &&
    mp.join_method === 'invited' &&
    !mp.user_accepted_at
  ) {
    return { kind: 'accept' }
  }

  // 2. Organizer: someone waiting for approval
  if (params.isOrganizer && params.pendingApprovals.length > 0) {
    return {
      kind: 'approve',
      participantId: params.pendingApprovals[0].id,
      count: params.pendingApprovals.length,
    }
  }

  // 3a. Pending participant — can withdraw/cancel
  if (mp?.status === 'pending') {
    return { kind: 'withdraw' }
  }

  // 3b. Confirmed non-organizer — can leave
  if (mp?.status === 'confirmed' && !params.isOrganizer) {
    return { kind: 'withdraw' }
  }

  // 4. Not a participant in a request-mode match — can request
  if (!mp && !params.isOrganizer && params.admissionMode === 'request') {
    return { kind: 'request' }
  }

  return null
}

/** Labels shown on CTA buttons. */
export const CTA_LABEL: Record<string, string> = {
  accept:   'Accept',
  withdraw: 'Withdraw',
  request:  'Request',
  approve:  'Approve',
}

/** Button colours for CTA kinds. */
export const CTA_COLOR: Record<string, string> = {
  accept:   '#2d8a4e',
  withdraw: '#888888',
  request:  '#4a90d9',
  approve:  '#d97706',
}
