import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  isSuperAdmin,
  isClubAdmin,
  getClub,
  getClubCourts,
  getClubAdmins,
  updateClub,
  createCourt,
  updateCourt,
  deleteCourt,
  grantClubAdmin,
  revokeClubAdmin,
  searchUsersForAdmin,
} from '@/lib/api/clubs'
import { ClubDetailShell } from './ClubDetailShell'

interface Props {
  params: Promise<{ clubId: string }>
}

export default async function ClubAdminPage({ params }: Props) {
  const { clubId } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const [superAdmin, clubAdminRole] = await Promise.all([
    isSuperAdmin(supabase),
    isClubAdmin(supabase, clubId),
  ])

  if (!superAdmin && !clubAdminRole) redirect('/matches')

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

  // ---- Server actions ----

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
      {/* Breadcrumb */}
      <nav style={{ fontSize: '0.82rem', color: '#888', marginBottom: '1.25rem' }}>
        <Link href="/matches" style={{ color: '#888', textDecoration: 'none' }}>
          Matches
        </Link>
        <span style={{ margin: '0 0.4rem' }}>›</span>
        {superAdmin && (
          <>
            <Link href="/admin/clubs" style={{ color: '#888', textDecoration: 'none' }}>
              Club Admin
            </Link>
            <span style={{ margin: '0 0.4rem' }}>›</span>
          </>
        )}
        <span>{club.name}</span>
      </nav>

      {/* Club header */}
      <header style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ margin: '0 0 0.2rem', fontSize: '1.5rem', fontWeight: 700 }}>{club.name}</h1>
        {(club.location_text || club.timezone) && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
            {[club.location_text, club.timezone].filter(Boolean).join(' · ')}
          </p>
        )}
      </header>

      {/* Tabs shell */}
      <ClubDetailShell
        club={club}
        courts={courts}
        admins={admins}
        isSuperAdmin={superAdmin}
        onUpdateClub={handleUpdateClub}
        onCreateCourt={handleCreateCourt}
        onUpdateCourt={handleUpdateCourt}
        onDeleteCourt={handleDeleteCourt}
        onSearchUsers={handleSearchUsers}
        onGrantAdmin={handleGrantAdmin}
        onRevokeAdmin={handleRevokeAdmin}
      />
    </div>
  )
}
