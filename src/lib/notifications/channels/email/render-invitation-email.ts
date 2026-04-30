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

function normalizeBaseUrl(siteUrl: string): string {
  return siteUrl && siteUrl !== 'undefined' ? siteUrl : FALLBACK_SITE_URL
}

function formatInvitationTitle(): string {
  return 'PlayerHoods Match Invitation'
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Render invitation email HTML. CTA leads to the invitation response page. */
export function renderInvitationEmail(data: InvitationEmailData): string {
  const base = normalizeBaseUrl(data.siteUrl)
  const viewUrl = `${base}/invitations/${data.invitationId}`
  const registerUrl = `${base}/login`
  const formatLabel = formatMatchFormatLabel(data.matchSummary?.game_type)
  const dateLabel = formatMatchDateLabel(data.matchSummary?.match_date)
  const clubLabel = formatClubLabel(data.matchSummary?.club_name)

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(formatInvitationTitle())}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f9fafb;
            margin: 0;
            padding: 0;
            color: #1f2937;
        }
        .container {
            max-width: 520px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            border: 1px solid #e5e7eb;
        }
        .header {
            padding: 32px 32px 20px;
        }
        .logo {
            font-size: 20px;
            font-weight: 800;
            color: #0284c7;
            letter-spacing: -0.5px;
            margin-bottom: 24px;
        }
        .title {
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 12px;
            color: #111827;
        }
        .inviter {
            font-size: 16px;
            color: #4b5563;
            margin-bottom: 24px;
        }
        .inviter strong {
            color: #111827;
        }
        .info-grid {
            background-color: #f3f4f6;
            border-radius: 8px;
            padding: 16px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 32px;
        }
        .info-item {
            display: flex;
            flex-direction: column;
        }
        .label {
            font-size: 11px;
            text-transform: uppercase;
            color: #6b7280;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .value {
            font-size: 14px;
            font-weight: 600;
            color: #111827;
        }
        .primary-action {
            padding: 0 32px 32px;
            text-align: center;
        }
        .btn-primary {
            display: block;
            background-color: #0284c7;
            color: white !important;
            text-decoration: none;
            padding: 14px 24px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            transition: background 0.2s;
        }
        .btn-primary:hover {
            background-color: #0369a1;
        }
        .hint {
            font-size: 13px;
            color: #9ca3af;
            margin-top: 12px;
        }
        .divider {
            height: 1px;
            background-color: #e5e7eb;
            margin: 0 32px;
        }
        .secondary-section {
            padding: 32px;
            background-color: #fafafa;
        }
        .intro-title {
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
        }
        .intro-title svg {
            margin-right: 8px;
            color: #0284c7;
        }
        .intro-text {
            font-size: 14px;
            color: #4b5563;
            line-height: 1.6;
            margin-bottom: 16px;
        }
        .register-link {
            display: inline-flex;
            align-items: center;
            color: #0284c7;
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
        }
        .register-link:hover {
            text-decoration: underline;
        }
        .footer {
            padding: 24px 32px;
            font-size: 12px;
            color: #9ca3af;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">PlayerHoods</div>
            <h1 class="title">${escapeHtml(formatInvitationHeading())}</h1>
            <p class="inviter">${formatInvitationBody(data.inviterDisplayName)}</p>

            <div class="info-grid">
                <div class="info-item">
                    <span class="label">Format</span>
                    <span class="value">${escapeHtml(formatLabel)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Date</span>
                    <span class="value">${escapeHtml(dateLabel)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Club</span>
                    <span class="value">${escapeHtml(clubLabel)}</span>
                </div>
            </div>
        </div>

        <div class="primary-action">
            <a href="${escapeHtml(viewUrl)}" class="btn-primary">Respond to Invitation</a>
            <p class="hint">No account required to respond</p>
        </div>

        <div class="divider"></div>

        <div class="secondary-section">
            <div class="intro-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12L2.1 14.9"></path><path d="M12 12l9.9-2.9"></path><circle cx="12" cy="12" r="10"></circle></svg>
                Why PlayerHoods?
            </div>
            <p class="intro-text">
                PlayerHoods helps players organize matches without the chaos of scattered group chats. Respond to invitations quickly, keep your playing schedule in one place, and join the community whenever you&apos;re ready.
            </p>
            <a href="${escapeHtml(registerUrl)}" class="register-link">
                Join our community for a seamless experience →
            </a>
        </div>

        <div class="footer">
            &copy; 2026 PlayerHoods. Play made simple.
        </div>
    </div>
</body>
</html>`
}
