const BASE_STYLES = `
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #333; }
  .card { max-width: 480px; margin: 0 auto; padding: 1.5rem; }
  .btn { display: inline-block; padding: 0.5rem 1rem; background: #0369a1; color: white; text-decoration: none; border-radius: 6px; }
  .meta { font-size: 0.85rem; color: #666; margin-top: 1rem; }
`

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

const FALLBACK_SITE_URL = 'http://localhost:3000'

/** Render invitation email HTML. CTA leads to the invitation response page. */
export function renderInvitationEmail(data: InvitationEmailData): string {
  const base = data.siteUrl && data.siteUrl !== 'undefined' ? data.siteUrl : FALLBACK_SITE_URL
  const viewUrl = `${base}/invitations/${data.invitationId}`
  const matchStr = data.matchSummary
    ? [data.matchSummary.game_type, data.matchSummary.match_date, data.matchSummary.club_name]
        .filter(Boolean)
        .join(' · ') || 'Match'
    : 'Match'

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <h2>You&apos;re invited to play</h2>
    <p><strong>${escapeHtml(data.inviterDisplayName)}</strong> invited you to join a match.</p>
    <p><strong>Details:</strong> ${escapeHtml(matchStr)}</p>
    <p>Use your private invitation link to accept or decline this match invitation.</p>
    <p><a href="${escapeHtml(viewUrl)}" class="btn">Respond to invitation</a></p>
    <p class="meta">No PlayerHoods account is required to respond. If you enjoy playing with this group, you&apos;re also welcome to join the PlayerHoods community later and organize more games with friends.</p>
  </div>
</body>
</html>
`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
