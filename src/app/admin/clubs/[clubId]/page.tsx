import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  isSuperAdmin, isClubAdmin,
  getClub, getClubCourts, getClubAdmins,
  updateClub, createCourt, updateCourt, deleteCourt,
  grantClubAdmin, revokeClubAdmin, searchUsersForAdmin,
} from '@/lib/api/clubs'
import { ClubEditForm } from './ClubEditForm'
import { CourtsManager } from './CourtsManager'
import { AdminManager } from './AdminManager'

interface Props {
  params: Promise<{ clubId: string }>
}

export default async function ClubAdminPage({ params }: Props) {
  const { clubId } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const [superAdmin, clubAdmin] = await Promise.all([
    isSuperAdmin(supabase),
    isClubAdmin(supabase, clubId),
  ])

  if (!superAdmin && !clubAdmin) redirect('/matches')

  let club
  try {
    club = await getClub(supabase, clubId)
  } catch {
    notFound()
  }

  const [courts, admins] = await Promise.all([
    getClubCourts(supabase, clubId),
    superAdmin ? getClubAdmins(supabase, clubId) : Promise.resolve([]),
  ])

  // Server actions
  async function handleUpdateClub(formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await updateClub(supabase, clubId, {
      name: (formData.get('name') as string)?.trim() || undefined,
      location_text: (formData.get('location_text') as string)?.trim() || undefined,
      timezone: (formData.get('timezone') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/clubs/${clubId}`)
  }

  async function handleCreateCourt(formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await createCourt(supabase, clubId, {
      court_code: (formData.get('court_code') as string).trim(),
      surface: (formData.get('surface') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/clubs/${clubId}`)
  }

  async function handleUpdateCourt(courtId: string, formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await updateCourt(supabase, courtId, {
      court_code: (formData.get('court_code') as string)?.trim() || undefined,
      surface: (formData.get('surface') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/clubs/${clubId}`)
  }

  async function handleDeleteCourt(courtId: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await deleteCourt(supabase, courtId)
    revalidatePath(`/admin/clubs/${clubId}`)
  }

  async function handleGrantAdmin(userId: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await grantClubAdmin(supabase, userId, clubId)
    revalidatePath(`/admin/clubs/${clubId}`)
  }

  async function handleRevokeAdmin(userId: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await revokeClubAdmin(supabase, userId, clubId)
    revalidatePath(`/admin/clubs/${clubId}`)
  }

  async function handleSearchUsers(query: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    return searchUsersForAdmin(supabase, query)
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
      <nav style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        {superAdmin && <Link href="/admin/clubs">← All Clubs</Link>}
        <Link href="/matches">← Matches</Link>
      </nav>

      <h1>{club.name}</h1>
      <p style={{ color: '#666', margin: '0 0 2rem' }}>
        {club.location_text && `${club.location_text} · `}{club.timezone}
      </p>

      {/* Club info edit */}
      <section style={{ marginBottom: '2.5rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Club Info</h2>
        <ClubEditForm club={club} onSubmit={handleUpdateClub} />
      </section>

      {/* Courts management */}
      <section style={{ marginBottom: '2.5rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Courts ({courts.length})</h2>
        <CourtsManager
          courts={courts}
          onCreateCourt={handleCreateCourt}
          onUpdateCourt={handleUpdateCourt}
          onDeleteCourt={handleDeleteCourt}
        />
      </section>

      {/* Admin management (super admin only) */}
      {superAdmin && (
        <section style={{ padding: '1rem', border: '1px solid #ccc' }}>
          <h2 style={{ marginTop: 0 }}>Club Admins</h2>
          <AdminManager
            admins={admins}
            onSearch={handleSearchUsers}
            onGrant={handleGrantAdmin}
            onRevoke={handleRevokeAdmin}
          />
        </section>
      )}
    </div>
  )
}
