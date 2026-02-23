import { notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getClub, getClubCourts } from '@/lib/api/clubs'
import {
  getMyClubIdentities,
  getMyVenuePreferences,
  addVenuePreference,
  removeVenuePreference,
} from '@/lib/api/identities'
import { VenuePreferenceButton } from './VenuePreferenceButton'

interface Props {
  params: Promise<{ venueId: string }>
}

export default async function VenueDetailPage({ params }: Props) {
  const { venueId } = await params
  const user = await getUser()
  const supabase = await createSupabaseServerClient()

  let venue, courts
  try {
    ;[venue, courts] = await Promise.all([
      getClub(supabase, venueId),
      getClubCourts(supabase, venueId),
    ])
  } catch {
    notFound()
  }

  let isMember = false
  let isSaved  = false
  let memberHandle: string | null = null

  if (user) {
    const [identities, prefs] = await Promise.all([
      getMyClubIdentities(supabase, user.id).catch(() => []),
      getMyVenuePreferences(supabase, user.id).catch(() => []),
    ])
    const identity = identities.find(i => i.club_id === venueId)
    isMember = !!identity
    memberHandle = identity?.club_handle ?? null
    isSaved  = prefs.some(v => v.id === venueId)
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
            <h1 className="text-2xl font-bold text-gray-900">{venue.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
              {venue.location_text && <span>📍 {venue.location_text}</span>}
              {venue.timezone && <span>🕐 {venue.timezone}</span>}
            </div>
          </div>

          {/* Member badge or Save button */}
          <div className="flex items-center gap-2 shrink-0">
            {isMember ? (
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-xl border border-blue-100">
                ✓ Member{memberHandle ? ` · @${memberHandle}` : ''}
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
          <div className="space-y-2">
            {courts.map(c => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100"
              >
                <span className="text-sm font-medium text-gray-800">{c.court_code}</span>
                {c.surface && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {c.surface}
                  </span>
                )}
                {c.notes && (
                  <span className="text-xs text-gray-400 ml-auto truncate max-w-[200px]">
                    {c.notes}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Join CTA — for logged-in non-members */}
      {user && !isMember && (
        <section className="mt-2 px-4 py-4 bg-white rounded-2xl border border-gray-100 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Not a member yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Join this venue to get a handle and appear in match scope groups.</p>
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
