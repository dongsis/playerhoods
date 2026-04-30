import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  createCourt,
  deleteCourt,
  getVenue,
  getVenueAdmins,
  getVenueCourts,
  grantVenueAdmin,
  isSuperAdmin,
  isVenueAdmin,
  revokeVenueAdmin,
  searchUsersForAdmin,
  updateCourt,
  updateVenue,
} from '@/lib/api/venues'
import { listSports } from '@/lib/api/sports'
import { getVenueDisplayName } from '@/lib/venues/display'
import { VenueDetailShell } from '../../venues/[venueId]/VenueDetailShell'

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
    isVenueAdmin(supabase, venueId),
  ])

  if (!superAdmin && !venueAdminRole) redirect('/dashboard')

  let venue
  try {
    venue = await getVenue(supabase, venueId)
  } catch {
    notFound()
  }

  const [courts, admins, sports] = await Promise.all([
    getVenueCourts(supabase, venueId),
    superAdmin ? getVenueAdmins(supabase, venueId) : Promise.resolve([]),
    listSports(supabase),
  ])

  async function handleUpdateVenue(formData: FormData) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    await updateVenue(nextSupabase, venueId, {
      name: (formData.get('name') as string)?.trim() || undefined,
      abbreviation: (formData.get('abbreviation') as string | null) ?? undefined,
      location_text: (formData.get('location_text') as string)?.trim() || undefined,
      city: (formData.get('city') as string)?.trim() || undefined,
      postal_code: (formData.get('postal_code') as string)?.trim() || undefined,
      country: (formData.get('country') as string)?.trim() || undefined,
      website_url: (formData.get('website_url') as string)?.trim() || undefined,
      contact_name: (formData.get('contact_name') as string)?.trim() || undefined,
      contact_phone: (formData.get('contact_phone') as string)?.trim() || undefined,
      contact_email: (formData.get('contact_email') as string)?.trim() || undefined,
      venue_phone: (formData.get('venue_phone') as string)?.trim() || undefined,
      venue_email: (formData.get('venue_email') as string)?.trim() || undefined,
      timezone: (formData.get('timezone') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
      venue_kind: (formData.get('venue_kind') as string | null)?.trim() as never,
      access_type: (formData.get('access_type') as string | null)?.trim() as never,
    })
    revalidatePath(`/admin/venues/${venueId}`)
    revalidatePath(`/venues/${venueId}`)
    revalidatePath('/admin/venues')
  }

  async function handleCreateCourt(formData: FormData) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    await createCourt(nextSupabase, venueId, {
      sport_id: parseInt(formData.get('sport_id') as string, 10),
      court_code: (formData.get('court_code') as string).trim(),
      surface: (formData.get('surface') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/venues/${venueId}`)
    revalidatePath(`/venues/${venueId}`)
  }

  async function handleUpdateCourt(courtId: string, formData: FormData) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    await updateCourt(nextSupabase, courtId, {
      sport_id: formData.get('sport_id') ? parseInt(formData.get('sport_id') as string, 10) : undefined,
      court_code: (formData.get('court_code') as string)?.trim() || undefined,
      surface: (formData.get('surface') as string)?.trim() || undefined,
      notes: (formData.get('notes') as string)?.trim() || undefined,
    })
    revalidatePath(`/admin/venues/${venueId}`)
    revalidatePath(`/venues/${venueId}`)
  }

  async function handleDeleteCourt(courtId: string) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    await deleteCourt(nextSupabase, courtId)
    revalidatePath(`/admin/venues/${venueId}`)
    revalidatePath(`/venues/${venueId}`)
  }

  async function handleGrantAdmin(userId: string) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    await grantVenueAdmin(nextSupabase, userId, venueId)
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleRevokeAdmin(userId: string) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    await revokeVenueAdmin(nextSupabase, userId, venueId)
    revalidatePath(`/admin/venues/${venueId}`)
  }

  async function handleSearchUsers(query: string) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    return searchUsersForAdmin(nextSupabase, query)
  }

  const venueMetaParts = [
    venue.location_text,
    venue.city,
    venue.postal_code,
    venue.country,
    venue.timezone,
  ].filter(Boolean)

  return (
    <div className="ph-page">
      <nav className="mb-6 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">
        <Link href="/dashboard" className="ph-link">
          Dashboard
        </Link>
        <span>&rsaquo;</span>
        {superAdmin ? (
          <>
            <Link href="/admin/venues" className="ph-link">
              Venue Admin
            </Link>
            <span>&rsaquo;</span>
          </>
        ) : null}
        <span>{getVenueDisplayName(venue)}</span>
      </nav>

      <header className="ph-card mb-6 px-6 py-5">
        <div className="ph-kicker mb-2">Venue Admin</div>
        <h1 className="ph-title">{getVenueDisplayName(venue)}</h1>
        {venueMetaParts.length > 0 ? (
          <p className="ph-subtitle mt-2">{venueMetaParts.join(' · ')}</p>
        ) : null}
        {venue.website_url ? (
          <a
            href={venue.website_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-medium text-[#2563EB] hover:underline"
          >
            Visit website
          </a>
        ) : null}
        {[venue.contact_name, venue.contact_phone, venue.contact_email, venue.venue_phone, venue.venue_email].some(Boolean) ? (
          <div className="mt-4 grid gap-2 text-sm text-[#475569] sm:grid-cols-2">
            {venue.contact_name ? <div><span className="font-semibold text-[#1E293B]">Contact:</span> {venue.contact_name}</div> : null}
            {venue.contact_phone ? <div><span className="font-semibold text-[#1E293B]">Contact phone:</span> {venue.contact_phone}</div> : null}
            {venue.contact_email ? <div><span className="font-semibold text-[#1E293B]">Contact email:</span> {venue.contact_email}</div> : null}
            {venue.venue_phone ? <div><span className="font-semibold text-[#1E293B]">Venue phone:</span> {venue.venue_phone}</div> : null}
            {venue.venue_email ? <div><span className="font-semibold text-[#1E293B]">Venue email:</span> {venue.venue_email}</div> : null}
          </div>
        ) : null}
      </header>

      <VenueDetailShell
        venue={venue}
        courts={courts}
        sports={sports}
        admins={admins}
        isSuperAdmin={superAdmin}
        onUpdateVenue={handleUpdateVenue}
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
