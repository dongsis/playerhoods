import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { isSuperAdmin, getAllClubs, getMyAdminClubs, getClubAdmins } from '@/lib/api/clubs'
import { ClubCard } from './ClubCard'
import { CreateClubDialog } from './CreateClubDialog'

export default async function AdminClubsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const superAdmin = await isSuperAdmin(supabase)

  let clubs
  if (superAdmin) {
    clubs = await getAllClubs(supabase)
  } else {
    const myAdminClubs = await getMyAdminClubs(supabase)
    if (myAdminClubs.length === 0) redirect('/dashboard')
    clubs = myAdminClubs.map(r => r.club)
  }

  const adminsPerClub = await Promise.all(
    clubs.map(c => getClubAdmins(supabase, c.id).catch(() => []))
  )
  const clubsWithAdmins = clubs.map((c, i) => ({ club: c, admins: adminsPerClub[i] }))

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: '0.82rem', color: '#888', marginBottom: '1.25rem' }}>
        <Link href="/dashboard" style={{ color: '#888', textDecoration: 'none' }}>
          Dashboard
        </Link>
        <span style={{ margin: '0 0.4rem' }}>›</span>
        <span>Club Admin</span>
      </nav>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Clubs</h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#666' }}>
            {clubs.length} club{clubs.length !== 1 ? 's' : ''}
          </p>
        </div>
        {superAdmin && <CreateClubDialog />}
      </div>

      {/* Club cards */}
      {clubsWithAdmins.length === 0 ? (
        <p style={{ color: '#aaa', textAlign: 'center', padding: '3rem 0' }}>No clubs yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {clubsWithAdmins.map(({ club, admins }) => (
            <ClubCard key={club.id} club={club} admins={admins} />
          ))}
        </div>
      )}
    </div>
  )
}
