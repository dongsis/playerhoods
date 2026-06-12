import Link from 'next/link'
import { BrandLogo } from '@/app/components/BrandLogo'
import { getPublicParticipantStatus } from '@/lib/public-participant-status'
import type { Json } from '@/lib/types/database'
import { markStatusTokenOutAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    error?: string
    notice?: string
  }>
}

type SafeConfirmedPlayer = {
  display_name: string
  avatar_url: string | null
  is_self: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseConfirmedPlayers(value: Json): SafeConfirmedPlayer[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((player) => {
    if (!isRecord(player)) return []

    const displayName = typeof player.display_name === 'string' ? player.display_name.trim() : ''
    const avatarUrl = typeof player.avatar_url === 'string' && player.avatar_url.trim()
      ? player.avatar_url.trim()
      : null
    const isSelf = player.is_self === true || player.is_you === true

    return [{
      display_name: displayName || 'Player',
      avatar_url: avatarUrl,
      is_self: isSelf,
    }]
  })
}

function formatGameType(gameType: string | null | undefined, sportName: string | null | undefined): string {
  const value = gameType || sportName
  if (!value) return 'Match'

  const label = value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())

  return /\bmatch\b/i.test(label) ? label : `${label} match`
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return value

  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatTime(value: string | null | undefined): string | null {
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

function formatFormedAt(value: string | null | undefined): string | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'P'
}

function getPageNotice(code: string | undefined): string | null {
  switch (code) {
    case 'request-sent':
      return 'The host has your response.'
    case 'accepted':
      return "You're in."
    case 'out':
      return "You're marked out for this match."
    default:
      return null
  }
}

function getPageError(code: string | undefined): string | null {
  switch (code) {
    case 'match-not-active':
      return 'This match is no longer taking updates.'
    case 'cannot-out-organizer':
      return 'The host cannot use this link to leave the match.'
    case 'out-failed':
      return 'Could not update your status. Please try again.'
    default:
      return null
  }
}

function getParticipantStatusCopy(status: {
  participant_status: string
  participant_removed_at: string | null
  participant_accepted_at: string | null
  participant_org_approved_at: string | null
  participant_confirmation_source: string | null
  player_visible_note: string | null
}) {
  const isRemoved = Boolean(status.participant_removed_at) || status.participant_status === 'removed'
  const isHostConfirmed =
    status.participant_confirmation_source === 'host_managed_offline'
    || status.participant_confirmation_source === 'contact_owner_managed'
  const isConfirmed =
    status.participant_status === 'confirmed'
    || (Boolean(status.participant_accepted_at) && Boolean(status.participant_org_approved_at) && !isRemoved)

  if (isRemoved && status.player_visible_note) {
    return {
      label: 'Not This Time',
      title: 'Not This Time',
      body: "The host couldn't add you to the Confirmed Lineup for this match.",
      tone: 'stopped',
    }
  }

  if (isRemoved) {
    return {
      label: 'Out',
      title: "You're marked out",
      body: 'You are no longer listed as available for this match.',
      tone: 'stopped',
    }
  }

  if (isConfirmed) {
    return {
      label: isHostConfirmed ? 'Host-confirmed' : 'Confirmed Lineup',
      title: "You're in the Confirmed Lineup",
      body: isHostConfirmed
        ? 'The host confirmed your spot for this match.'
        : 'Your spot is confirmed for this match.',
      tone: 'confirmed',
    }
  }

  if (status.participant_status === 'waiting_list') {
    return {
      label: 'Waiting list',
      title: "You're waiting for a spot",
      body: "The host has your response. We'll update you if a spot opens.",
      tone: 'waiting',
    }
  }

  return {
    label: 'Waiting for host',
    title: 'The host has your response',
    body: "We'll update you when the host sets the Confirmed Lineup.",
    tone: 'waiting',
  }
}

export default async function PublicParticipantStatusPage({ params, searchParams }: Props) {
  const { token } = await params
  const pageParams = await searchParams
  const status = await getPublicParticipantStatus(token).catch((error) => {
    console.error('[public-status] status load failed', {
      has_error: true,
      error_code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    })
    return null
  })

  const pageNotice = getPageNotice(pageParams.notice)
  const pageError = getPageError(pageParams.error)

  if (!status) {
    return (
      <div className="status-page">
        <style>{statusPageStyles}</style>
        <main className="status-shell status-shell-narrow">
          <div className="status-brand">
            <BrandLogo variant="horizontal" />
          </div>
          <section className="status-card">
            <p className="status-kicker">Match status</p>
            <h1 className="status-title">This status link is no longer available</h1>
            <p className="status-subtext">
              Use the secure link you were sent for this match. Ordinary share links do not show personal match status.
            </p>
            <div className="status-actions">
              <Link href="/" className="status-button status-button-secondary">
                PlayerHoods
              </Link>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const confirmedPlayers = parseConfirmedPlayers(status.confirmed_players)
  const participantCopy = getParticipantStatusCopy(status)
  const matchType = formatGameType(status.game_type, status.sport_name)
  const matchDate = formatDate(status.match_date)
  const matchTime = formatTime(status.start_time)
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' at ') || 'Time to be confirmed'
  const venueName = status.venue_name ?? 'Venue to be confirmed'
  const formedAt = formatFormedAt(status.formed_at)
  const outAction = markStatusTokenOutAction.bind(null, token)

  return (
    <div className="status-page">
      <style>{statusPageStyles}</style>
      <main className="status-shell">
        <div className="status-brand">
          <BrandLogo variant="horizontal" />
          <div>
            <div className="status-brand-title">PlayerHoods</div>
            <div className="status-brand-subtitle">Your private match status</div>
          </div>
        </div>

        <div className="status-layout">
          <section className="status-card status-main-card">
            <div className="status-topline">
              <p className="status-kicker">Match status</p>
              <span className={`status-pill status-pill-${participantCopy.tone}`}>
                {participantCopy.label}
              </span>
            </div>

            {pageError ? (
              <div className="status-alert status-alert-error">
                {pageError}
              </div>
            ) : null}

            {pageNotice ? (
              <div className="status-alert status-alert-notice">
                {pageNotice}
              </div>
            ) : null}

            <h1 className="status-title">{participantCopy.title}</h1>
            <p className="status-subtext">{participantCopy.body}</p>

            <section className="status-summary" aria-label="Match details">
              <div>
                <div className="status-summary-label">Game type</div>
                <div className="status-summary-value">{matchType}</div>
              </div>
              <div>
                <div className="status-summary-label">When</div>
                <div className="status-summary-value">{matchDateTime}</div>
              </div>
              <div>
                <div className="status-summary-label">Where</div>
                <div className="status-summary-value">{venueName}</div>
              </div>
              <div>
                <div className="status-summary-label">Host</div>
                <div className="status-summary-value">{status.host_display_name}</div>
              </div>
            </section>

            <section className={`status-formed-card${status.is_formed ? ' status-formed-card-ready' : ''}`}>
              <div className="status-formed-marker" aria-hidden="true" />
              <div>
                <h2>{status.is_formed ? 'Game formed' : 'Match is forming'}</h2>
                <p>
                  {status.is_formed
                    ? `The host formed this match${formedAt ? ` on ${formedAt}` : ''}.`
                    : "The host is still setting the lineup. We'll update this page when the match is formed."}
                </p>
              </div>
            </section>

            {status.player_visible_note ? (
              <section className="status-host-note" aria-label="Host note">
                <div className="status-host-note-label">Host note</div>
                <p>{status.player_visible_note}</p>
              </section>
            ) : null}

            {status.can_out ? (
              <section className="status-out-card">
                <h2>Plans changed?</h2>
                <p>
                  Mark yourself out if you can't make it. This only updates your own match status.
                </p>
                <details className="status-out-confirm">
                  <summary>I can't make it</summary>
                  <form action={outAction}>
                    <button type="submit" className="status-button status-button-danger">
                      Confirm I can't make it
                    </button>
                  </form>
                </details>
              </section>
            ) : null}
          </section>

          <aside className="status-side">
            <section className="status-card status-lineup-card" aria-label="Confirmed Lineup">
              <div className="status-lineup-header">
                <div>
                  <p className="status-kicker">Confirmed Lineup</p>
                  <h2>{confirmedPlayers.length} player{confirmedPlayers.length === 1 ? '' : 's'}</h2>
                </div>
              </div>

              {confirmedPlayers.length > 0 ? (
                <ul className="status-player-list">
                  {confirmedPlayers.map((player, index) => (
                    <li key={`${player.display_name}:${index}`} className="status-player-row">
                      <span className="status-avatar" aria-hidden="true">
                        {player.avatar_url ? (
                          <img src={player.avatar_url} alt="" />
                        ) : (
                          getInitials(player.display_name)
                        )}
                      </span>
                      <span className="status-player-name">
                        {player.display_name}
                        {player.is_self ? <span className="status-you-tag">You</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="status-empty-lineup">
                  The Confirmed Lineup has not been set yet.
                </p>
              )}
            </section>

            <section className="status-card status-privacy-card">
              <h2>Private status link</h2>
              <p>
                This page only shows your own status and a safe Confirmed Lineup.
              </p>
              <ul className="status-privacy-list">
                <li>Your phone and email stay private on PlayerHoods.</li>
                <li>PlayerHoods limits invitations to match-connected players.</li>
                <li>Internal notes stay private.</li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}

const statusPageStyles = `
  .status-page {
    min-height: 100vh;
    background: #edf5ff;
    color: #06183d;
    padding: 28px 18px 48px;
  }

  .status-shell {
    width: min(100%, 1040px);
    margin: 0 auto;
  }

  .status-shell-narrow {
    width: min(100%, 680px);
  }

  .status-brand {
    align-items: center;
    display: flex;
    gap: 14px;
    margin-bottom: 22px;
  }

  .status-brand-title {
    font-size: 0.95rem;
    font-weight: 850;
    line-height: 1.1;
  }

  .status-brand-subtitle {
    color: #5c6f91;
    font-size: 0.84rem;
    font-weight: 700;
  }

  .status-layout {
    align-items: start;
    display: grid;
    gap: 18px;
    grid-template-columns: minmax(0, 1fr) 330px;
  }

  .status-card {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #d5e2f2;
    border-radius: 24px;
    box-shadow: 0 18px 44px rgba(17, 42, 84, 0.08);
  }

  .status-main-card {
    padding: 28px;
  }

  .status-side {
    display: grid;
    gap: 14px;
  }

  .status-topline,
  .status-lineup-header {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
  }

  .status-kicker {
    color: #7c8eaa;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    margin: 0;
    text-transform: uppercase;
  }

  .status-pill {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 900;
    min-height: 30px;
    padding: 0 12px;
    white-space: nowrap;
  }

  .status-pill-confirmed {
    background: #e8f9d7;
    color: #225400;
  }

  .status-pill-waiting {
    background: #fff7d6;
    color: #6a4b00;
  }

  .status-pill-stopped {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-title {
    font-size: clamp(2rem, 4vw, 3.1rem);
    letter-spacing: 0;
    line-height: 1.06;
    margin: 18px 0 0;
  }

  .status-subtext {
    color: #405474;
    font-size: 1rem;
    font-weight: 650;
    line-height: 1.55;
    margin: 14px 0 0;
    max-width: 620px;
  }

  .status-alert {
    border-radius: 16px;
    font-size: 0.92rem;
    font-weight: 800;
    line-height: 1.45;
    margin-top: 16px;
    padding: 12px 14px;
  }

  .status-alert-error {
    background: #fff5f5;
    border: 1px solid #fecaca;
    color: #b42318;
  }

  .status-alert-notice {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #047857;
  }

  .status-summary {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 24px 0;
    padding: 18px;
    border: 1px solid #d9e6f4;
    border-radius: 18px;
    background: #f8fbff;
  }

  .status-summary-label {
    color: #7c8eaa;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    margin-bottom: 5px;
    text-transform: uppercase;
  }

  .status-summary-value {
    color: #0b1f4d;
    font-size: 0.96rem;
    font-weight: 850;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .status-formed-card,
  .status-host-note,
  .status-out-card {
    border: 1px solid #d9e6f4;
    border-radius: 18px;
    margin-top: 14px;
    padding: 16px;
  }

  .status-formed-card {
    align-items: start;
    background: #f8fbff;
    display: flex;
    gap: 12px;
  }

  .status-formed-card-ready {
    background: #f3ffe9;
    border-color: #c7eb9d;
  }

  .status-formed-marker {
    background: #7c8eaa;
    border-radius: 999px;
    flex: 0 0 auto;
    height: 12px;
    margin-top: 6px;
    width: 12px;
  }

  .status-formed-card-ready .status-formed-marker {
    background: #67a400;
  }

  .status-formed-card h2,
  .status-host-note-label,
  .status-out-card h2,
  .status-lineup-card h2,
  .status-privacy-card h2 {
    color: #06183d;
    font-size: 1.05rem;
    font-weight: 900;
    margin: 0;
  }

  .status-formed-card p,
  .status-host-note p,
  .status-out-card p,
  .status-privacy-card p,
  .status-empty-lineup {
    color: #526784;
    font-size: 0.92rem;
    font-weight: 680;
    line-height: 1.5;
    margin: 6px 0 0;
  }

  .status-host-note {
    background: #fffaf0;
    border-color: #f5d08a;
  }

  .status-host-note-label {
    font-size: 0.9rem;
  }

  .status-out-card {
    background: #fff;
  }

  .status-out-confirm {
    margin-top: 12px;
  }

  .status-out-confirm summary {
    align-items: center;
    background: #fff;
    border: 1px solid #d4dfed;
    border-radius: 14px;
    color: #16335f;
    cursor: pointer;
    display: inline-flex;
    font-size: 0.92rem;
    font-weight: 900;
    min-height: 42px;
    padding: 0 14px;
  }

  .status-out-confirm form {
    margin-top: 10px;
  }

  .status-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 22px;
  }

  .status-button {
    align-items: center;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    font-size: 0.92rem;
    font-weight: 900;
    justify-content: center;
    min-height: 44px;
    padding: 0 18px;
    text-decoration: none;
  }

  .status-button-secondary {
    background: #06183d;
    color: #fff;
  }

  .status-button-danger {
    background: #b42318;
    color: #fff;
  }

  .status-lineup-card,
  .status-privacy-card {
    padding: 20px;
  }

  .status-player-list {
    display: grid;
    gap: 10px;
    list-style: none;
    margin: 18px 0 0;
    padding: 0;
  }

  .status-privacy-list {
    color: #526784;
    display: grid;
    font-size: 0.88rem;
    font-weight: 680;
    gap: 7px;
    line-height: 1.45;
    margin: 12px 0 0;
    padding-left: 18px;
  }

  .status-player-row {
    align-items: center;
    display: flex;
    gap: 10px;
    min-width: 0;
  }

  .status-avatar {
    align-items: center;
    background: #e8f1ff;
    border-radius: 999px;
    color: #16335f;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 0.78rem;
    font-weight: 950;
    height: 36px;
    justify-content: center;
    overflow: hidden;
    width: 36px;
  }

  .status-avatar img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .status-player-name {
    align-items: center;
    color: #16335f;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.94rem;
    font-weight: 850;
    gap: 7px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .status-you-tag {
    background: #e8f9d7;
    border-radius: 999px;
    color: #225400;
    font-size: 0.68rem;
    font-weight: 950;
    padding: 3px 7px;
    text-transform: uppercase;
  }

  @media (max-width: 820px) {
    .status-page {
      padding: 20px 12px 34px;
    }

    .status-brand {
      justify-content: center;
      text-align: center;
    }

    .status-layout {
      grid-template-columns: 1fr;
    }

    .status-card {
      border-radius: 22px;
    }

    .status-main-card {
      padding: 22px;
    }

    .status-topline {
      align-items: flex-start;
      flex-direction: column;
    }

    .status-title {
      font-size: 2rem;
      line-height: 1.12;
    }

    .status-summary {
      grid-template-columns: 1fr;
    }

    .status-out-confirm summary,
    .status-button {
      width: 100%;
    }
  }
`
