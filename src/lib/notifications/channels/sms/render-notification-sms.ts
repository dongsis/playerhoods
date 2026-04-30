import type { MatchInfo } from '@/lib/email/templates'

type InvitationSmsData = {
  inviterDisplayName: string
  invitationId: string
  matchSummary?: {
    game_type: string | null
    match_date: string | null
    club_name: string | null
  } | null
  siteUrl: string
}

const FALLBACK_SITE_URL = 'http://localhost:3000'

function normalizeBaseUrl(siteUrl: string): string {
  return siteUrl && siteUrl !== 'undefined' ? siteUrl : FALLBACK_SITE_URL
}

function formatGameType(gameType: string | null | undefined): string {
  if (!gameType) return 'match'
  return gameType.replace(/_/g, ' ')
}

function formatSummaryParts(gameType: string | null | undefined, matchDate: string | null | undefined, venueName: string | null | undefined) {
  return [formatGameType(gameType), matchDate ?? null, venueName?.trim() || null].filter(Boolean).join(' - ')
}

function matchLink(match: MatchInfo): string {
  return `${normalizeBaseUrl(match.siteUrl)}/matches/${match.matchId}`
}

export function renderInvitationSms(data: InvitationSmsData): string {
  const summary = formatSummaryParts(
    data.matchSummary?.game_type,
    data.matchSummary?.match_date,
    data.matchSummary?.club_name,
  )
  const invitationUrl = `${normalizeBaseUrl(data.siteUrl)}/invitations/${data.invitationId}`
  return summary
    ? `${data.inviterDisplayName} invited you to a PlayerHoods match (${summary}). Respond: ${invitationUrl}`
    : `${data.inviterDisplayName} invited you to a PlayerHoods match. Respond: ${invitationUrl}`
}

export function renderGuestNominatedSms(match: MatchInfo, nominatorName: string): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `${nominatorName} nominated you for a PlayerHoods match${summary ? ` (${summary})` : ''}. Details: ${matchLink(match)}`
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
