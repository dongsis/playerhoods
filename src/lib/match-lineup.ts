import type { Json } from '@/lib/types/database'

export type MatchLineupMatch = {
  court: string
  group: string[]
  teamA: string[]
  teamB: string[]
}

export type MatchLineupSnapshot = {
  generatedAt: string
  playerIds: string[]
  playersCount: number
  courtCount: number
  generatedCourtLabels: boolean
  setOne: MatchLineupMatch[]
  setTwo: MatchLineupMatch[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isLineupMatch(value: unknown): value is MatchLineupMatch {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.court === 'string' &&
    isStringArray(candidate.group) &&
    isStringArray(candidate.teamA) &&
    isStringArray(candidate.teamB)
  )
}

export function parseMatchLineupSnapshot(value: Json | null | undefined): MatchLineupSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.generatedAt !== 'string' ||
    typeof candidate.playersCount !== 'number' ||
    typeof candidate.courtCount !== 'number' ||
    typeof candidate.generatedCourtLabels !== 'boolean' ||
    !isStringArray(candidate.playerIds) ||
    !Array.isArray(candidate.setOne) ||
    !Array.isArray(candidate.setTwo) ||
    !candidate.setOne.every(isLineupMatch) ||
    !candidate.setTwo.every(isLineupMatch)
  ) {
    return null
  }

  return {
    generatedAt: candidate.generatedAt,
    playerIds: candidate.playerIds,
    playersCount: candidate.playersCount,
    courtCount: candidate.courtCount,
    generatedCourtLabels: candidate.generatedCourtLabels,
    setOne: candidate.setOne,
    setTwo: candidate.setTwo,
  }
}

export function isCurrentLineupSnapshot(
  snapshot: MatchLineupSnapshot | null,
  confirmedPlayerIds: string[],
) {
  if (!snapshot) return false
  if (snapshot.playerIds.length !== confirmedPlayerIds.length) return false

  const left = snapshot.playerIds.slice().sort()
  const right = confirmedPlayerIds.slice().sort()
  return left.every((id, index) => id === right[index])
}
