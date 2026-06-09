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

function formatPossessiveName(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`
}

function formatPublicShareOpening(input: PublicJoinShareTextInput): string {
  const matchKind = formatShareMatchKind(input.sportName, input.gameType)
  const emoji = /\btennis\b/i.test(matchKind) ? ' 🎾' : ''

  if (input.firstPerson) {
    return `Join my ${matchKind} on PlayerHoods${emoji}`
  }

  const hostName = input.hostName?.trim()
  if (hostName) {
    return `Join ${formatPossessiveName(hostName)} ${matchKind} on PlayerHoods${emoji}`
  }

  return `Join this ${matchKind} on PlayerHoods${emoji}`
}

export function buildPublicJoinShareText(input: PublicJoinShareTextInput): string {
  const url = input.url.trim()
  const detailLine = [input.venueName?.trim(), input.dateTimeLabel?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(' · ')

  if (!url || !detailLine) {
    return [
      'Join this match on PlayerHoods',
      '',
      'Request a spot here:',
      url,
    ].join('\n')
  }

  return [
    formatPublicShareOpening(input),
    '',
    detailLine,
    'Looking for players',
    '',
    'Request a spot here:',
    url,
  ].join('\n')
}
