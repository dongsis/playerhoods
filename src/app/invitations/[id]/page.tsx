import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { IdentityLinkReviewCard } from '@/app/components/IdentityLinkReviewCard'
import { getIdentityLinkCandidates } from '@/lib/api/identity-links'
import { formatMatchLevelLabel } from '@/lib/match-level'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/supabase/server'
import type { MatchDoublesFormat } from '@/lib/types/database'
import { getInvitationById } from '@/lib/invitations/get-invitation-by-id'
import { InvitationShareLinkSection } from './InvitationShareLinkSection'
import { acceptInvitationAsGuestAction, declineInvitationAsGuestAction } from './guest-invitation-actions'
import {
  acceptInvitationAuthenticatedAction,
  acceptInvitationIdentityLinkAndContinueAction,
  declineInvitationAuthenticatedAction,
  keepSeparateInvitationIdentityLinkAction,
  openInvitationStatusAction,
} from './invitation-actions'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    notice?: string
  }>
}

type InvitationMatchDisplayDetails = {
  duration_minutes: number | null
  doubles_format: MatchDoublesFormat | null
  organizer_note: string | null
  level: string | null
}

function getInvitationPageErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'not-authenticated':
      return 'Please open the magic link again, or sign in with the invited account.'
    case 'email-mismatch':
      return 'This invitation is tied to a different email address.'
    case 'expired':
      return 'This invitation has expired.'
    case 'match-not-active':
      return 'This match is no longer active.'
    case 'participant-ambiguous':
      return 'This invitation matches more than one participant record. Ask the organizer to resend it.'
    case 'participant-not-found':
      return 'This invitation is no longer connected to an active participant.'
    case 'not-found':
      return 'This invitation could not be found.'
    case 'unsupported':
      return 'This invitation type is not supported here.'
    case 'status-unavailable':
      return 'Could not open your private match status. Please try again.'
    case 'failed':
      return 'Could not update this invitation. Please try again.'
    default:
      return null
  }
}

function getInvitationPageNotice(code: string | undefined): string | null {
  switch (code) {
    case 'accepted':
      return "You're in."
    case 'declined':
      return 'Invitation declined.'
    default:
      return null
  }
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
  if (!name) return 'Someone'
  return name
    .split(/\s+/)
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(' ')
}

function formatMatchKindForSentence(value: string | null | undefined): string {
  const normalized = value?.replace(/_/g, ' ').trim().toLowerCase()
  return normalized || 'a match'
}

function getInactiveInvitationCopy(invitationStatus: string, matchStatus: string | null | undefined, isParticipantRemoved: boolean) {
  if (invitationStatus === 'canceled' || isParticipantRemoved) {
    return {
      title: 'This invitation is no longer active',
      body: 'The host canceled this invitation or updated the match details.',
    }
  }

  if (matchStatus === 'cancelled' || matchStatus === 'canceled') {
    return {
      title: 'This invitation is no longer active',
      body: 'The host canceled this invitation or updated the match details.',
    }
  }

  return {
    title: 'This invitation is no longer active',
    body: 'The host canceled this invitation or updated the match details.',
  }
}

async function getInvitationMatchDisplayDetails(matchId: string): Promise<InvitationMatchDisplayDetails | null> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase
      .from('matches')
      .select('duration_minutes, doubles_format, organizer_note, level')
      .eq('id', matchId)
      .maybeSingle()

    if (error) throw error

    return data as InvitationMatchDisplayDetails | null
  } catch (error) {
    console.error('[invitation-page] match display details load failed', {
      has_error: true,
      match_id: matchId,
      error_code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    })
    return null
  }
}

