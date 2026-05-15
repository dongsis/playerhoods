import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { IdentityLinkReviewCard } from '@/app/components/IdentityLinkReviewCard'
import { getIdentityLinkCandidates } from '@/lib/api/identity-links'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/supabase/server'
import { getInvitationById } from '@/lib/invitations/get-invitation-by-id'
import { acceptInvitationAsGuestAction, declineInvitationAsGuestAction } from './guest-invitation-actions'
import {
  acceptInvitationAuthenticatedAction,
  acceptInvitationIdentityLinkAndContinueAction,
  declineInvitationAuthenticatedAction,
  keepSeparateInvitationIdentityLinkAction,
} from './invitation-actions'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    notice?: string
  }>
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
    case 'failed':
      return 'Could not update this invitation. Please try again.'
    default:
      return null
  }
}

function getInvitationPageNotice(code: string | undefined): string | null {
  switch (code) {
    case 'accepted':
      return 'Invitation accepted.'
    case 'declined':
      return 'Invitation declined.'
    default:
      return null
  }
}

function formatGameType(value: string | null | undefined): string {
  if (!value) return 'Match'
  return value.replace(/_/g, ' ')
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

  const matchType = formatGameType(inv.match_summary?.game_type)
  const matchDate = formatDate(inv.match_summary?.match_date)
  const matchTime = inv.match_summary?.start_time ?? null
  const venueName = inv.match_summary?.club_name ?? null
  const matchHref = user && inv.related_type === 'match'
    ? `/matches/${inv.related_id}`
    : `/i/${id}/match`
  const pageError = getInvitationPageErrorMessage(pageParams.error)
  const pageNotice = inv.status === 'accepted' && pageParams.notice === 'accepted'
    ? null
    : getInvitationPageNotice(pageParams.notice)

  return (
    <div style={{ maxWidth: 480, margin: '1.5rem auto', padding: '0 1rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <BrandLogo variant="horizontal" />
      </div>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Match invitation</h1>

      {pageError ? (
        <div style={{ padding: '0.75rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>{pageError}</p>
        </div>
      ) : null}

      {pageNotice ? (
        <div style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>{pageNotice}</p>
        </div>
      ) : null}

      <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: '1rem', background: '#fff' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#555' }}>
          <strong>{inv.inviter_display_name}</strong> invited you to join a match.
        </p>
        <dl style={{ display: 'grid', gap: '0.45rem', margin: 0, fontSize: '0.9rem' }}>
          <div>
            <dt style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Match</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{matchType}</dd>
          </div>
          <div>
            <dt style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Date and time</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{[matchDate, matchTime].filter(Boolean).join(' at ') || 'Time to be confirmed'}</dd>
          </div>
          <div>
            <dt style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Venue</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{venueName ?? 'Venue to be confirmed'}</dd>
          </div>
        </dl>
      </div>

      {inv.status === 'accepted' && (
        <div style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#166534', fontSize: '1rem' }}>
            Invitation accepted. You're in this match.
          </h2>
          <p style={{ margin: '0.45rem 0 0', color: '#166534', fontSize: '0.85rem' }}>
            Save {inv.inviter_display_name} as a player contact after you join.
          </p>
          {inv.related_type === 'match' && (
            <Link href={matchHref} style={{ display: 'inline-block', marginTop: '0.75rem', padding: '0.55rem 0.9rem', background: '#0B1F4D', color: 'white', borderRadius: 999, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>
              View match
            </Link>
          )}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #bbf7d0' }}>
            <h3 style={{ margin: 0, color: '#0B1F4D', fontSize: '0.95rem' }}>Create your PlayerHoods account</h3>
            <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.82rem' }}>
              Manage this match, get updates, save players for next time, and join future matches faster.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <Link href={`/login?mode=register&next=${encodeURIComponent(matchHref)}`} style={{ padding: '0.5rem 0.85rem', background: '#0369a1', color: 'white', borderRadius: 999, fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}>
                Create account
              </Link>
              <Link href={matchHref} style={{ padding: '0.5rem 0.85rem', border: '1px solid #cbd5e1', color: '#0B1F4D', borderRadius: 999, fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}>
                Maybe later
              </Link>
            </div>
          </div>
        </div>
      )}

      {inv.status === 'declined' && (
        <div style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem' }}>
            You declined this invitation.
          </p>
          <p style={{ margin: '0.6rem 0 0', color: '#92400e', fontSize: '0.82rem' }}>
            You can join PlayerHoods later.
          </p>
        </div>
      )}

      {isExpired && inv.status === 'pending' && (
        <div style={{ padding: '0.75rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>This invitation has expired.</p>
        </div>
      )}

      {inv.status === 'pending' && !isExpired && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                {inv.caller_email_matches
                  ? 'You are signed in. Accept or decline here.'
                  : 'This invitation is tied to a different email. Sign in with the invited account, or open the link while signed out.'}
              </p>
              {inv.caller_email_matches ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <form action={acceptAuthenticatedAction}>
                    <button
                      type="submit"
                      style={{ padding: '0.5rem 1rem', background: '#0369a1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Accept invitation
                    </button>
                  </form>
                  <form action={declineAuthenticatedAction}>
                    <button
                      type="submit"
                      style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Decline
                    </button>
                  </form>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                You can accept or decline here.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <form action={acceptAction}>
                  <button
                    type="submit"
                    style={{ padding: '0.5rem 1rem', background: '#0369a1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    Accept invitation
                  </button>
                </form>
                <form action={declineAction}>
                  <button
                    type="submit"
                    style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    Decline
                  </button>
                </form>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem' }}>
                <Link href="/login?mode=register" style={{ color: '#0369a1' }}>
                  Join PlayerHoods later
                </Link>
              </p>
            </>
          )}
        </div>
      )}

      <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#888' }}>
        <Link href="/">PlayerHoods</Link>
      </p>
    </div>
  )
}
