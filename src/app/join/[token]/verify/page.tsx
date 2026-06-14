import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { BrandLogo } from '@/app/components/BrandLogo'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import type { Database, MatchDoublesFormat } from '@/lib/types/database'
import { verifyPublicMatchSignupAction } from '../actions'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    signup?: string
    verification_token?: string
    token?: string
    status?: string
    error?: string
  }>
}

type PublicSignupContext = {
  match_id: string
  signup_open: boolean
  match_status: string
  host_display_name: string
  game_type: string | null
  sport_name: string | null
  match_date: string | null
  start_time: string | null
  venue_name: string | null
  venue_timezone: string | null
}

type PublicSignupMatchDisplayDetails = {
  duration_minutes: number | null
  doubles_format: MatchDoublesFormat | null
  organizer_note: string | null
  level: string | null
}

type VerifiedSignupRow = {
  id: string
  link_id: string
  match_id: string
  match_participant_id: string | null
  verified_at: string | null
  status: string
}

type PublicSignupLinkRow = {
  match_id: string
  public_token: string
  disabled_at: string | null
}

type MatchParticipantRow = {
  id: string
  match_id: string
  removed_at: string | null
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function createPublicSignupReadClient() {
  const serverUrl = process.env.SUPABASE_SERVER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serverUrl || !serviceKey) {
    throw new Error('public_signup_service_client_not_configured')
  }
  return createClient<Database>(serverUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

async function verifySignupFinalized(publicToken: string, signupId: string): Promise<boolean> {
  try {
    const supabase = createPublicSignupReadClient()
    const { data: signup, error: signupError } = await supabase
      .from('public_match_signups')
      .select('id, link_id, match_id, match_participant_id, verified_at, status')
      .eq('id', signupId)
      .maybeSingle()

    if (signupError || !signup) return false

    const signupRow = signup as VerifiedSignupRow
    if (
      signupRow.status !== 'participant_created' ||
      !signupRow.verified_at ||
      !signupRow.match_participant_id
    ) {
      return false
    }

    const { data: link, error: linkError } = await supabase
      .from('public_match_signup_links')
      .select('match_id, public_token, disabled_at')
      .eq('id', signupRow.link_id)
      .eq('public_token', publicToken)
      .maybeSingle()

    if (linkError || !link) return false

    const linkRow = link as PublicSignupLinkRow
    if (linkRow.disabled_at || linkRow.match_id !== signupRow.match_id) return false

    const { data: participant, error: participantError } = await supabase
      .from('match_participants')
      .select('id, match_id, removed_at')
      .eq('id', signupRow.match_participant_id)
      .maybeSingle()

    if (participantError || !participant) return false

    const participantRow = participant as MatchParticipantRow
    return participantRow.match_id === signupRow.match_id && participantRow.removed_at === null
  } catch {
    return false
  }
}

async function getPublicSignupVerifyDisplayDetails(matchId: string): Promise<PublicSignupMatchDisplayDetails | null> {
  try {
    const supabase = createPublicSignupReadClient()
    const { data, error } = await supabase
      .from('matches')
      .select('duration_minutes, doubles_format, organizer_note, level')
      .eq('id', matchId)
      .maybeSingle()

    if (error) throw error

    return data as PublicSignupMatchDisplayDetails | null
  } catch (error) {
    console.error('[public-signup-verify] match display details load failed', {
      has_error: true,
      match_id: matchId,
      error_code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    })
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

function formatPublicMatchType(
  gameType: string | null | undefined,
  sportName: string | null | undefined,
  doublesFormat: MatchDoublesFormat | null | undefined,
): string {
  if (doublesFormat === 'open') {
    const isSingles = (gameType ?? '').toLowerCase() === 'singles'
    return isSingles ? 'Open singles match' : 'Open doubles match'
  }

  return formatGameType(gameType ?? sportName)
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

function getVerifyErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'expired':
      return 'This verification link expired. Submit the request form again to get a new email.'
    case 'invalid':
      return 'This verification link is not valid.'
    case 'match-not-active':
      return 'This match is no longer taking spot requests.'
    case 'link-not-found':
      return 'This join link is no longer available.'
    case 'failed':
      return 'Could not verify this request. Please submit the form again.'
    default:
      return null
  }
}

export default async function PublicMatchSignupVerifyPage({ params, searchParams }: Props) {
  const { token: publicToken } = await params
  const pageParams = await searchParams
  const signupId = pageParams.signup ?? ''
  const verificationToken = pageParams.verification_token ?? pageParams.token ?? ''
  const routeErrorMessage = getVerifyErrorMessage(pageParams.error)
  const wantsVerifiedState = pageParams.status === 'verified'
  const hasSignupId = isUuid(signupId)
  const hasVerificationInput = isUuid(signupId) && isUuid(verificationToken)

  if (!isUuid(publicToken)) {
    notFound()
  }

  const isVerified = wantsVerifiedState && hasSignupId
    ? await verifySignupFinalized(publicToken, signupId)
    : false
  const statusErrorMessage = wantsVerifiedState && !isVerified
    ? getVerifyErrorMessage('invalid')
    : null
  const inputErrorMessage = !wantsVerifiedState && !routeErrorMessage && !hasVerificationInput
    ? getVerifyErrorMessage('invalid')
    : null
  const errorMessage = routeErrorMessage ?? statusErrorMessage ?? inputErrorMessage
  const isFinishing = !wantsVerifiedState && !errorMessage && hasVerificationInput

  const supabase = createSupabasePublicServerClient()
  const { data } = await supabase.rpc('rpc_public_match_signup_context', {
    p_public_token: publicToken,
  })
  const context = ((data ?? []) as PublicSignupContext[])[0] ?? null
  const matchDisplayDetails = context ? await getPublicSignupVerifyDisplayDetails(context.match_id) : null
  const matchType = context
    ? formatPublicMatchType(context.game_type, context.sport_name, matchDisplayDetails?.doubles_format)
    : null
  const matchDate = context ? formatDate(context.match_date) : null
  const matchTime = context ? formatTimeRange(context.start_time, matchDisplayDetails?.duration_minutes) : null
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' · ') || 'Time to be confirmed'
  const venueName = context?.venue_name ?? 'Venue to be confirmed'
  const venueMapHref = getVenueMapHref(context?.venue_name)
  const hostName = context?.host_display_name || 'the host'
  const hostNote = matchDisplayDetails?.organizer_note?.trim() || null
  const matchLevel = matchDisplayDetails?.level?.trim() || null
  const verifyAction = verifyPublicMatchSignupAction.bind(null, publicToken)

  return (
    <div className="public-signup-verify-page">
      <style>{`
        .public-signup-verify-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 22px 16px 48px;
        }

        .public-signup-verify-shell {
          width: min(100%, 980px);
          margin: 0 auto;
        }

        .public-signup-verify-layout {
          align-items: start;
          display: grid;
          gap: 18px;
        }

        @media (min-width: 860px) {
          .public-signup-verify-layout {
            grid-template-columns: minmax(0, 1fr) 320px;
          }
        }

        .public-signup-verify-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .public-signup-verify-brand-logo {
          height: 34px !important;
          width: 154px !important;
        }

        .public-signup-verify-brand-copy {
          border-left: 1px solid #cfdced;
          padding-left: 10px;
        }

        .public-signup-verify-brand-subtitle {
          color: #5c6f91;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .public-signup-verify-card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 20px;
          box-shadow: 0 14px 30px rgba(17, 42, 84, 0.07);
          padding: 24px;
        }

        .public-signup-verify-greeting {
          color: #16335f;
          font-size: 1.05rem;
          font-weight: 780;
          line-height: 1.35;
          margin: 0 0 16px;
        }

        .public-signup-verify-title {
          font-size: clamp(1.9rem, 3vw, 2.35rem);
          line-height: 1.1;
          margin: 0;
          letter-spacing: 0;
        }

        .public-signup-verify-body,
        .public-signup-verify-second-line {
          color: #405474;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 14px 0 0;
        }

        .public-signup-verify-second-line {
          margin-top: 8px;
        }

        .public-signup-verify-summary {
          display: grid;
          gap: 3px;
          margin: 20px 0 0;
        }

        .public-signup-verify-summary-type {
          color: #06183d;
          font-size: 1.06rem;
          font-weight: 900;
          line-height: 1.35;
          margin: 0 0 2px;
        }

        .public-signup-verify-summary-line {
          color: #405474;
          font-size: 0.96rem;
          font-weight: 720;
          line-height: 1.35;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .public-signup-verify-summary-label-inline {
          color: #16335f;
          font-weight: 900;
        }

        .public-signup-verify-venue-line {
          align-items: baseline;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .public-signup-verify-map-link {
          color: #1f5fe8;
          font-weight: 900;
          text-decoration: none;
        }

        .public-signup-verify-map-link:hover {
          text-decoration: underline;
        }

        .public-signup-verify-link {
          display: inline-flex;
          margin-top: 24px;
          color: #2554d9;
          font-size: 0.9rem;
          font-weight: 850;
          text-decoration: none;
        }

        .public-signup-verify-form {
          margin: 20px 0 0;
        }

        .public-signup-verify-fallback {
          color: #405474;
          font-size: 0.95rem;
          font-weight: 650;
          line-height: 1.5;
          margin: 0 0 14px;
        }

        .public-signup-verify-button,
        .public-signup-verify-button-link {
          align-items: center;
          appearance: none;
          background: #2554d9;
          border: 0;
          border-radius: 999px;
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          font-size: 0.95rem;
          font-weight: 850;
          min-height: 46px;
          padding: 0 20px;
          text-decoration: none;
        }

        .public-signup-verify-nudge {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid #d5e2f2;
          border-radius: 24px;
          box-shadow: 0 12px 30px rgba(17, 42, 84, 0.06);
          padding: 20px;
        }

        .public-signup-verify-nudge-title {
          color: #06183d;
          font-size: 1.12rem;
          font-weight: 950;
          line-height: 1.2;
          margin: 0;
        }

        .public-signup-verify-nudge-copy {
          color: #405474;
          font-size: 0.9rem;
          font-weight: 700;
          line-height: 1.5;
          margin: 10px 0 0;
        }

        .public-signup-verify-nudge-list {
          color: #405474;
          display: grid;
          gap: 7px;
          font-size: 0.85rem;
          font-weight: 700;
          list-style: none;
          line-height: 1.35;
          margin: 14px 0 0;
          padding-left: 0;
        }

        .public-signup-verify-nudge-list li {
          display: grid;
          gap: 8px;
          grid-template-columns: auto 1fr;
        }

        .public-signup-verify-actions {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 16px;
        }

        .public-signup-verify-guest-link {
          color: #2554d9;
          font-size: 0.88rem;
          font-weight: 850;
          text-decoration: none;
        }

        .public-signup-verify-kicker {
          color: #7c8eaa;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          margin: 0 0 10px;
          text-transform: uppercase;
        }

        @media (max-width: 820px) {
          .public-signup-verify-page {
            padding: 16px 12px 40px;
          }

          .public-signup-verify-card {
            padding: 20px;
          }

          .public-signup-verify-title {
            font-size: 1.85rem;
            line-height: 1.12;
          }
        }
      `}</style>

      <main className="public-signup-verify-shell">
        <div className="public-signup-verify-brand">
          <BrandLogo variant="horizontal" imageClassName="public-signup-verify-brand-logo" />
          <div className="public-signup-verify-brand-copy">
            <div className="public-signup-verify-brand-subtitle">Match invitation</div>
          </div>
        </div>

        <div className="public-signup-verify-layout">
        <section className="public-signup-verify-card">
          <p className="public-signup-verify-greeting">Hi there,</p>
          <h1 className="public-signup-verify-title">
            {isVerified ? 'Request sent' : isFinishing ? 'Check your email' : 'Verification needs attention'}
          </h1>
          {isVerified ? (
            <>
              <p className="public-signup-verify-body">
                Your request has already been sent to the host. Your email is now verified for match updates.
              </p>
              <p className="public-signup-verify-second-line">
                We&apos;ll email you when the host responds.
              </p>
            </>
          ) : isFinishing ? (
            <>
              <p className="public-signup-verify-body">
                Your request has been sent to the host. Please verify your email so we can send you match updates and confirmations.
              </p>
              <p className="public-signup-verify-second-line">
                Your name will be shown to the host with your request. Your email will not be shared.
              </p>
              <p className="public-signup-verify-second-line">
                Status: Waiting for email verification.
              </p>
              <p className="public-signup-verify-second-line">
                After verifying your email, you can create a free account to track matches and join future games faster.
              </p>
              <p className="public-signup-verify-second-line">
                Can&apos;t find the email? Check your inbox, spam, or junk folder. You can also add noreply@playerhoods.com to your safe sender list.
              </p>
              <form id="public-signup-verify-form" className="public-signup-verify-form" action={verifyAction}>
                <input type="hidden" name="signup" value={signupId} />
                <input type="hidden" name="verification_token" value={verificationToken} />
                <noscript>
                  <p className="public-signup-verify-fallback">
                    JavaScript is unavailable, so use this button to finish verifying your email.
                  </p>
                  <button type="submit" className="public-signup-verify-button">
                    Verify email
                  </button>
                </noscript>
              </form>
              <script
                dangerouslySetInnerHTML={{
                  __html: `
(() => {
  const form = document.getElementById('public-signup-verify-form');
  if (!form || form.dataset.autosubmitted === 'true') return;
  form.dataset.autosubmitted = 'true';
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
  } else {
    form.submit();
  }
})();
                  `.trim(),
                }}
              />
            </>
          ) : (
            <p className="public-signup-verify-body">
              {errorMessage ?? 'Could not verify this request. Please submit the form again.'}
            </p>
          )}

          {context ? (
            <div className="public-signup-verify-summary" aria-label="Match summary">
              <h2 className="public-signup-verify-summary-type">{matchType}</h2>
              {matchLevel ? (
                <p className="public-signup-verify-summary-line">
                  <span className="public-signup-verify-summary-label-inline">Level: </span>
                  {matchLevel}
                </p>
              ) : null}
              <p className="public-signup-verify-summary-line">{matchDateTime}</p>
              <p className="public-signup-verify-summary-line public-signup-verify-venue-line">
                <span>{venueName}</span>
                {venueMapHref ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <a href={venueMapHref} target="_blank" rel="noreferrer" className="public-signup-verify-map-link">
                      Map
                    </a>
                  </>
                ) : null}
              </p>
              <p className="public-signup-verify-summary-line">Host: {hostName}</p>
              {hostNote ? (
                <p className="public-signup-verify-summary-line">
                  <span className="public-signup-verify-summary-label-inline">Note from host: </span>
                  {hostNote}
                </p>
              ) : null}
            </div>
          ) : null}

          <Link href={`/join/${publicToken}`} className="public-signup-verify-link">
            Back to match invitation
          </Link>
        </section>

        {false ? (
          <aside className="public-signup-verify-nudge" aria-label="Create a free account">
          <p className="public-signup-verify-kicker">New to PlayerHoods?</p>
          <h2 className="public-signup-verify-nudge-title">Create a free account</h2>
          <ul className="public-signup-verify-nudge-list">
            <li><span aria-hidden="true">✓</span> Join matches faster and host with less work</li>
            <li><span aria-hidden="true">✓</span> Track updates, change responses, and manage your match status in one place</li>
            <li><span aria-hidden="true">✓</span> Communicate more easily in match chat and group chat</li>
            <li><span aria-hidden="true">✓</span> Save trusted players to your Hood and stay connected through groups</li>
          </ul>
          <div className="public-signup-verify-actions">
            <Link href="/login" className="public-signup-verify-button-link">Create Free Account</Link>
            <Link href={`/join/${publicToken}`} className="public-signup-verify-guest-link">Maybe later</Link>
          </div>
          </aside>
        ) : null}
        </div>
      </main>
    </div>
  )
}
