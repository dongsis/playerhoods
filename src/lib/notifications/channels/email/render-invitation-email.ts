import { escapeHtml, renderEmailLayout } from '@/lib/email/render-email-layout'
import { getSiteOrigin } from '@/lib/site-url'

export type InvitationEmailData = {
  inviterDisplayName: string
  targetEmail: string
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

function formatMatchFormatLabel(gameType: string | null | undefined): string {
  if (!gameType) return 'Match'
  const normalized = gameType.replace(/_/g, ' ').trim()
  if (!normalized) return 'Match'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatMatchDateLabel(matchDate: string | null | undefined): string {
  if (!matchDate) return 'TBD'
  return matchDate
}

function formatClubLabel(clubName: string | null | undefined): string {
  const value = clubName?.trim()
  return value || 'TBD'
}

/** Render invitation email HTML. CTA leads to the invitation response page. */
export function renderInvitationEmail(data: InvitationEmailData): string {
  const base = data.siteUrl && data.siteUrl !== 'undefined' ? data.siteUrl : getSiteOrigin()
  const viewUrl = `${base}/invitations/${data.invitationId}`
  const registerUrl = `${base}/login?mode=register&next=${encodeURIComponent(viewUrl)}`
  const unsubscribeUrl = data.unsubscribeUrl ?? `${base}/unsubscribe?invitation=${encodeURIComponent(data.invitationId)}&channel=email&scope=contact_invites`
  const formatLabel = formatMatchFormatLabel(data.matchSummary?.game_type)
  const dateLabel = formatMatchDateLabel(data.matchSummary?.match_date)
  const timeLabel = data.matchSummary?.start_time?.trim() || 'TBD'
  const clubLabel = formatClubLabel(data.matchSummary?.club_name)
  const inviterName = data.inviterDisplayName.trim() || 'Someone'
  const escapedInviter = escapeHtml(inviterName)
  const escapedVenue = escapeHtml(clubLabel)

  return renderEmailLayout({
    title: `${inviterName} invited you to play`,
    introHtml: `Hi,<br><br><strong>${escapedInviter}</strong> invited you to play at <strong>${escapedVenue}</strong>.<br><br>Please confirm whether you can join:`,
    details: [
      { label: 'Date', value: dateLabel },
      { label: 'Time', value: timeLabel },
      { label: 'Venue', value: clubLabel },
      { label: 'Match', value: formatLabel },
    ],
    ctaLabel: 'Respond to Invitation',
    ctaUrl: viewUrl,
    ctaHint: 'No account is required to respond.',
    promoTitle: 'New to PlayerHoods?',
    promoBody:
      'Create a free account to keep this match, confirm future invites faster, and stay connected with players you know.',
    promoCtaLabel: 'Create Free Account',
    promoCtaUrl: registerUrl,
    secondaryTitle: 'Notification note',
    secondaryBody:
      `PlayerHoods is helping ${inviterName} organize this match. You’ll only receive important updates, such as when the match is formed, cancelled, or key details change.`,
    footerNoteHtml: `You received this because ${escapedInviter} invited you to this match. If you do not want to receive match invitations by email, you can <a href="${escapeHtml(unsubscribeUrl)}">unsubscribe here</a>.`,
    siteUrl: data.siteUrl,
  })
}
