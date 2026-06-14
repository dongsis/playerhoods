import { createHash } from 'node:crypto'
import Link from 'next/link'
import { BrandLogo } from '@/app/components/BrandLogo'
import { createSupabasePublicServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { MatchDoublesFormat } from '@/lib/types/database'
import { declinePublicJoinSmsSpotAction, requestPublicJoinSmsSpotAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    error?: string
    notice?: string
  }>
}

type PublicJoinSmsContext = {
  sms_intent_id: string
  status: 'pending_sms_response' | 'request_created' | 'declined_by_guest' | 'expired' | 'cancelled'
  display_name: string
  match_id: string
  match_status: string
  game_type: string | null
  sport_name: string | null
  match_date: string | null
  start_time: string | null
  venue_name: string | null
  venue_timezone: string | null
  host_display_name: string | null
  expires_at: string
  match_participant_id: string | null
}

type PublicJoinSmsMatchDisplayDetails = {
  duration_minutes: number | null
  doubles_format: MatchDoublesFormat | null
  organizer_note: string | null
  level: string | null
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function getTokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12)
}

function getSupabaseRuntimeInfo(): { supabaseHost: string; supabaseProjectRef: string | null } {
  const configuredUrl = process.env.SUPABASE_SERVER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!configuredUrl) {
    return { supabaseHost: 'missing', supabaseProjectRef: null }
  }

  try {
    const host = new URL(configuredUrl).host
    return {
      supabaseHost: host,
      supabaseProjectRef: host.endsWith('.supabase.co') ? host.split('.')[0] ?? null : null,
    }
  } catch {
    return { supabaseHost: 'invalid-url', supabaseProjectRef: null }
  }
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

function getErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'expired':
      return 'This text link expired. Use the public join link to text yourself the match again.'
    case 'match-not-active':
      return 'This match is no longer taking responses.'
    case 'not-found':
    case 'invalid':
      return 'This text link is no longer available.'
    case 'not-available':
      return 'This response link is no longer available.'
    case 'failed':
      return 'Could not update your response. Please try again.'
    default:
      return null
  }
}

async function getPublicJoinSmsContext(token: string): Promise<PublicJoinSmsContext | null> {
  const supabase = createSupabasePublicServerClient()
  const { data, error } = await supabase.rpc('rpc_public_match_signup_sms_context', {
    p_sms_token: token,
  })

  if (error) {
    console.error('[j-sms-context] rpc_public_match_signup_sms_context failed', {
      rpc: 'rpc_public_match_signup_sms_context',
      tokenFingerprint: getTokenFingerprint(token),
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
    })
    throw new Error('public_join_sms_context_rpc_failed')
  }

  const rows = (data ?? []) as PublicJoinSmsContext[]
  const context = rows[0] ?? null
  if (!context) {
    console.warn('[j-sms-context] rpc_public_match_signup_sms_context returned no rows', {
      rpc: 'rpc_public_match_signup_sms_context',
      tokenFingerprint: getTokenFingerprint(token),
      rowCount: rows.length,
      ...getSupabaseRuntimeInfo(),
    })
  }

  return context
}

async function getPublicJoinSmsMatchDisplayDetails(matchId: string): Promise<PublicJoinSmsMatchDisplayDetails | null> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase
      .from('matches')
      .select('duration_minutes, doubles_format, organizer_note, level')
      .eq('id', matchId)
      .maybeSingle()

    if (error) throw error

    return data as PublicJoinSmsMatchDisplayDetails | null
  } catch (error) {
    console.error('[j-sms-context] match display details load failed', {
      has_error: true,
      match_id: matchId,
      error_code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    })
    return null
  }
}

