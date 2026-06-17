import type { MatchInfo } from '@/lib/email/templates'
import { formatInvitationToken } from '@/lib/invitations/invitation-token'
import { formatMatchLevelLabel } from '@/lib/match-level'
import { getSiteOrigin } from '@/lib/site-url'

type SmsMatchSummary = {
  game_type: string | null
  sport_name?: string | null
  match_date: string | null
  start_time?: string | null
  club_name: string | null
  level_label?: string | null
  match_summary_sms?: string | null
}

type InvitationSmsData = {
  inviterDisplayName: string
  recipientName?: string | null
  invitationId: string
  matchSummary?: SmsMatchSummary | null
  siteUrl: string
  unsubscribeUrl?: string | null
  replyCode?: string | null
  responseUrl?: string | null
  levelLabel?: string | null
  matchSummarySms?: string | null
}

type MatchSmsData = MatchInfo & {
  replyCode?: string | null
  magicLinkPath?: string | null
  changeSet?: Record<string, unknown> | null
  isFormed?: boolean
  recipientName?: string | null
  sportName?: string | null
  venueTimezone?: string | null
  levelLabel?: string | null
  matchSummarySms?: string | null
}

type PublicJoinRequestSmsData = {
  hostDisplayName: string
  recipientName?: string | null
  gameType?: string | null
  sportName?: string | null
  matchDate?: string | null
  startTime?: string | null
  venueName?: string | null
  levelLabel?: string | null
  matchSummarySms?: string | null
  smsJoinPath: string
  siteUrl: string
}

type PublicJoinNotThisTimeSmsData = Pick<
  MatchSmsData,
  'matchId' | 'siteUrl' | 'magicLinkPath' | 'recipientName'
