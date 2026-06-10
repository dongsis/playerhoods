import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { createSupabasePublicServerClient, createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getAbsoluteUrl } from '@/lib/site-url'
import { requestRegisteredPublicMatchSpotAction, startPublicMatchSignupAction } from './actions'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    error?: string
    notice?: string
    intent?: string
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

type PublicSignupContextResult = {
  context: PublicSignupContext | null
  error: boolean
}

type RegisteredParticipantState = {
  id: string
  status: string
  join_method: string | null
  org_approved_at: string | null
  participant_accepted_at: string | null
  confirmed_at: string | null
  removed_at: string | null
}

type RegisteredRequestState = {
  title: string
  subtext: string
  note: string | null
  message: string
  statusLabel: string
  variant: 'success' | 'error'
}

type PlayerCardIdentity = {
  display_name: string | null
  avatar_url: string | null
  level: string | null
}

type PublicJoinStatus = {
  title: string
  subtext: string
  badge: string
  variant: 'success' | 'warning' | 'error' | 'neutral'
}

type MatchDetailStatus = {
  label: string
  variant: PublicJoinStatus['variant']
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

async function getPublicSignupContextResult(token: string): Promise<PublicSignupContextResult> {
  const publicSupabase = createSupabasePublicServerClient()
  const { data, error } = await publicSupabase.rpc('rpc_public_match_signup_context', {
    p_public_token: token,
  })

  return {
    context: ((data ?? []) as PublicSignupContext[])[0] ?? null,
    error: Boolean(error),
  }
}

function getPublicJoinMetadataCopy(context: PublicSignupContext) {
  const matchType = formatGameType(context.game_type ?? context.sport_name)
  const venueName = context.venue_name?.trim() || null
  const matchDate = formatDate(context.match_date)
  const matchTime = formatTime(context.start_time)
  const matchDateTime = [matchDate, matchTime].filter(Boolean).join(', ')
  const matchLabel = `${matchType}${venueName ? ` at ${venueName}` : ''}`
  const title = `${[matchLabel, matchDateTime].filter(Boolean).join(' - ')} | PlayerHoods`
  const description = [
    matchLabel,
    matchDateTime ? `on ${matchDateTime}` : null,
    "View match details and let the host know if you're interested.",
  ].filter(Boolean).join(' ')

  return { title, description }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const canonicalUrl = getAbsoluteUrl(`/join/${encodeURIComponent(token)}`)

  if (!isUuid(token)) {
    return {
      title: 'Join a match | PlayerHoods',
      description: "View match details and let the host know if you're interested.",
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const { context } = await getPublicSignupContextResult(token)
  const fallbackTitle = 'Join a match | PlayerHoods'
  const fallbackDescription = "View match details and let the host know if you're interested."
  const { title, description } = context
    ? getPublicJoinMetadataCopy(context)
    : { title: fallbackTitle, description: fallbackDescription }

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'PlayerHoods',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    robots: context
      ? undefined
      : {
          index: false,
          follow: false,
        },
  }
}

function getRegisteredRequestState(
  participant: RegisteredParticipantState | null,
  requestSentNotice: boolean,
): RegisteredRequestState | null {
  if (participant?.status === 'confirmed') {
    return {
      title: "You're in for this match",
      subtext: "You're in for this match.",
      note: null,
      message: "You're in.",
      statusLabel: "You're in",
      variant: 'success',
    }
  }

  if (participant?.status === 'waiting_list') {
    return {
      title: 'You are on the waitlist',
      subtext: 'Your spot is on the waitlist for this match.',
      note: "We'll let you know if there's a spot for you.",
      message: 'Waitlisted.',
      statusLabel: 'Waitlisted',
      variant: 'success',
    }
  }

  if (participant || requestSentNotice) {
    return {
      title: 'The host has your response',
      subtext: "You're marked interested for this match.",
      note: "We'll let you know if there's a spot for you.",
      message: "You're marked interested. The host is checking availability.",
      statusLabel: 'Host is checking availability',
      variant: 'success',
    }
  }

  return null
}

function getRegisteredUnavailableState(context: PublicSignupContext): RegisteredRequestState | null {
  if (context.match_status === 'cancelled') {
    return {
      title: 'This match is cancelled',
      subtext: 'This match is no longer taking responses.',
      note: null,
      message: 'Cancelled.',
      statusLabel: 'Cancelled',
      variant: 'error',
    }
  }

  if (context.match_status === 'formed') {
    return {
      title: 'This match has already been formed',
      subtext: 'The group for this match is already set.',
      note: null,
      message: 'Group is set.',
      statusLabel: 'Group is set',
      variant: 'success',
    }
  }

  if (!context.signup_open || context.match_status !== 'active') {
    return {
      title: 'This match is closed',
      subtext: 'This match is not taking responses right now.',
      note: null,
      message: 'Closed.',
      statusLabel: 'Closed',
      variant: 'error',
    }
  }

  return null
}

function getGuestStatus(context: PublicSignupContext, notice?: string, error?: string, intent?: string): PublicJoinStatus {
  if (error === 'link-not-found') {
    return {
      title: 'This link is no longer available',
      subtext: 'Ask the host for a fresh share link if you still want to join this match.',
      badge: 'Link unavailable',
      variant: 'error',
    }
  }

  if (context.match_status === 'cancelled') {
    return {
      title: 'This match is cancelled',
      subtext: 'The host cancelled this match, so the share link is no longer taking responses.',
      badge: 'Cancelled',
      variant: 'error',
    }
  }

  if (context.match_status === 'formed') {
    return {
      title: 'This match has been formed',
      subtext: 'The group for this match is already set. You can still review the details here.',
      badge: 'Group is set',
      variant: 'success',
    }
  }

  if (!context.signup_open || context.match_status !== 'active') {
    return {
      title: 'This match is not taking responses',
      subtext: 'The host is not taking new responses from this link right now.',
      badge: 'Closed',
      variant: 'error',
    }
  }

  if (notice === 'sms-pending') {
    return {
      title: 'Check your texts',
      subtext: "We texted you a link for this match. Reply JOIN or tap the link to let the host know you're interested.",
      badge: 'Waiting for your text',
      variant: 'neutral',
    }
  }

  if (notice === 'already-submitted' || notice === 'request-sent') {
    return {
      title: 'The host has your response',
      subtext: "You're marked interested for this match.",
      badge: 'Host is checking availability',
      variant: 'success',
    }
  }

  if (intent === 'withdraw') {
    return {
      title: 'Review your response',
      subtext: 'Guest withdraw is not available safely from this link yet. If you need to change plans, contact the host.',
      badge: 'Action unavailable',
      variant: 'warning',
    }
  }

  if (intent === 'change-response') {
    return {
      title: 'Review your response',
      subtext: 'Changing a guest response is not available safely from this link yet. You can ask the host to update your status.',
      badge: 'Action unavailable',
      variant: 'warning',
    }
  }

  if (intent === 'review-changes') {
    return {
      title: 'Review match details',
      subtext: "Check the latest safe match details below before deciding whether to let the host know you're interested.",
      badge: 'Review details',
      variant: 'neutral',
    }
  }

  return {
    title: 'Want to play?',
    subtext: "Choose how you'd like to let the host know you're interested.",
    badge: "Seeing who's free",
    variant: 'neutral',
  }
}

function getMatchDetailStatus(
  context: PublicSignupContext | null,
  registeredRequestState: RegisteredRequestState | null,
  guestStatus: PublicJoinStatus | null,
  isSmsPending: boolean,
  isAlreadySubmitted: boolean,
): MatchDetailStatus {
  if (registeredRequestState) {
    return {
      label: registeredRequestState.statusLabel,
      variant: registeredRequestState.variant,
    }
  }

  if (!context) {
    return {
      label: 'Link unavailable',
      variant: 'error',
    }
  }

  if (isSmsPending) {
    return {
      label: 'Waiting for your text',
      variant: 'neutral',
    }
  }

  if (isAlreadySubmitted) {
    return {
      label: 'Host is checking availability',
      variant: 'success',
    }
  }

  if (guestStatus) {
    return {
      label: guestStatus.badge,
      variant: guestStatus.variant,
    }
  }

  if (context.match_status === 'cancelled') {
    return {
      label: 'Cancelled',
      variant: 'error',
    }
  }

  if (context.match_status === 'formed') {
    return {
      label: 'Group is set',
      variant: 'success',
    }
  }

  if (!context.signup_open || context.match_status !== 'active') {
    return {
      label: 'Closed',
      variant: 'error',
    }
  }

  return {
    label: "Seeing who's free",
    variant: 'neutral',
  }
}

function PlayerCardNudge({
  guestHref = '#guest-request',
  guestLabel = 'Join with mobile number',
}: {
  guestHref?: string
  guestLabel?: string
} = {}) {
  return (
    <aside className="public-player-card-nudge" aria-label="Create a free account">
      <p className="public-player-card-kicker">New to PlayerHoods?</p>
      <h2 className="public-player-card-title">Create a free account</h2>
      <ul className="public-player-card-list">
        <li><span aria-hidden="true">✓</span> Join matches faster and host with less work</li>
        <li><span aria-hidden="true">✓</span> Track updates, change responses, and manage your match status in one place</li>
        <li><span aria-hidden="true">✓</span> Communicate more easily in match chat and group chat</li>
        <li><span aria-hidden="true">✓</span> Save trusted players to your Hood and stay connected through groups</li>
      </ul>
      <div className="public-player-card-actions">
        <Link href="/login" className="public-signup-button public-signup-button-secondary">Create Free Account</Link>
        <a href={guestHref} className="public-player-card-later">{guestLabel}</a>
      </div>
    </aside>
  )
}

function getErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'name-required':
      return 'Name is required.'
    case 'contact-required':
    case 'phone-required':
      return 'Enter a mobile number so we can text you this match.'
    case 'phone-invalid':
      return 'Enter a valid 10-digit US or Canadian mobile number.'
    case 'sms-opted-out':
      return 'This number is opted out of PlayerHoods match texts. Reply START to a previous PlayerHoods text to opt back in, or use a free account.'
    case 'match-not-active':
      return 'This match is no longer taking responses.'
    case 'link-not-found':
      return 'This join link is no longer available.'
    case 'sign-in-required':
      return "Sign in before letting the host know you're interested."
    case 'organizer-cannot-request':
      return "Hosts can't respond to their own match link."
    case 'sms-delivery-unavailable':
      return 'Could not text you this match. Please try again shortly.'
    case 'request-throttled':
      return "We couldn't process your response right now. Please try again shortly."
    case 'failed':
      return 'Could not send your response. Please try again.'
    default:
      return null
  }
}

