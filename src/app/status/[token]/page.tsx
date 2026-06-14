import Link from 'next/link'
import { BrandLogo } from '@/app/components/BrandLogo'
import { getPublicParticipantStatus } from '@/lib/public-participant-status'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { Json, MatchDoublesFormat } from '@/lib/types/database'
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

type StatusMatchDisplayDetails = {
  duration_minutes: number | null
  doubles_format: MatchDoublesFormat | null
  organizer_note: string | null
  level: string | null
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

function formatSpecificMatchType(
  gameType: string | null | undefined,
  sportName: string | null | undefined,
  doublesFormat: MatchDoublesFormat | null | undefined,
): string {
  if (doublesFormat === 'open') {
    const isSingles = (gameType ?? '').toLowerCase() === 'singles'
    return isSingles ? 'Open singles match' : 'Open doubles match'
  }

  return formatGameType(gameType, sportName)
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

function parseTimeParts(value: string | null | undefined): { hours: number; minutes: number } | null {
  if (!value) return null
  const parts = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!parts) return null

  return {
    hours: Number(parts[1]),
    minutes: Number(parts[2]),
  }
}

function formatTimeRange(startTime: string | null | undefined, durationMinutes: number | null | undefined): string | null {
  const startLabel = formatTime(startTime)
  if (!startLabel) return null

  const startParts = parseTimeParts(startTime)
  if (!startParts || !durationMinutes || durationMinutes <= 0) {
    return startLabel
  }

  const end = new Date(Date.UTC(2026, 0, 1, startParts.hours, startParts.minutes + durationMinutes))
  const endLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(end)

  return `${startLabel} – ${endLabel}`
}

function getVenueMapHref(venueName: string | null | undefined): string | null {
  const venue = venueName?.trim()
  if (!venue) return null

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`
}

function getFirstName(value: string | null | undefined): string | null {
  const name = value?.trim()
  if (!name) return null

  return name.split(/\s+/)[0] || null
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
      return null
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
      title: 'Thanks \u2014 we have your response',
      body: "We'll notify you if a spot opens.",
      tone: 'waiting',
    }
  }

  return {
    label: 'Waiting for host',
    title: 'Thanks \u2014 we have your response',
    body: "We'll notify you when the host sets the confirmed lineup.",
    tone: 'waiting',
  }
}

async function getStatusMatchDisplayDetails(matchId: string): Promise<StatusMatchDisplayDetails | null> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase
      .from('matches')
      .select('duration_minutes, doubles_format, organizer_note, level')
      .eq('id', matchId)
      .maybeSingle()

    if (error) throw error

    return data as StatusMatchDisplayDetails | null
  } catch (error) {
    console.error('[public-status] match display details load failed', {
      has_error: true,
      match_id: matchId,
      error_code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    })
    return null
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

  const matchDisplayDetails = await getStatusMatchDisplayDetails(status.match_id)
  const confirmedPlayers = parseConfirmedPlayers(status.confirmed_players)
  const participantCopy = getParticipantStatusCopy(status)
  const matchType = formatSpecificMatchType(status.game_type, status.sport_name, matchDisplayDetails?.doubles_format)
  const matchDate = formatDate(status.match_date)
  const matchTime = formatTimeRange(status.start_time, matchDisplayDetails?.duration_minutes)
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' · ') || 'Time to be confirmed'
  const venueName = status.venue_name ?? 'Venue to be confirmed'
  const venueMapHref = getVenueMapHref(status.venue_name)
  const hostNote = matchDisplayDetails?.organizer_note?.trim() || null
  const matchLevel = matchDisplayDetails?.level?.trim() || null
  const participantFirstName = getFirstName(status.participant_display_name)
  const lineupHeading = status.is_formed ? 'Confirmed Lineup' : 'Confirmed So Far'
  const statusPath = `/status/${encodeURIComponent(token)}`
  const createAccountHref = `/login?mode=register&next=${encodeURIComponent(statusPath)}`
  const outAction = markStatusTokenOutAction.bind(null, token)

  return (
    <div className="status-page">
      <style>{statusPageStyles}</style>
      <main className="status-shell">
        <div className="status-brand">
          <BrandLogo variant="horizontal" imageClassName="status-brand-logo" />
          <div className="status-brand-copy">
            <div className="status-brand-subtitle">Private match status</div>
          </div>
        </div>

        <div className="status-layout">
          <div className="status-left-stack">
            <section className="status-card status-main-card">
              <p className="status-greeting">Hi {participantFirstName ?? 'there'},</p>

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

              <div className={`status-state status-state-${participantCopy.tone}`}>
                {participantCopy.label}
              </div>

              <h1 className="status-title">{participantCopy.title}</h1>
              <p className="status-subtext">{participantCopy.body}</p>

              {status.is_formed ? (
                <p className="status-formed-inline">
                  This match is already formed. Please keep this time reserved and allow enough time to arrive.
                </p>
              ) : null}

              <section className="status-summary" aria-label="Match summary">
                <h2>{matchType}</h2>
                {matchLevel ? (
                  <p>
                    <span className="status-summary-label-inline">Level: </span>
                    {matchLevel}
                  </p>
                ) : null}
                <p>{matchDateTime}</p>
                <p className="status-venue-line">
                  <span>{venueName}</span>
                  {venueMapHref ? (
                    <>
                      <span aria-hidden="true"> · </span>
                      <a href={venueMapHref} target="_blank" rel="noreferrer" className="status-map-link">
                        Map
                      </a>
                    </>
                  ) : null}
                </p>
                <p>Host: {status.host_display_name}</p>
                {hostNote ? (
                  <p>
                    <span className="status-summary-label-inline">Note from host: </span>
                    {hostNote}
                  </p>
                ) : null}
              </section>

              {status.player_visible_note ? (
                <section className="status-host-note" aria-label="Host note">
                  <div className="status-host-note-label">Status note</div>
                  <p>{status.player_visible_note}</p>
                </section>
              ) : null}
            </section>

            <section className="status-card status-lineup-card" aria-label={lineupHeading}>
              <div className="status-lineup-header">
                <div>
                  <p className="status-kicker">{lineupHeading}</p>
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
                  No players are confirmed yet.
                </p>
              )}
              <p className="status-lineup-note">Only confirmed players are shown.</p>
            </section>

            {status.can_out ? (
              <section className="status-card status-out-card">
                {status.is_formed ? (
                  <>
                    <h2>Can&apos;t make it?</h2>
                    <p>
                      This match is already formed. Please keep this time reserved and allow enough time to arrive.
                    </p>
                    <p>
                      If you can no longer make it, mark yourself out as soon as possible so the host can adjust the lineup.
                    </p>
                    <details className="status-out-confirm">
                      <summary>Mark me as unable to play</summary>
                      <div className="status-out-confirm-panel">
                        <h3>Mark yourself as unable to play?</h3>
                        <p>
                          This match is already formed. Only continue if you can no longer make it.
                        </p>
                        <div className="status-out-confirm-actions">
                          <Link href={`/status/${encodeURIComponent(token)}`} className="status-button status-button-muted">
                            Keep my spot
                          </Link>
                          <form action={outAction}>
                            <button type="submit" className="status-button status-button-outline">
                              Mark me as unable to play
                            </button>
                          </form>
                        </div>
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    <h2>Need to change your response?</h2>
                    <p>
                      This only updates your own match status.
                    </p>
                    <details className="status-out-confirm">
                      <summary>I can&apos;t make it</summary>
                      <form action={outAction}>
                        <button type="submit" className="status-button status-button-outline">
                          Confirm I can&apos;t make it
                        </button>
                      </form>
                    </details>
                  </>
                )}
              </section>
            ) : null}
          </div>

          <aside className="status-account-rail">
            <section className="status-card status-account-card" aria-label="Create a free account">
              <p className="status-kicker">New to PlayerHoods?</p>
              <h2>Create a free account</h2>
              <ul className="status-account-list">
                <li><span aria-hidden="true">&#10003;</span> Join matches faster and host with less work</li>
                <li><span aria-hidden="true">&#10003;</span> Track updates, change responses, and manage your match status in one place</li>
                <li><span aria-hidden="true">&#10003;</span> Communicate more easily in match chat and group chat</li>
                <li><span aria-hidden="true">&#10003;</span> Save trusted players to your Hood and stay connected through groups</li>
              </ul>
              <div className="status-account-actions">
                <Link href={createAccountHref} className="status-button status-button-primary">
                  Create Free Account
                </Link>
              </div>
            </section>
          </aside>

          <section className="status-card status-privacy-card">
            <h2>Private status link</h2>
            <p>
              This page shows only your own status and confirmed players.
            </p>
            <p>Your phone, email, and internal notes stay private.</p>
            <p>Invitations are limited to match-connected players.</p>
          </section>
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
    padding: 22px 16px 40px;
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
    gap: 10px;
    margin-bottom: 14px;
  }

  .status-brand-logo {
    height: 34px !important;
    width: 154px !important;
  }

  .status-brand-copy {
    border-left: 1px solid #cfdced;
    padding-left: 10px;
  }

  .status-brand-title {
    font-size: 1rem;
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
    gap: 14px;
    grid-template-columns: 1fr;
  }

  .status-card {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #d5e2f2;
    border-radius: 20px;
    box-shadow: 0 14px 30px rgba(17, 42, 84, 0.07);
  }

  .status-main-card {
    padding: 24px;
  }

  .status-left-stack,
  .status-account-rail {
    display: grid;
    gap: 14px;
  }

  .status-lineup-header {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
  }

  .status-greeting {
    color: #16335f;
    font-size: 1.05rem;
    font-weight: 780;
    line-height: 1.35;
    margin: 0 0 16px;
  }

  .status-kicker {
    color: #7c8eaa;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    margin: 0;
    text-transform: uppercase;
  }

  .status-state {
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.82rem;
    font-weight: 900;
    line-height: 1;
    margin-top: 2px;
    min-height: 30px;
    padding: 0 12px;
    align-items: center;
  }

  .status-state-confirmed {
    background: #e8f9d7;
    color: #225400;
  }

  .status-state-waiting {
    background: #fff7d6;
    color: #6a4b00;
  }

  .status-state-stopped {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-title {
    font-size: clamp(1.75rem, 3vw, 2.35rem);
    letter-spacing: 0;
    line-height: 1.1;
    margin: 16px 0 0;
  }

  .status-subtext {
    color: #405474;
    font-size: 1rem;
    font-weight: 650;
    line-height: 1.5;
    margin: 8px 0 0;
    max-width: 620px;
  }

  .status-formed-inline {
    color: #526784;
    font-size: 0.92rem;
    font-weight: 720;
    line-height: 1.45;
    margin: 8px 0 0;
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
    gap: 3px;
    margin: 20px 0 0;
  }

  .status-summary h2 {
    color: #06183d;
    font-size: 1.06rem;
    font-weight: 900;
    line-height: 1.35;
    margin: 0 0 2px;
  }

  .status-summary p {
    color: #405474;
    font-size: 0.96rem;
    font-weight: 720;
    line-height: 1.35;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .status-summary-label-inline {
    color: #16335f;
    font-weight: 900;
  }

  .status-venue-line {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .status-map-link {
    color: #1f5fe8;
    font-weight: 900;
    text-decoration: none;
  }

  .status-map-link:hover {
    text-decoration: underline;
  }

  .status-host-note,
  .status-out-card {
    border: 1px solid #d9e6f4;
    border-radius: 16px;
    margin-top: 14px;
    padding: 16px;
  }

  .status-out-card {
    margin-top: 0;
  }

  .status-host-note-label,
  .status-out-card h2,
  .status-lineup-card h2,
  .status-privacy-card h2 {
    color: #06183d;
    font-size: 1.05rem;
    font-weight: 900;
    margin: 0;
  }

  .status-host-note p,
  .status-out-card p,
  .status-privacy-card p,
  .status-empty-lineup,
  .status-lineup-note {
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
    box-sizing: border-box;
  }

  .status-out-confirm > form {
    margin-top: 10px;
  }

  .status-out-confirm-panel {
    background: #f8fbff;
    border: 1px solid #d9e6f4;
    border-radius: 16px;
    margin-top: 12px;
    padding: 14px;
  }

  .status-out-confirm-panel h3 {
    color: #06183d;
    font-size: 1rem;
    font-weight: 900;
    margin: 0;
  }

  .status-out-confirm-panel p {
    margin-top: 6px;
  }

  .status-out-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
  }

  .status-out-confirm-actions form {
    margin: 0;
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
    box-sizing: border-box;
  }

  .status-button-secondary {
    background: #06183d;
    color: #fff;
  }

  .status-button-primary {
    background: #1f5fe8;
    color: #fff;
    box-shadow: 0 12px 22px rgba(31, 95, 232, 0.18);
  }

  .status-button-outline {
    background: #fff;
    border: 1px solid #d4dfed;
    color: #16335f;
  }

  .status-button-muted {
    background: #eef4fb;
    color: #405474;
  }

  .status-lineup-card,
  .status-account-card,
  .status-out-card,
  .status-privacy-card {
    padding: 18px;
  }

  .status-account-card h2 {
    color: #06183d;
    font-size: 1.1rem;
    font-weight: 900;
    margin: 8px 0 0;
  }

  .status-account-list {
    color: #16335f;
    display: grid;
    font-size: 0.86rem;
    font-weight: 720;
    gap: 7px;
    line-height: 1.35;
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }

  .status-account-list li {
    display: grid;
    gap: 7px;
    grid-template-columns: 14px minmax(0, 1fr);
  }

  .status-account-list span {
    color: #16335f;
    font-weight: 900;
  }

  .status-account-actions {
    display: grid;
    gap: 10px;
    justify-items: start;
    margin-top: 14px;
  }

  .status-player-list {
    display: grid;
    gap: 10px;
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
  }

  .status-lineup-note {
    margin-top: 14px;
  }

  .status-privacy-card {
    box-shadow: none;
  }

  .status-privacy-card h2 {
    font-size: 0.98rem;
  }

  .status-privacy-card p + p {
    margin-top: 4px;
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
      padding: 16px 12px 32px;
    }

    .status-brand {
      justify-content: flex-start;
      text-align: left;
    }

    .status-layout {
      grid-template-columns: 1fr;
    }

    .status-card {
      border-radius: 20px;
    }

    .status-main-card {
      padding: 20px;
    }

    .status-title {
      font-size: 1.75rem;
      line-height: 1.12;
    }

    .status-out-confirm summary,
    .status-out-confirm-actions,
    .status-out-confirm-actions form,
    .status-button {
      width: 100%;
    }
  }

  @media (min-width: 900px) {
    .status-layout {
      grid-template-columns: minmax(0, 1fr) 320px;
    }

    .status-left-stack,
    .status-privacy-card {
      grid-column: 1;
    }

    .status-account-rail {
      grid-column: 2;
      grid-row: 1;
    }
  }
`
