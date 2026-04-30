import { notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getVenue, getVenueCourts, isSuperAdmin, isVenueAdmin } from '@/lib/api/venues'
import { listSports } from '@/lib/api/sports'
import {
  addVenuePreference,
  getMyVenuePreferences,
  getMyVenueRelationships,
  removeVenuePreference,
} from '@/lib/api/identities'
import { getInviteCircleList } from '@/lib/api/play-network'
import { getVenueDisplayName } from '@/lib/venues/display'
import { VenuePreferenceButton } from './VenuePreferenceButton'
import { VenueMembersSection } from './VenueMembersSection'

interface Props {
  params: Promise<{ venueId: string }>
}

export default async function VenueDetailPage({ params }: Props) {
  const { venueId } = await params
  const user = await getUser()
  const supabase = await createSupabaseServerClient()

  let venue, courts, sports
  try {
    ;[venue, courts, sports] = await Promise.all([
      getVenue(supabase, venueId),
      getVenueCourts(supabase, venueId),
      listSports(supabase),
    ])
  } catch {
    notFound()
  }

  const sportMap = new Map(sports.map((sport) => [sport.id, sport.display_name]))
  const courtsBySport = sports
    .map((sport) => ({
      sport,
      courts: courts.filter((court) => court.sport_id === sport.id),
    }))
    .filter((entry) => entry.courts.length > 0)

  let isMember = false
  let isSaved = false
  let savedPlayerIds: string[] = []
  let canManageVenue = false

  if (user) {
    const [relationships, prefs, inviteCircle, superAdmin, venueAdmin] = await Promise.all([
      getMyVenueRelationships(supabase, user.id).catch(() => []),
      getMyVenuePreferences(supabase, user.id).catch(() => []),
      getInviteCircleList(supabase).catch(() => []),
      isSuperAdmin(supabase).catch(() => false),
      isVenueAdmin(supabase, venueId).catch(() => false),
    ])
    const relationship = relationships.find(
      (item) => item.venue_id === venueId && item.relationship_type === 'member',
    )
    isMember = !!relationship
    isSaved = prefs.some((v) => v.id === venueId)
    savedPlayerIds = inviteCircle.map((row) => row.target_user_id)
    canManageVenue = superAdmin || venueAdmin
  }

  async function handleTogglePreference() {
    'use server'
    const srv = await createSupabaseServerClient()
    const currentUser = await getUser()
    if (!currentUser) return
    if (isSaved) {
      await removeVenuePreference(srv, currentUser.id, venueId)
    } else {
      await addVenuePreference(srv, currentUser.id, venueId)
    }
    revalidatePath(`/venues/${venueId}`)
    revalidatePath('/profile')
    revalidatePath('/dashboard')
  }

  const venueMetaParts = [
    venue.location_text,
    venue.city,
    venue.postal_code,
    venue.country,
    venue.timezone,
  ].filter(Boolean)

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <nav className="mb-6 text-sm text-gray-400">
        <Link href="/venues" className="hover:text-gray-600">
          &larr; Venues
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{getVenueDisplayName(venue)}</h1>
            {venueMetaParts.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-500">
                <span>{venueMetaParts.join(' · ')}</span>
              </div>
            ) : null}
            {venue.website_url ? (
              <a
                href={venue.website_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
              >
                Visit website
              </a>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canManageVenue ? (
              <Link
                href={`/admin/venues/${venueId}`}
                className="rounded-xl bg-[#1E293B] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#0F172A]"
              >
                Manage Venue
              </Link>
            ) : null}
            {isMember ? (
              <span className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                Member
              </span>
            ) : user ? (
              <VenuePreferenceButton isSaved={isSaved} onToggle={handleTogglePreference} />
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
              >
                Log in to save
              </Link>
            )}
          </div>
        </div>
      </header>

      {isMember && user ? (
        <VenueMembersSection venueId={venueId} initialSavedPlayerIds={savedPlayerIds} />
      ) : null}

      {venue.notes ? (
        <section className="mb-6 rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">
          {venue.notes}
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Courts ({courts.length})
        </h2>
        {courts.length === 0 ? (
          <p className="text-sm italic text-gray-400">No courts listed.</p>
        ) : (
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
            {courtsBySport.length === 0 ? (
              <div className="space-y-2">
                {courts.map((court) => (
                  <div
                    key={court.id}
                    className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
                  >
                    <span className="text-sm font-medium text-gray-800">{court.court_code}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                      {sportMap.get(court.sport_id) ?? `Sport ${court.sport_id}`}
                    </span>
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
            ) : null}
          </div>
        )}
      </section>

      {user && !isMember ? (
        <section className="mt-2 flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Not a member yet</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Join this venue to appear in match scope groups.
            </p>
          </div>
          <Link
            href="/profile"
            className="shrink-0 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Join via Profile &rarr;
          </Link>
        </section>
      ) : null}
    </div>
  )
}