export default async function PublicMatchSignupPage({ params, searchParams }: Props) {
  const { token } = await params
  const pageParams = await searchParams
  if (!isUuid(token)) notFound()

  const { context, error } = await getPublicSignupContextResult(token)
  if (error) notFound()

  const linkUnavailable = !context

  const user = context ? await getUser() : null
  let registeredParticipant: RegisteredParticipantState | null = null
  let playerCardIdentity: PlayerCardIdentity | null = null

  if (user && context) {
    const supabase = await createSupabaseServerClient()
    const [{ data: participant }, { data: profile }] = await Promise.all([
      supabase
        .from('match_participants')
        .select('id,status,join_method,org_approved_at,participant_accepted_at,confirmed_at,removed_at')
        .eq('match_id', context.match_id)
        .eq('user_id', user.id)
        .is('removed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('display_name,avatar_url,level')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    registeredParticipant = (participant as RegisteredParticipantState | null) ?? null
    playerCardIdentity = (profile as PlayerCardIdentity | null) ?? null
  }

  const signupAction = startPublicMatchSignupAction.bind(null, token)
  const registeredRequestAction = requestRegisteredPublicMatchSpotAction.bind(null, token)
  const matchType = context ? formatGameType(context.game_type ?? context.sport_name) : 'Link unavailable'
  const matchDate = context ? formatDate(context.match_date) : null
  const matchTime = context ? formatTime(context.start_time) : null
  const matchDateTime = context
    ? [matchDate, matchTime].filter(Boolean).join(' - ') || 'Time to be confirmed'
    : 'Ask the host for a fresh share link'
  const venueName = context?.venue_name ?? 'Match details unavailable'
  const pageError = getErrorMessage(pageParams.error)
  const isAlreadySubmitted = pageParams.notice === 'already-submitted' || pageParams.notice === 'request-sent'
  const isSmsPending = pageParams.notice === 'sms-pending'
  const isRegisteredRequestSent = pageParams.notice === 'registered-requested'
  const isRegisteredRequestBlocked = pageParams.error === 'organizer-cannot-request'
  const registeredRequestState = user && context
    ? getRegisteredRequestState(registeredParticipant, isRegisteredRequestSent) ?? getRegisteredUnavailableState(context)
    : null
  const guestStatus = !user
    ? context
      ? getGuestStatus(context, pageParams.notice, pageParams.error, pageParams.intent)
      : {
          title: 'This link is no longer available',
          subtext: 'Ask the host for a fresh share link if you still want to join this match.',
          badge: 'Link unavailable',
          variant: 'error' as const,
        }
    : null
  const showPublicSmsPending = !user && isSmsPending
  const showPublicAlreadySubmitted = !user && isAlreadySubmitted
  const showRegisteredRequestButton = Boolean(
    user && context?.signup_open && !registeredRequestState && !isRegisteredRequestBlocked,
  )
  const showRequestForm = Boolean(!user && context?.signup_open && !isSmsPending && !isAlreadySubmitted)
  const pageTitle = registeredRequestState?.title
    ?? guestStatus?.title
    ?? (showPublicAlreadySubmitted ? 'The host has your response' : showPublicSmsPending ? 'Check your texts' : 'Want to play?')
  const guestNudgeHref = linkUnavailable
    ? '/'
    : (showPublicSmsPending || showPublicAlreadySubmitted)
      ? `/join/${token}`
      : '#guest-request'
  const guestNudgeLabel = linkUnavailable
    ? 'Maybe later'
    : (showPublicSmsPending || showPublicAlreadySubmitted)
      ? 'Back to match details'
      : 'Join with mobile number'
  const showGuestStatusBadge = Boolean(
    guestStatus && guestStatus.variant !== 'neutral',
  )
  const matchDetailStatus = getMatchDetailStatus(
    context,
    registeredRequestState,
    guestStatus,
    showPublicSmsPending,
    showPublicAlreadySubmitted,
  )

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
          width: min(100%, 1040px);
          margin: 0 auto;
        }

        .public-signup-layout {
          align-items: start;
          display: grid;
          gap: 18px;
        }

        @media (min-width: 860px) {
          .public-signup-layout {
            grid-template-columns: minmax(0, 1fr) 320px;
          }
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

        .public-signup-status-row {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: space-between;
          margin-top: 4px;
        }

        .public-signup-status-label {
          color: #526784;
          font-size: 0.9rem;
          font-weight: 800;
        }

        .public-signup-status-pill {
          border-radius: 999px;
          display: inline-flex;
          font-size: 0.82rem;
          font-weight: 900;
          line-height: 1;
          padding: 8px 11px;
        }

        .public-signup-status-pill.success {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
        }

        .public-signup-status-pill.error {
          background: #fff5f5;
          border: 1px solid #fecaca;
          color: #b42318;
        }

        .public-signup-status-pill.warning {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }

        .public-signup-status-pill.neutral {
          background: #eef6ff;
          border: 1px solid #c9def6;
          color: #2554d9;
        }

        .public-response-options {
          display: grid;
          gap: 18px;
          max-width: 560px;
        }

        .public-response-section {
          border-top: 1px solid #d9e6f4;
          display: grid;
          gap: 12px;
          padding-top: 18px;
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

        .public-signup-message.warning {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }

        .public-signup-message.neutral {
          background: #f8fbff;
          border: 1px solid #d9e6f4;
          color: #405474;
        }

        .public-signup-button-secondary {
          background: #2554d9;
          color: #fff;
          text-decoration: none;
        }

        .public-player-card-nudge,
        .public-signed-in-card {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid #d5e2f2;
          border-radius: 24px;
          box-shadow: 0 12px 30px rgba(17, 42, 84, 0.06);
          padding: 20px;
        }

        .public-player-card-kicker,
        .public-signed-in-kicker {
          color: #7c8eaa;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          margin: 0 0 10px;
          text-transform: uppercase;
        }

        .public-player-card-title,
        .public-signed-in-title {
          color: #06183d;
          font-size: 1.12rem;
          font-weight: 950;
          line-height: 1.2;
          margin: 0;
        }

        .public-player-card-copy,
        .public-signed-in-copy {
          color: #405474;
          font-size: 0.9rem;
          font-weight: 700;
          line-height: 1.5;
          margin: 10px 0 0;
        }

        .public-player-card-list {
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

        .public-player-card-list li {
          display: grid;
          gap: 8px;
          grid-template-columns: auto 1fr;
        }

        .public-player-card-actions {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 16px;
        }

        .public-player-card-later {
          color: #2554d9;
          font-size: 0.88rem;
          font-weight: 850;
          text-decoration: none;
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

        <div className="public-signup-layout">
        <section className="public-signup-card">
          <p className="public-signup-kicker">Join Link</p>
          <h1 className="public-signup-title">{pageTitle}</h1>
          {registeredRequestState ? (
            <>
              <p className="public-signup-subtext">{registeredRequestState.subtext}</p>
              {registeredRequestState.note ? (
                <p className="public-signup-note">{registeredRequestState.note}</p>
              ) : null}
            </>
          ) : showPublicAlreadySubmitted ? (
            <p className="public-signup-subtext">
              You&apos;re marked interested for this match. We&apos;ll text you if there&apos;s a spot for you.
            </p>
          ) : showPublicSmsPending ? (
            <>
              <p className="public-signup-subtext">
                We texted you a link for this match. Reply JOIN or tap the link to let the host know you&apos;re interested.
              </p>
              <p className="public-signup-note">
                Your response is not sent until you respond from your phone.
              </p>
            </>
          ) : user ? (
            <>
              <p className="public-signup-subtext">
                You&apos;re signed in. Let the host know you&apos;re interested using your PlayerHoods account.
              </p>
              <p className="public-signup-note">
                The host is seeing who&apos;s free for this match.
              </p>
            </>
          ) : guestStatus ? (
            <>
              <p className="public-signup-subtext">{guestStatus.subtext}</p>
              {showGuestStatusBadge ? (
                <p className={`public-signup-message ${guestStatus.variant}`}>{guestStatus.badge}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="public-signup-subtext">
                Add your name and mobile number. We&apos;ll text you a link for this match.
              </p>
              <p className="public-signup-note">
                Reply or tap the link to let the host know you&apos;re interested.
              </p>
            </>
          )}

          <div className="public-signup-summary" aria-label="Match summary">
            <div className="public-signup-summary-heading">Match details</div>
            <div className="public-signup-summary-type">{matchType}</div>
            <div className="public-signup-summary-venue">{venueName}</div>
            <div className="public-signup-summary-time">{matchDateTime}</div>
            <div className="public-signup-summary-host">Host: {context?.host_display_name || 'Unavailable'}</div>
            <div className="public-signup-status-row">
              <span className="public-signup-status-label">Status</span>
              <span className={`public-signup-status-pill ${matchDetailStatus.variant}`}>{matchDetailStatus.label}</span>
            </div>
          </div>

          {pageError ? <p className="public-signup-message error">{pageError}</p> : null}
          {registeredRequestState ? (
            <p className={`public-signup-message ${registeredRequestState.variant}`}>{registeredRequestState.message}</p>
          ) : null}

          {showPublicSmsPending ? (
            <>
              <p className="public-signup-help">
                Can&apos;t find the text? Check that your mobile number was entered correctly, then try again in a few minutes.
              </p>
              <Link href={`/join/${token}`} className="public-signup-link">
                Back to match details
              </Link>
            </>
          ) : showPublicAlreadySubmitted ? (
            <Link href={`/join/${token}`} className="public-signup-link">
              Back to match details
            </Link>
          ) : registeredRequestState ? (
            <Link href={`/join/${token}`} className="public-signup-link">
              Back to match details
            </Link>
          ) : showRegisteredRequestButton ? (
            <form action={registeredRequestAction} className="public-signup-form">
              <button type="submit" className="public-signup-button">
                I&apos;d like to play
              </button>
            </form>
          ) : user && isRegisteredRequestBlocked ? (
            <Link href={`/join/${token}`} className="public-signup-link">
              Back to match details
            </Link>
          ) : linkUnavailable ? (
            <Link href="/" className="public-signup-link">
              Back to PlayerHoods
            </Link>
          ) : showRequestForm ? (
            <div className="public-response-options" aria-label="Ways to respond">
              <section className="public-response-section">
                <h2 className="public-player-card-title">Join with your PlayerHoods account</h2>
                <p className="public-signup-helper">
                  Sign in or create an account to let the host know you&apos;re interested and keep track of match updates.
                </p>
                <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`} className="public-signup-button public-signup-button-secondary">
                  Create account or sign in
                </Link>
              </section>
              <form id="guest-request" action={signupAction} className="public-response-section public-signup-form">
                <h2 className="public-player-card-title">Join with your mobile number</h2>
                <p className="public-signup-helper">
                  No account needed. Tell the host who you are and we&apos;ll text you a link for this match.
                </p>
                <label className="public-signup-field">
                  <span className="public-signup-label">Name</span>
                  <input className="public-signup-input" name="display_name" autoComplete="name" required maxLength={120} />
                </label>

                <label className="public-signup-field">
                  <span className="public-signup-label">Mobile number</span>
                  <input className="public-signup-input" name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
                </label>

                <p className="public-signup-helper">
                  We&apos;ll text you a link for this match. Reply or tap the link to let the host know you&apos;re interested.
                </p>
                <p className="public-signup-helper">
                  We&apos;ll use this number for this match, match updates, and future invitations from this host. Message rates may apply. Reply STOP to opt out.
                </p>

                <button type="submit" className="public-signup-button">
                  Text me a join link
                </button>
              </form>
            </div>
          ) : (
            <p className="public-signup-message error">
              This match is not taking responses right now.
            </p>
          )}
        </section>

        {user ? (
          <aside className="public-signed-in-card" aria-label="Signed-in PlayerHoods account">
            <p className="public-signed-in-kicker">Signed in as</p>
            <h2 className="public-signed-in-title">{playerCardIdentity?.display_name ?? user.email ?? 'Signed-in player'}</h2>
            <p className="public-signed-in-copy">
              {registeredRequestState
                ? 'The host has your response through your PlayerHoods account.'
                : "Use your PlayerHoods account to let the host know you're interested and track match updates."}
            </p>
            {playerCardIdentity?.level ? (
              <p className="public-signed-in-copy">Level: {playerCardIdentity.level}</p>
            ) : null}
          </aside>
        ) : (
          <PlayerCardNudge
            guestHref={guestNudgeHref}
            guestLabel={guestNudgeLabel}
          />
        )}
        </div>

        <p className="public-signup-footer">
          <Link href="/">PlayerHoods</Link>
        </p>
      </main>
    </div>
  )
}
