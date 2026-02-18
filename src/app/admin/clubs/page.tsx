import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { isSuperAdmin, getAllClubs, getClubAdmins, createClub } from '@/lib/api/clubs'
import type { Club } from '@/lib/types/database'
import { CreateClubForm } from './CreateClubForm'
import { revalidatePath } from 'next/cache'

export default async function AdminClubsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const superAdmin = await isSuperAdmin(supabase)
  if (!superAdmin) redirect('/matches')

  const clubs = await getAllClubs(supabase)

  // Fetch admins for all clubs in parallel
  const adminsPerClub = await Promise.all(
    clubs.map(c => getClubAdmins(supabase, c.id).catch(() => []))
  )
  const clubsWithAdmins = clubs.map((c, i) => ({ ...c, admins: adminsPerClub[i] }))

  async function handleCreateClub(formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    const name = formData.get('name') as string
    const location_text = formData.get('location_text') as string
    const timezone = formData.get('timezone') as string
    const notes = formData.get('notes') as string

    await createClub(supabase, {
      name: name.trim(),
      location_text: location_text?.trim() || undefined,
      timezone: timezone?.trim() || 'America/Toronto',
      notes: notes?.trim() || undefined,
    })
    revalidatePath('/admin/clubs')
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/matches">← Back</Link>
      </nav>

      <h1>Club Admin Dashboard</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Manage clubs and their admins. Club admins can update club info and manage courts.
      </p>

      {/* Create Club */}
      <section style={{ marginBottom: '2.5rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Create Club</h2>
        <CreateClubForm onSubmit={handleCreateClub} />
      </section>

      {/* Clubs list */}
      <section>
        <h2>All Clubs ({clubs.length})</h2>
        {clubsWithAdmins.length === 0 && <p style={{ color: '#888' }}>No clubs yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {clubsWithAdmins.map(club => (
            <div
              key={club.id}
              style={{
                padding: '1rem',
                border: '1px solid #ddd',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div>
                <strong>{club.name}</strong>
                {club.location_text && (
                  <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                    · {club.location_text}
                  </span>
                )}
                <span style={{ marginLeft: '0.5rem', color: '#888', fontSize: '0.85rem' }}>
                  · {club.timezone}
                </span>
                <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#555' }}>
                  Admins:{' '}
                  {club.admins.length === 0
                    ? <span style={{ color: '#aaa' }}>none</span>
                    : club.admins.map(a => a.profile?.display_name || a.user_id.slice(0, 8)).join(', ')
                  }
                </div>
              </div>
              <Link
                href={`/admin/clubs/${club.id}`}
                style={{
                  padding: '0.4rem 0.8rem',
                  background: '#333',
                  color: 'white',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                }}
              >
                Manage →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
