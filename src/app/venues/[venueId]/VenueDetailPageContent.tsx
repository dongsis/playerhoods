import { notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getVenue, getVenueCourts, getVenueSports, isSuperAdmin, isVenueAdmin } from '@/lib/api/venues'
import { listSports } from '@/lib/api/sports'
import {
  addVenuePreference,
  getMyVenuePreferences,
  getMyVenueRelationships,
  joinVenue,
  removeVenuePreference,
} from '@/lib/api/identities'
import { getInviteCircleList } from '@/lib/api/play-network'
import { getVenueDisplayName } from '@/lib/venues/display'
import { getPublicVenueNote } from '@/lib/venues/notes'
import { getVenueCanonicalPath } from '@/lib/venues/slug'
import { BrandLogo } from '@/app/components/BrandLogo'
import { VenueMembersSection } from './VenueMembersSection'

function venueSupportsMembership(kind: string | null | undefined) {
  return kind === 'club' || kind === 'private_facility' || kind === 'condo' || kind === 'school'
}

export async function VenueDetailPageContent({
  venueId,
  canonicalPath,
}: {
  venueId: string
  canonicalPath?: string
}) {
  const user = await getUser()
  const supabase = await createSupabaseServerClient()

  let venue, courts, sports
  let venueSports
  try {
    ;[venue, courts, sports, venueSports] = await Promise.all([
      getVenue(supabase, venueId),
      getVenueCourts(supabase, venueId),
      listSports(supabase),
      getVenueSports(supabase, venueId),
    ])
  } catch {
    notFound()
  }
  const venueCanonicalPath = canonicalPath ?? getVenueCanonicalPath(venue)

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

  let isMember = false
  let isSaved = false
  let savedPlayerIds: string[] = []
  let canManageVenue = false
  const canJoinAsMember = venueSupportsMembership(venue.venue_kind)

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
    revalidatePath(`/app/venues/${venueId}`)
    revalidatePath(venueCanonicalPath)
    revalidatePath('/profile')
    revalidatePath('/dashboard')
  }

  async function handleJoinAsMember() {
    'use server'
    const srv = await createSupabaseServerClient()
    const currentUser = await getUser()
    if (!currentUser) return
    await joinVenue(srv, venueId)
    revalidatePath(`/app/venues/${venueId}`)
    revalidatePath(venueCanonicalPath)
    revalidatePath('/profile')
    revalidatePath('/dashboard')
  }

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
  ].filter(Boolean)
  const publicVenueNote = getPublicVenueNote(venue.notes)

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <BrandLogo variant="horizontal" />
      </div>
      <nav className="mb-6 text-sm text-gray-400">
        <Link href="/dashboard?tab=profile&section=venues" className="hover:text-gray-600">
          &larr; Profile venues
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
            ) : null}
          </div>
        </div>
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
        </section>
      ) : null}

      {user && !isMember ? (
        <section className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4">
          <div>
            <p className="text-sm font-medium text-gray-700">
              {canJoinAsMember ? 'Not a member yet' : isSaved ? 'Saved venue' : 'Save this venue'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canJoinAsMember ? (
              <form action={handleJoinAsMember}>
                <button
                  type="submit"
                  className="shrink-0 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  I&apos;m a member of this club.
                </button>
              </form>
            ) : null}
            <form action={handleTogglePreference}>
              <button
                type="submit"
                className={[
                  'shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                  isSaved
                    ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {isSaved ? 'Unsave this venue' : 'Save this venue'}
              </button>
            </form>
          </div>
        </section>
      ) : !user ? (
        <section className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Save or join this venue</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Log in to save this venue or mark yourself as a member.
            </p>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Log in
          </Link>
        </section>
      ) : null}

      {isMember && user ? (
        <VenueMembersSection venueId={venueId} initialSavedPlayerIds={savedPlayerIds} />
      ) : null}
    </div>
  )
}
