'use client'

import Link from 'next/link'
import { CreateVenueDialog } from '@/app/admin/venues/CreateVenueDialog'
import type { VenueAdmin, Venue } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'

interface Props {
  myAdminVenues: (VenueAdmin & { venue: Venue })[]
  isSuperAdmin: boolean
}

export function VenueManagementPanel({ myAdminVenues, isSuperAdmin }: Props) {
  const canCreateVenue = isSuperAdmin || myAdminVenues.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Venue Management</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {isSuperAdmin ? 'Super admin' : 'Venue admin'} access
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateVenue ? <CreateVenueDialog /> : null}
          {isSuperAdmin ? (
            <Link
              href="/admin/venues"
              className="rounded-xl bg-gray-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-gray-800"
            >
              All Venues →
            </Link>
          ) : null}
        </div>
      </div>

      {myAdminVenues.length === 0 ? (
        <p className="text-sm italic text-gray-400">No venues assigned yet.</p>
      ) : (
        <div className="space-y-3">
          {myAdminVenues.map(({ venue }) => (
            <div
              key={venue.id}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white"
            >
              <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">{getVenueDisplayName(venue)}</div>
                  {venue.location_text && (
                    <div className="text-xs text-gray-400">{venue.location_text}</div>
                  )}
                </div>
                <Link
                  href={`/admin/venues/${venue.id}`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  Manage →
                </Link>
              </div>

              <div className="flex gap-0 bg-gray-50 px-4 py-2">
                {['Info', 'Courts', 'Admins'].map(label => (
                  <Link
                    key={label}
                    href={`/admin/venues/${venue.id}`}
                    className="rounded-lg px-3 py-1 text-xs text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Full venue management is available at{' '}
        <Link href="/admin/venues" className="text-blue-500 hover:underline">
          /admin/venues
        </Link>
        .
      </p>
    </div>
  )
}

