/**
 * HTML email templates for participant notifications.
 */

const BASE_STYLES = `
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #333; }
  .card { max-width: 480px; margin: 0 auto; padding: 1.5rem; }
  .btn { display: inline-block; padding: 0.5rem 1rem; background: #0369a1; color: white; text-decoration: none; border-radius: 6px; }
  .meta { font-size: 0.85rem; color: #666; margin-top: 1rem; }
`

export type MatchInfo = {
  matchId: string
  gameType: string
  matchDate: string | null
  startTime: string | null
  venueName: string | null
  siteUrl: string
}

const FALLBACK_SITE_URL = 'http://localhost:3000'

function matchLink(m: MatchInfo): string {
  const base = m.siteUrl && m.siteUrl !== 'undefined' ? m.siteUrl : FALLBACK_SITE_URL
  return `${base}/matches/${m.matchId}`
}

/** Game formed: 比赛成局 */
export function gameFormedEmail(m: MatchInfo): string {
  const timeStr = [m.matchDate, m.startTime].filter(Boolean).join(' ') || 'TBD'
  const location = m.venueName || 'TBD'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <h2>Game formed</h2>
    <p>Your match <strong>${m.gameType}</strong> is confirmed.</p>
    <p><strong>When:</strong> ${timeStr}<br><strong>Where:</strong> ${location}</p>
    <p><a href="${matchLink(m)}" class="btn">View match</a></p>
    <p class="meta">PlayerHoods</p>
  </div>
</body>
</html>
`
}

/** Match time change pending: 比赛改时间待确认 */
export function matchTimeChangePendingEmail(m: MatchInfo): string {
  const timeStr = [m.matchDate, m.startTime].filter(Boolean).join(' ') || 'TBD'
  const location = m.venueName || 'TBD'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <h2>Match time changed — please confirm</h2>
    <p>The schedule for <strong>${m.gameType}</strong> has been updated.</p>
    <p><strong>New time:</strong> ${timeStr}<br><strong>Where:</strong> ${location}</p>
    <p>Please confirm you can still make it.</p>
    <p><a href="${matchLink(m)}" class="btn">Confirm attendance</a></p>
    <p class="meta">PlayerHoods</p>
  </div>
</body>
</html>
`
}

/** Guest nominated: Contact Player 被提名 */
export function guestNominatedEmail(m: MatchInfo, nominatorName: string): string {
  const timeStr = [m.matchDate, m.startTime].filter(Boolean).join(' ') || 'TBD'
  const location = m.venueName || 'TBD'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <h2>You're nominated</h2>
    <p><strong>${nominatorName}</strong> nominated you for a match: <strong>${m.gameType}</strong>.</p>
    <p><strong>When:</strong> ${timeStr}<br><strong>Where:</strong> ${location}</p>
    <p><a href="${matchLink(m)}" class="btn">View match</a></p>
    <p class="meta">PlayerHoods</p>
  </div>
</body>
</html>
`
}

/** Guest org approved: 组织者已批准 */
export function guestOrgApprovedEmail(m: MatchInfo): string {
  const timeStr = [m.matchDate, m.startTime].filter(Boolean).join(' ') || 'TBD'
  const location = m.venueName || 'TBD'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <h2>Match approval</h2>
    <p>The organizer approved your participation in <strong>${m.gameType}</strong>.</p>
    <p><strong>When:</strong> ${timeStr}<br><strong>Where:</strong> ${location}</p>
    <p><a href="${matchLink(m)}" class="btn">View match</a></p>
    <p class="meta">PlayerHoods</p>
  </div>
</body>
</html>
`
}

/** Guest delegate confirmed: 已确认能来 */
export function guestDelegateConfirmedEmail(m: MatchInfo): string {
  const timeStr = [m.matchDate, m.startTime].filter(Boolean).join(' ') || 'TBD'
  const location = m.venueName || 'TBD'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <h2>You're confirmed</h2>
    <p>Your participation in <strong>${m.gameType}</strong> is confirmed.</p>
    <p><strong>When:</strong> ${timeStr}<br><strong>Where:</strong> ${location}</p>
    <p><a href="${matchLink(m)}" class="btn">View match</a></p>
    <p class="meta">PlayerHoods</p>
  </div>
</body>
</html>
`
}

/** Invite / Nominate: 被邀请或提名 */
export function inviteOrNominateEmail(m: MatchInfo, inviterName: string): string {
  const timeStr = [m.matchDate, m.startTime].filter(Boolean).join(' ') || 'TBD'
  const location = m.venueName || 'TBD'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body>
  <div class="card">
    <h2>You're invited</h2>
    <p><strong>${inviterName}</strong> invited you to a match: <strong>${m.gameType}</strong>.</p>
    <p><strong>When:</strong> ${timeStr}<br><strong>Where:</strong> ${location}</p>
    <p><a href="${matchLink(m)}" class="btn">View & respond</a></p>
    <p class="meta">PlayerHoods</p>
  </div>
</body>
</html>
`
}
