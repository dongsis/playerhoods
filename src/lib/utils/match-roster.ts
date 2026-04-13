import type { Match, MatchParticipantStatus, Profile } from '@/lib/types/database'

export type MatchRosterGender = 'male' | 'female' | 'unspecified'
export type MatchRosterDoublesFormat = 'open' | 'mens_doubles' | 'womens_doubles' | 'mixed_doubles'

type RosterParticipant = {
  id: string
  status: MatchParticipantStatus
  user_id: string | null
  guest_id: string | null
  display_name: string
  gender?: Profile['gender'] | null
}

export type MatchRosterInsight = {
  confirmedCount: number
  pendingCount: number
  waitingCount: number
  removedCount: number
  openSpots: number
  formatLabel: string | null
  compositionLabel: string | null
  neededLabel: string | null
  summaryLabel: string
  needsCompositionReview: boolean
  genderCounts: {
    male: number
    female: number
    unspecified: number
  }
}

export function normalizeMatchGender(value: string | null | undefined): MatchRosterGender {
  if (value === 'male' || value === 'female') {
    return value
  }
  return 'unspecified'
}

function isDoublesMatch(gameType: string | null | undefined): boolean {
  return (gameType ?? '').toLowerCase() === 'doubles'
}

function normalizeDoublesFormat(
  match: Pick<Match, 'game_type' | 'doubles_format'>,
): MatchRosterDoublesFormat | null {
  if (!isDoublesMatch(match.game_type)) {
    return null
  }

  switch (match.doubles_format) {
    case 'mens_doubles':
    case 'womens_doubles':
    case 'mixed_doubles':
      return match.doubles_format
    case 'open':
    default:
      return 'open'
  }
}

export function formatDoublesFormatLabel(
  doublesFormat: Match['doubles_format'] | null | undefined,
): string | null {
  switch (doublesFormat) {
    case 'mens_doubles':
      return "Men's doubles"
    case 'womens_doubles':
      return "Women's doubles"
    case 'mixed_doubles':
      return 'Mixed doubles'
    case 'open':
      return 'Open doubles'
    default:
      return null
  }
}

function formatNeededToken(count: number, gender: 'male' | 'female'): string | null {
  if (count <= 0) return null
  return `${count}${gender === 'male' ? 'M' : 'F'}`
}

function buildMixedNeededLabel(
  requiredCount: number,
  confirmedCount: number,
  maleCount: number,
  femaleCount: number,
): string | null {
  const openSpots = Math.max(requiredCount - confirmedCount, 0)
  if (openSpots <= 0) return null

  const targetMale = Math.floor(requiredCount / 2)
  const targetFemale = requiredCount - targetMale
  let remainingMale = Math.max(targetMale - maleCount, 0)
  let remainingFemale = Math.max(targetFemale - femaleCount, 0)
  let maleNeeded = 0
  let femaleNeeded = 0
  let slots = openSpots

  while (slots > 0) {
    if (remainingMale <= 0 && remainingFemale <= 0) {
      break
    }

    if (remainingMale > 0 && remainingFemale > 0) {
      if (remainingFemale > remainingMale) {
        femaleNeeded += 1
        remainingFemale -= 1
      } else {
        maleNeeded += 1
        remainingMale -= 1
      }
      slots -= 1
      continue
    }

    if (remainingMale > 0) {
      maleNeeded += 1
      remainingMale -= 1
      slots -= 1
      continue
    }

    femaleNeeded += 1
    remainingFemale -= 1
    slots -= 1
  }

  const parts = [formatNeededToken(maleNeeded, 'male'), formatNeededToken(femaleNeeded, 'female')].filter(
    (value): value is string => Boolean(value),
  )

  return parts.length > 0 ? `${parts.join('')} needed` : `${openSpots} needed`
}

function buildCompositionLabel(counts: MatchRosterInsight['genderCounts']): string | null {
  const parts: string[] = []
  if (counts.male > 0) parts.push(`${counts.male}M`)
  if (counts.female > 0) parts.push(`${counts.female}F`)
  if (counts.unspecified > 0) parts.push(`${counts.unspecified}U`)
  return parts.length > 0 ? parts.join(' / ') : null
}

export function deriveMatchRosterInsight(
  match: Pick<Match, 'required_count' | 'game_type' | 'doubles_format'>,
  participants: RosterParticipant[],
): MatchRosterInsight {
  const confirmed = participants.filter((participant) => participant.status === 'confirmed')
  const pending = participants.filter((participant) => participant.status === 'pending')
  const waiting = participants.filter((participant) => participant.status === 'waiting_list')
  const removed = participants.filter((participant) => participant.status === 'removed')
  const openSpots = Math.max(match.required_count - confirmed.length, 0)
  const doublesFormat = normalizeDoublesFormat(match)

  const genderCounts = confirmed.reduce(
    (counts, participant) => {
      const gender = normalizeMatchGender(participant.gender)
      counts[gender] += 1
      return counts
    },
    { male: 0, female: 0, unspecified: 0 },
  )

  let neededLabel: string | null = null
  let needsCompositionReview = false

  if (openSpots > 0) {
    if (!doublesFormat || doublesFormat === 'open') {
      neededLabel = `${openSpots} needed`
    } else if (doublesFormat === 'mens_doubles') {
      neededLabel = `${Math.min(openSpots, Math.max(match.required_count - genderCounts.male, 0))}M needed`
    } else if (doublesFormat === 'womens_doubles') {
      neededLabel = `${Math.min(openSpots, Math.max(match.required_count - genderCounts.female, 0))}F needed`
    } else {
      neededLabel = buildMixedNeededLabel(
        match.required_count,
        confirmed.length,
        genderCounts.male,
        genderCounts.female,
      )
    }
  } else if (doublesFormat && doublesFormat !== 'open') {
    if (doublesFormat === 'mens_doubles') {
      needsCompositionReview = genderCounts.male < match.required_count
    } else if (doublesFormat === 'womens_doubles') {
      needsCompositionReview = genderCounts.female < match.required_count
    } else {
      const targetMale = Math.floor(match.required_count / 2)
      const targetFemale = match.required_count - targetMale
      needsCompositionReview =
        genderCounts.male < targetMale || genderCounts.female < targetFemale
    }
  }

  const summarySegments: string[] = []
  if (confirmed.length >= match.required_count) {
    summarySegments.push('Full')
    if (needsCompositionReview) {
      summarySegments.push('composition needs review')
    }
  } else {
    if (pending.length > 0) {
      summarySegments.push(`${pending.length} pending`)
    }
    if (neededLabel) {
      summarySegments.push(neededLabel)
    }
  }

  if (waiting.length > 0) {
    summarySegments.push(`${waiting.length} on waiting list`)
  }

  if (summarySegments.length === 0) {
    summarySegments.push(`${Math.max(match.required_count - confirmed.length, 0)} needed`)
  }

  return {
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    waitingCount: waiting.length,
    removedCount: removed.length,
    openSpots,
    formatLabel: formatDoublesFormatLabel(doublesFormat),
    compositionLabel: buildCompositionLabel(genderCounts),
    neededLabel,
    summaryLabel: summarySegments.join(' · '),
    needsCompositionReview,
    genderCounts,
  }
}
