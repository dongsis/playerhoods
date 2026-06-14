import type { MatchDoublesFormat } from '@/lib/types/database'
import { formatDoublesFormatLabel } from '@/lib/utils/match-roster'

type PublicJoinShareTextInput = {
  url: string
  sportName?: string | null
  gameType?: string | null
  doublesFormat?: MatchDoublesFormat | null
  level?: string | null
  venueName?: string | null
  dateTimeLabel?: string | null
  hostName?: string | null
  firstPerson?: boolean
}

function formatShareLabel(sportName: string | null | undefined, gameType: string | null | undefined): string {
  const sportLabel = (sportName || '').replace(/_/g, ' ').trim()
  const gameTypeLabel = (gameType || '').replace(/_/g, ' ').trim()
  const sportLower = sportLabel.toLowerCase()
  const gameTypeLower = gameTypeLabel.toLowerCase()

  if (sportLabel && gameTypeLabel) {
    if (gameTypeLower.includes(sportLower)) return gameTypeLabel
    if (sportLower.includes(gameTypeLower)) return sportLabel
    return `${sportLabel} ${gameTypeLabel}`
  }

  return sportLabel || gameTypeLabel
}

function formatShareMatchKind(sportName: string | null | undefined, gameType: string | null | undefined): string {
  const label = formatShareLabel(sportName, gameType)
  if (!label) return 'match'
  const lowerLabel = label.toLowerCase()
  return /\bmatch\b/i.test(lowerLabel) ? lowerLabel : `${lowerLabel} match`
}

function formatShareMatchType(input: PublicJoinShareTextInput): string {
  const formatLabel = formatDoublesFormatLabel(input.gameType, input.doublesFormat)
  if (formatLabel) {
    return /\bmatch\b/i.test(formatLabel) ? formatLabel : `${formatLabel} match`
  }

  const label = (input.gameType || input.sportName || '').replace(/_/g, ' ').trim()
  if (!label) return 'Match'

  const titleLabel = formatTitleCase(label)
  return /\bmatch\b/i.test(titleLabel) ? titleLabel : `${titleLabel} match`
}

function formatShareLevel(value: string | null | undefined): string | null {
  const level = value?.trim()
  return level || null
}

function formatShareActivity(sportName: string | null | undefined, gameType: string | null | undefined): string {
  const label = formatShareLabel(sportName, gameType)
  if (!label) return 'this match'
  return label.toLowerCase().replace(/\s+match$/i, '')
}

function formatTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPublicShareOpening(input: PublicJoinShareTextInput): string {
  const activity = formatShareActivity(input.sportName, input.gameType)
  const hostName = input.hostName?.trim()

  if (input.firstPerson) {
    return hostName
      ? `Hey — this is ${hostName}. I'm seeing who's free for ${activity}.`
      : `Hey — I'm seeing who's free for ${activity}.`
  }

  if (hostName) {
    return `${hostName} is seeing who's free for ${activity}.`
  }

  return `${formatTitleCase(formatShareMatchKind(input.sportName, input.gameType))} details`
}

export function buildPublicJoinShareText(input: PublicJoinShareTextInput): string {
  const url = input.url.trim()
  const level = formatShareLevel(input.level)
  const matchLine = [
    formatShareMatchType(input),
    level ? `Level: ${level}` : null,
  ].filter(Boolean).join(' · ')
  const detailLine = [input.venueName?.trim(), input.dateTimeLabel?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(' · ')
  const hostName = input.hostName?.trim()
  const shareLines = [
    formatPublicShareOpening(input),
    '',
  ]

  if (matchLine) {
    shareLines.push(matchLine)
  }

  if (detailLine) {
    shareLines.push(detailLine)
  }

  if (hostName) {
    shareLines.push(`Hosted by ${hostName}`)
  }

  if (url) {
    shareLines.push('', 'Details here if you might want to play:', url)
  }

  return shareLines.join('\n')
}
