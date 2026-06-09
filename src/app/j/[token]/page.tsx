import { createHash } from 'node:crypto'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function getTokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12)
}

function formatGameType(value: string | null | undefined): string {
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
    month: 'short',
    day: 'numeric',
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

function getErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'expired':
      return 'This text link expired. Use the public join link to text yourself the match again.'
    case 'match-not-active':
      return 'This match is no longer taking spot requests.'
    case 'not-found':
    case 'invalid':
      return 'This text link is no longer available.'
    case 'not-available':
      return 'This request is no longer available.'
    case 'failed':
      return 'Could not update this request. Please try again.'
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

  return ((data ?? []) as PublicJoinSmsContext[])[0] ?? null
}

export default async function PublicJoinSmsPage({ params, searchParams }: Props) {
  const { token } = await params
  const pageParams = await searchParams
  if (!isUuid(token)) notFound()

  const context = await getPublicJoinSmsContext(token)
  if (!context) notFound()

  const requestAction = requestPublicJoinSmsSpotAction.bind(null, token)
  const declineAction = declinePublicJoinSmsSpotAction.bind(null, token)
  const matchType = formatGameType(context.game_type ?? context.sport_name)
  const matchDate = formatDate(context.match_date)
  const matchTime = formatTime(context.start_time)
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' · ') || 'Time to be confirmed'
  const venueName = context.venue_name ?? 'Venue to be confirmed'
  const hostName = context.host_display_name ?? 'Host'
  const pageError = getErrorMessage(pageParams.error)
  const requestSent = pageParams.notice === 'request-sent' || context.status === 'request_created'
  const declined = pageParams.notice === 'declined' || context.status === 'declined_by_guest'
  const expired = pageParams.error === 'expired' || context.status === 'expired' || context.match_status !== 'active'
  const canRespond = context.status === 'pending_sms_response' && !expired && !requestSent && !declined
  const title = requestSent
    ? 'Request sent'
    : declined
      ? 'No problem'
      : expired
        ? 'This text link expired'
        : 'Request to join this match'
  const subtext = requestSent
    ? "The host can now review your request. If you're added to the lineup, we'll text you."
    : declined
      ? "We won't send this request to the host."
      : expired
        ? 'Use the public join link to text yourself the match again.'
        : 'Tap below to send your request to the host.'

  return (
    <div className="public-sms-page">
      <style>{`
        .public-sms-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 32px 18px 48px;
        }

        .public-sms-shell {
          width: min(100%, 720px);
          margin: 0 auto;
        }

        .public-sms-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .public-sms-card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 24px;
          box-shadow: 0 18px 44px rgba(17, 42, 84, 0.08);
          padding: 30px;
        }

        .public-sms-kicker {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .public-sms-title {
          font-size: clamp(2rem, 3.5vw, 2.85rem);
          line-height: 1.08;
          margin: 0;
          letter-spacing: 0;
        }

        .public-sms-subtext {
          color: #405474;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 14px 0 0;
        }

        .public-sms-summary {
          display: grid;
          gap: 10px;
          margin: 24px 0;
          padding: 18px;
          border: 1px solid #d9e6f4;
          border-radius: 18px;
          background: #f8fbff;
        }

        .public-sms-summary-heading {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .public-sms-summary-type {
          font-size: 1.15rem;
          font-weight: 850;
        }

        .public-sms-summary-line {
          color: #526784;
          font-size: 0.95rem;
          font-weight: 700;
        }

        .public-sms-actions {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 20px;
        }

        .public-sms-button {
          align-items: center;
          background: #9ce600;
          border: 0;
          border-radius: 14px;
          color: #102a00;
          cursor: pointer;
          display: inline-flex;
          font-size: 0.98rem;
          font-weight: 950;
          justify-content: center;
          padding: 13px 18px;
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

        .public-sms-link {
          display: inline-flex;
          margin-top: 22px;
          color: #2554d9;
          font-size: 0.9rem;
          font-weight: 850;
          text-decoration: none;
        }
      `}</style>

      <main className="public-sms-shell">
        <div className="public-sms-brand">
          <BrandLogo variant="horizontal" />
        </div>

        <section className="public-sms-card">
          <p className="public-sms-kicker">PlayerHoods Text</p>
          <h1 className="public-sms-title">{title}</h1>
          <p className="public-sms-subtext">{subtext}</p>

          <div className="public-sms-summary" aria-label="Match summary">
            <div className="public-sms-summary-heading">Match details</div>
            <div className="public-sms-summary-type">{matchType}</div>
            <div className="public-sms-summary-line">{venueName}</div>
            <div className="public-sms-summary-line">{matchDateTime}</div>
            <div className="public-sms-summary-line">Hosted by {hostName}</div>
          </div>

          {pageError ? <p className="public-sms-message error">{pageError}</p> : null}

          {canRespond ? (
            <div className="public-sms-actions">
              <form action={requestAction}>
                <button type="submit" className="public-sms-button">
                  Request a spot
                </button>
              </form>
              <form action={declineAction}>
                <button type="submit" className="public-sms-button public-sms-button-secondary">
                  Not This Time
                </button>
              </form>
            </div>
          ) : null}

          <Link href="/" className="public-sms-link">
            PlayerHoods
          </Link>
        </section>
      </main>
    </div>
  )
}
