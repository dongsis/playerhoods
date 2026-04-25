import { notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getVenue, getVenueCourts } from '@/lib/api/venues'
import { listSports } from '@/lib/api/sports'
import {
  getMyVenueRelationships,
  getMyVenuePreferences,
  addVenuePreference,
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
  let isSaved  = false
  let savedPlayerIds: string[] = []

  if (user) {
    const [relationships, prefs, inviteCircle] = await Promise.all([
      getMyVenueRelationships(supabase, user.id).catch(() => []),
      getMyVenuePreferences(supabase, user.id).catch(() => []),
      getInviteCircleList(supabase).catch(() => []),
    ])
    const relationship = relationships.find(
      (item) => item.venue_id === venueId && item.relationship_type === 'member',
    )
    isMember = !!relationship
    isSaved  = prefs.some(v => v.id === venueId)
    savedPlayerIds = inviteCircle.map((row) => row.target_user_id)
  }

  async function handleTogglePreference() {
    'use server'
    const srv = await createSupabaseServerClient()
    const u = await getUser()
    if (!u) return
    if (isSaved) {
      await removeVenuePreference(srv, u.id, venueId)
    } else {
      await addVenuePreference(srv, u.id, venueId)
    }
    revalidatePath(`/venues/${venueId}`)
    revalidatePath('/profile')
    revalidatePath('/dashboard')
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-400">
        <Link href="/venues" className="hover:text-gray-600">← Venues</Link>
      </nav>

      {/* Header */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{getVenueDisplayName(venue)}</h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
              {venue.location_text && <span>📍 {venue.location_text}</span>}
              {venue.timezone && <span>🕐 {venue.timezone}</span>}
            </div>
          </div>

          {/* Member badge or Save button */}
          <div className="flex items-center gap-2 shrink-0">
            {isMember ? (
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-xl border border-blue-100">
                ✓ Member
              </span>
            ) : user ? (
              <VenuePreferenceButton isSaved={isSaved} onToggle={handleTogglePreference} />
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Log in to save
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Venue Members discovery — for members only */}
      {isMember && user && (
        <VenueMembersSection venueId={venueId} initialSavedPlayerIds={savedPlayerIds} />
      )}

      {/* Notes / description */}
      {venue.notes && (
        <section className="mb-6 px-4 py-3 bg-gray-50 rounded-2xl text-sm text-gray-600 leading-relaxed">
          {venue.notes}
        </section>
      )}

      {/* Courts */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Courts ({courts.length})
        </h2>
        {courts.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No courts listed.</p>
        ) : (
          <div className="space-y-4">
            {courtsBySport.map(({ sport, courts: sportCourts }) => (
              <div key={sport.id}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {sport.display_name}
                </p>
                <div className="space-y-2">
                  {sportCourts.map((court) => (
                    <div
                      key={court.id}
                      className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100"
                    >
                      <span className="text-sm font-medium text-gray-800">{court.court_code}</span>
                      {court.surface && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {court.surface}
                        </span>
                      )}
                      {court.notes && (
                        <span className="text-xs text-gray-400 ml-auto truncate max-w-[200px]">
                          {court.notes}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {courtsBySport.length === 0 && (
              <div className="space-y-2">
                {courts.map((court) => (
                  <div
                    key={court.id}
                    className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100"
                  >
                    <span className="text-sm font-medium text-gray-800">{court.court_code}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {sportMap.get(court.sport_id) ?? `Sport ${court.sport_id}`}
                    </span>
                    {court.surface && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {court.surface}
                      </span>
                    )}
                    {court.notes && (
                      <span className="text-xs text-gray-400 ml-auto truncate max-w-[200px]">
                        {court.notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Join CTA — for logged-in non-members */}
      {user && !isMember && (
        <section className="mt-2 px-4 py-4 bg-white rounded-2xl border border-gray-100 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Not a member yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Join this venue to appear in match scope groups.</p>
          </div>
          <Link
            href="/profile"
            className="shrink-0 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
          >
            Join via Profile →
          </Link>
        </section>
      )}
    </div>
  )
}
