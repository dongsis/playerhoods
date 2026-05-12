import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getAllVenues } from '@/lib/api/venues'
import { getMyVenuePreferences, getMyVenueRelationships } from '@/lib/api/identities'
import { VenueSearch } from './VenueSearch'

interface Props {
  searchParams?: Promise<{ q?: string }>
}

export default async function VenuesPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  const params = await searchParams
  const initialQuery = typeof params?.q === 'string' ? params.q : ''

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
    <main className="min-h-screen bg-[#eef6ff] px-4 py-6 text-[#061a44] sm:px-6 lg:px-8">
      <nav className="mx-auto mb-5 flex max-w-[1540px] items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-black text-[#075bd7] transition hover:text-[#003d99]"
        >
          <span aria-hidden="true">{"<-"}</span>
          <span>Home</span>
        </Link>

        <Link href="/" className="flex items-center gap-2" aria-label="PlayerHoods home">
          <img
            src="/playerhoods-logo.png"
            alt=""
            className="h-10 w-10 object-contain"
          />
          <span className="hidden text-xl font-black tracking-tight text-[#001845] sm:inline">
            Player<span className="font-semibold">Hoods</span>
          </span>
        </Link>
      </nav>

      <VenueSearch
        venues={venues}
        myVenueIds={myVenueIds}
        mySavedIds={mySavedIds}
        initialQuery={initialQuery}
        isSignedIn={Boolean(user)}
      />
    </main>
  )
}