> & {
  hostDisplayName?: string | null
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
  const sport = sportName?.trim().toLowerCase()
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

function firstName(name: string | null | undefined): string | null {
  const value = name?.trim()
  if (!value) return null
  return value.split(/\s+/)[0] || null
}

function greeting(recipientName: string | null | undefined): string {
  const name = firstName(recipientName)
  return name ? `Hey ${name}` : 'Hey there'
}

function cleanLine(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text || null
}

function resolvedLevelLabel(value: string | null | undefined): string | null {
  return formatMatchLevelLabel(value)
}

function formatMatchKind(
  sportName: string | null | undefined,
  gameType: string | null | undefined,
  levelLabel: string | null | undefined,
): string {
  const activity = formatActivityLabel(sportName, gameType).replace(/\s+match$/i, '').trim()
  const level = resolvedLevelLabel(levelLabel)
  const label = [level, activity].filter(Boolean).join(' ').trim() || 'match'
  return /\bmatch$/i.test(label) ? label : `${label} match`
}

function openingLine(
  recipientName: string | null | undefined,
  hostName: string | null | undefined,
  matchKind: string,
  venueName: string | null | undefined,
  dateTime: string,
  verb = 'has an opening for',
): string {
  const host = hostName?.trim() || 'Someone'
  const venue = venueName?.trim() || 'TBD'
  return `PlayerHoods: ${greeting(recipientName)}, ${host} ${verb} a ${matchKind} at ${venue}, ${dateTime}.`
}

function pushOptionalSummary(lines: Array<string | null>, summary: string | null | undefined): void {
  const cleanSummary = cleanLine(summary)
  if (cleanSummary) {
    lines.push('', cleanSummary)
  }
}

export function renderInvitationSms(data: InvitationSmsData): string {
  const baseUrl = normalizeBaseUrl(data.siteUrl)
  const dateTime = formatSmsDateTime(data.matchSummary?.match_date, data.matchSummary?.start_time)
  const venueName = data.matchSummary?.club_name?.trim()
  const token = formatInvitationToken(data.invitationId)
  const invitationUrl = data.responseUrl ?? `${baseUrl}/i/${token}`
  const levelLabel = data.levelLabel ?? data.matchSummary?.level_label ?? null
  const matchKind = formatMatchKind(data.matchSummary?.sport_name, data.matchSummary?.game_type, levelLabel)
  const replyText = data.replyCode
    ? `Reply YES ${data.replyCode} if you'd like to play, or NO ${data.replyCode} if not this time.`
    : null
  const lines: Array<string | null> = [
    openingLine(data.recipientName, data.inviterDisplayName, matchKind, venueName, dateTime),
  ]

  pushOptionalSummary(lines, data.matchSummarySms ?? data.matchSummary?.match_summary_sms)
  lines.push('', replyText, `Details: ${invitationUrl}`, 'Reply STOP to opt out.')

  return lines.filter((line): line is string => line != null).join('\n')
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
  const replyText = match.replyCode
    ? `Reply YES ${match.replyCode} if you'd like to play, or NO ${match.replyCode} if not this time.`
    : null
  const matchKind = formatMatchKind(match.sportName, match.gameType, match.levelLabel)
  const lines: Array<string | null> = [
    openingLine(match.recipientName, organizerName, matchKind, location, dateTime),
  ]

  pushOptionalSummary(lines, match.matchSummarySms)
  lines.push('', replyText, `Details: ${matchLink(match)}`, 'Reply STOP to opt out.')

  return lines.filter((line): line is string => line != null).join('\n')
}

export function renderPublicJoinRequestSms(data: PublicJoinRequestSmsData): string {
  const baseUrl = normalizeBaseUrl(data.siteUrl)
  const path = data.smsJoinPath.startsWith('/') ? data.smsJoinPath : `/${data.smsJoinPath}`
  const detailsUrl = `${baseUrl}${path}`
  const venue = data.venueName?.trim() || 'TBD'
  const dateTime = formatSmsDateTime(data.matchDate, data.startTime)
  const matchKind = formatMatchKind(data.sportName, data.gameType, data.levelLabel)
  const lines = [
    openingLine(data.recipientName, data.hostDisplayName, matchKind, venue, dateTime),
  ]

  pushOptionalSummary(lines, data.matchSummarySms)
  lines.push(
    '',
    'Reply JOIN to request a spot, or NO if not this time.',
    `Details: ${detailsUrl}`,
    'Reply STOP to opt out.',
  )

  return lines.join('\n')
}

export function renderPublicJoinNotThisTimeSms(data: PublicJoinNotThisTimeSmsData): string {
  const hostName = data.hostDisplayName?.trim() || 'The host'
  return [
    `PlayerHoods: ${greeting(data.recipientName)}, not this time - ${hostName} couldn't add you to this match.`,
    '',
    `Details: ${matchLink(data)}`,
    'Reply STOP to opt out.',
  ].join('\n')
}

export function renderConfirmedLineupSms(match: MatchSmsData): string {
  const dateTime = formatSmsDateTime(match.matchDate, match.startTime)
  const location = match.venueName ?? 'TBD'
  const outText = match.replyCode ? `Reply OUT ${match.replyCode} if you can't make it.` : null
  const matchKind = formatMatchKind(match.sportName, match.gameType, match.levelLabel)
  const name = firstName(match.recipientName)
  const opening = name
    ? `PlayerHoods: Game on, ${name}. You're confirmed for a ${matchKind} at ${location}, ${dateTime}.`
    : `PlayerHoods: Game on. You're confirmed for a ${matchKind} at ${location}, ${dateTime}.`
  return [
    opening,
    '',
    outText,
    `Details: ${matchLink(match)}`,
    'Reply STOP to opt out.',
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
  const matchKind = formatMatchKind(match.sportName, match.gameType, match.levelLabel)
  const statusLine = match.isFormed
    ? "Game On. You're in the confirmed lineup."
    : "This is not the final lineup yet. We'll send Game On if the match is formed."
  return [
    `PlayerHoods: ${greeting(match.recipientName)}, ${hostName} confirmed you for a ${matchKind} at ${location}, ${dateTime}.`,
    '',
    statusLine,
    '',
    outText,
    `Details: ${matchLink(match)}`,
    'Reply STOP to opt out.',
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
