import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { getInvitationById } from '@/lib/invitations/get-invitation-by-id'
import { resolveInvitationToken } from '@/lib/invitations/invitation-token'
import { formatMatchLevelLabel } from '@/lib/match-level'
import { createSupabasePublicServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { MatchDoublesFormat } from '@/lib/types/database'
import { openInvitationStatusAction } from '@/app/invitations/[id]/invitation-actions'

type Props = {
  params: Promise<{ id: string }>
}

type GuestInvitationMatchDisplayDetails = {
  duration_minutes: number | null
  doubles_format: MatchDoublesFormat | null
  organizer_note: string | null
  level: string | null
}

function formatGameType(value: string | null | undefined): string {
  if (!value) return 'Match'
  const label = value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
  return /\bmatch\b/i.test(label) ? label : `${label} match`
}

function formatSpecificMatchType(value: string | null | undefined, doublesFormat: MatchDoublesFormat | null | undefined): string {
  if (doublesFormat === 'open') {
    const isSingles = (value ?? '').toLowerCase() === 'singles'
    return isSingles ? 'Open singles match' : 'Open doubles match'
  }

  return formatGameType(value)
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

function formatPersonName(value: string | null | undefined): string {
  const name = value?.trim()
  if (!name) return 'the host'
  return name
    .split(/\s+/)
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(' ')
}

async function getGuestInvitationMatchDisplayDetails(matchId: string): Promise<GuestInvitationMatchDisplayDetails | null> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase
      .from('matches')
      .select('duration_minutes, doubles_format, organizer_note, level')
      .eq('id', matchId)
      .maybeSingle()

    if (error) throw error

    return data as GuestInvitationMatchDisplayDetails | null
  } catch (error) {
    console.error('[guest-invitation-match] match display details load failed', {
      has_error: true,
      match_id: matchId,
      error_code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    })
    return null
  }
}

