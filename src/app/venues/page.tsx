import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getAllVenues } from '@/lib/api/venues'
import { getMyVenuePreferences, getMyVenueRelationships } from '@/lib/api/identities'
import { VenueSearch } from './VenueSearch'

export default async function VenuesPage() {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()

  const [venues, relationships, venuePrefs] = await Promise.all([
    getAllVenues(supabase).catch(() => []),
    user ? getMyVenueRelationships(supabase, user.id).catch(() => []) : Promise.resolve([]),
    user ? getMyVenuePreferences(supabase, user.id).catch(() => []) : Promise.resolve([]),
  ])

  const myVenueIds = relationships
    .filter((relationship) => relationship.relationship_type === 'member')
    .map((relationship) => relationship.venue_id)
  const mySavedIds = venuePrefs.map((venue) => venue.id)

  return (
    <div className="ph-page-narrow">
      <nav className="mb-6 text-[11px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">
        <Link href="/dashboard" className="ph-link">
          ← Dashboard
        </Link>
      </nav>

      <section className="ph-card mb-5 px-6 py-5">
        <div className="ph-kicker mb-2">Venue Directory</div>
        <h1 className="ph-title">Venues</h1>
        <p className="ph-subtitle mt-1">
          {venues.length} venue{venues.length !== 1 ? 's' : ''}
        </p>
      </section>

      <VenueSearch venues={venues} myVenueIds={myVenueIds} mySavedIds={mySavedIds} />
    </div>
  )
}
