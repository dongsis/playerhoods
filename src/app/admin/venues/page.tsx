import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getAllVenues, getMyAdminVenues, isSuperAdmin } from '@/lib/api/venues'
import { getVenueDisplayName } from '@/lib/venues/display'
import { CreateVenueDialog } from '../venues/CreateVenueDialog'

export default async function AdminVenuesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const superAdmin = await isSuperAdmin(supabase)
  let canCreateVenue = superAdmin

  let venues
  if (superAdmin) {
    venues = await getAllVenues(supabase)
  } else {
    const myAdminVenues = await getMyAdminVenues(supabase)
    if (myAdminVenues.length === 0) redirect('/dashboard')
    venues = myAdminVenues.map((row) => row.venue)
    canCreateVenue = myAdminVenues.length > 0
  }

  return (
    <div className="ph-page-narrow">
      <nav className="mb-6 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">
        <Link href="/dashboard" className="ph-link">
          Dashboard
        </Link>
        <span>&rsaquo;</span>
        <span>Venue Admin</span>
      </nav>

      <section className="ph-card px-6 py-5">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="ph-kicker mb-2">Venue Admin</div>
            <h1 className="ph-title">Venues</h1>
            <p className="ph-subtitle mt-1">
              {venues.length} venue{venues.length !== 1 ? 's' : ''}
            </p>
          </div>
          {canCreateVenue ? <CreateVenueDialog /> : null}
        </div>

        {venues.length === 0 ? (
          <div className="ph-empty">No venues yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {venues.map((venue) => {
              const metaParts = [
                venue.location_text,
                venue.city,
                venue.country,
              ].filter(Boolean)

              return (
                <Link
                  key={venue.id}
                  href={`/admin/venues/${venue.id}`}
                  className="block rounded-[20px] border border-[#E2E8F0] bg-white px-5 py-4 text-inherit no-underline shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-[#C25E46]/35 hover:bg-[#FFF8F5]"
                >
                  <div className="text-sm font-bold text-[#1E293B]">{getVenueDisplayName(venue)}</div>
                  {metaParts.length > 0 ? (
                    <div className="mt-1 text-[12px] text-[#64748B]">{metaParts.join(' · ')}</div>
                  ) : null}
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
