'use client'

import Link from 'next/link'
import type { Club, ClubIdentity } from '@/lib/types/database'

interface Props {
  myIdentities: (ClubIdentity & { club: Club })[]
  myVenuePrefs: Club[]
  isAdmin: boolean
}

export function VenuesPanel({ myIdentities, myVenuePrefs, isAdmin }: Props) {
  const joinedVenues = myIdentities.map(i => i.club)

  // Saved venues that aren't already joined
  const joinedIds = new Set(joinedVenues.map(v => v.id))
  const savedOnly = myVenuePrefs.filter(v => !joinedIds.has(v.id))

  return (
    <div className="space-y-8 max-w-lg">

      {/* My Clubs (member) */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          My Clubs
        </h2>
        {joinedVenues.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Not a member of any club yet.</p>
        ) : (
          <div className="space-y-2">
            {joinedVenues.map(v => {
              const identity = myIdentities.find(i => i.club_id === v.id)!
              return (
                <Link
                  key={v.id}
                  href={`/venues/${v.id}`}
                  className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors group"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
                      {v.name}
                    </span>
                    {identity.club_handle && (
                      <span className="text-xs text-gray-400 ml-2">@{identity.club_handle}</span>
                    )}
                    {v.location_text && (
                      <div className="text-xs text-gray-400 mt-0.5">{v.location_text}</div>
                    )}
                  </div>
                  <span className="text-xs text-gray-300 group-hover:text-gray-400">→</span>
                </Link>
              )
            })}
          </div>
        )}
        <Link
          href="/profile"
          className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800"
        >
          Manage memberships →
        </Link>
      </section>

      {/* Saved venues */}
      {savedOnly.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Saved Venues
          </h2>
          <div className="space-y-2">
            {savedOnly.map(v => (
              <Link
                key={v.id}
                href={`/venues/${v.id}`}
                className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors group"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
                    {v.name}
                  </span>
                  {v.location_text && (
                    <div className="text-xs text-gray-400 mt-0.5">{v.location_text}</div>
                  )}
                </div>
                <span className="text-xs text-gray-300 group-hover:text-gray-400">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Explore */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Explore
        </h2>
        <div className="space-y-2">
          <Link
            href="/venues"
            className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors group"
          >
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Browse all venues
            </span>
            <span className="text-xs text-gray-300 group-hover:text-gray-400">→</span>
          </Link>
          {isAdmin && (
            <Link
              href="/admin/venues"
              className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors group"
            >
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                Venue Admin
              </span>
              <span className="text-xs text-gray-300 group-hover:text-gray-400">→</span>
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}
