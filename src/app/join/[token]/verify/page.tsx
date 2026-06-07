import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { BrandLogo } from '@/app/components/BrandLogo'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
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
          line-height: 1.35;
          margin: 14px 0 0;
          padding-left: 18px;
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
      `}</style>

      <main className="public-signup-verify-shell">
        <div className="public-signup-verify-brand">
          <BrandLogo variant="horizontal" />
        </div>

        <div className="public-signup-verify-layout">
        <section className="public-signup-verify-card">
          <p className="public-signup-verify-kicker">Join Link</p>
          <h1 className="public-signup-verify-title">
            {isVerified ? 'Request sent' : isFinishing ? 'Verify your contact' : 'Verification needs attention'}
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
                To help the host know who is joining, we&apos;re verifying the email you used for this match request. This should only take a moment.
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

        <aside className="public-signup-verify-nudge" aria-label="Create a Player Card">
          <p className="public-signup-verify-kicker">New to PlayerHoods?</p>
          <h2 className="public-signup-verify-nudge-title">Create a free Player Card</h2>
          <p className="public-signup-verify-nudge-copy">
            Create a Player Card to make joining, tracking, and hosting matches easier while keeping your contact info private.
          </p>
          <ul className="public-signup-verify-nudge-list">
            <li>Track all your matches in one place</li>
            <li>Confirm future invites faster</li>
            <li>Change your response when supported</li>
            <li>Get useful match updates</li>
            <li>Keep your phone and email private</li>
            <li>Stay connected with players you know</li>
            <li>Save trusted players to your Hood</li>
            <li>Host your own matches more easily</li>
          </ul>
          <div className="public-signup-verify-actions">
            <Link href="/login" className="public-signup-verify-button-link">Create Free Player Card</Link>
            <Link href={`/join/${publicToken}`} className="public-signup-verify-guest-link">Maybe later</Link>
          </div>
        </aside>
        </div>
      </main>
    </div>
  )
}
