import Link from 'next/link'
import type { Club, ClubAdminWithDetails } from '@/lib/types/database'

interface Props {
  club: Club
  admins: ClubAdminWithDetails[]
}

export function ClubCard({ club, admins }: Props) {
  const adminSummary =
    admins.length === 0
      ? 'No admins'
      : admins
          .slice(0, 3)
          .map(a => a.profile?.display_name || '—')
          .join(', ') + (admins.length > 3 ? ` +${admins.length - 3} more` : '')

  return (
    <div
      style={{
        border: '1px solid #e2e2e2',
        borderRadius: '7px',
        padding: '0.9rem 1.1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '1rem',
        background: '#fafafa',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: '0.15rem' }}>{club.name}</div>
        {(club.location_text || club.timezone) && (
          <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.15rem' }}>
            {[club.location_text, club.timezone].filter(Boolean).join(' · ')}
          </div>
        )}
        <div style={{ fontSize: '0.77rem', color: '#999' }}>{adminSummary}</div>
      </div>
      <Link
        href={`/admin/clubs/${club.id}`}
        style={{
          padding: '0.3rem 0.75rem',
          background: '#111',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: '4px',
          fontSize: '0.8rem',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Manage →
      </Link>
    </div>
  )
}
