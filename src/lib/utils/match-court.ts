import type { Match, MatchCourtPlanMode, MatchCourtStatus } from '@/lib/types/database'

export type MatchCourtState = {
  status: MatchCourtStatus
  badgeLabel: string
  detailLabel: string
}

export function deriveMatchCourtStatus(params: {
  matchStatus: Match['status']
  courtPlanMode: MatchCourtPlanMode | null | undefined
  finalCourtLabel: string | null | undefined
}): MatchCourtState {
  const finalCourtLabel = params.finalCourtLabel?.trim() || null

  if (params.matchStatus === 'cancelled') {
    return {
      status: 'cancelled',
      badgeLabel: 'Court cancelled',
      detailLabel: 'Court cancelled',
    }
  }

  if (params.courtPlanMode === 'walk_in') {
    return {
      status: 'walk_in',
      badgeLabel: 'Walk-in',
      detailLabel: 'Walk-in / no advance booking',
    }
  }

  if (finalCourtLabel || params.courtPlanMode === 'secured') {
    return {
      status: 'secured',
      badgeLabel: finalCourtLabel ? `Court secured - ${finalCourtLabel}` : 'Court secured',
      detailLabel: finalCourtLabel ? `Court secured - ${finalCourtLabel}` : 'Court secured',
    }
  }

  if (params.courtPlanMode === 'needs_help_booking') {
    return {
      status: 'open',
      badgeLabel: 'Court needed',
      detailLabel: 'Court needed',
    }
  }

  if (params.courtPlanMode === 'self_book_later' || params.courtPlanMode == null) {
    return {
      status: 'open',
      badgeLabel: 'Host will book it later',
      detailLabel: 'Host will book it later',
    }
  }

  return {
    status: 'open',
    badgeLabel: 'Host will book it later',
    detailLabel: 'Host will book it later',
  }
}
