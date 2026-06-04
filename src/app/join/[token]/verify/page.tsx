import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
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
  const isVerified = pageParams.status === 'verified'
  const hasVerificationInput = isUuid(signupId) && isUuid(verificationToken)

  if (!isUuid(publicToken)) {
    notFound()
  }

  const inputErrorMessage = !isVerified && !routeErrorMessage && !hasVerificationInput
    ? getVerifyErrorMessage('invalid')
    : null
  const errorMessage = routeErrorMessage ?? inputErrorMessage
  const isFinishing = !isVerified && !errorMessage && hasVerificationInput

  const supabase = createSupabasePublicServerClient()
  const { data } = await supabase.rpc('rpc_public_match_signup_context', {
    p_public_token: publicToken,
  })
  const context = ((data ?? []) as PublicSignupContext[])[0] ?? null
  const matchType = context ? formatGameType(context.game_type ?? context.sport_name) : null
  const matchDate = context ? formatDate(context.match_date) : null
  const matchTime = context ? formatTime(context.start_time) : null
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' - ') || 'Time to be confirmed'
  const venueName = context?.venue_name ?? 'Venue to be confirmed'
  const verifyAction = verifyPublicMatchSignupAction.bind(null, publicToken)

  return (
    <div className="public-signup-verify-page">
      <style>{`
        .public-signup-verify-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 32px 18px 48px;
        }

        .public-signup-verify-shell {
          width: min(100%, 720px);
          margin: 0 auto;
        }

        .public-signup-verify-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .public-signup-verify-card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 28px;
          box-shadow: 0 18px 44px rgba(17, 42, 84, 0.08);
          padding: 30px;
        }

        .public-signup-verify-kicker,
        .public-signup-verify-summary-heading {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .public-signup-verify-summary-heading {
          margin: 0;
        }

        .public-signup-verify-title {
          font-size: clamp(2rem, 3.5vw, 2.65rem);
          line-height: 1.08;
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
          gap: 10px;
          margin: 24px 0 0;
          padding: 18px;
          border: 1px solid #d9e6f4;
          border-radius: 20px;
          background: #f8fbff;
        }

        .public-signup-verify-summary-type {
          font-size: 1.15rem;
          font-weight: 850;
        }

        .public-signup-verify-summary-venue {
          color: #0b1f4d;
          font-size: 1rem;
          font-weight: 800;
        }

        .public-signup-verify-summary-time,
        .public-signup-verify-summary-host {
          color: #526784;
          font-size: 0.95rem;
          font-weight: 700;
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

        .public-signup-verify-button {
          appearance: none;
          background: #2554d9;
          border: 0;
          border-radius: 999px;
          color: #fff;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 850;
          min-height: 46px;
          padding: 0 20px;
        }
      `}</style>

      <main className="public-signup-verify-shell">
        <div className="public-signup-verify-brand">
          <BrandLogo variant="horizontal" />
        </div>

        <section className="public-signup-verify-card">
          <p className="public-signup-verify-kicker">Join Link</p>
          <h1 className="public-signup-verify-title">
            {isVerified ? 'Request sent' : isFinishing ? 'Finishing your request...' : 'Verification failed'}
          </h1>
          {isVerified ? (
            <>
              <p className="public-signup-verify-body">
                Thanks &mdash; your request has been sent to the host. If there&apos;s a spot, the host can add you to the lineup.
              </p>
              <p className="public-signup-verify-second-line">
                We&apos;ll email you when the host responds.
              </p>
            </>
          ) : isFinishing ? (
            <>
              <p className="public-signup-verify-body">
                Verifying your email and sending your request to the host. This should only take a moment.
              </p>
              <form id="public-signup-verify-form" className="public-signup-verify-form" action={verifyAction}>
                <input type="hidden" name="signup" value={signupId} />
                <input type="hidden" name="verification_token" value={verificationToken} />
                <noscript>
                  <p className="public-signup-verify-fallback">
                    JavaScript is unavailable, so use this button to finish sending your request.
                  </p>
                  <button type="submit" className="public-signup-verify-button">
                    Finish request
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
              <div className="public-signup-verify-summary-heading">Match details</div>
              <div className="public-signup-verify-summary-type">{matchType}</div>
              <div className="public-signup-verify-summary-venue">{venueName}</div>
              <div className="public-signup-verify-summary-time">{matchDateTime}</div>
              <div className="public-signup-verify-summary-host">Host: {context.host_display_name || 'the host'}</div>
            </div>
          ) : null}

          <Link href={`/join/${publicToken}`} className="public-signup-verify-link">
            Back to match details
          </Link>
        </section>
      </main>
    </div>
  )
}
