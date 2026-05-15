import type { MatchInfo } from '@/lib/email/templates'

type InvitationSmsData = {
  inviterDisplayName: string
  invitationId: string
  matchSummary?: {
    game_type: string | null
    match_date: string | null
    start_time?: string | null
    club_name: string | null
  } | null
  siteUrl: string
  unsubscribeUrl?: string | null
}

const FALLBACK_SITE_URL = 'http://localhost:3000'

function normalizeBaseUrl(siteUrl: string): string {
  return siteUrl && siteUrl !== 'undefined' ? siteUrl : FALLBACK_SITE_URL
}

function formatGameType(gameType: string | null | undefined): string {
  if (!gameType) return 'match'
  return gameType.replace(/_/g, ' ')
}

function formatSmsDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return value
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function formatSummaryParts(gameType: string | null | undefined, matchDate: string | null | undefined, venueName: string | null | undefined) {
  return [formatGameType(gameType), matchDate ?? null, venueName?.trim() || null].filter(Boolean).join(' - ')
}

function matchLink(match: MatchInfo): string {
  return `${normalizeBaseUrl(match.siteUrl)}/matches/${match.matchId}`
}

export function renderInvitationSms(data: InvitationSmsData): string {
  const baseUrl = normalizeBaseUrl(data.siteUrl)
  const gameType = formatGameType(data.matchSummary?.game_type)
  const date = formatSmsDate(data.matchSummary?.match_date)
  const venueName = data.matchSummary?.club_name?.trim()
  const invitationUrl = `${baseUrl}/i/${data.invitationId}`
  const unsubscribeUrl = data.unsubscribeUrl ?? `${baseUrl}/stop/${data.invitationId}`
  const details = [
    gameType === 'match' ? 'a match' : `a ${gameType} match`,
    date ? `on ${date}` : null,
    venueName ? `at ${venueName}` : null,
  ].filter(Boolean).join(' ')

  return `PlayerHoods: ${data.inviterDisplayName} invited you to ${details}. Respond: ${invitationUrl}. Stop invites: ${unsubscribeUrl}. Reply STOP to unsubscribe.`
}

export function renderGuestParticipantInviteSms(match: MatchInfo, inviterName: string): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `${inviterName} invited you to a PlayerHoods match${summary ? ` (${summary})` : ''}. Details: ${matchLink(match)}`
}

export function renderGuestOrgApprovedSms(match: MatchInfo, inviterName: string): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `${inviterName} invited you to a PlayerHoods match${summary ? ` (${summary})` : ''}. Details: ${matchLink(match)}`
}

export function renderGuestDelegateConfirmedSms(match: MatchInfo): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `You're confirmed for your PlayerHoods match${summary ? ` (${summary})` : ''}. Details: ${matchLink(match)}`
}

export function renderGameFormedSms(match: MatchInfo): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `Your PlayerHoods match is formed${summary ? ` (${summary})` : ''}. Details: ${matchLink(match)}`
}

export function renderMatchTimeChangeSms(match: MatchInfo): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `Your PlayerHoods match time changed${summary ? ` (${summary})` : ''}. Confirm here: ${matchLink(match)}`
}

export function renderMatchRemovedSms(match: MatchInfo): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `You were removed from a PlayerHoods match${summary ? ` (${summary})` : ''}. Details: ${matchLink(match)}`
}