export default async function GuestInvitationMatchPage({ params }: Props) {
  const { id } = await params
  const supabase = createSupabasePublicServerClient()
  const invitationId = await resolveInvitationToken(supabase, id)
  const invitation = invitationId ? await getInvitationById(supabase, invitationId) : null

  if (!invitationId || !invitation || invitation.related_type !== 'match') {
    notFound()
  }

  const summary = invitation.match_summary
  const matchDisplayDetails = summary?.match_id
    ? await getGuestInvitationMatchDisplayDetails(summary.match_id)
    : null
  const inviterName = formatPersonName(invitation.inviter_display_name)
  const matchType = formatSpecificMatchType(summary?.game_type, matchDisplayDetails?.doubles_format)
  const matchDate = formatDate(summary?.match_date)
  const matchTime = formatTimeRange(summary?.start_time, matchDisplayDetails?.duration_minutes)
  const venueName = summary?.club_name ?? 'Venue to be confirmed'
  const venueMapHref = getVenueMapHref(summary?.club_name)
  const hostNote = matchDisplayDetails?.organizer_note?.trim() || null
  const matchLevel = formatMatchLevelLabel(matchDisplayDetails?.level)
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' · ') || 'Time to be confirmed'
  const invitationHref = `/invitations/${invitationId}`
  const createAccountHref = `/login?mode=register&next=${encodeURIComponent(`/i/${id}/match`)}`
  const openStatusAction = openInvitationStatusAction.bind(null, invitationId)
  const hasResponded = invitation.status === 'accepted' || invitation.status === 'declined'
  const isInactive =
    !hasResponded
    && (
      invitation.status === 'canceled'
      || invitation.status === 'expired'
      || summary?.participant_status === 'removed'
      || Boolean(summary?.participant_removed_at)
      || summary?.match_status === 'cancelled'
      || summary?.match_status === 'canceled'
    )

  const pageState = isInactive
    ? {
        title: 'This invitation is no longer active',
        body: 'The host canceled this invitation or updated the match details.',
        rsvp: null,
        promptTitle: null,
        promptBody: null,
        softPrompt: true,
      }
    : invitation.status === 'declined'
      ? {
          title: "You've declined this invitation.",
          body: "We'll let the host know.",
          rsvp: 'Declined',
          promptTitle: 'Manage future invites more easily',
          promptBody: 'Create a free PlayerHoods account to track match updates, save players, and respond faster next time.',
          softPrompt: true,
        }
      : invitation.status === 'accepted'
        ? {
            title: "You're in",
            body: "You've accepted this match invitation. The host will be notified that you're in.",
            rsvp: 'Accepted',
            promptTitle: 'Create your free PlayerHoods account',
            promptBody: `Manage this match, get updates, save ${inviterName} as a player contact, and join future matches faster.`,
            softPrompt: false,
          }
        : {
            title: `${inviterName} invited you to play`,
            body: 'Confirm whether you can join this match.',
            rsvp: null,
            promptTitle: 'New to PlayerHoods?',
            promptBody: 'Create a free account to keep this match, confirm future invites faster, and stay connected with players you know.',
            softPrompt: true,
          }

  return (
    <div className="guest-invitation-page">
      <style>{`
        .guest-invitation-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 32px 18px 48px;
        }

        .guest-invitation-shell {
          width: min(100%, 940px);
          margin: 0 auto;
        }

        .guest-invitation-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .guest-invitation-brand-title {
          font-size: 0.95rem;
          font-weight: 800;
          line-height: 1.1;
        }

        .guest-invitation-brand-subtitle {
          color: #5c6f91;
          font-size: 0.85rem;
          font-weight: 650;
        }

        .guest-invitation-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 22px;
          align-items: start;
        }

        .guest-invitation-card,
        .guest-invitation-value-panel {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 28px;
          box-shadow: 0 18px 44px rgba(17, 42, 84, 0.08);
        }

        .guest-invitation-card {
          padding: 30px;
        }

        .guest-invitation-kicker,
        .guest-invitation-rsvp-label {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .guest-invitation-kicker {
          margin: 0 0 14px;
        }

        .guest-invitation-title {
          font-size: clamp(2rem, 3.5vw, 2.85rem);
          line-height: 1.08;
          margin: 0;
          letter-spacing: 0;
        }

        .guest-invitation-subtext {
          color: #405474;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 14px 0 0;
          max-width: 560px;
        }

        .guest-invitation-summary {
          display: grid;
          gap: 3px;
          margin: 24px 0;
        }

        .guest-invitation-summary-type {
          color: #06183d;
          font-size: 1.06rem;
          font-weight: 900;
          line-height: 1.35;
          margin: 0 0 2px;
        }

        .guest-invitation-summary-line {
          color: #405474;
          font-size: 0.96rem;
          font-weight: 720;
          line-height: 1.35;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .guest-invitation-summary-label-inline {
          color: #16335f;
          font-weight: 900;
        }

        .guest-invitation-venue-line {
          align-items: baseline;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .guest-invitation-map-link {
          color: #1f5fe8;
          font-weight: 900;
          text-decoration: none;
        }

        .guest-invitation-map-link:hover {
          text-decoration: underline;
        }

        .guest-invitation-rsvp-card {
          align-items: center;
          background: #f8fbff;
          border: 1px solid #d9e6f4;
          border-radius: 18px;
          display: flex;
          justify-content: space-between;
          margin: -8px 0 22px;
          padding: 14px 16px;
        }

        .guest-invitation-helper-card {
          background: #f8fbff;
          border: 1px solid #d9e6f4;
          border-radius: 18px;
          color: #405474;
          font-size: 0.95rem;
          font-weight: 700;
          line-height: 1.5;
          margin: -8px 0 22px;
          padding: 14px 16px;
        }

        .guest-invitation-rsvp-value {
          color: #06183d;
          font-size: 1rem;
          font-weight: 900;
        }

        .guest-invitation-account-card {
          margin-top: 24px;
          padding: 20px;
          border: 1px solid #d9e6f4;
          border-radius: 22px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }

        .guest-invitation-account-card-soft {
          background: #fff;
        }

        .guest-invitation-account-card h2 {
          font-size: 1.25rem;
          margin: 0;
        }

        .guest-invitation-account-card p {
          color: #405474;
          font-size: 0.95rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 8px 0 16px;
        }

        .guest-invitation-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .guest-invitation-action-form {
          margin: 0;
        }

        .guest-invitation-button {
          align-items: center;
          border: 0;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          font-size: 0.92rem;
          font-weight: 850;
          justify-content: center;
          min-height: 46px;
          padding: 0 18px;
          text-decoration: none;
        }

        .guest-invitation-button-primary {
          background: #06183d;
          color: #fff;
          box-shadow: 0 12px 24px rgba(6, 24, 61, 0.16);
        }

        .guest-invitation-button-secondary {
          border: 1px solid #c8d7eb;
          color: #16335f;
          background: #fff;
        }

        .guest-invitation-value-panel {
          padding: 24px;
        }

        .guest-invitation-value-panel h2 {
          font-size: 1.25rem;
          margin: 0 0 18px;
        }

        .guest-invitation-value-list {
          display: grid;
          gap: 16px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .guest-invitation-value-item {
          display: grid;
          gap: 4px;
          padding-left: 18px;
          position: relative;
        }

        .guest-invitation-value-dot {
          background: #c7e500;
          border-radius: 999px;
          height: 8px;
          left: 0;
          position: absolute;
          top: 8px;
          width: 8px;
        }

        .guest-invitation-value-item strong {
          font-size: 0.95rem;
        }

        .guest-invitation-value-item span {
          color: #526784;
          font-size: 0.86rem;
          line-height: 1.45;
        }

        .guest-invitation-footer {
          color: #72819a;
          font-size: 0.78rem;
          font-weight: 650;
          margin-top: 18px;
        }

        .guest-invitation-footer a {
          color: #526784;
        }

        @media (max-width: 760px) {
          .guest-invitation-page {
            padding: 20px 12px 34px;
          }

          .guest-invitation-grid {
            grid-template-columns: 1fr;
          }

          .guest-invitation-card {
            padding: 22px;
            border-radius: 24px;
          }

          .guest-invitation-brand {
            justify-content: center;
            text-align: center;
          }

          .guest-invitation-brand-subtitle {
            font-size: 0.78rem;
          }

          .guest-invitation-title {
            font-size: 2rem;
            line-height: 1.12;
          }

          .guest-invitation-value-panel {
            display: none;
          }

          .guest-invitation-actions {
            display: grid;
          }

          .guest-invitation-button {
            width: 100%;
          }
        }
      `}</style>

      <div className="guest-invitation-shell">
        <div className="guest-invitation-brand">
          <BrandLogo variant="horizontal" />
          <div>
            <div className="guest-invitation-brand-title">PlayerHoods</div>
            <div className="guest-invitation-brand-subtitle">See who&apos;s in. Keep playing.</div>
          </div>
        </div>

        <div className="guest-invitation-grid">
          <section className="guest-invitation-card">
            <p className="guest-invitation-kicker">Match Invitation</p>
            <h1 className="guest-invitation-title">{pageState.title}</h1>
            <p className="guest-invitation-subtext">{pageState.body}</p>

            <section className="guest-invitation-summary" aria-label="Match summary">
              <h2 className="guest-invitation-summary-type">{matchType}</h2>
              {matchLevel ? (
                <p className="guest-invitation-summary-line">
                  <span className="guest-invitation-summary-label-inline">Level: </span>
                  {matchLevel}
                </p>
              ) : null}
              <p className="guest-invitation-summary-line">{matchDateTime}</p>
              <p className="guest-invitation-summary-line guest-invitation-venue-line">
                <span>{venueName}</span>
                {venueMapHref ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <a href={venueMapHref} target="_blank" rel="noreferrer" className="guest-invitation-map-link">
                      Map
                    </a>
                  </>
                ) : null}
              </p>
              <p className="guest-invitation-summary-line">Host: {inviterName}</p>
              {hostNote ? (
                <p className="guest-invitation-summary-line">
                  <span className="guest-invitation-summary-label-inline">Note from host: </span>
                  {hostNote}
                </p>
              ) : null}
            </section>

            {pageState.rsvp ? (
              <section className="guest-invitation-rsvp-card" aria-label="Your RSVP">
                <span className="guest-invitation-rsvp-label">Your RSVP</span>
                <span className="guest-invitation-rsvp-value">{pageState.rsvp}</span>
              </section>
            ) : null}

            {isInactive ? (
              <section className="guest-invitation-helper-card">
                No action is needed.
              </section>
            ) : null}

            {invitation.status === 'pending' && !isInactive ? (
              <div className="guest-invitation-actions">
                <Link href={invitationHref} className="guest-invitation-button guest-invitation-button-primary">
                  Respond to invitation
                </Link>
              </div>
            ) : null}

            {pageState.promptTitle && pageState.promptBody ? (
              <section className={`guest-invitation-account-card${pageState.softPrompt ? ' guest-invitation-account-card-soft' : ''}`}>
                <h2>{pageState.promptTitle}</h2>
                <p>{pageState.promptBody}</p>
                <div className="guest-invitation-actions">
                  <Link href={createAccountHref} className={`guest-invitation-button ${pageState.softPrompt ? 'guest-invitation-button-secondary' : 'guest-invitation-button-primary'}`}>
                    Create account
                  </Link>
                  {invitation.status === 'accepted' ? (
                    <form action={openStatusAction} className="guest-invitation-action-form">
                      <button type="submit" className="guest-invitation-button guest-invitation-button-secondary">
                        View status
                      </button>
                    </form>
                  ) : (
                    <Link href={invitationHref} className="guest-invitation-button guest-invitation-button-secondary">
                      Maybe later
                    </Link>
                  )}
                </div>
              </section>
            ) : null}
          </section>

          <aside className="guest-invitation-value-panel" aria-label="Why PlayerHoods">
            <h2>Why PlayerHoods?</h2>
            <ul className="guest-invitation-value-list">
              <li className="guest-invitation-value-item">
                <span className="guest-invitation-value-dot" aria-hidden="true" />
                <strong>No group chat chaos</strong>
                <span>Confirm who&apos;s in without endless messages.</span>
              </li>
              <li className="guest-invitation-value-item">
                <span className="guest-invitation-value-dot" aria-hidden="true" />
                <strong>Private by default</strong>
                <span>
                  Your phone and email stay private on PlayerHoods. Invitations are limited to match-connected players.
                </span>
              </li>
              <li className="guest-invitation-value-item">
                <span className="guest-invitation-value-dot" aria-hidden="true" />
                <strong>Only useful updates</strong>
                <span>We notify you only when it matters.</span>
              </li>
            </ul>
          </aside>
        </div>

        <p className="guest-invitation-footer">
          Private match coordination. No group chat chaos. <Link href="/">PlayerHoods</Link>
        </p>
      </div>
    </div>
  )
}
