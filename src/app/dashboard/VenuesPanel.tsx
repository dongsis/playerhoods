'use client'

import Link from 'next/link'
import type { Venue, VenueAdmin, VenueIdentity } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'

interface Props {
  myIdentities: (VenueIdentity & { venue: Venue })[]
  myVenuePrefs: Venue[]
  isAdmin: boolean
  myAdminVenues: (VenueAdmin & { venue: Venue })[]
}

export function VenuesPanel({ myIdentities, myVenuePrefs, isAdmin, myAdminVenues }: Props) {
  const joinedVenues = myIdentities.map((identity) => identity.venue)
  const joinedIds = new Set(joinedVenues.map((venue) => venue.id))
  const savedOnly = myVenuePrefs.filter((venue) => !joinedIds.has(venue.id))
  const adminVenueIds = new Set(myAdminVenues.map(({ venue }) => venue.id))

  return (
    <div className="max-w-lg space-y-8">
      {isAdmin ? (
        <section>
          <h2 className="mb-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#94A3B8]">
            Venue Management
          </h2>
          <div className="space-y-2">
            <Link
              href="/admin/venues"
              className="group flex items-center justify-between rounded-[24px] border border-[#E2E8F0] bg-white px-4 py-4 transition-colors hover:border-[#C25E46]/35 hover:bg-[#FFF8F5]"
            >
              <div>
                <div className="text-sm font-semibold text-[#1E293B]">Open Venue Admin</div>
                <div className="mt-0.5 text-xs text-[#64748B]">
                  Manage venue details, courts, and admin access.
                </div>
              </div>
              <span className="text-xs text-[#94A3B8] group-hover:text-[#C25E46]">→</span>
            </Link>

            {myAdminVenues.map(({ venue }) => (
              <Link
                key={`admin-${venue.id}`}
                href={`/admin/venues/${venue.id}`}
                className="group flex items-center justify-between rounded-[24px] border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-3 transition-colors hover:border-[#C25E46]/35 hover:bg-[#FFF8F5]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#1E293B]">{getVenueDisplayName(venue)}</div>
                  <div className="mt-0.5 text-xs text-[#64748B]">
                    {venue.location_text || venue.city || 'Manage this venue'}
                  </div>
                </div>
                <span className="rounded-full bg-[#1E293B] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                  Manage
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#94A3B8]">
          My Venues
        </h2>
        {joinedVenues.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#CBD5E1] bg-[#F8FBFF] px-5 py-5 text-sm italic text-[#64748B]">
            Not a member of any venue yet.
          </div>
        ) : (
          <div className="space-y-2">
            {joinedVenues.map((venue) => (
              <Link
                key={venue.id}
                href={`/app/venues/${venue.id}`}
                className="group flex items-center justify-between rounded-[24px] border border-[#E2E8F0] bg-white px-4 py-3 transition-colors hover:border-[#C25E46]/35 hover:bg-[#F8FBFF]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#1E293B]">{getVenueDisplayName(venue)}</span>
                    {adminVenueIds.has(venue.id) ? (
                      <span className="rounded-full border border-[#1E293B]/10 bg-[#1E293B]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1E293B]">
                        Admin
                      </span>
                    ) : null}
                  </div>
                  {venue.location_text ? (
                    <div className="mt-0.5 text-xs text-[#64748B]">{venue.location_text}</div>
                  ) : null}
                </div>
                <span className="text-xs text-[#94A3B8] group-hover:text-[#C25E46]">→</span>
              </Link>
            ))}
          </div>
        )}
        <Link href="/profile" className="ph-link mt-2 inline-block text-xs">
          Manage memberships →
        </Link>
      </section>

      {savedOnly.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#94A3B8]">
            Saved Venues
          </h2>
          <div className="space-y-2">
            {savedOnly.map((venue) => (
              <Link
                key={venue.id}
                href={`/app/venues/${venue.id}`}
                className="group flex items-center justify-between rounded-[24px] border border-[#E2E8F0] bg-white px-4 py-3 transition-colors hover:border-[#C25E46]/35 hover:bg-[#F8FBFF]"
              >
                <div>
                  <span className="text-sm font-semibold text-[#1E293B]">{getVenueDisplayName(venue)}</span>
                  {venue.location_text ? (
                    <div className="mt-0.5 text-xs text-[#64748B]">{venue.location_text}</div>
                  ) : null}
                </div>
                <span className="text-xs text-[#94A3B8] group-hover:text-[#C25E46]">→</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#94A3B8]">
          Explore
        </h2>
        <div className="space-y-2">
          <Link
            href="/venues"
            className="group flex items-center justify-between rounded-[24px] border border-[#E2E8F0] bg-white px-4 py-3 transition-colors hover:border-[#C25E46]/35 hover:bg-[#F8FBFF]"
          >
            <span className="text-sm font-semibold text-[#1E293B]">Browse all venues</span>
            <span className="text-xs text-[#94A3B8] group-hover:text-[#C25E46]">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
