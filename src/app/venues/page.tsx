import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getAllVenues } from '@/lib/api/venues'
import { getMyVenueIdentities, getMyVenuePreferences } from '@/lib/api/identities'
import { VenueSearch } from './VenueSearch'

export default async function VenuesPage() {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()

  const [venues, identities, venuePrefs] = await Promise.all([
    getAllVenues(supabase).catch(() => []),
    user ? getMyVenueIdentities(supabase, user.id).catch(() => []) : Promise.resolve([]),
    user ? getMyVenuePreferences(supabase, user.id).catch(() => []) : Promise.resolve([]),
  ])

  const myVenueIds  = identities.map(i => i.venue_id)
  const mySavedIds = venuePrefs.map(v => v.id)

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <nav className="mb-6 text-sm text-gray-400">
        <Link href="/dashboard" className="hover:text-gray-600">← Dashboard</Link>
      </nav>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {venues.length} venue{venues.length !== 1 ? 's' : ''}
        </p>
      </div>

      <VenueSearch venues={venues} myVenueIds={myVenueIds} mySavedIds={mySavedIds} />
    </div>
  )
}
