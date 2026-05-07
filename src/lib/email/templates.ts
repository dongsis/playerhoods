/**
 * HTML email templates for participant notifications.
 */

import { escapeHtml, renderEmailLayout, type EmailDetail } from '@/lib/email/render-email-layout'

export type MatchInfo = {
  matchId: string
  gameType: string
  matchDate: string | null
  startTime: string | null
  venueName: string | null
  siteUrl: string
}

function matchLink(m: MatchInfo): string {
  const base = m.siteUrl && m.siteUrl !== 'undefined' ? m.siteUrl : 'http://localhost:3000'
  return `${base}/matches/${m.matchId}`
}

function buildMatchDetails(m: MatchInfo): EmailDetail[] {
  return [
    { label: 'Sport', value: m.gameType || 'Match' },
    { label: 'When', value: [m.matchDate, m.startTime].filter(Boolean).join(' ') || 'TBD' },
    { label: 'Where', value: m.venueName || 'TBD' },
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

export function guestNominatedEmail(m: MatchInfo, nominatorName: string): string {
  return renderEmailLayout({
    eyebrow: 'Nomination',
    title: "You're nominated",
    introHtml: `<strong>${escapeHtml(nominatorName)}</strong> nominated you for <strong>${escapeHtml(m.gameType || 'a match')}</strong>.`,
    details: buildMatchDetails(m),
    ctaLabel: 'View match',
    ctaUrl: matchLink(m),
    secondaryTitle: 'Why you got this',
    secondaryBody:
      'A PlayerHoods user added you as a possible player for this match. Review the details before deciding whether to join.',
    footerNote: 'This message relates to a PlayerHoods match nomination.',
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

export function inviteOrNominateEmail(m: MatchInfo, inviterName: string): string {
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
