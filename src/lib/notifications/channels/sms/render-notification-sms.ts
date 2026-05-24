import type { MatchInfo } from '@/lib/email/templates'
import { formatInvitationToken } from '@/lib/invitations/invitation-token'
import { getSiteOrigin } from '@/lib/site-url'

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
  replyCode?: string | null
}

type MatchSmsData = MatchInfo & {
  replyCode?: string | null
  magicLinkPath?: string | null
  changeSet?: Record<string, unknown> | null
  isFormed?: boolean
}

function normalizeBaseUrl(siteUrl: string | null | undefined): string {
  if (!siteUrl || siteUrl === 'undefined') return getSiteOrigin()

  try {
    const origin = new URL(siteUrl).origin
    const hostname = new URL(origin).hostname.toLowerCase()
    const isProductionBuild = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

    if (isProductionBuild && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      return getSiteOrigin()
    }

    return origin
  } catch {
    return getSiteOrigin()
  }
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

function formatSmsTime(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!parts) return value
  const date = new Date(Date.UTC(2026, 0, 1, Number(parts[1]), Number(parts[2])))
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date)
}

function formatSummaryParts(gameType: string | null | undefined, matchDate: string | null | undefined, venueName: string | null | undefined) {
  return [formatGameType(gameType), matchDate ?? null, venueName?.trim() || null].filter(Boolean).join(' - ')
}

function matchLink(match: Pick<MatchSmsData, 'matchId' | 'siteUrl' | 'magicLinkPath'>): string {
  if (match.magicLinkPath) {
    const path = match.magicLinkPath.startsWith('/') ? match.magicLinkPath : `/${match.magicLinkPath}`
    return `${normalizeBaseUrl(match.siteUrl)}${path}`
  }
  return `${normalizeBaseUrl(match.siteUrl)}/matches/${match.matchId}`
}

export function renderInvitationSms(data: InvitationSmsData): string {
  const baseUrl = normalizeBaseUrl(data.siteUrl)
  const gameType = formatGameType(data.matchSummary?.game_type)
  const date = formatSmsDate(data.matchSummary?.match_date)
  const venueName = data.matchSummary?.club_name?.trim()
  const token = formatInvitationToken(data.invitationId)
  const invitationUrl = `${baseUrl}/i/${token}`
  const unsubscribeUrl = data.unsubscribeUrl ?? `${baseUrl}/stop/${token}`
  const title = gameType === 'match' ? "You're invited to a PlayerHoods match:" : `You're invited to a PlayerHoods ${gameType} match:`
  const detailLines = [date, venueName].filter(Boolean)
  const replyText = data.replyCode ? `Reply YES ${data.replyCode} if you can play, or NO ${data.replyCode} if you can't.` : null
  return [
    title.replace('invited to', 'invited to confirm availability for'),
    ...detailLines,
    '',
    replyText,
    'This is not the final lineup yet. We will send Game On if the host forms the match.',
    `Details: ${invitationUrl}`,
    `Stop invites: ${unsubscribeUrl}`,
  ].filter((line): line is string => line != null).join('\n')
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
  const date = formatSmsDate(match.matchDate) ?? 'TBD'
  const time = formatSmsTime(match.startTime) ?? 'TBD'
  const location = match.venueName ?? 'TBD'
  return [
    'PlayerHoods update: match time changed to',
    `${date}, ${time}`,
    location,
    '',
    `Details: ${matchLink(match)}`,
  ].join('\n')
}

export function renderMatchRemovedSms(match: MatchInfo): string {
  const summary = formatSummaryParts(match.gameType, match.matchDate, match.venueName)
  return `You were removed from a PlayerHoods match${summary ? ` (${summary})` : ''}. Details: ${matchLink(match)}`
}

export function renderMatchInviteSms(match: MatchSmsData): string {
  const date = formatSmsDate(match.matchDate) ?? 'TBD'
  const time = formatSmsTime(match.startTime) ?? 'TBD'
  const location = match.venueName ?? 'TBD'
  const replyText = match.replyCode ? `Reply YES ${match.replyCode} if you can play, or NO ${match.replyCode} if you can't.` : null
  return [
    "You're invited to confirm availability for a PlayerHoods match:",
    `${date}, ${time}`,
    location,
    '',
    replyText,
    'This is not the final lineup yet. We will send Game On if the host forms the match.',
    `Details: ${matchLink(match)}`,
  ].filter((line): line is string => line != null).join('\n')
}

export function renderConfirmedLineupSms(match: MatchSmsData): string {
  const date = formatSmsDate(match.matchDate) ?? 'TBD'
  const time = formatSmsTime(match.startTime) ?? 'TBD'
  const location = match.venueName ?? 'TBD'
  const outText = match.replyCode ? ` Reply OUT ${match.replyCode} if you can't make it.` : ''
  return `Game on. You're confirmed to play: ${date} at ${time}, ${location}.${outText} We'll only notify you again if the match is cancelled or key details change.`
}

export function renderHostOfflineConfirmationSms(match: MatchSmsData, hostName = 'Someone'): string {
  const date = formatSmsDate(match.matchDate) ?? 'TBD'
  const time = formatSmsTime(match.startTime) ?? 'TBD'
  const location = match.venueName ?? 'TBD'
  const outText = match.replyCode ? ` Reply OUT ${match.replyCode} if anything changed.` : ''
  const formedText = match.isFormed ? ' for a formed match' : ''
  return `${hostName} added you as confirmed${formedText}: ${formatGameType(match.gameType)} at ${location} on ${date} ${time}.${outText} Details: ${matchLink(match)}`
}

function summarizeChangeSet(changeSet: Record<string, unknown> | null | undefined): string {
  if (!changeSet || Object.keys(changeSet).length === 0) return 'match details changed'
  if ('status' in changeSet) return 'this match has been cancelled'
  return Object.keys(changeSet)
    .map((key) => key.replace(/_/g, ' '))
    .join(', ') + ' changed'
}

export function renderCriticalUpdateSms(match: MatchSmsData): string {
  const summary = summarizeChangeSet(match.changeSet)
  const isTimeChange = Boolean(match.changeSet && ('start_time' in match.changeSet || 'match_date' in match.changeSet))

  if (isTimeChange) {
    const date = formatSmsDate(match.matchDate) ?? 'TBD'
    const time = formatSmsTime(match.startTime) ?? 'TBD'
    const location = match.venueName ?? 'TBD'
    const replyText = match.replyCode ? `Reply YES ${match.replyCode} to join, or NO ${match.replyCode} to decline.` : null
    return [
      'PlayerHoods update: match time changed to',
      `${date}, ${time}`,
      location,
      '',
      replyText,
      `Details: ${matchLink(match)}`,
    ].filter((line): line is string => line != null).join('\n')
  }

  const outText = match.replyCode ? ` Reply OUT ${match.replyCode} if you can't make it.` : ''
  return `PlayerHoods update: ${summary}.${outText} Details: ${matchLink(match)}`
}

export function renderCancellationSms(match: MatchSmsData): string {
  const date = formatSmsDate(match.matchDate) ?? 'TBD'
  const time = formatSmsTime(match.startTime) ?? 'TBD'
  const location = match.venueName ?? 'TBD'
  return `PlayerHoods update: this match has been cancelled. ${date} at ${time}, ${location}. Details: ${matchLink(match)}`
}
