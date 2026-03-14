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
import { ClubDetailShell } from '../../clubs/[clubId]/ClubDetailShell'

interface Props {
  params: Promise<{ venueId: string }>
}

export default async function VenueAdminDetailPage({ params }: Props) {
  const { venueId } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const [superAdmin, venueAdminRole] = await Promise.all([
    isSuperAdmin(supabase),
    isClubAdmin(supabase, venueId),
  ])

  if (!superAdmin && !venueAdminRole) redirect('/dashboard')

  let venue
  try {
    venue = await getClub(supabase, venueId)
  } catch {
    notFound()
  }

  const [courts, admins] = await Promise.all([
    getClubCourts(supabase, venueId),
    superAdmin ? getClubAdmins(supabase, venueId) : Promise.resolve([]),
  ])

  // ---- Server actions ----

  async function handleUpdateClub(formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await updateClub(supabase, venueId, {
      name: (formData.get('name') as string)?.trim() || undefined,
      location_text: (formData.get('location_text') as string)?.trim() || undefined,
      timezone: (formData.get('timezone') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleCreateCourt(formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await createCourt(supabase, venueId, {
      court_code: (formData.get('court_code') as string).trim(),
      surface: (formData.get('surface') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleUpdateCourt(courtId: string, formData: FormData) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await updateCourt(supabase, courtId, {
      court_code: (formData.get('court_code') as string)?.trim() || undefined,
      surface: (formData.get('surface') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleDeleteCourt(courtId: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await deleteCourt(supabase, courtId)
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleGrantAdmin(userId: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await grantClubAdmin(supabase, userId, venueId)
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleRevokeAdmin(userId: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    await revokeClubAdmin(supabase, userId, venueId)
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleSearchUsers(query: string) {
    'use server'
    const supabase = await createSupabaseServerClient()
    return searchUsersForAdmin(supabase, query)
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
      <nav style={{ fontSize: '0.82rem', color: '#888', marginBottom: '1.25rem' }}>
        <Link href="/dashboard" style={{ color: '#888', textDecoration: 'none' }}>Dashboard</Link>
        <span style={{ margin: '0 0.4rem' }}>›</span>
        {superAdmin && (
          <>
            <Link href="/admin/venues" style={{ color: '#888', textDecoration: 'none' }}>Venue Admin</Link>
            <span style={{ margin: '0 0.4rem' }}>›</span>
          </>
        )}
        <span>{venue.name}</span>
      </nav>

      <header style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ margin: '0 0 0.2rem', fontSize: '1.5rem', fontWeight: 700 }}>{venue.name}</h1>
        {(venue.location_text || venue.timezone) && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
            {[venue.location_text, venue.timezone].filter(Boolean).join(' · ')}
          </p>
        )}
      </header>

      <ClubDetailShell
        club={venue}
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
