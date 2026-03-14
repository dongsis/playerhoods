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

  const matchStr = inv.match_summary
    ? [inv.match_summary.game_type, inv.match_summary.match_date, inv.match_summary.club_name]
        .filter(Boolean)
        .join(' · ') || 'Match'
    : 'Match'

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Invitation</h1>

      <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: '1rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#555' }}>
          <strong>{inv.inviter_display_name}</strong> invited you to a match.
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>{matchStr}</p>
      </div>

      {inv.status === 'accepted' && (
        <div style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>You accepted this invitation.</p>
          {inv.related_type === 'match' && (
            <Link href={`/matches/${inv.related_id}`} style={{ display: 'inline-block', marginTop: '0.5rem', color: '#0369a1', fontSize: '0.85rem' }}>
              View match →
            </Link>
          )}
        </div>
      )}

      {inv.status === 'declined' && (
        <div style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: '1rem' }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem' }}>You declined this invitation.</p>
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
            Respond to this invitation for the current match.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <form action={acceptAction}>
              <button
                type="submit"
                style={{ padding: '0.5rem 1rem', background: '#0369a1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Yes, I can come
              </button>
            </form>
            <form action={declineAction}>
              <button
                type="submit"
                style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                No, I can&apos;t come
              </button>
            </form>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
            <Link href="/login?mode=register" style={{ color: '#0369a1' }}>
              Register for PlayerHoods
            </Link>
          </p>
        </div>
      )}

      <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#888' }}>
        <Link href="/">Playerhoods</Link>
      </p>
    </div>
  )
}