export default async function PublicJoinSmsPage({ params, searchParams }: Props) {
  const { token } = await params
  const pageParams = await searchParams
  const hasValidTokenShape = isUuid(token)

  const context = hasValidTokenShape ? await getPublicJoinSmsContext(token) : null
  const linkUnavailable = !hasValidTokenShape || !context
  const matchDisplayDetails = context ? await getPublicJoinSmsMatchDisplayDetails(context.match_id) : null

  const requestAction = context ? requestPublicJoinSmsSpotAction.bind(null, token) : null
  const declineAction = context ? declinePublicJoinSmsSpotAction.bind(null, token) : null
  const matchType = context
    ? formatSpecificMatchType(context.game_type, context.sport_name, matchDisplayDetails?.doubles_format)
    : null
  const matchDate = context ? formatDate(context.match_date) : null
  const matchTime = context ? formatTimeRange(context.start_time, matchDisplayDetails?.duration_minutes) : null
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' · ') || 'Time to be confirmed'
  const venueName = context?.venue_name ?? 'Venue to be confirmed'
  const venueMapHref = getVenueMapHref(context?.venue_name)
  const hostName = context?.host_display_name ?? 'Host'
  const hostNote = matchDisplayDetails?.organizer_note?.trim() || null
  const matchLevel = matchDisplayDetails?.level?.trim() || null
  const participantFirstName = getFirstName(context?.display_name)
  const pageError = getErrorMessage(pageParams.error)
  const requestSent = Boolean(context && (pageParams.notice === 'request-sent' || context.status === 'request_created'))
  const declined = Boolean(context && (pageParams.notice === 'declined' || context.status === 'declined_by_guest'))
  const expired = Boolean(context && (pageParams.error === 'expired' || context.status === 'expired' || context.match_status !== 'active'))
  const canRespond = Boolean(context && context.status === 'pending_sms_response' && !expired && !requestSent && !declined)
  const title = linkUnavailable
    ? 'This link is no longer available'
    : requestSent
    ? 'Thanks — we have your response'
    : declined
      ? "Thanks — we've updated your response"
      : expired
        ? 'This text link expired'
        : 'Want to play?'
  const subtext = linkUnavailable
    ? 'This match text link may have expired or already been used. Open the match link again if you still want to play.'
    : requestSent
    ? "We'll notify you when the host sets the confirmed lineup."
    : declined
      ? "The host will see that you can't make this one."
      : expired
        ? 'Use the public join link to text yourself the match again.'
        : 'Tap a response below to let the host know.'

  return (
    <div className="public-sms-page">
      <style>{`
        .public-sms-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 22px 16px 40px;
        }

        .public-sms-shell {
          width: min(100%, 680px);
          margin: 0 auto;
        }

        .public-sms-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .public-sms-brand-logo {
          height: 34px !important;
          width: 154px !important;
        }

        .public-sms-brand-copy {
          border-left: 1px solid #cfdced;
          padding-left: 10px;
        }

        .public-sms-brand-subtitle {
          color: #5c6f91;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .public-sms-card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 20px;
          box-shadow: 0 14px 30px rgba(17, 42, 84, 0.07);
          padding: 24px;
        }

        .public-sms-greeting {
          color: #16335f;
          font-size: 1.05rem;
          font-weight: 780;
          line-height: 1.35;
          margin: 0 0 16px;
        }

        .public-sms-title {
          color: #06183d;
          font-size: clamp(1.9rem, 3vw, 2.35rem);
          line-height: 1.1;
          margin: 0;
          letter-spacing: 0;
        }

        .public-sms-subtext {
          color: #405474;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.5;
          margin: 8px 0 0;
          max-width: 620px;
        }

        .public-sms-summary {
          display: grid;
          gap: 3px;
          margin: 20px 0 0;
        }

        .public-sms-summary-type {
          color: #06183d;
          font-size: 1.06rem;
          font-weight: 900;
          line-height: 1.35;
          margin: 0 0 2px;
        }

        .public-sms-summary-line {
          color: #405474;
          font-size: 0.96rem;
          font-weight: 720;
          line-height: 1.35;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .public-sms-summary-label-inline {
          color: #16335f;
          font-weight: 900;
        }

        .public-sms-venue-line {
          align-items: baseline;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .public-sms-map-link {
          color: #1f5fe8;
          font-weight: 900;
          text-decoration: none;
        }

        .public-sms-map-link:hover {
          text-decoration: underline;
        }

        .public-sms-actions {
          display: grid;
          gap: 10px;
          margin-top: 22px;
          width: 100%;
        }

        .public-sms-actions form {
          margin: 0;
        }

        .public-sms-button {
          align-items: center;
          background: #9ce600;
          border: 0;
          border-radius: 999px;
          color: #102a00;
          cursor: pointer;
          display: flex;
          font-size: 0.95rem;
          font-weight: 950;
          justify-content: center;
          min-height: 44px;
          padding: 0 18px;
          width: 100%;
        }

        .public-sms-button-secondary {
          background: #fff;
          border: 1px solid #cbd8ea;
          color: #405474;
        }

        .public-sms-message {
          border-radius: 16px;
          font-size: 0.9rem;
          font-weight: 750;
          line-height: 1.45;
          margin: 16px 0 0;
          padding: 12px 14px;
        }

        .public-sms-message.error {
          background: #fff5f5;
          border: 1px solid #fecaca;
          color: #b42318;
        }

        .public-sms-footer-link {
          display: inline-flex;
          margin-top: 20px;
          color: #1f5fe8;
          font-size: 0.9rem;
          font-weight: 900;
          text-decoration: none;
        }

        @media (max-width: 820px) {
          .public-sms-page {
            padding: 16px 12px 32px;
          }

          .public-sms-card {
            padding: 20px;
          }

          .public-sms-title {
            font-size: 1.85rem;
            line-height: 1.12;
          }
        }
      `}</style>

      <main className="public-sms-shell">
        <div className="public-sms-brand">
          <BrandLogo variant="horizontal" imageClassName="public-sms-brand-logo" />
          <div className="public-sms-brand-copy">
            <div className="public-sms-brand-subtitle">Match invitation</div>
          </div>
        </div>

        <section className="public-sms-card">
          <p className="public-sms-greeting">Hi {participantFirstName ?? 'there'},</p>
          <h1 className="public-sms-title">{title}</h1>
          <p className="public-sms-subtext">{subtext}</p>

          {context ? (
            <div className="public-sms-summary" aria-label="Match summary">
              <h2 className="public-sms-summary-type">{matchType}</h2>
              {matchLevel ? (
                <p className="public-sms-summary-line">
                  <span className="public-sms-summary-label-inline">Level: </span>
                  {matchLevel}
                </p>
              ) : null}
              <p className="public-sms-summary-line">{matchDateTime}</p>
              <p className="public-sms-summary-line public-sms-venue-line">
                <span>{venueName}</span>
                {venueMapHref ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <a href={venueMapHref} target="_blank" rel="noreferrer" className="public-sms-map-link">
                      Map
                    </a>
                  </>
                ) : null}
              </p>
              <p className="public-sms-summary-line">Host: {hostName}</p>
              {hostNote ? (
                <p className="public-sms-summary-line">
                  <span className="public-sms-summary-label-inline">Note from host: </span>
                  {hostNote}
                </p>
              ) : null}
            </div>
          ) : null}

          {pageError ? <p className="public-sms-message error">{pageError}</p> : null}

          {canRespond ? (
            <div className="public-sms-actions">
              <form action={requestAction!}>
                <button type="submit" className="public-sms-button">
                  I&apos;m interested
                </button>
              </form>
              <form action={declineAction!}>
                <button type="submit" className="public-sms-button public-sms-button-secondary">
                  Not this time
                </button>
              </form>
            </div>
          ) : null}

          <Link href="/" className="public-sms-footer-link">
            PlayerHoods
          </Link>
        </section>
      </main>
    </div>
  )
}
