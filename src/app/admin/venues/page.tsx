import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { isSuperAdmin, getAllVenues, getMyAdminVenues } from '@/lib/api/venues'
import { CreateVenueDialog } from '../venues/CreateVenueDialog'

export default async function AdminVenuesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const superAdmin = await isSuperAdmin(supabase)

  let venues
  if (superAdmin) {
    venues = await getAllVenues(supabase)
  } else {
    const myAdminVenues = await getMyAdminVenues(supabase)
    if (myAdminVenues.length === 0) redirect('/dashboard')
    venues = myAdminVenues.map(r => r.venue)
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '1.5rem' }}>
      <nav style={{ fontSize: '0.82rem', color: '#888', marginBottom: '1.25rem' }}>
        <Link href="/dashboard" style={{ color: '#888', textDecoration: 'none' }}>Dashboard</Link>
        <span style={{ margin: '0 0.4rem' }}>›</span>
        <span>Venue Admin</span>
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Venues</h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#666' }}>
            {venues.length} venue{venues.length !== 1 ? 's' : ''}
          </p>
        </div>
        {superAdmin && <CreateVenueDialog />}
      </div>

      {venues.length === 0 ? (
        <p style={{ color: '#aaa', textAlign: 'center', padding: '3rem 0' }}>No venues yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {venues.map(v => (
            <Link
              key={v.id}
              href={`/admin/venues/${v.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  padding: '0.85rem 1rem',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{v.name}</div>
                {(v.location_text || v.timezone) && (
                  <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.15rem' }}>
                    {[v.location_text, v.timezone].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
