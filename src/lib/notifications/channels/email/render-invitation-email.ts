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

/** Render invitation email HTML. CTA: "View Invitation" - no auto-accept. */
export function renderInvitationEmail(data: InvitationEmailData): string {
  const viewUrl = `${data.siteUrl}/invitations/${data.invitationId}`
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
    <h2>You're invited</h2>
    <p><strong>${escapeHtml(data.inviterDisplayName)}</strong> invited you to a match.</p>
    <p><strong>Details:</strong> ${escapeHtml(matchStr)}</p>
    <p>View the invitation and respond.</p>
    <p><a href="${escapeHtml(viewUrl)}" class="btn">View Invitation</a></p>
    <p class="meta">PlayerHoods — You must sign in and confirm to accept.</p>
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
