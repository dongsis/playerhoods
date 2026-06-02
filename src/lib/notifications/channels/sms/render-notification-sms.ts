import type { MatchInfo } from '@/lib/email/templates'
import { formatInvitationToken } from '@/lib/invitations/invitation-token'
import { getSiteOrigin } from '@/lib/site-url'

type InvitationSmsData = {
  inviterDisplayName: string
  recipientName?: string | null
  invitationId: string
  matchSummary?: {
    game_type: string | null
    sport_name?: string | null
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
  recipientName?: string | null
  venueTimezone?: string | null
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

function formatActivityLabel(sportName: string | null | undefined, gameType: string | null | undefined): string {
  const sport = sportName?.trim()
  const format = formatGameType(gameType)
  if (!sport) return format
  if (format === 'match') return sport
  return `${sport} ${format}`
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

function formatSmsDateTime(matchDate: string | null | undefined, startTime: string | null | undefined): string {
  const date = formatSmsDate(matchDate) ?? 'TBD'
  const time = formatSmsTime(startTime) ?? 'TBD'
  return `${date}, ${time}`
}

function matchLink(match: Pick<MatchSmsData, 'matchId' | 'siteUrl' | 'magicLinkPath'>): string {
  if (match.magicLinkPath) {
    const path = match.magicLinkPath.startsWith('/') ? match.magicLinkPath : `/${match.magicLinkPath}`
    return `${normalizeBaseUrl(match.siteUrl)}${path}`
  }
  return `${normalizeBaseUrl(match.siteUrl)}/matches/${match.matchId}`
}

function recipientPrefix(prefix: string, recipientName: string | null | undefined, fallback: string): string {
  const name = recipientName?.trim()
  return name ? `${prefix}, ${name}.` : fallback
}

export function renderInvitationSms(data: InvitationSmsData): string {
  const baseUrl = normalizeBaseUrl(data.siteUrl)
  const activity = formatActivityLabel(data.matchSummary?.sport_name, data.matchSummary?.game_type)
  const date = formatSmsDate(data.matchSummary?.match_date)
  const time = formatSmsTime(data.matchSummary?.start_time)
  const venueName = data.matchSummary?.club_name?.trim()
  const token = formatInvitationToken(data.invitationId)
  const invitationUrl = `${baseUrl}/i/${token}`
  const detailLines = [[date, time].filter(Boolean).join(', ') || null, venueName].filter(Boolean)
  const replyText = data.replyCode ? `Reply YES ${data.replyCode} or NO ${data.replyCode}.` : null
  const recipientName = data.recipientName?.trim()
  const opening = recipientName
    ? `Hi ${recipientName}, ${data.inviterDisplayName} invited you to ${activity}:`
    : `${data.inviterDisplayName} invited you to ${activity}:`
  return [
    opening,
    ...detailLines,
    '',
    replyText,
    `Details: ${invitationUrl}`,
  ].filter((line): line is string => line != null).join('\n')
}

export function renderGuestParticipantInviteSms(match: MatchInfo, inviterName: string): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  return [
    `${inviterName} invited you to ${formatGameType(match.gameType)}:`,
    dateTime,
    location,
    '',
    `Details: ${matchLink(match)}`,
  ].join('\n')
}

export function renderGuestOrgApprovedSms(match: MatchInfo, inviterName: string): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  return [
    `${inviterName} invited you to ${formatGameType(match.gameType)}:`,
    dateTime,
    location,
    '',
    `Details: ${matchLink(match)}`,
  ].join('\n')
}

export function renderGuestDelegateConfirmedSms(match: MatchInfo): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  return [
    "You're confirmed:",
    dateTime,
    location,
    '',
    `Details: ${matchLink(match)}`,
  ].join('\n')
}

export function renderGameFormedSms(match: MatchInfo): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  return [
    'Game on.',
    '',
    dateTime,
    location,
    '',
    `Details: ${matchLink(match)}`,
  ].join('\n')
}

export function renderMatchTimeChangeSms(match: MatchInfo): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  return [
    `Update: match time changed to ${dateTime}, ${location}.`,
    `Details: ${matchLink(match)}`,
  ].join(' ')
}

export function renderMatchRemovedSms(match: MatchInfo): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  return [
    'You were removed from this match:',
    dateTime,
    location,
    '',
    `Details: ${matchLink(match)}`,
  ].join('\n')
}

export function renderMatchInviteSms(match: MatchSmsData, organizerName = 'Someone'): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  const replyText = match.replyCode ? `Reply YES ${match.replyCode} or NO ${match.replyCode}.` : null
  return [
    `${organizerName} invited you to ${formatGameType(match.gameType)}:`,
    dateTime,
    location,
    '',
    replyText,
    `Details: ${matchLink(match)}`,
  ].filter((line): line is string => line != null).join('\n')
}

export function renderConfirmedLineupSms(match: MatchSmsData): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  const outText = match.replyCode ? `Reply OUT ${match.replyCode} if you can't make it.` : null
  return [
    recipientPrefix('Game on', match.recipientName, 'Game on.'),
    '',
    dateTime,
    location,
    '',
    outText,
    "We'll only text if plans change.",
  ].filter((line): line is string => line != null).join('\n')
}

export function renderMatchReminderSms(match: MatchSmsData): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  const outText = match.replyCode ? `Reply OUT ${match.replyCode} if you can't make it.` : null
  return [
    recipientPrefix('Reminder', match.recipientName, 'Match reminder.'),
    '',
    dateTime,
    location,
    '',
    outText,
    `Details: ${matchLink(match)}`,
  ].filter((line): line is string => line != null).join('\n')
}

export function renderHostOfflineConfirmationSms(match: MatchSmsData, hostName = 'Someone'): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  const outText = match.replyCode ? `Reply OUT ${match.replyCode} if you can't make it.` : null
  const opening = match.recipientName?.trim()
    ? `Hi ${match.recipientName.trim()}, ${hostName} added you as confirmed:`
    : `${hostName} added you as confirmed:`
  return [
    opening,
    dateTime,
    location,
    '',
    outText,
    `Details: ${matchLink(match)}`,
  ].filter((line): line is string => line != null).join('\n')
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
  const outText = match.replyCode ? ` Reply OUT ${match.replyCode} if you can't make it.` : ''

  if (isTimeChange) {
    const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
    const location = match.venueName ?? 'TBD'
    return `Update: match time changed to ${dateTime}, ${location}.${outText} Details: ${matchLink(match)}`
  }

  return `Update: ${summary}.${outText} Details: ${matchLink(match)}`
}

export function renderCancellationSms(match: MatchSmsData): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  return [
    'This match was cancelled:',
    dateTime,
    location,
    '',
    `Details: ${matchLink(match)}`,
  ].join('\n')
}
