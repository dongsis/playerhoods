import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getInvitationById } from '@/lib/invitations/get-invitation-by-id'
import { acceptInvitationAsGuestAction, declineInvitationAsGuestAction } from './guest-invitation-actions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function InvitationPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const inv = await getInvitationById(supabase, id)
  if (!inv) notFound()

  const isExpired = inv.expires_at ? new Date(inv.expires_at) < new Date() : false
  const acceptAction = acceptInvitationAsGuestAction.bind(null, id)
  const declineAction = declineInvitationAsGuestAction.bind(null, id)
  const isMatchProxyBinding = inv.related_type === 'match_proxy_binding'

  const matchStr = inv.match_summary
    ? [inv.match_summary.game_type, inv.match_summary.match_date, inv.match_summary.club_name]
        .filter(Boolean)
        .join(' · ') || 'Match'
    : 'Match'

  const title = isMatchProxyBinding ? 'Match proxy request' : 'Match invitation'
  const introText = isMatchProxyBinding
    ? <><strong>{inv.inviter_display_name}</strong> requested permission to help manage your match participation.</>
    : <><strong>{inv.inviter_display_name}</strong> invited you to join a match.</>
  const summaryText = isMatchProxyBinding
    ? 'If you accept, this person can confirm, decline, or withdraw your match participation on your behalf. You still keep full control of your own participation.'
    : matchStr
  const pendingText = isMatchProxyBinding
    ? 'Use this private verification link to approve or reject this Match Proxy request. You do not need a PlayerHoods account to respond.'
    : 'Use this private invitation link to accept or decline this match invitation. You do not need a PlayerHoods account to respond.'

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>{title}</h1>

      <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: '1rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#555' }}>
          {introText}
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>{summaryText}</p>
      </div>

      {inv.status === 'accepted' && (
        <div style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>
            {isMatchProxyBinding ? 'You approved this Match Proxy request.' : 'You accepted this invitation.'}
          </p>
          {inv.related_type === 'match' && (
            <Link href={`/matches/${inv.related_id}`} style={{ display: 'inline-block', marginTop: '0.5rem', color: '#0369a1', fontSize: '0.85rem' }}>
              View match →
            </Link>
          )}
          {!isMatchProxyBinding && (
            <p style={{ margin: '0.6rem 0 0', color: '#166534', fontSize: '0.82rem' }}>
              Want to keep playing with friends here? Joining the PlayerHoods community is optional, and you can do it anytime later.
            </p>
          )}
        </div>
      )}

      {inv.status === 'declined' && (
        <div style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem' }}>
            {isMatchProxyBinding ? 'You declined this Match Proxy request.' : 'You declined this invitation.'}
          </p>
          {!isMatchProxyBinding && (
            <p style={{ margin: '0.6rem 0 0', color: '#92400e', fontSize: '0.82rem' }}>
              You&apos;re still welcome to join the PlayerHoods community later if you&apos;d like to stay connected and play with friends.
            </p>
          )}
        </div>
      )}

      {isExpired && inv.status === 'pending' && (
        <div style={{ padding: '0.75rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>This invitation has expired.</p>
        </div>
      )}

      {inv.status === 'pending' && !isExpired && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
            {pendingText}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <form action={acceptAction}>
              <button
                type="submit"
                style={{ padding: '0.5rem 1rem', background: '#0369a1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                {isMatchProxyBinding ? 'Approve proxy' : 'Accept invitation'}
              </button>
            </form>
            <form action={declineAction}>
              <button
                type="submit"
                style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                {isMatchProxyBinding ? 'Decline request' : 'Decline'}
              </button>
            </form>
          </div>
          {!isMatchProxyBinding && (
            <>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                If you enjoy playing with this group, you&apos;re also welcome to join the PlayerHoods community later and organize more games with friends.
              </p>
              <p style={{ margin: 0, fontSize: '0.82rem' }}>
                <Link href="/login?mode=register" style={{ color: '#0369a1' }}>
                  Optional: join PlayerHoods later
                </Link>
              </p>
            </>
          )}
        </div>
      )}

      <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#888' }}>
        <Link href="/">Playerhoods</Link>
      </p>
    </div>
  )
}
