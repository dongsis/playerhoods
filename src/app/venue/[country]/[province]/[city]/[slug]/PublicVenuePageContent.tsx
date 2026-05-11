import Link from 'next/link'
import type { Court, Sport, Venue, VenueSport } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'
import { getPublicVenueNote } from '@/lib/venues/notes'

interface Props {
  venue: Venue
  courts: Court[]
  sports: Sport[]
  venueSports: VenueSport[]
}

export function PublicVenuePageContent({ venue, courts, sports, venueSports }: Props) {
  const publicVenueNote = getPublicVenueNote(venue.notes)
  const sportMap = new Map(sports.map((sport) => [sport.id, sport.display_name]))
  const courtsBySport = sports
    .map((sport) => ({
      sport,
      courts: courts.filter((court) => court.sport_id === sport.id),
    }))
    .filter((entry) => entry.courts.length > 0)

  const venueSportsSummary = venueSports
    .map((entry) => ({
      ...entry,
      sportName: sportMap.get(entry.sport_id) ?? `Sport ${entry.sport_id}`,
    }))
    .sort((left, right) => left.sportName.localeCompare(right.sportName))

  const venueMetaParts = [
    venue.location_text,
    venue.city,
    venue.province,
    venue.postal_code,
    venue.country,
  ].filter(Boolean)

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
    venue.has_lights === true ? 'Lights' : null,
    venue.has_parking === true ? 'Parking' : null,
    venue.has_washroom === true ? 'Washroom' : null,
  ].filter(Boolean)

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <nav className="mb-6 text-sm text-gray-400">
        <Link href="/venues" className="hover:text-gray-600">
          &larr; Venues
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{getVenueDisplayName(venue)}</h1>
        {venueMetaParts.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-500">
            <span>{venueMetaParts.join(' · ')}</span>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {venue.website_url ? (
            <a
              href={venue.website_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Visit website
            </a>
          ) : null}
          {venue.google_maps_url ? (
            <a
              href={venue.google_maps_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View on map
            </a>
          ) : null}
        </div>
        {attributeBadges.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {attributeBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {publicVenueNote ? (
        <section className="mb-6 rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">
          {publicVenueNote}
        </section>
      ) : null}

      {venueSportsSummary.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Sports
          </h2>
          <div className="flex flex-wrap gap-2">
            {venueSportsSummary.map((entry) => (
              <span
                key={`${entry.venue_id}-${entry.sport_id}`}
                className="rounded-2xl border border-gray-100 bg-white px-4 py-2 text-sm text-gray-700"
              >
                <span className="font-semibold text-gray-900">{entry.sportName}</span>
                {entry.court_count && entry.court_count > 0 ? (
                  <span className="ml-2 text-gray-500">{entry.court_count} courts</span>
                ) : null}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {courts.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Courts
          </h2>
          <div className="space-y-4">
            {courtsBySport.map(({ sport, courts: sportCourts }) => (
              <div key={sport.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {sport.display_name}
                </p>
                <div className="space-y-2">
                  {sportCourts.map((court) => (
                    <div
                      key={court.id}
                      className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
                    >
                      <span className="text-sm font-medium text-gray-800">{court.court_code}</span>
                      {court.surface ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                          {court.surface}
                        </span>
                      ) : null}
                      {court.notes ? (
                        <span className="ml-auto max-w-[200px] truncate text-xs text-gray-400">
                          {court.notes}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
