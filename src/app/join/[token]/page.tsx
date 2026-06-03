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
      return 'Enter an email or phone to sign up.'
    case 'sms-coming-next':
      return 'SMS verification is coming next. Please use email for this signup.'
    case 'email-invalid':
      return 'Enter a valid email address.'
    case 'match-not-active':
      return 'This match is no longer open for signup.'
    case 'link-not-found':
      return 'This signup link is no longer available.'
    case 'failed':
      return 'Could not submit your signup. Please try again.'
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
  const pageNotice =
    pageParams.notice === 'check-email'
      ? "If this signup can be verified, we'll send a verification email shortly. Please wait a few minutes before requesting another one."
      : pageParams.notice === 'already-submitted'
        ? 'If this email has already been verified, the request is already waiting for the host.'
        : null

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

        .public-signup-input-label {
          color: #526784;
          font-size: 0.74rem;
          font-weight: 820;
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
          <p className="public-signup-kicker">Open to Join</p>
          <h1 className="public-signup-title">{context.host_display_name} opened this match</h1>
          <p className="public-signup-subtext">
            Add your name and a verified contact method to ask for a spot. The host still needs to add you to the lineup.
          </p>

          <div className="public-signup-summary" aria-label="Match summary">
            <div className="public-signup-summary-type">{matchType}</div>
            <div className="public-signup-summary-venue">{venueName}</div>
            <div className="public-signup-summary-time">{matchDateTime}</div>
          </div>

          {pageNotice ? <p className="public-signup-message success">{pageNotice}</p> : null}
          {pageError ? <p className="public-signup-message error">{pageError}</p> : null}

          {context.signup_open ? (
            <form action={signupAction} className="public-signup-form">
              <label className="public-signup-field">
                <span className="public-signup-label">Name</span>
                <input className="public-signup-input" name="display_name" autoComplete="name" required maxLength={120} />
              </label>

              <fieldset className="public-signup-contact-group">
                <legend className="public-signup-label">Email or phone</legend>
                <p className="public-signup-helper">
                  We'll verify your signup by email or SMS. Email verification is available now; SMS verification is coming next.
                </p>

                <label className="public-signup-field">
                  <span className="public-signup-input-label">Email</span>
                  <input className="public-signup-input" name="email" type="email" autoComplete="email" />
                </label>

                <label className="public-signup-field">
                  <span className="public-signup-input-label">Phone</span>
                  <input className="public-signup-input" name="phone" type="tel" autoComplete="tel" />
                </label>
              </fieldset>

              <label className="public-signup-check">
                <input name="marketing_email_opt_in" type="checkbox" />
                <span>
                  Send me occasional PlayerHoods updates by email. Match-related verification and status emails are separate.
                </span>
              </label>

              <button type="submit" className="public-signup-button">
                I'd like to play
              </button>
            </form>
          ) : (
            <p className="public-signup-message error">
              This match is not open for public signup right now.
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
