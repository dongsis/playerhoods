type PublicJoinShareTextInput = {
  url: string
  sportName?: string | null
  gameType?: string | null
  venueName?: string | null
  dateTimeLabel?: string | null
  hostName?: string | null
  firstPerson?: boolean
}

function formatShareMatchKind(sportName: string | null | undefined, gameType: string | null | undefined): string {
  const label = (sportName || gameType || '').replace(/_/g, ' ').trim()
  if (!label) return 'match'
  const lowerLabel = label.toLowerCase()
  return /\bmatch\b/i.test(lowerLabel) ? lowerLabel : `${lowerLabel} match`
}

function formatShareActivity(sportName: string | null | undefined, gameType: string | null | undefined): string {
  const label = (sportName || gameType || '').replace(/_/g, ' ').trim()
  if (!label) return 'this match'
  return label.toLowerCase().replace(/\s+match$/i, '')
}

function formatTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPublicShareOpening(input: PublicJoinShareTextInput): string {
  const activity = formatShareActivity(input.sportName, input.gameType)

  if (input.firstPerson) {
    return `Hey - I'm seeing who's free for ${activity}.`
  }

  const hostName = input.hostName?.trim()
  if (hostName) {
    return `${hostName} is seeing who's free for ${activity}.`
  }

  return `${formatTitleCase(formatShareMatchKind(input.sportName, input.gameType))} details`
}

export function buildPublicJoinShareText(input: PublicJoinShareTextInput): string {
  const url = input.url.trim()
  const detailLine = [input.venueName?.trim(), input.dateTimeLabel?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(' · ')
  const hostName = input.hostName?.trim()
  const shareLines = [
    formatPublicShareOpening(input),
    '',
  ]

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
