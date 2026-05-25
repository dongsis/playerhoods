/**
 * HTML email templates for participant notifications.
 */

import { escapeHtml, renderEmailLayout, type EmailDetail } from '@/lib/email/render-email-layout'
import { getSiteOrigin } from '@/lib/site-url'

export type MatchInfo = {
  matchId: string
  gameType: string
  matchDate: string | null
  startTime: string | null
  venueName: string | null
  siteUrl: string
  magicLinkPath?: string | null
  changeSet?: Record<string, unknown> | null
  isFormed?: boolean
}

function matchLink(m: MatchInfo): string {
  const base = m.siteUrl && m.siteUrl !== 'undefined' ? m.siteUrl : getSiteOrigin()
  if (m.magicLinkPath) {
    const path = m.magicLinkPath.startsWith('/') ? m.magicLinkPath : `/${m.magicLinkPath}`
    return `${base}${path}`
  }
  return `${base}/matches/${m.matchId}`
}

function formatEmailDate(value: string | null | undefined): string {
  if (!value) return 'TBD'
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return value
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatEmailTime(value: string | null | undefined): string {
  if (!value) return 'TBD'
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

function buildMatchDetails(m: MatchInfo): EmailDetail[] {
  return [
    { label: 'Sport', value: m.gameType || 'Match' },
    { label: 'Date', value: formatEmailDate(m.matchDate) },
    { label: 'Time', value: formatEmailTime(m.startTime) },
    { label: 'Venue', value: m.venueName || 'TBD' },
  ]
}

export function gameFormedEmail(m: MatchInfo): string {
  return renderEmailLayout({
    eyebrow: 'Match update',
    title: 'Game formed',
    introHtml: `Your <strong>${escapeHtml(m.gameType || 'match')}</strong> is now confirmed.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match',
    ctaUrl: matchLink(m),
    secondaryTitle: 'What happens next',
    secondaryBody:
      'Open the match page to review the roster, court details, and any last-minute notes from the organizer.',
    footerNote: 'You are receiving this email because you are part of a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function matchTimeChangePendingEmail(m: MatchInfo): string {
  return renderEmailLayout({
    eyebrow: 'Schedule update',
    title: 'Match time changed',
    introHtml: `The schedule for <strong>${escapeHtml(m.gameType || 'your match')}</strong> has been updated. Please confirm that you can still make it.`,
    details: buildMatchDetails(m),
    ctaLabel: 'Confirm attendance',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Need to adjust?',
    secondaryBody:
      'If the new time no longer works, update your response on the match page as soon as possible so the organizer can refill the spot.',
    footerNote: 'You are receiving this email because you are part of a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function guestParticipantInviteEmail(m: MatchInfo, inviterName: string): string {
  return renderEmailLayout({
    eyebrow: 'Invitation',
    title: "You're invited",
    introHtml: `<strong>${escapeHtml(inviterName)}</strong> invited you to <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Why you got this',
    secondaryBody:
      'A PlayerHoods user invited you as a possible player for this match. Review the details before deciding whether to join.',
    footerNote: 'This message relates to a PlayerHoods match invitation.',
    siteUrl: m.siteUrl,
  })
}

export function guestOrgApprovedEmail(m: MatchInfo, inviterName: string): string {
  return renderEmailLayout({
    eyebrow: 'Invitation',
    title: "You're invited",
    introHtml: `<strong>${escapeHtml(inviterName)}</strong> invited you to <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Before you respond',
    secondaryBody:
      'Open the match to check the date, venue, and roster details. You can respond from the match page.',
    footerNote: 'This message relates to a PlayerHoods match invitation.',
    siteUrl: m.siteUrl,
  })
}

export function guestDelegateConfirmedEmail(m: MatchInfo): string {
  return renderEmailLayout({
    eyebrow: 'Confirmation',
    title: "You're confirmed",
    introHtml: `Your participation in <strong>${escapeHtml(m.gameType || 'this match')}</strong> is confirmed.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Be ready to play',
    secondaryBody:
      'Use the match page to check for any organizer notes, court updates, or late schedule changes.',
    footerNote: 'You are receiving this email because your PlayerHoods match status changed.',
    siteUrl: m.siteUrl,
  })
}

export function matchRemovedEmail(m: MatchInfo): string {
  return renderEmailLayout({
    eyebrow: 'Roster update',
    title: 'Removed from match',
    introHtml: `You were removed from <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Need more context?',
    secondaryBody:
      'Open the match page to review the latest status. If you think this was unexpected, reach out to the organizer directly.',
    footerNote: 'You are receiving this email because your PlayerHoods match status changed.',
    siteUrl: m.siteUrl,
  })
}

export function matchInvitationEmail(m: MatchInfo, inviterName: string): string {
  return renderEmailLayout({
    eyebrow: 'Invitation',
    title: "You're invited",
    introHtml: `<strong>${escapeHtml(inviterName)}</strong> invited you to <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View and respond',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Next step',
    secondaryBody: 'Review the match details, then respond from the match page when you are ready.',
    footerNote: 'This message relates to a PlayerHoods match invitation.',
    siteUrl: m.siteUrl,
  })
}

export function playerhoodsMatchInviteEmail(m: MatchInfo, organizerName = 'Someone'): string {
  const venueName = m.venueName || 'the venue'
  const inviterName = organizerName.trim() || 'Someone'

  return renderEmailLayout({
    title: `${inviterName} invited you to play`,
    introHtml: `Hi,<br><br><strong>${escapeHtml(inviterName)}</strong> invited you to play at <strong>${escapeHtml(venueName)}</strong>.<br><br>Please confirm whether you can join:`,
    details: buildMatchDetails(m),
    ctaLabel: 'Respond to invitation',
    ctaUrl: matchLink(m),
    ctaHint: 'No account is required to respond.',
    secondaryTitle: 'Notification note',
    secondaryBody:
      `Playerhoods is helping ${inviterName} organize this match. You will not receive more messages unless the match is confirmed and you are selected to play, or if the match is cancelled or key details change.`,
    footerNote: `You received this because ${inviterName} invited you to this match.`,
    siteUrl: m.siteUrl,
  })
}

export function confirmedLineupEmail(m: MatchInfo, organizerName = 'Someone'): string {
  const venueName = m.venueName || 'the venue'
  const inviterName = organizerName.trim() || 'Someone'

  return renderEmailLayout({
    title: "Game on. You're confirmed to play.",
    introHtml: `Hi,<br><br><strong>${escapeHtml(inviterName)}</strong> confirmed the match at <strong>${escapeHtml(venueName)}</strong>. You're in the lineup.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match details',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Notification note',
    secondaryBody:
      'Playerhoods will only contact you again if the match is cancelled or key details change.',
    footerNote: `You received this because ${inviterName} confirmed you in the lineup for this match.`,
    siteUrl: m.siteUrl,
  })
}

export function hostOfflineConfirmationEmail(m: MatchInfo, organizerName = 'Someone'): string {
  const venueName = m.venueName || 'the venue'
  const hostName = organizerName.trim() || 'Someone'

  return renderEmailLayout({
    eyebrow: 'Match confirmation',
    title: "You're listed as confirmed",
    introHtml: `Hi,<br><br><strong>${escapeHtml(hostName)}</strong> added you as confirmed for <strong>${escapeHtml(m.gameType || 'a match')}</strong> at <strong>${escapeHtml(venueName)}</strong>. If anything changed, you can update your response anytime.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Need to change your response?',
    secondaryBody:
      "Open the match page if you can't make it or need to let the host know something changed.",
    footerNote: `You received this because ${hostName} added you to this PlayerHoods match from offline coordination.`,
    siteUrl: m.siteUrl,
  })
}

export function criticalUpdateEmail(m: MatchInfo): string {
  return renderEmailLayout({
    eyebrow: 'Match update',
    title: 'PlayerHoods match update',
    introHtml: 'Key details for your match changed.',
    details: buildMatchDetails(m),
    ctaLabel: 'View details',
    ctaUrl: matchLink(m),
    footerNote: 'You are receiving this email because you are confirmed for a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function cancellationEmail(m: MatchInfo): string {
  return renderEmailLayout({
    eyebrow: 'Match cancelled',
    title: 'PlayerHoods match cancelled',
    introHtml: 'This match has been cancelled.',
    details: buildMatchDetails(m),
    ctaLabel: 'View details',
    ctaUrl: matchLink(m),
    footerNote: 'You are receiving this email because you were confirmed for a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}
