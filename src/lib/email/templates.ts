/**
 * HTML email templates for participant notifications.
 */

import { escapeHtml, renderEmailLayout, type EmailDetail } from '@/lib/email/render-email-layout'
import { addPublicJoinIntent, type PublicJoinIntent } from '@/lib/notifications/public-join-links'
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

function matchLink(m: MatchInfo, intent?: PublicJoinIntent): string {
  const base = m.siteUrl && m.siteUrl !== 'undefined' ? m.siteUrl : getSiteOrigin()
  if (m.magicLinkPath) {
    const path = m.magicLinkPath.startsWith('/') ? m.magicLinkPath : `/${m.magicLinkPath}`
    return addPublicJoinIntent(`${base}${path}`, intent)
  }
  return `${base}/matches/${m.matchId}`
}

function registrationUrl(m: MatchInfo, nextUrl: string): string {
  const base = m.siteUrl && m.siteUrl !== 'undefined' ? m.siteUrl : getSiteOrigin()
  return `${base}/login?mode=register&next=${encodeURIComponent(nextUrl)}`
}

function accountPromo(m: MatchInfo, nextUrl: string) {
  return {
    promoTitle: 'New to PlayerHoods?',
    promoBody:
      'Create a free account to join matches faster, track updates, manage your match status, and stay connected with players you trust.',
    promoCtaLabel: 'Create Free Account',
    promoCtaUrl: registrationUrl(m, nextUrl),
  }
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

function formatEmailMatchKind(value: string | null | undefined): string {
  const normalized = value?.replace(/_/g, ' ').trim().toLowerCase()
  if (!normalized) return 'match'
  return /\bmatch\b/i.test(normalized) ? normalized : `${normalized} match`
}

export function gameFormedEmail(m: MatchInfo): string {
  const viewUrl = matchLink(m, 'view')
  return renderEmailLayout({
    eyebrow: 'Match update',
    title: 'Game formed',
    introHtml: `Your <strong>${escapeHtml(m.gameType || 'match')}</strong> is now confirmed.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View Match Details',
    ctaUrl: viewUrl,
    secondaryTitle: 'What happens next',
    secondaryBody:
      'Open the match page to review the roster, court details, and any last-minute notes from the organizer.',
    secondaryLinkLabel: 'Change My Response',
    secondaryLinkUrl: matchLink(m, 'change-response'),
    ...accountPromo(m, viewUrl),
    footerNote: 'You are receiving this email because you are part of a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function matchTimeChangePendingEmail(m: MatchInfo): string {
  const reviewUrl = matchLink(m, 'review-changes')
  return renderEmailLayout({
    eyebrow: 'Schedule update',
    title: 'Match details changed',
    introHtml: `The schedule for <strong>${escapeHtml(m.gameType || 'your match')}</strong> has been updated. Please review the new time, venue, or notes.`,
    details: buildMatchDetails(m),
    ctaLabel: 'Review Match Changes',
    ctaUrl: reviewUrl,
    secondaryTitle: 'Need to adjust?',
    secondaryBody:
      'If the new time no longer works, update your response on the match page as soon as possible so the organizer can refill the spot.',
    secondaryLinkLabel: 'Change My Response',
    secondaryLinkUrl: matchLink(m, 'change-response'),
    ...accountPromo(m, reviewUrl),
    footerNote: 'You are receiving this email because you are part of a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function guestParticipantInviteEmail(m: MatchInfo, inviterName: string): string {
  const respondUrl = matchLink(m, 'respond')
  return renderEmailLayout({
    eyebrow: 'Invitation',
    title: "You're invited",
    introHtml: `<strong>${escapeHtml(inviterName)}</strong> invited you to <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'Respond to Invitation',
    ctaUrl: respondUrl,
    ctaHint: 'No account is required to respond.',
    secondaryTitle: 'Why you got this',
    secondaryBody:
      'A PlayerHoods user invited you as a possible player for this match. Review the details before deciding whether to join.',
    ...accountPromo(m, respondUrl),
    footerNote: 'This message relates to a PlayerHoods match invitation.',
    siteUrl: m.siteUrl,
  })
}

export function guestOrgApprovedEmail(m: MatchInfo, inviterName: string): string {
  const respondUrl = matchLink(m, 'respond')
  return renderEmailLayout({
    eyebrow: 'Invitation',
    title: "You're invited",
    introHtml: `<strong>${escapeHtml(inviterName)}</strong> invited you to <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'Respond to Invitation',
    ctaUrl: respondUrl,
    ctaHint: 'No account is required to respond.',
    secondaryTitle: 'Before you respond',
    secondaryBody:
      'Open the match to check the date, venue, and roster details. You can respond from the match page.',
    ...accountPromo(m, respondUrl),
    footerNote: 'This message relates to a PlayerHoods match invitation.',
    siteUrl: m.siteUrl,
  })
}

export function guestDelegateConfirmedEmail(m: MatchInfo): string {
  const viewUrl = matchLink(m, 'view')
  return renderEmailLayout({
    eyebrow: 'Confirmation',
    title: "Game on. You're confirmed to play.",
    introHtml: `Your participation in <strong>${escapeHtml(m.gameType || 'this match')}</strong> is confirmed.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View Match Details',
    ctaUrl: viewUrl,
    secondaryTitle: 'Be ready to play',
    secondaryBody:
      'Use the match page to check for any organizer notes, court updates, or late schedule changes.',
    secondaryLinkLabel: 'Change My Response',
    secondaryLinkUrl: matchLink(m, 'change-response'),
    ...accountPromo(m, viewUrl),
    footerNote: 'You are receiving this email because your PlayerHoods match status changed.',
    siteUrl: m.siteUrl,
  })
}

export function matchRemovedEmail(m: MatchInfo): string {
  const viewUrl = matchLink(m, 'view')
  return renderEmailLayout({
    eyebrow: 'Roster update',
    title: 'Removed from match',
    introHtml: `You were removed from <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View Match Details',
    ctaUrl: viewUrl,
    secondaryTitle: 'Need more context?',
    secondaryBody:
      'Open the match page to review the latest status. If you think this was unexpected, reach out to the organizer directly.',
    ...accountPromo(m, viewUrl),
    footerNote: 'You are receiving this email because your PlayerHoods match status changed.',
    siteUrl: m.siteUrl,
  })
}

export function matchInvitationEmail(m: MatchInfo, inviterName: string): string {
  const respondUrl = matchLink(m, 'respond')
  return renderEmailLayout({
    eyebrow: 'Invitation',
    title: "You're invited",
    introHtml: `<strong>${escapeHtml(inviterName)}</strong> invited you to <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'Respond to Invitation',
    ctaUrl: respondUrl,
    ctaHint: 'No account is required to respond.',
    secondaryTitle: 'Next step',
    secondaryBody: 'Review the match details, then respond from the match page when you are ready.',
    ...accountPromo(m, respondUrl),
    footerNote: 'This message relates to a PlayerHoods match invitation.',
    siteUrl: m.siteUrl,
  })
}

export function playerhoodsMatchInviteEmail(m: MatchInfo, organizerName = 'Someone'): string {
  const venueName = m.venueName || 'the venue'
  const inviterName = organizerName.trim() || 'Someone'
  const respondUrl = matchLink(m, 'respond')

  return renderEmailLayout({
    title: `${inviterName} invited you to play`,
    introHtml: `Hi,<br><br><strong>${escapeHtml(inviterName)}</strong> invited you to play at <strong>${escapeHtml(venueName)}</strong>.<br><br>Please confirm whether you can join:`,
    details: buildMatchDetails(m),
    ctaLabel: 'Respond to Invitation',
    ctaUrl: respondUrl,
    ctaHint: 'No account is required to respond.',
    ...accountPromo(m, respondUrl),
    secondaryTitle: 'Notification note',
    secondaryBody:
      `PlayerHoods is helping ${inviterName} organize this match. You'll only receive important updates, such as when the match is formed, cancelled, or key details change.`,
    footerNote: `You received this because ${inviterName} invited you to this match.`,
    siteUrl: m.siteUrl,
  })
}

export function publicMatchSignupVerificationEmail(
  m: MatchInfo,
  recipientName: string | null,
  verificationUrl: string,
): string {
  const name = recipientName?.trim() || 'there'
  const venueName = m.venueName || 'the venue'
  const matchKind = formatEmailMatchKind(m.gameType)

  return renderEmailLayout({
    eyebrow: 'JOIN LINK',
    title: 'Verify your email',
    introHtml: `Hi ${escapeHtml(name)},<br><br>Your request for this <strong>${escapeHtml(matchKind)}</strong> at <strong>${escapeHtml(venueName)}</strong> has been sent to the host. Click once to verify your email for match updates and confirmations.`,
    details: buildMatchDetails(m),
    ctaLabel: 'Verify email',
    ctaUrl: verificationUrl,
    ctaHint: 'The host still needs to add you to the lineup.',
    secondaryTitle: 'Privacy note',
    secondaryBody:
      'Your contact details will not be shared with the host.',
    footerNote: 'You received this because this email was used to request a spot in a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function confirmedLineupEmail(m: MatchInfo, organizerName = 'Someone'): string {
  const venueName = m.venueName || 'the venue'
  const inviterName = organizerName.trim() || 'Someone'
  const viewUrl = matchLink(m, 'view')

  return renderEmailLayout({
    title: "Game on. You're confirmed to play.",
    introHtml: `Hi,<br><br><strong>${escapeHtml(inviterName)}</strong> confirmed the match at <strong>${escapeHtml(venueName)}</strong>. You're in the lineup.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View Match Details',
    ctaUrl: viewUrl,
    secondaryTitle: 'Need to change your response?',
    secondaryBody:
      "Open your match page to withdraw or let the host know you can't make it.",
    secondaryLinkLabel: 'Change My Response',
    secondaryLinkUrl: matchLink(m, 'change-response'),
    ...accountPromo(m, viewUrl),
    footerNote: `You received this because ${inviterName} confirmed you in the lineup for this match.`,
    siteUrl: m.siteUrl,
  })
}

export function matchReminderEmail(m: MatchInfo): string {
  const viewUrl = matchLink(m, 'view')
  return renderEmailLayout({
    eyebrow: 'Match reminder',
    title: 'Your PlayerHoods match is coming up',
    introHtml: `Reminder: you're in for <strong>${escapeHtml(m.gameType || 'a match')}</strong> at <strong>${escapeHtml(m.venueName || 'the venue')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View Match Details',
    ctaUrl: viewUrl,
    secondaryTitle: 'No group chat noise',
    secondaryBody:
      'PlayerHoods sends only useful match updates: invitations, confirmations, reminders, cancellations, and key detail changes.',
    footerNote: 'You are receiving this email because you are confirmed for a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function hostOfflineConfirmationEmail(m: MatchInfo, organizerName = 'Someone'): string {
  const venueName = m.venueName || 'the venue'
  const hostName = organizerName.trim() || 'Someone'
  const viewUrl = matchLink(m, 'view')

  return renderEmailLayout({
    eyebrow: 'Match confirmation',
    title: "You're listed as confirmed",
    introHtml: `Hi,<br><br><strong>${escapeHtml(hostName)}</strong> added you as confirmed for <strong>${escapeHtml(m.gameType || 'a match')}</strong> at <strong>${escapeHtml(venueName)}</strong>. If anything changed, you can update your response anytime.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View Match Details',
    ctaUrl: viewUrl,
    secondaryTitle: 'Need to change your response?',
    secondaryBody:
      "Open the match page if you can't make it or need to let the host know something changed.",
    secondaryLinkLabel: 'Change My Response',
    secondaryLinkUrl: matchLink(m, 'change-response'),
    ...accountPromo(m, viewUrl),
    footerNote: `You received this because ${hostName} added you to this PlayerHoods match from offline coordination.`,
    siteUrl: m.siteUrl,
  })
}

export function criticalUpdateEmail(m: MatchInfo): string {
  const reviewUrl = matchLink(m, 'review-changes')
  return renderEmailLayout({
    eyebrow: 'Match update',
    title: 'Match details changed',
    introHtml: 'Please review the updated time, venue, or notes for this match.',
    details: buildMatchDetails(m),
    ctaLabel: 'Review Match Changes',
    ctaUrl: reviewUrl,
    secondaryTitle: 'Need to adjust?',
    secondaryBody:
      "Open your match page to withdraw or let the host know you can't make it.",
    secondaryLinkLabel: 'Change My Response',
    secondaryLinkUrl: matchLink(m, 'change-response'),
    ...accountPromo(m, reviewUrl),
    footerNote: 'You are receiving this email because you are confirmed for a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}

export function cancellationEmail(m: MatchInfo): string {
  const viewUrl = matchLink(m, 'view')
  return renderEmailLayout({
    eyebrow: 'Match cancelled',
    title: 'PlayerHoods match cancelled',
    introHtml: 'This match has been cancelled.',
    details: buildMatchDetails(m),
    ctaLabel: 'View Match Details',
    ctaUrl: viewUrl,
    footerNote: 'You are receiving this email because you were confirmed for a PlayerHoods match.',
    siteUrl: m.siteUrl,
  })
}
