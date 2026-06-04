import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import { startPublicMatchSignupAction } from './actions'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    error?: string
    notice?: string
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

function getErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'name-required':
      return 'Name is required.'
    case 'contact-required':
    case 'email-required':
      return 'Enter an email to request a spot.'
    case 'sms-coming-next':
      return 'SMS verification is coming next. Please use email for this request.'
    case 'email-invalid':
      return 'Enter a valid email address.'
    case 'match-not-active':
      return 'This match is no longer taking spot requests.'
    case 'link-not-found':
      return 'This join link is no longer available.'
    case 'email-delivery-unavailable':
      return 'Could not send the verification email. Please try again.'
    case 'failed':
      return 'Could not request a spot. Please try again.'
    default:
      return null
  }
}

export default async function PublicMatchSignupPage({ params, searchParams }: Props) {
  const { token } = await params
  const pageParams = await searchParams
  if (!isUuid(token)) notFound()

  const supabase = createSupabasePublicServerClient()
  const { data, error } = await supabase.rpc('rpc_public_match_signup_context', {
    p_public_token: token,
  })
  if (error) notFound()

  const context = ((data ?? []) as PublicSignupContext[])[0] ?? null
  if (!context) notFound()

  const signupAction = startPublicMatchSignupAction.bind(null, token)
  const matchType = formatGameType(context.game_type ?? context.sport_name)
  const matchDate = formatDate(context.match_date)
  const matchTime = formatTime(context.start_time)
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(' - ') || 'Time to be confirmed'
  const venueName = context.venue_name ?? 'Venue to be confirmed'
  const pageError = getErrorMessage(pageParams.error)
  const isCheckEmail = pageParams.notice === 'check-email'
  const isAlreadySubmitted = pageParams.notice === 'already-submitted'
  const showRequestForm = context.signup_open && !isCheckEmail && !isAlreadySubmitted

  return (
    <div className="public-signup-page">
      <style>{`
        .public-signup-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 32px 18px 48px;
        }

        .public-signup-shell {
          width: min(100%, 920px);
          margin: 0 auto;
        }

        .public-signup-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .public-signup-card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 28px;
          box-shadow: 0 18px 44px rgba(17, 42, 84, 0.08);
          padding: 30px;
        }

        .public-signup-kicker {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .public-signup-title {
          font-size: clamp(2rem, 3.5vw, 2.85rem);
          line-height: 1.08;
          margin: 0;
          letter-spacing: 0;
        }

        .public-signup-subtext {
          color: #405474;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 14px 0 0;
          max-width: 620px;
        }

        .public-signup-summary {
          display: grid;
          gap: 10px;
          margin: 24px 0;
          padding: 18px;
          border: 1px solid #d9e6f4;
          border-radius: 20px;
          background: #f8fbff;
        }

        .public-signup-summary-heading {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .public-signup-summary-type {
          font-size: 1.15rem;
          font-weight: 850;
        }

        .public-signup-summary-venue {
          color: #0b1f4d;
          font-size: 1rem;
          font-weight: 800;
        }

        .public-signup-summary-time {
          color: #526784;
          font-size: 0.95rem;
          font-weight: 700;
        }

        .public-signup-summary-host {
          color: #526784;
          font-size: 0.95rem;
          font-weight: 700;
        }

        .public-signup-form {
          display: grid;
          gap: 14px;
          max-width: 520px;
        }

        .public-signup-field {
          display: grid;
          gap: 6px;
        }

        .public-signup-contact-group {
          border: 0;
          display: grid;
          gap: 10px;
          margin: 0;
          padding: 0;
        }

        .public-signup-label {
          color: #405474;
          font-size: 0.78rem;
          font-weight: 850;
        }

        .public-signup-helper {
          color: #526784;
          font-size: 0.84rem;
          font-weight: 700;
          line-height: 1.45;
          margin: -2px 0 0;
        }

        .public-signup-input {
          width: 100%;
          border: 1px solid #cbd8ea;
          border-radius: 14px;
          color: #06183d;
          font-size: 1rem;
          font-weight: 650;
          padding: 12px 14px;
        }

        .public-signup-check {
          align-items: flex-start;
          color: #405474;
          display: flex;
          font-size: 0.86rem;
          font-weight: 700;
          gap: 10px;
          line-height: 1.45;
        }

        .public-signup-check input {
          margin-top: 3px;
        }

        .public-signup-check-copy {
          display: grid;
          gap: 2px;
        }

        .public-signup-check-note {
          color: #526784;
          font-size: 0.8rem;
          font-weight: 650;
        }

        .public-signup-button {
          align-items: center;
          background: #9ce600;
          border: 0;
          border-radius: 16px;
          color: #102a00;
          cursor: pointer;
          display: inline-flex;
          font-size: 0.98rem;
          font-weight: 950;
          justify-content: center;
          padding: 13px 18px;
          width: fit-content;
        }

        .public-signup-message {
          border-radius: 16px;
          font-size: 0.9rem;
          font-weight: 750;
          line-height: 1.45;
          margin: 0 0 16px;
          padding: 12px 14px;
        }

        .public-signup-message.success {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
        }

        .public-signup-message.error {
          background: #fff5f5;
          border: 1px solid #fecaca;
          color: #b42318;
        }

        .public-signup-note,
        .public-signup-help {
          color: #526784;
          font-size: 0.92rem;
          font-weight: 700;
          line-height: 1.5;
          margin: 12px 0 0;
          max-width: 620px;
        }

        .public-signup-help {
          background: #f8fbff;
          border: 1px solid #d9e6f4;
          border-radius: 16px;
          padding: 12px 14px;
        }

        .public-signup-help a {
          color: #2554d9;
          font-weight: 850;
        }

        .public-signup-link {
          display: inline-flex;
          margin-top: 22px;
          color: #2554d9;
          font-size: 0.9rem;
          font-weight: 850;
          text-decoration: none;
        }

        .public-signup-footer {
          color: #6b7f9f;
          font-size: 0.82rem;
          font-weight: 700;
          margin-top: 22px;
        }
      `}</style>

      <main className="public-signup-shell">
        <div className="public-signup-brand">
          <BrandLogo variant="horizontal" />
        </div>

        <section className="public-signup-card">
          <p className="public-signup-kicker">Join Link</p>
          <h1 className="public-signup-title">
            {isAlreadySubmitted ? 'Request already sent' : isCheckEmail ? 'Check your email' : 'Request a spot in this match'}
          </h1>
          {isAlreadySubmitted ? (
            <p className="public-signup-subtext">
              Your request is already waiting for the host. We&apos;ll email you when the host responds.
            </p>
          ) : isCheckEmail ? (
            <>
              <p className="public-signup-subtext">
                Verify your email to send your request for this match to the host. Your contact information will not be shared with the host.
              </p>
              <p className="public-signup-note">
                We sent you a verification link. Click it once to send your request.
              </p>
            </>
          ) : (
            <>
              <p className="public-signup-subtext">
                Add your name and email. Once verified, your request will be sent to the host.
              </p>
              <p className="public-signup-note">
                The host still needs to add you to the lineup.
              </p>
            </>
          )}

          <div className="public-signup-summary" aria-label="Match summary">
            <div className="public-signup-summary-heading">Match details</div>
            <div className="public-signup-summary-type">{matchType}</div>
            <div className="public-signup-summary-venue">{venueName}</div>
            <div className="public-signup-summary-time">{matchDateTime}</div>
            <div className="public-signup-summary-host">Host: {context.host_display_name || 'the host'}</div>
          </div>

          {pageError ? <p className="public-signup-message error">{pageError}</p> : null}

          {isCheckEmail ? (
            <>
              <p className="public-signup-help">
                Can&apos;t find the email? Check your inbox first, then your spam or junk folder. To help future PlayerHoods emails arrive, add{' '}
                <a href="mailto:noreply@playerhoods.com">noreply@playerhoods.com</a> to your safe sender list.
              </p>
              <Link href={`/join/${token}`} className="public-signup-link">
                Back to match details
              </Link>
            </>
          ) : isAlreadySubmitted ? (
            <Link href={`/join/${token}`} className="public-signup-link">
              Back to match details
            </Link>
          ) : showRequestForm ? (
            <form action={signupAction} className="public-signup-form">
              <label className="public-signup-field">
                <span className="public-signup-label">Name</span>
                <input className="public-signup-input" name="display_name" autoComplete="name" required maxLength={120} />
              </label>

              <label className="public-signup-field">
                <span className="public-signup-label">Email</span>
                <input className="public-signup-input" name="email" type="email" autoComplete="email" required />
              </label>

              <label className="public-signup-check">
                <input name="marketing_email_opt_in" type="checkbox" />
                <span className="public-signup-check-copy">
                  <span>Send me occasional PlayerHoods updates.</span>
                  <span className="public-signup-check-note">Match verification and status emails are separate.</span>
                </span>
              </label>

              <button type="submit" className="public-signup-button">
                Request a spot
              </button>
            </form>
          ) : (
            <p className="public-signup-message error">
              This match is not taking spot requests right now.
            </p>
          )}
        </section>

        <p className="public-signup-footer">
          <Link href="/">PlayerHoods</Link>
        </p>
      </main>
    </div>
  )
}
