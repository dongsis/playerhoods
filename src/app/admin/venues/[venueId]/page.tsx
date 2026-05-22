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
  getVenueSports,
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
import { getVenueCanonicalPath } from '@/lib/venues/slug'
import { BrandLogo } from '@/app/components/BrandLogo'
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
  const venueCanonicalPath = getVenueCanonicalPath(venue)

  const [courts, venueSports, admins, sports] = await Promise.all([
    getVenueCourts(supabase, venueId),
    getVenueSports(supabase, venueId),
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
      province: (formData.get('province') as string)?.trim() || undefined,
      postal_code: (formData.get('postal_code') as string)?.trim() || undefined,
      country: (formData.get('country') as string)?.trim() || undefined,
      website_url: (formData.get('website_url') as string)?.trim() || undefined,
      contact_name: (formData.get('contact_name') as string)?.trim() || undefined,
      contact_phone: (formData.get('contact_phone') as string)?.trim() || undefined,
      contact_email: (formData.get('contact_email') as string)?.trim() || undefined,
      venue_phone: (formData.get('venue_phone') as string)?.trim() || undefined,
      venue_email: (formData.get('venue_email') as string)?.trim() || undefined,
      latitude: formData.get('latitude') ? Number(formData.get('latitude')) : null,
      longitude: formData.get('longitude') ? Number(formData.get('longitude')) : null,
      indoor_outdoor: ((formData.get('indoor_outdoor') as string | null)?.trim() || null) as never,
      facility_type: ((formData.get('facility_type') as string | null)?.trim() || null) as never,
      booking_required: formData.get('booking_required') === '' ? null : formData.get('booking_required') === 'true',
      cost_type: ((formData.get('cost_type') as string | null)?.trim() || null) as never,
      supports_tennis: formData.get('supports_tennis') === 'on',
      supports_pickleball: formData.get('supports_pickleball') === 'on',
      notes: (formData.get('notes') as string)?.trim() || undefined,
      venue_kind: (formData.get('venue_kind') as string | null)?.trim() as never,
      access_type: (formData.get('access_type') as string | null)?.trim() as never,
    })
    revalidatePath(`/admin/venues/${venueId}`)
    revalidatePath(`/app/venues/${venueId}`)
    revalidatePath(venueCanonicalPath)
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
    revalidatePath(`/app/venues/${venueId}`)
    revalidatePath(venueCanonicalPath)
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
    revalidatePath(`/app/venues/${venueId}`)
    revalidatePath(venueCanonicalPath)
  }

  async function handleDeleteCourt(courtId: string) {
    'use server'
    const nextSupabase = await createSupabaseServerClient()
    await deleteCourt(nextSupabase, courtId)
    revalidatePath(`/admin/venues/${venueId}`)
    revalidatePath(`/app/venues/${venueId}`)
    revalidatePath(venueCanonicalPath)
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
    venue.province,
    venue.postal_code,
    venue.country,
  ].filter(Boolean)
  const sportMap = new Map(sports.map((sport) => [sport.id, sport.display_name]))
  const venueSportsSummary = venueSports
    .map((entry) => ({
      ...entry,
      sportName: sportMap.get(entry.sport_id) ?? `Sport ${entry.sport_id}`,
    }))
    .sort((left, right) => left.sportName.localeCompare(right.sportName))
  const attributeBadges = [
    venue.indoor_outdoor === 'indoor'
      ? 'Indoor'
      : venue.indoor_outdoor === 'outdoor'
        ? 'Outdoor'
        : venue.indoor_outdoor === 'indoor_outdoor'
          ? 'Indoor/Outdoor'
          : null,
    venue.facility_type === 'full_facility'
      ? 'Full Facility'
      : venue.facility_type === 'court_only'
        ? 'Court Only'
        : null,
    venue.booking_required === true ? 'Booking required' : venue.booking_required === false ? 'No booking required' : null,
    venue.cost_type === 'paid' ? 'Paid' : venue.cost_type === 'free' ? 'Free' : null,
  ].filter(Boolean)

  return (
    <div className="ph-page">
      <div className="mb-6">
        <BrandLogo variant="horizontal" href="/dashboard" />
      </div>
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
            className="mt-3 inline-block text-sm font-medium text-[#0d6efd] hover:underline"
          >
            Visit website
          </a>
        ) : null}
        {attributeBadges.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {attributeBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-[#475569]"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        {venueSportsSummary.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-[#475569]">
            {venueSportsSummary.map((entry) => (
              <span
                key={`${entry.venue_id}-${entry.sport_id}`}
                className="rounded-full border border-[#E2E8F0] bg-[#F8FBFF] px-3 py-1"
              >
                <span className="font-semibold text-[#1E293B]">{entry.sportName}</span>
                <span className="ml-2">{entry.court_count} courts</span>
              </span>
            ))}
          </div>
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
