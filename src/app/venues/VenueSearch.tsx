'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Venue, VenueKind } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'
import { getVenueCanonicalPath } from '@/lib/venues/slug'

type SportFilter = 'all' | 'tennis' | 'pickleball' | 'both'
type VenueKindFilter = 'all' | VenueKind

interface Props {
  venues: Venue[]
  myVenueIds: string[]
  mySavedIds: string[]
  initialQuery?: string
  isSignedIn?: boolean
}

const PAGE_SIZE = 10

const VENUE_KIND_OPTIONS: { value: VenueKindFilter; label: string }[] = [
  { value: 'all', label: 'All venue types' },
  { value: 'club', label: 'Club' },
  { value: 'park', label: 'Park' },
  { value: 'community_centre', label: 'Community centre' },
  { value: 'condo', label: 'Condo' },
  { value: 'school', label: 'School' },
  { value: 'private_facility', label: 'Private facility' },
]

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function getVenueKindLabel(kind: Venue['venue_kind']) {
  return VENUE_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? 'Venue'
}

function getVenueAddress(venue: Venue) {
  const streetOrFullAddress = venue.location_text?.trim()
  if (streetOrFullAddress) {
    const normalizedAddress = normalize(streetOrFullAddress)
    const alreadyHasCity = venue.city ? normalizedAddress.includes(normalize(venue.city)) : false
    const alreadyHasProvince = venue.province ? normalizedAddress.includes(normalize(venue.province)) : false
    const alreadyHasPostalCode = venue.postal_code ? normalizedAddress.includes(normalize(venue.postal_code)) : false

    if (alreadyHasCity || alreadyHasProvince || alreadyHasPostalCode) {
      return streetOrFullAddress
    }
  }

  const pieces = [streetOrFullAddress, venue.city, venue.province, venue.postal_code]
    .map((piece) => piece?.trim())
    .filter(Boolean)

  return pieces.join(', ')
}

function getSportBadges(venue: Venue) {
  const badges: { label: string; tone: 'tennis' | 'pickleball' }[] = []
  if (venue.supports_tennis) badges.push({ label: 'Tennis', tone: 'tennis' })
  if (venue.supports_pickleball) badges.push({ label: 'Pickleball', tone: 'pickleball' })
  return badges
}

function matchesSport(venue: Venue, sportFilter: SportFilter) {
  if (sportFilter === 'tennis') return venue.supports_tennis
  if (sportFilter === 'pickleball') return venue.supports_pickleball
  if (sportFilter === 'both') return venue.supports_tennis && venue.supports_pickleball
  return true
}

function SearchIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ArrowRightIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.5 8.3 2.8 2.8 6.2-6.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PeopleIcon({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="11" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 25c.8-4.2 3.4-6.5 7.5-6.5s6.7 2.3 7.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7.5" cy="13.5" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M3 23c.5-3 2.2-4.8 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24.5" cy="13.5" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M29 23c-.5-3-2.2-4.8-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function VenueSearch({
  venues,
  myVenueIds,
  mySavedIds,
  initialQuery = '',
  isSignedIn = false,
}: Props) {
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [sportFilter, setSportFilter] = useState<SportFilter>('both')
  const [venueKind, setVenueKind] = useState<VenueKindFilter>('all')
  const [venueNameInput, setVenueNameInput] = useState(initialQuery)
  const [venueNameQuery, setVenueNameQuery] = useState(initialQuery)
  const [page, setPage] = useState(1)

  const provinces = useMemo(() => {
    return Array.from(new Set(venues.map((venue) => venue.province?.trim()).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b))
  }, [venues])

  const cities = useMemo(() => {
    const selectedProvince = normalize(province)
    return Array.from(new Set(
      venues
        .filter((venue) => !selectedProvince || normalize(venue.province) === selectedProvince)
        .map((venue) => venue.city?.trim())
        .filter(Boolean) as string[],
    )).sort((a, b) => a.localeCompare(b))
  }, [province, venues])

  const filtered = useMemo(() => {
    const selectedProvince = normalize(province)
    const selectedCity = normalize(city)
    const nameQuery = normalize(venueNameQuery)

    return venues.filter((venue) => {
      if (selectedProvince && normalize(venue.province) !== selectedProvince) return false
      if (selectedCity && normalize(venue.city) !== selectedCity) return false
      if (venueKind !== 'all' && venue.venue_kind !== venueKind) return false
      if (!matchesSport(venue, sportFilter)) return false

      if (nameQuery) {
        const searchable = [
          getVenueDisplayName(venue),
          venue.name,
          venue.abbreviation,
          venue.location_text,
          venue.city,
          venue.province,
          venue.postal_code,
        ].map(normalize).join(' ')
        if (!searchable.includes(nameQuery)) return false
      }

      return true
    })
  }, [city, province, sportFilter, venueKind, venueNameQuery, venues])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageVenues = filtered.slice(startIndex, startIndex + PAGE_SIZE)
  const showingStart = filtered.length === 0 ? 0 : startIndex + 1
  const showingEnd = Math.min(startIndex + PAGE_SIZE, filtered.length)

  const resetToFirstPage = () => setPage(1)

  const handleSearch = () => {
    setVenueNameQuery(venueNameInput.trim())
    setPage(1)
  }

  const updateProvince = (value: string) => {
    setProvince(value)
    setCity('')
    resetToFirstPage()
  }

  const updateCity = (value: string) => {
    setCity(value)
    resetToFirstPage()
  }

  const updateVenueKind = (value: VenueKindFilter) => {
    setVenueKind(value)
    resetToFirstPage()
  }

  const updateSport = (value: SportFilter) => {
    setSportFilter(value)
    resetToFirstPage()
  }

  const pageButtons = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1)
    }

    const buttons = new Set([1, totalPages, currentPage])
    if (currentPage > 1) buttons.add(currentPage - 1)
    if (currentPage < totalPages) buttons.add(currentPage + 1)
    return Array.from(buttons).sort((a, b) => a - b)
  }, [currentPage, totalPages])

  return (
    <div className="mx-auto grid max-w-[1540px] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[22px] border border-[#d7e4f5] bg-white p-6 shadow-[0_18px_60px_rgba(13,40,82,0.08)] sm:p-8">
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#6c7d98]">
            Venue Directory
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-[#071b46]">
            Find Venues
          </h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-[180px_210px_310px_200px_minmax(230px,1fr)_110px]">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#0e2147]">Province</span>
            <select
              value={province}
              onChange={(event) => updateProvince(event.target.value)}
              className="h-[52px] w-full rounded-lg border border-[#d7e2f0] bg-white px-4 text-sm font-semibold text-[#61708b] outline-none transition focus:border-[#0b61df] focus:ring-4 focus:ring-[#0b61df]/10"
            >
              <option value="">Select province</option>
              {provinces.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#0e2147]">City</span>
            <input
              value={city}
              onChange={(event) => updateCity(event.target.value)}
              list="venue-city-options"
              placeholder="Select or type city"
              className="h-[52px] w-full rounded-lg border border-[#d7e2f0] bg-white px-4 text-sm font-semibold text-[#61708b] outline-none transition focus:border-[#0b61df] focus:ring-4 focus:ring-[#0b61df]/10"
            />
            <datalist id="venue-city-options">
              {cities.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>

          <fieldset>
            <legend className="mb-2 block text-sm font-black text-[#0e2147]">Type</legend>
            <div className="grid h-[52px] grid-cols-3 overflow-hidden rounded-lg border border-[#d7e2f0] bg-white">
              {[
                { value: 'tennis', label: 'Tennis' },
                { value: 'pickleball', label: 'Pickleball' },
                { value: 'both', label: 'Both' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateSport(option.value as SportFilter)}
                  className={[
                    'border-r border-[#d7e2f0] px-3 text-sm font-black transition last:border-r-0',
                    sportFilter === option.value
                      ? 'bg-[#edf4ff] text-[#064fb8] ring-2 ring-inset ring-[#0b61df]'
                      : 'text-[#263a5f] hover:bg-[#f6f9fd]',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#0e2147]">Venue kind</span>
            <select
              value={venueKind}
              onChange={(event) => updateVenueKind(event.target.value as VenueKindFilter)}
              className="h-[52px] w-full rounded-lg border border-[#d7e2f0] bg-white px-4 text-sm font-semibold text-[#61708b] outline-none transition focus:border-[#0b61df] focus:ring-4 focus:ring-[#0b61df]/10"
            >
              {VENUE_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#0e2147]">
              Venue name <span className="font-semibold text-[#697895]">(optional)</span>
            </span>
            <input
              value={venueNameInput}
              onChange={(event) => setVenueNameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch()
              }}
              type="search"
              placeholder="Search by venue name"
              className="h-[52px] w-full rounded-lg border border-[#d7e2f0] bg-white px-4 text-sm font-semibold text-[#61708b] outline-none transition focus:border-[#0b61df] focus:ring-4 focus:ring-[#0b61df]/10"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSearch}
              className="h-[52px] w-full rounded-lg bg-[#004fc4] px-6 text-sm font-black text-white shadow-[0_10px_22px_rgba(0,79,196,0.22)] transition hover:bg-[#003f9e] 2xl:w-auto"
            >
              Search
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-[#cfe0f5] bg-[#f5f9ff] px-5 py-4 text-sm font-bold text-[#1c61d6] sm:flex-row sm:items-center sm:justify-between">
          <span>Create an account to save venues, get match invites, and join the venue's community.</span>
          <Link href={isSignedIn ? '/dashboard' : '/login?mode=register'} className="font-black text-[#075bd7]">
            {isSignedIn ? 'Open dashboard' : 'Create an account'} -&gt;
          </Link>
        </div>

        <div className="mt-8 overflow-hidden rounded-[20px] border border-[#dbe6f4] bg-white">
          <div className="flex items-center gap-4 border-b border-[#e3ebf6] px-5 py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#edf4ff] text-[#075bd7]">
              <SearchIcon />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#071b46]">
                {filtered.length} venue{filtered.length === 1 ? '' : 's'} found
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#667692]">
                Showing {showingStart}-{showingEnd} of {filtered.length}
              </p>
            </div>
          </div>

          {pageVenues.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm font-semibold text-[#667692]">
              No venues match the current filters.
            </div>
          ) : (
            <div>
              {pageVenues.map((venue, index) => {
                const isMember = myVenueIds.includes(venue.id)
                const isSaved = mySavedIds.includes(venue.id) && !isMember
                const badges = getSportBadges(venue)

                return (
                  <Link
                    key={venue.id}
                    href={getVenueCanonicalPath(venue)}
                    className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-2 border-b border-[#e7eef8] px-4 py-4 transition last:border-b-0 hover:bg-[#f8fbff] sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:gap-4 sm:px-5 sm:py-3.5"
                  >
                    <span className="hidden text-center text-sm font-bold text-[#5d6e8d] sm:block">
                      {startIndex + index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 basis-full text-base font-black leading-snug text-[#10244d] sm:basis-auto sm:truncate">
                          {getVenueDisplayName(venue)}
                        </span>
                        <span className="rounded-md bg-[#eef3fb] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#4d617f]">
                          {getVenueKindLabel(venue.venue_kind)}
                        </span>
                        {isMember ? (
                          <span className="rounded-full bg-[#e7f0ff] px-2 py-0.5 text-[10px] font-black uppercase text-[#075bd7]">Member</span>
                        ) : null}
                        {isSaved ? (
                          <span className="rounded-full bg-[#fff5db] px-2 py-0.5 text-[10px] font-black uppercase text-[#986c00]">Saved</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block break-words text-sm font-semibold leading-snug text-[#667692] sm:truncate">
                        {getVenueAddress(venue) || 'Address not listed'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center justify-end gap-3">
                      <span className="hidden flex-wrap justify-end gap-2 sm:flex">
                        {badges.map((badge) => (
                          <span
                            key={badge.label}
                            className={[
                              'rounded-md px-2.5 py-1 text-xs font-black',
                              badge.tone === 'tennis'
                                ? 'bg-[#e4f8e9] text-[#17833b]'
                                : 'bg-[#efe9ff] text-[#6b4cc2]',
                            ].join(' ')}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </span>
                      <span className="text-[#536989]">
                        <ArrowRightIcon />
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-[#e3ebf6] px-5 py-5">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="h-11 rounded-lg border border-[#d7e2f0] px-5 text-sm font-black text-[#5d6e8d] transition enabled:hover:bg-[#f7faff] disabled:opacity-45"
            >
              Previous
            </button>
            {pageButtons.map((buttonPage, index) => {
              const previous = pageButtons[index - 1]
              const needsGap = previous != null && buttonPage - previous > 1
              return (
                <span key={buttonPage} className="flex items-center gap-3">
                  {needsGap ? <span className="font-black text-[#7c8da8]">...</span> : null}
                  <button
                    type="button"
                    onClick={() => setPage(buttonPage)}
                    className={[
                      'h-11 min-w-[44px] rounded-lg border px-4 text-sm font-black transition',
                      currentPage === buttonPage
                        ? 'border-[#004fc4] bg-[#004fc4] text-white shadow-[0_8px_18px_rgba(0,79,196,0.2)]'
                        : 'border-[#d7e2f0] bg-white text-[#0f234b] hover:bg-[#f7faff]',
                    ].join(' ')}
                  >
                    {buttonPage}
                  </button>
                </span>
              )
            })}
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage === totalPages}
              className="h-11 rounded-lg border border-[#d7e2f0] px-5 text-sm font-black text-[#075bd7] transition enabled:hover:bg-[#f7faff] disabled:opacity-45"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <aside className="rounded-[22px] border border-[#d7e4f5] bg-white p-6 shadow-[0_18px_60px_rgba(13,40,82,0.08)] xl:sticky xl:top-6 xl:self-start">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#eaf2ff] text-[#075bd7]">
          <PeopleIcon />
        </div>
        <h2 className="mt-8 text-center text-xl font-black leading-relaxed text-[#071b46]">
          Create an account to join this venue's community
        </h2>
        <div className="mt-6 space-y-4 text-sm font-semibold text-[#5b6b86]">
          {[
            'Save venues to your favorites',
            'Join local players near you',
            'Get match invites',
          ].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0b61df] text-[#0b61df]">
                <CheckIcon />
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-4">
          <Link
            href={isSignedIn ? '/dashboard' : '/login?mode=register'}
            className="rounded-lg bg-[#004fc4] px-5 py-4 text-center text-sm font-black text-white shadow-[0_10px_22px_rgba(0,79,196,0.24)] transition hover:bg-[#003f9e]"
          >
            {isSignedIn ? 'Open Dashboard' : 'Register'}
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-[#d7e2f0] px-5 py-4 text-center text-sm font-black text-[#075bd7] transition hover:bg-[#f7faff]"
          >
            Learn more
          </Link>
        </div>
        <div className="mt-8 rounded-lg border border-[#cfe0f5] bg-[#f5f9ff] p-4">
          <p className="text-sm font-black text-[#1f62d4]">We respect your privacy.</p>
          <p className="mt-1 text-xs font-semibold text-[#64748b]">Your information is never shared.</p>
        </div>
      </aside>
    </div>
  )
}
