import { escapeHtml, renderEmailLayout } from '@/lib/email/render-email-layout'

export type InvitationEmailData = {
  inviterDisplayName: string
  targetEmail: string
  invitationId: string
  matchSummary?: {
    game_type: string | null
    match_date: string | null
    club_name: string | null
  } | null
  siteUrl: string
}

function formatInvitationHeading(): string {
  return 'Match Invitation'
}

function formatInvitationBody(inviterDisplayName: string): string {
  return `<strong>${escapeHtml(inviterDisplayName)}</strong> has invited you to join a <strong>match</strong>.`
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
  const base = data.siteUrl && data.siteUrl !== 'undefined' ? data.siteUrl : 'http://localhost:3000'
  const viewUrl = `${base}/invitations/${data.invitationId}`
  const registerUrl = `${base}/login`
  const formatLabel = formatMatchFormatLabel(data.matchSummary?.game_type)
  const dateLabel = formatMatchDateLabel(data.matchSummary?.match_date)
  const clubLabel = formatClubLabel(data.matchSummary?.club_name)

  return renderEmailLayout({
    eyebrow: 'Invitation',
    title: formatInvitationHeading(),
    introHtml: formatInvitationBody(data.inviterDisplayName),
    details: [
      { label: 'Format', value: formatLabel },
      { label: 'Date', value: dateLabel },
      { label: 'Club', value: clubLabel },
    ],
    ctaLabel: 'Respond to invitation',
    ctaUrl: viewUrl,
    ctaHint: 'No account is required to respond.',
    secondaryTitle: 'Why PlayerHoods',
    secondaryBody:
      "PlayerHoods helps players organize matches without scattered group chats. Respond quickly, keep your playing schedule in one place, and join the community whenever you're ready.",
    secondaryLinkLabel: 'Create an account for a smoother experience',
    secondaryLinkUrl: registerUrl,
    footerNote: `This invitation was sent to ${data.targetEmail}.`,
    siteUrl: data.siteUrl,
  })
}