export default async function InvitationPage({ params, searchParams }: Props) {
  const { id } = await params
  const pageParams = await searchParams
  const supabase = await createSupabaseServerClient()
  const user = await getUser()

  const inv = await getInvitationById(supabase, id)
  if (!inv) notFound()

  const isExpired = inv.expires_at ? new Date(inv.expires_at) < new Date() : false
  const acceptAction = acceptInvitationAsGuestAction.bind(null, id)
  const declineAction = declineInvitationAsGuestAction.bind(null, id)
  const acceptAuthenticatedAction = acceptInvitationAuthenticatedAction.bind(null, id, inv.related_id, inv.related_type)
  const declineAuthenticatedAction = declineInvitationAuthenticatedAction.bind(null, id, inv.related_id, inv.related_type)
  const openStatusAction = openInvitationStatusAction.bind(null, id)

  const normalizedTargetEmail = inv.target_email?.trim().toLowerCase() ?? null
  const identityLinkCandidates = user ? await getIdentityLinkCandidates(supabase).catch(() => []) : []
  const relevantIdentityLinkCandidates = normalizedTargetEmail
    ? identityLinkCandidates.filter((candidate) => {
        const matchedEmail = candidate.matched_email_normalized?.trim().toLowerCase() ?? null
        const guestEmail = candidate.guest_email?.trim().toLowerCase() ?? null
        return matchedEmail === normalizedTargetEmail || guestEmail === normalizedTargetEmail
      })
    : []
  if (inv.related_type === 'match_proxy_binding') {
    return (
      <div style={{ maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <BrandLogo variant="horizontal" />
        </div>
        <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
            This request is not available here right now.
          </p>
        </div>

        <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#888' }}>
          <Link href="/">PlayerHoods</Link>
        </p>
      </div>
    )
  }

  const matchDisplayDetails = inv.match_summary?.match_id
    ? await getInvitationMatchDisplayDetails(inv.match_summary.match_id)
    : null
  const inviterName = formatPersonName(inv.inviter_display_name)
  const matchType = formatSpecificMatchType(inv.match_summary?.game_type, matchDisplayDetails?.doubles_format)
  const matchKind = formatMatchKindForSentence(inv.match_summary?.game_type)
  const matchDate = formatDate(inv.match_summary?.match_date)
  const matchTime = formatTimeRange(inv.match_summary?.start_time, matchDisplayDetails?.duration_minutes)
  const venueName = inv.match_summary?.club_name ?? null
  const venueMapHref = getVenueMapHref(venueName)
  const hostNote = matchDisplayDetails?.organizer_note?.trim() || null
  const matchLevel = formatMatchLevelLabel(matchDisplayDetails?.level)
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' · ')
  const matchHref = user && inv.related_type === 'match'
    ? `/matches/${inv.related_id}`
    : `/i/${id}/match`
  const pageError = getInvitationPageErrorMessage(pageParams.error)
  const pageNotice = (inv.status === 'accepted' && pageParams.notice === 'accepted') || (inv.status === 'declined' && pageParams.notice === 'declined')
    ? null
    : getInvitationPageNotice(pageParams.notice)
  const confirmationSource = inv.match_summary?.participant_confirmation_source ?? null
  const acceptedVia = inv.match_summary?.participant_accepted_via ?? null
  const isParticipantRemoved =
    inv.match_summary?.participant_status === 'removed'
    || Boolean(inv.match_summary?.participant_removed_at)
  const hasResponded = inv.status === 'accepted' || inv.status === 'declined'
  const isInvitationInactive =
    !hasResponded
    && (
      inv.status === 'canceled'
      || inv.status === 'expired'
      || isParticipantRemoved
      || inv.match_summary?.match_status === 'cancelled'
      || inv.match_summary?.match_status === 'canceled'
    )
  const inactiveCopy = getInactiveInvitationCopy(inv.status, inv.match_summary?.match_status, isParticipantRemoved)
  const isHostConfirmed =
    confirmationSource === 'host_managed_offline'
    || confirmationSource === 'contact_owner_managed'
    || acceptedVia === 'host_offline_confirmation'
  const isParticipantConfirmed =
    Boolean(inv.match_summary?.participant_accepted_at)
    && Boolean(inv.match_summary?.participant_org_approved_at)
    && !isParticipantRemoved
  const isMatchFormed = Boolean(inv.match_summary?.formed_at)
  const isMatchCancelled =
    inv.match_summary?.match_status === 'cancelled'
    || inv.match_summary?.match_status === 'canceled'
  const showShareLinkSection =
    inv.related_type === 'match'
    && !isExpired
    && inv.status !== 'canceled'
    && inv.status !== 'expired'
    && !isParticipantRemoved
    && !isMatchFormed
    && !isMatchCancelled
  const shouldShowConfirmedLanding =
    !isInvitationInactive
    && (isHostConfirmed || (isParticipantConfirmed && inv.status === 'pending'))
  const shouldShowFormedLanding =
    !isInvitationInactive
    && isMatchFormed
    && isParticipantConfirmed
  const showPendingResponseFlow =
    inv.status === 'pending'
    && !isExpired
    && !shouldShowConfirmedLanding
    && !shouldShowFormedLanding
    && !isInvitationInactive
  const pageKicker = shouldShowConfirmedLanding || shouldShowFormedLanding
    ? 'Match Confirmation'
    : 'Match Invitation'
  const createAccountHref = `/login?mode=register&next=${encodeURIComponent(matchHref)}`

  return (
    <div className="invitation-page">
      <style>{`
        .invitation-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 32px 18px 48px;
        }

        .invitation-shell {
          width: min(100%, 940px);
          margin: 0 auto;
        }

        .invitation-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .invitation-brand-copy {
          display: grid;
          gap: 3px;
        }

        .invitation-brand-title {
          font-size: 0.95rem;
          font-weight: 800;
          line-height: 1.1;
        }

        .invitation-brand-subtitle {
          color: #5c6f91;
          font-size: 0.85rem;
          font-weight: 650;
        }

        .invitation-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 22px;
          align-items: start;
        }

        .invitation-card,
        .invitation-value-panel {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 28px;
          box-shadow: 0 18px 44px rgba(17, 42, 84, 0.08);
        }

        .invitation-card {
          padding: 30px;
        }

        .invitation-kicker {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .invitation-title {
          font-size: clamp(2rem, 3.5vw, 2.85rem);
          line-height: 1.08;
          margin: 0;
          letter-spacing: 0;
        }

        .invitation-subtext {
          color: #405474;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 14px 0 0;
          max-width: 560px;
        }

        .invitation-summary {
          display: grid;
          gap: 3px;
          margin: 24px 0;
        }

        .invitation-summary-type {
          color: #06183d;
          font-size: 1.06rem;
          font-weight: 900;
          line-height: 1.35;
          margin: 0 0 2px;
        }

        .invitation-summary-line {
          color: #405474;
          font-size: 0.96rem;
          font-weight: 720;
          line-height: 1.35;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .invitation-summary-label-inline {
          color: #16335f;
          font-weight: 900;
        }

        .invitation-venue-line {
          align-items: baseline;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .invitation-map-link {
          color: #1f5fe8;
          font-weight: 900;
          text-decoration: none;
        }

        .invitation-map-link:hover {
          text-decoration: underline;
        }

        .invitation-note {
          color: #50627f;
          font-size: 0.95rem;
          line-height: 1.55;
          margin: 0 0 22px;
        }

        .invitation-helper-card {
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

        .invitation-rsvp-card {
          align-items: center;
          background: #f8fbff;
          border: 1px solid #d9e6f4;
          border-radius: 18px;
          display: flex;
          justify-content: space-between;
          margin: -8px 0 22px;
          padding: 14px 16px;
        }

        .invitation-rsvp-label {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .invitation-rsvp-value {
          color: #06183d;
          font-size: 1rem;
          font-weight: 900;
        }

        .invitation-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .invitation-action-form {
          margin: 0;
        }

        .invitation-button {
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

        .invitation-button-primary {
          background: #06183d;
          color: #fff;
          box-shadow: 0 12px 24px rgba(6, 24, 61, 0.16);
        }

        .invitation-button-blue {
          background: #0b5bd3;
          color: #fff;
          box-shadow: 0 12px 24px rgba(11, 91, 211, 0.16);
        }

        .invitation-button-secondary {
          border: 1px solid #c8d7eb;
          color: #16335f;
          background: #fff;
        }

        .invitation-account-card {
          margin-top: 24px;
          padding: 20px;
          border: 1px solid #d9e6f4;
          border-radius: 22px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }

        .invitation-account-card-soft {
          margin-top: 18px;
          background: #fff;
        }

        .invitation-account-card h2 {
          font-size: 1.25rem;
          margin: 0;
        }

        .invitation-account-card p {
          color: #405474;
          font-size: 0.95rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 8px 0 16px;
        }

        .invitation-status-alert {
          border-radius: 18px;
          font-size: 0.92rem;
          font-weight: 750;
          margin-bottom: 16px;
          padding: 12px 14px;
        }

        .invitation-status-error {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }

        .invitation-status-notice {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
        }

        .invitation-form-copy {
          color: #405474;
          font-size: 0.95rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 0 0 14px;
        }

        .invitation-form-button {
          border: none;
          border-radius: 999px;
          cursor: pointer;
          font-size: 0.92rem;
          font-weight: 850;
          min-height: 46px;
          padding: 0 18px;
        }

        .invitation-form-button-accept {
          background: #0b5bd3;
          color: #fff;
        }

        .invitation-form-button-decline {
          background: #fff;
          border: 1px solid #c8d7eb;
          color: #16335f;
        }

        .invitation-value-panel {
          padding: 24px;
        }

        .invitation-value-panel h2 {
          font-size: 1.25rem;
          margin: 0 0 18px;
        }

        .invitation-value-list {
          display: grid;
          gap: 16px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .invitation-value-item {
          display: grid;
          gap: 4px;
          padding-left: 18px;
          position: relative;
        }

        .invitation-value-dot {
          background: #c7e500;
          border-radius: 999px;
          height: 8px;
          left: 0;
          position: absolute;
          top: 8px;
          width: 8px;
        }

        .invitation-value-item strong {
          font-size: 0.95rem;
        }

        .invitation-value-item span {
          color: #526784;
          font-size: 0.86rem;
          line-height: 1.45;
        }

        .invitation-footer {
          color: #72819a;
          font-size: 0.78rem;
          font-weight: 650;
          margin-top: 18px;
        }

        .invitation-footer a {
          color: #526784;
        }

        @media (max-width: 760px) {
          .invitation-page {
            padding: 20px 12px 34px;
          }

          .invitation-grid {
            grid-template-columns: 1fr;
          }

          .invitation-card {
            padding: 22px;
            border-radius: 24px;
          }

          .invitation-brand {
            justify-content: center;
            text-align: center;
          }

          .invitation-brand-subtitle {
            font-size: 0.78rem;
          }

          .invitation-title {
            font-size: 2rem;
            line-height: 1.12;
          }

          .invitation-value-panel {
            display: none;
          }

          .invitation-actions,
          .invitation-account-card .invitation-actions {
            display: grid;
          }

          .invitation-button,
          .invitation-form-button {
            width: 100%;
          }
        }
      `}</style>

      <div className="invitation-shell">
        <div className="invitation-brand">
          <BrandLogo variant="horizontal" />
          <div className="invitation-brand-copy">
            <div className="invitation-brand-title">PlayerHoods</div>
            <div className="invitation-brand-subtitle">See who&apos;s in. Keep playing.</div>
          </div>
        </div>

        <div className="invitation-grid">
          <section className="invitation-card">
            <p className="invitation-kicker">{pageKicker}</p>

            {pageError ? (
              <div className="invitation-status-alert invitation-status-error">
                {pageError}
              </div>
            ) : null}

            {pageNotice ? (
              <div className="invitation-status-alert invitation-status-notice">
                {pageNotice}
              </div>
            ) : null}

            {isInvitationInactive ? (
              <>
                <h1 className="invitation-title">{inactiveCopy.title}</h1>
                <p className="invitation-subtext">
                  {inactiveCopy.body}
                </p>
              </>
            ) : shouldShowFormedLanding ? (
              <>
                <h1 className="invitation-title">This match is formed</h1>
                <p className="invitation-subtext">
                  You're in the confirmed lineup for {matchKind} at {venueName ?? 'the venue'}.
                </p>
              </>
            ) : shouldShowConfirmedLanding ? (
              <>
                <h1 className="invitation-title">You're confirmed for this match</h1>
                <p className="invitation-subtext">
                  {inviterName} added you as confirmed for {matchKind} at {venueName ?? 'the venue'}. If anything changed, you can update your response or message the host.
                </p>
              </>
            ) : inv.status === 'accepted' ? (
              <>
                <h1 className="invitation-title">You're in</h1>
                <p className="invitation-subtext">
                  You've accepted this match invitation. The host will be notified that you're in.
                </p>
              </>
            ) : inv.status === 'declined' ? (
              <>
                <h1 className="invitation-title">You've declined this invitation.</h1>
                <p className="invitation-subtext">
                  We'll let the host know.
                </p>
              </>
            ) : (
              <>
                <h1 className="invitation-title">{inviterName} invited you to play</h1>
                <p className="invitation-subtext">
                  Confirm whether you can join this match.
                </p>
              </>
            )}

            <section className="invitation-summary" aria-label="Match summary">
              <h2 className="invitation-summary-type">{matchType}</h2>
              {matchLevel ? (
                <p className="invitation-summary-line">
                  <span className="invitation-summary-label-inline">Level: </span>
                  {matchLevel}
                </p>
              ) : null}
              <p className="invitation-summary-line">{matchDateTime || 'Time to be confirmed'}</p>
              <p className="invitation-summary-line invitation-venue-line">
                <span>{venueName ?? 'Venue to be confirmed'}</span>
                {venueMapHref ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <a href={venueMapHref} target="_blank" rel="noreferrer" className="invitation-map-link">
                      Map
                    </a>
                  </>
                ) : null}
              </p>
              <p className="invitation-summary-line">Host: {inviterName}</p>
              {hostNote ? (
                <p className="invitation-summary-line">
                  <span className="invitation-summary-label-inline">Note from host: </span>
                  {hostNote}
                </p>
              ) : null}
            </section>

            {isInvitationInactive ? (
              <section className="invitation-helper-card">
                No action is needed.
              </section>
            ) : null}

            {inv.status === 'accepted' && !isInvitationInactive && !shouldShowConfirmedLanding && !shouldShowFormedLanding ? (
              <section className="invitation-rsvp-card" aria-label="Your RSVP">
                <span className="invitation-rsvp-label">Your RSVP</span>
                <span className="invitation-rsvp-value">Accepted</span>
              </section>
            ) : null}

            {inv.status === 'declined' && !isInvitationInactive ? (
              <section className="invitation-rsvp-card" aria-label="Your RSVP">
                <span className="invitation-rsvp-label">Your RSVP</span>
                <span className="invitation-rsvp-value">Declined</span>
              </section>
            ) : null}

            {(shouldShowConfirmedLanding || shouldShowFormedLanding) && (
              <>
                {inv.related_type === 'match' && (
                  <div className="invitation-actions">
                    <form action={openStatusAction} className="invitation-action-form">
                      <button type="submit" className="invitation-button invitation-button-primary">
                        View Match
                      </button>
                    </form>
                  </div>
                )}
                <section className="invitation-account-card invitation-account-card-soft">
                  <h2>Need to change your response?</h2>
                  <p>
                    Open your private match status if you can&apos;t make it or need to let the host know something changed.
                  </p>
                </section>
                {!user && (
                  <section className="invitation-account-card invitation-account-card-soft">
                    <h2>New to PlayerHoods?</h2>
                    <p>
                      Create a free account to keep this match, confirm future invites faster, and stay connected with players you know.
                    </p>
                    <div className="invitation-actions">
                      <Link href={createAccountHref} className="invitation-button invitation-button-secondary">
                        Create Free Account
                      </Link>
                    </div>
                  </section>
                )}
              </>
            )}

            {inv.status === 'accepted' && !shouldShowConfirmedLanding && !shouldShowFormedLanding && !isInvitationInactive && (
              <>
                <section className="invitation-account-card">
                  <h2>Create your free PlayerHoods account</h2>
                  <p>
                    Manage this match, get updates, save {inviterName} as a player contact, and join future matches faster.
                  </p>
                  <div className="invitation-actions">
                    <Link href={createAccountHref} className="invitation-button invitation-button-primary">
                      Create account
                    </Link>
                    <form action={openStatusAction} className="invitation-action-form">
                      <button type="submit" className="invitation-button invitation-button-secondary">
                        View status
                      </button>
                    </form>
                  </div>
                </section>
              </>
            )}

            {inv.status === 'declined' && !isInvitationInactive && (
              <section className="invitation-account-card invitation-account-card-soft">
                <h2>Manage future invites more easily</h2>
                <p>
                  Create a free PlayerHoods account to track match updates, save players, and respond faster next time.
                </p>
                <div className="invitation-actions">
                  <Link href={createAccountHref} className="invitation-button invitation-button-secondary">
                    Create account
                  </Link>
                  <Link href="/" className="invitation-button invitation-button-secondary">
                    Maybe later
                  </Link>
                </div>
              </section>
            )}

            {isExpired && inv.status === 'pending' && !shouldShowConfirmedLanding && !shouldShowFormedLanding && !isInvitationInactive && (
              <div className="invitation-status-alert invitation-status-error">
                This invitation has expired.
              </div>
            )}

            {showPendingResponseFlow && (
              <div>
                {user && relevantIdentityLinkCandidates.length > 0 ? (
                  <IdentityLinkReviewCard
                    title="Link your contact profile"
                    body="We found matches linked to your contact information."
                    candidates={relevantIdentityLinkCandidates}
                    acceptLabel="Link and continue"
                    keepSeparateLabel="Keep separate for now"
                    onAccept={async (guestId) => {
                      'use server'
                      return acceptInvitationIdentityLinkAndContinueAction(id, guestId, inv.related_id, inv.related_type)
                    }}
                    onKeepSeparate={async (guestId) => {
                      'use server'
                      return keepSeparateInvitationIdentityLinkAction(id, guestId, inv.related_id, inv.related_type)
                    }}
                  />
                ) : user ? (
                  <>
                    <p className="invitation-form-copy">
                      {inv.caller_email_matches
                        ? 'You are signed in. Accept or decline here.'
                        : 'This invitation is tied to a different email. Sign in with the invited account, or open the link while signed out.'}
                    </p>
                    {inv.caller_email_matches ? (
                      <div className="invitation-actions">
                        <form action={acceptAuthenticatedAction}>
                          <button type="submit" className="invitation-form-button invitation-form-button-accept">
                            Accept invitation
                          </button>
                        </form>
                        <form action={declineAuthenticatedAction}>
                          <button type="submit" className="invitation-form-button invitation-form-button-decline">
                            Decline
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="invitation-form-copy">
                      No account is required to respond.
                    </p>
                    <div className="invitation-actions">
                      <form action={acceptAction}>
                        <button type="submit" className="invitation-form-button invitation-form-button-accept">
                          Accept invitation
                        </button>
                      </form>
                      <form action={declineAction}>
                        <button type="submit" className="invitation-form-button invitation-form-button-decline">
                          Decline
                        </button>
                      </form>
                    </div>
                    <section className="invitation-account-card invitation-account-card-soft">
                      <h2>New to PlayerHoods?</h2>
                      <p>
                        Create a free account to keep this match, confirm future invites faster, and stay connected with players you know.
                      </p>
                      <div className="invitation-actions">
                        <Link href={createAccountHref} className="invitation-button invitation-button-secondary">
                          Create Free Account
                        </Link>
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {showShareLinkSection ? (
              <InvitationShareLinkSection invitationId={id} />
            ) : null}
          </section>

          <aside className="invitation-value-panel" aria-label="Why PlayerHoods">
            <h2>Why PlayerHoods?</h2>
            <ul className="invitation-value-list">
              <li className="invitation-value-item">
                <span className="invitation-value-dot" aria-hidden="true" />
                <strong>No group chat chaos</strong>
                <span>Confirm who&apos;s in without endless messages.</span>
              </li>
              <li className="invitation-value-item">
                <span className="invitation-value-dot" aria-hidden="true" />
                <strong>Private by default</strong>
                <span>
                  Your phone and email stay private on PlayerHoods. Invitations are limited to match-connected players.
                </span>
              </li>
              <li className="invitation-value-item">
                <span className="invitation-value-dot" aria-hidden="true" />
                <strong>Only useful updates</strong>
                <span>We notify you only when it matters.</span>
              </li>
            </ul>
          </aside>
        </div>

        <p className="invitation-footer">
          Private match coordination. No group chat chaos. <Link href="/">PlayerHoods</Link>
        </p>
      </div>
    </div>
  )
}
