'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getVenueDisplayName } from '@/lib/venues/display'
import { completeFirstOnboardingAction } from './actions'
import { DEFAULT_PLAY_COUNTRY, DEFAULT_PLAY_REGION } from '@/lib/play-location-defaults'
import type { Profile, Sport, Venue } from '@/lib/types/database'
import type { LocationCityOption } from '@/lib/api/location-municipalities'

type PlayCityRecord = {
  city_name: string
  region: string | null
  country: string | null
}

type VenueOption = Pick<Venue, 'id' | 'name' | 'abbreviation' | 'city' | 'province' | 'country' | 'location_text' | 'venue_kind'>

interface Props {
  existing: Profile | null
  next: string
  sports: Sport[]
  venues: VenueOption[]
  cityOptions: LocationCityOption[]
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase()
}

function normalizeCityName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

const QUICK_CITY_GROUPS = [
  { label: 'Peel', cities: ['Mississauga', 'Brampton', 'Caledon'] },
  { label: 'Halton', cities: ['Oakville', 'Burlington', 'Milton', 'Halton Hills', 'Acton', 'Georgetown'] },
]

function getQuickCityGroups(cityOptions: string[], selectedCities: string[]) {
  const optionByLowerName = new Map(cityOptions.map((city) => [city.toLowerCase(), city]))
  const selectedLowerNames = new Set(selectedCities.map((city) => city.toLowerCase()))

  return QUICK_CITY_GROUPS
    .map((group) => ({
      ...group,
      cities: group.cities
        .map((city) => optionByLowerName.get(city.toLowerCase()))
        .filter((city): city is string => typeof city === 'string' && !selectedLowerNames.has(city.toLowerCase())),
    }))
    .filter((group) => group.cities.length > 0)
}

function getVenueMetaLine(venue: VenueOption): string {
  const cityRegion = [venue.city?.trim(), venue.province?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(', ')
  const parts = [
    venue.location_text?.trim() || null,
    cityRegion || venue.country?.trim() || null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' • ') || 'Location not set'
}

function buildErrorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : error instanceof Error
        ? error.message
      : 'Failed to save your profile.'
  return message && !message.startsWith('{') ? message : 'Failed to save your profile.'
}

function Icon({
  children,
  className = 'h-4 w-4',
  viewBox = '0 0 24 24',
}: {
  children: React.ReactNode
  className?: string
  viewBox?: string
}) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const CheckIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 12.5l4 4L19 7.5" />
  </Icon>
)

const MapPinIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 21s-6-5.2-6-11a6 6 0 1 1 12 0c0 5.8-6 11-6 11Z" />
    <circle cx="12" cy="10" r="2.2" />
  </Icon>
)

const SearchIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)

const TrophyIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M8 4h8v2a4 4 0 0 1-8 0V4Z" />
    <path d="M12 10v4" />
    <path d="M9 18h6" />
    <path d="M6 6H4a2 2 0 0 0 2 2" />
    <path d="M18 6h2a2 2 0 0 1-2 2" />
  </Icon>
)

const BuildingIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 20V6.5L12 3l8 3.5V20" />
    <path d="M9 20v-4h6v4" />
    <path d="M8 8h.01" />
    <path d="M12 8h.01" />
    <path d="M16 8h.01" />
    <path d="M8 11h.01" />
    <path d="M12 11h.01" />
    <path d="M16 11h.01" />
  </Icon>
)

const CloseIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Icon>
)

export function ProfileForm({ existing, next, sports, venues, cityOptions }: Props) {
  const initialDisplayName = useMemo(
    () => existing?.display_name?.trim() ?? '',
    [existing],
  )

  const availableCities = useMemo(
    () =>
      Array.from(
        new Set(
          cityOptions
            .map((city) => normalizeCityName(city.city_name))
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [cityOptions],
  )

  const cityMetaMap = useMemo(() => {
    const map = new Map<string, { region: string | null; country: string | null }>()
    for (const city of cityOptions) {
      const cityName = normalizeCityName(city.city_name)
      if (!cityName || map.has(cityName.toLowerCase())) continue
      map.set(cityName.toLowerCase(), {
        region: city.region ?? DEFAULT_PLAY_REGION,
        country: city.country ?? DEFAULT_PLAY_COUNTRY,
      })
    }
    return map
  }, [cityOptions])

  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [selectedSportIds, setSelectedSportIds] = useState<number[]>([])
  const [selectedCities, setSelectedCities] = useState<PlayCityRecord[]>([])
  const [selectedVenues, setSelectedVenues] = useState<VenueOption[]>([])
  const [cityDiscovery, setCityDiscovery] = useState(true)
  const [clubDiscovery, setClubDiscovery] = useState(true)
  const [cityInput, setCityInput] = useState('')
  const [clubInput, setClubInput] = useState('')
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false)
  const [isClubDropdownOpen, setIsClubDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({})

  const cityDropdownRef = useRef<HTMLDivElement | null>(null)
  const clubDropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(target)) {
        setIsCityDropdownOpen(false)
      }
      if (clubDropdownRef.current && !clubDropdownRef.current.contains(target)) {
        setIsClubDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const filteredCities = useMemo(() => {
    const query = normalizeQuery(cityInput)
    return availableCities.filter((city) => {
      if (selectedCities.some((entry) => entry.city_name === city)) return false
      return !query || city.toLowerCase().includes(query)
    })
  }, [availableCities, cityInput, selectedCities])
  const quickCityGroups = useMemo(
    () => getQuickCityGroups(availableCities, selectedCities.map((city) => city.city_name)),
    [availableCities, selectedCities],
  )

  const availableFilteredVenues = useMemo(() => {
    const query = normalizeQuery(clubInput)
    const selectedCityNames = new Set(selectedCities.map((city) => city.city_name))
    return venues.filter((venue) => {
      const venueCity = normalizeCityName(venue.city ?? '')
      if (!selectedCityNames.has(venueCity)) return false
      if (selectedVenues.some((selectedVenue) => selectedVenue.id === venue.id)) return false
      const searchBlob = [
        getVenueDisplayName(venue as Venue),
        venue.name,
        venue.abbreviation ?? '',
        venue.city ?? '',
        venue.province ?? '',
        venue.country ?? '',
        venue.location_text ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return !query || searchBlob.includes(query)
    })
  }, [clubInput, selectedCities, selectedVenues, venues])

  const toggleSport = (sportId: number) => {
    setSelectedSportIds((current) =>
      current.includes(sportId)
        ? current.filter((id) => id !== sportId)
        : [...current, sportId],
    )
    setErrorMessages((current) => ({ ...current, sports: '' }))
  }

  const addCity = (cityName: string) => {
    const normalized = normalizeCityName(cityName)
    if (!normalized) return
    if (!cityMetaMap.has(normalized.toLowerCase())) {
      setErrorMessages((current) => ({
        ...current,
        cities: 'Choose a city from the approved city list.',
      }))
      return
    }
    if (selectedCities.some((city) => city.city_name === normalized)) return

    if (selectedCities.length >= 8) {
      setErrorMessages((current) => ({
        ...current,
        cities: 'You can add up to 8 play cities.',
      }))
      return
    }

    const meta = cityMetaMap.get(normalized.toLowerCase()) ?? {
      region: DEFAULT_PLAY_REGION,
      country: DEFAULT_PLAY_COUNTRY,
    }

    setSelectedCities((current) => [
      ...current,
      {
        city_name: normalized,
        region: meta.region,
        country: meta.country,
      },
    ])
    setCityInput('')
    setIsCityDropdownOpen(false)
    setErrorMessages((current) => ({ ...current, cities: '' }))
  }

  const removeCity = (cityName: string) => {
    setSelectedCities((current) => current.filter((city) => city.city_name !== cityName))
    setSelectedVenues((current) => current.filter((venue) => normalizeCityName(venue.city ?? '') !== cityName))
    setErrorMessages((current) => ({ ...current, cities: '' }))
  }

  const addVenue = (venue: VenueOption) => {
    if (selectedVenues.some((current) => current.id === venue.id)) return
    setSelectedVenues((current) => [...current, venue])
    setClubInput('')
    setIsClubDropdownOpen(false)
  }

  const removeVenue = (venueId: string) => {
    setSelectedVenues((current) => current.filter((venue) => venue.id !== venueId))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedDisplayName = displayName.trim()

    if (!trimmedDisplayName) {
      setErrorMessages((current) => ({
        ...current,
        displayName: 'Display name is required.',
      }))
      return
    }

    if (selectedSportIds.length === 0) {
      setErrorMessages((current) => ({
        ...current,
        sports: 'Choose at least one sport.',
      }))
      return
    }

    setLoading(true)
    setErrorMessages({})

    try {
      const result = await completeFirstOnboardingAction({
        display_name: trimmedDisplayName,
        sport_ids: selectedSportIds,
        play_cities: selectedCities.map((city) => ({
          city_name: city.city_name,
          region: city.region,
          country: city.country,
        })),
        club_or_venue_ids: selectedVenues.map((venue) => venue.id),
        visible_in_city_discovery: cityDiscovery && selectedCities.length > 0,
        visible_in_club_member_discovery: clubDiscovery && selectedVenues.length > 0,
      })

      if (!result.ok) {
        throw new Error(result.error)
      }

      const primarySportId = result.primarySportId ?? selectedSportIds[0]
      const searchParams = new URLSearchParams()
      if (next) searchParams.set('next', next)
      if (primarySportId) searchParams.set('primarySportId', String(primarySportId))
      window.location.assign(next || `/dashboard${searchParams.toString() ? `?${searchParams.toString()}` : ''}`)
    } catch (saveError) {
      console.error('[onboarding:profile]', saveError)
      setErrorMessages((current) => ({
        ...current,
        submit: buildErrorMessage(saveError),
      }))
      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-2">
        <label htmlFor="displayName" className="text-h2 block text-[#1E293B]">
          Display name
        </label>
        <p className="text-body-sub text-[#64748B]">
          This is how other registered players will recognize you.
        </p>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value)
            if (event.target.value.trim()) {
              setErrorMessages((current) => ({ ...current, displayName: '' }))
            }
          }}
          disabled={loading}
          className={[
            'ph-input h-12 rounded-2xl border px-4 text-sm',
            errorMessages.displayName ? 'border-rose-400 bg-rose-50/60' : 'border-[#D7E0EC]',
          ].join(' ')}
          placeholder="How other players see you"
        />
        {errorMessages.displayName ? (
          <p className="text-body-sub text-rose-600">{errorMessages.displayName}</p>
        ) : null}
      </div>

      <div className="space-y-3">
        <label className="text-h2 block text-[#1E293B]">Sports you play</label>
        <div className="flex flex-wrap gap-2 pt-1">
          {sports.map((sport) => {
            const selected = selectedSportIds.includes(sport.id)
            return (
              <button
                key={sport.id}
                type="button"
                onClick={() => toggleSport(sport.id)}
                className={[
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-body-main font-semibold transition',
                  selected
                    ? 'border-[#C25E46] bg-[#C25E46] text-white shadow-[0_10px_24px_rgba(194,94,70,0.24)]'
                    : 'border-[#D7E0EC] bg-white text-[#475569] hover:border-[#C25E46]/40 hover:bg-[#F8FBFF]',
                ].join(' ')}
              >
                {selected ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                {sport.display_name}
              </button>
            )
          })}
        </div>
        {errorMessages.sports ? (
          <p className="text-body-sub text-rose-600">{errorMessages.sports}</p>
        ) : selectedSportIds.length === 0 ? (
          <p className="text-body-sub text-[#64748B]">Choose at least one sport.</p>
        ) : null}
      </div>

      <div className="space-y-3">
        <label className="text-h2 flex items-center justify-between text-[#1E293B]">
          <span>Cities where you play</span>
          <span className="text-body-sub text-[#94A3B8]">{selectedCities.length}/8</span>
        </label>

        {selectedCities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedCities.map((city) => (
              <span
                key={city.city_name}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D7E0EC] bg-white px-3 py-2 text-body-main text-[#334155]"
              >
                <MapPinIcon className="h-3.5 w-3.5 text-[#94A3B8]" />
                {city.city_name}
                <button
                  type="button"
                  onClick={() => removeCity(city.city_name)}
                  className="ml-1 text-[#94A3B8] transition hover:text-rose-500"
                  aria-label={`Remove ${city.city_name}`}
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div ref={cityDropdownRef} className="relative">
          <div className="flex items-center rounded-2xl border border-[#D7E0EC] bg-white px-4 py-3 focus-within:border-[#C25E46]">
            <SearchIcon className="mr-2 h-4 w-4 text-[#94A3B8]" />
            <input
              type="text"
              value={cityInput}
              onChange={(event) => {
                setCityInput(event.target.value)
                setIsCityDropdownOpen(true)
              }}
              onFocus={() => setIsCityDropdownOpen(true)}
              placeholder="Search and select a city..."
              className="flex-1 border-0 bg-transparent p-0 text-body-main text-[#1E293B] shadow-none focus:ring-0"
              disabled={selectedCities.length >= 8 || loading}
            />
          </div>

          {quickCityGroups.length > 0 ? (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              {quickCityGroups.map((group) => (
                <div key={group.label} className="flex shrink-0 items-center gap-1.5">
                  {group.cities.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => addCity(city)}
                      disabled={selectedCities.length >= 8 || loading}
                      className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#D7E0EC] bg-white px-3 text-body-sub font-semibold text-[#334155] transition hover:border-[#C25E46] hover:text-[#071A44] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {city}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {isCityDropdownOpen && selectedCities.length < 8 ? (
            <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-[20px] border border-[#E2E8F0] bg-white shadow-[0_20px_42px_-34px_rgba(15,23,42,0.24)]">
              {filteredCities.length > 0 ? (
                filteredCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => addCity(city)}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left text-body-main text-[#334155] transition hover:bg-[#F8FBFF] last:border-b-0"
                  >
                    <span>{city}</span>
                    <span className="text-label text-[#94A3B8]">Add</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-body-sub text-[#94A3B8]">
                  No cities found matching "{cityInput}".
                </div>
              )}
            </div>
          ) : null}
        </div>

        {errorMessages.cities ? (
          <p className="text-body-sub text-rose-600">{errorMessages.cities}</p>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-6">
        <div>
          <label className="text-h2 block text-[#1E293B]">Clubs or venues</label>
          <p className="text-body-sub mt-1 text-[#64748B]">
            Add venues so you can discover players to play with.
          </p>
        </div>

        {selectedVenues.length > 0 ? (
          <div className="space-y-2">
            {selectedVenues.map((venue) => (
              <div
                key={venue.id}
                className="flex items-center justify-between rounded-[20px] border border-[#D7E0EC] bg-[#F8FBFF] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#C25E46] shadow-sm">
                    <TrophyIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-title-main text-[#1E293B]">{getVenueDisplayName(venue as Venue)}</div>
                    <div className="text-body-sub text-[#64748B]">{getVenueMetaLine(venue)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeVenue(venue.id)}
                  className="rounded-full p-1 text-[#94A3B8] transition hover:bg-white hover:text-rose-500"
                  aria-label={`Remove ${getVenueDisplayName(venue as Venue)}`}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {selectedCities.length === 0 ? (
          <div className="rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4 text-body-sub text-[#64748B]">
            Please select at least one city above to find clubs or venues.
          </div>
        ) : (
          <div ref={clubDropdownRef} className="relative">
            <div className="flex items-center rounded-2xl border border-[#D7E0EC] bg-white px-4 py-3 focus-within:border-[#C25E46]">
              <BuildingIcon className="mr-2 h-4 w-4 text-[#94A3B8]" />
              <input
                type="text"
                value={clubInput}
                onChange={(event) => {
                  setClubInput(event.target.value)
                  setIsClubDropdownOpen(true)
                }}
                onFocus={() => setIsClubDropdownOpen(true)}
                placeholder="Search clubs in your selected cities..."
                className="flex-1 border-0 bg-transparent p-0 text-body-main text-[#1E293B] shadow-none focus:ring-0"
                disabled={loading}
              />
            </div>

            {isClubDropdownOpen ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white shadow-[0_20px_42px_-34px_rgba(15,23,42,0.24)]">
                {availableFilteredVenues.length > 0 ? (
                  <div className="max-h-[300px] overflow-y-auto">
                    {availableFilteredVenues.map((venue) => (
                      <div
                        key={venue.id}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="text-body-main truncate font-semibold text-[#1E293B]">{getVenueDisplayName(venue as Venue)}</div>
                          <div className="text-body-sub text-[#64748B]">{getVenueMetaLine(venue)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addVenue(venue)}
                          className="shrink-0 rounded-full bg-[#F0F7FF] px-3 py-1 text-body-sub font-semibold text-[#1E293B] transition hover:bg-[#E8F1FB]"
                        >
                          Add venue
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-body-sub text-[#94A3B8]">
                    No new clubs or venues found for your selected cities.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-5 border-t border-slate-100 pt-6">
        <div>
          <h2 className="text-h2 text-[#1E293B]">Who can find me?</h2>
          <p className="text-body-sub mt-1 text-[#64748B]">
            Choose where other players can find and save you. Your email and phone will not be shown.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="pr-4">
            <button
              type="button"
              onClick={() => {
                if (selectedVenues.length > 0) setClubDiscovery((current) => !current)
              }}
              className={[
                'text-left text-body-main font-semibold',
                selectedVenues.length > 0 ? 'text-[#1E293B]' : 'cursor-not-allowed text-[#94A3B8]',
              ].join(' ')}
            >
              Let members of my clubs find me
            </button>
            {selectedVenues.length === 0 ? (
              <p className="mt-2 inline-block rounded-xl bg-amber-50 px-3 py-2 text-body-sub text-amber-700">
                Add clubs or venues above so members of those places can find you.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={selectedVenues.length > 0 && clubDiscovery}
            disabled={selectedVenues.length === 0}
            onClick={() => {
              if (selectedVenues.length > 0) setClubDiscovery((current) => !current)
            }}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 rounded-full transition',
              selectedVenues.length === 0
                ? 'cursor-not-allowed bg-slate-200 opacity-60'
                : clubDiscovery
                  ? 'bg-[#C25E46]'
                  : 'bg-slate-200',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition',
                selectedVenues.length > 0 && clubDiscovery ? 'left-[22px]' : 'left-0.5',
              ].join(' ')}
            />
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="pr-4">
            <button
              type="button"
              onClick={() => {
                if (selectedCities.length > 0) setCityDiscovery((current) => !current)
              }}
              className={[
                'text-left text-body-main font-semibold',
                selectedCities.length > 0 ? 'text-[#1E293B]' : 'cursor-not-allowed text-[#94A3B8]',
              ].join(' ')}
            >
              Let players in my play cities find me
            </button>
            {selectedCities.length === 0 ? (
              <p className="mt-2 inline-block rounded-xl bg-amber-50 px-3 py-2 text-body-sub text-amber-700">
                Add at least one play city above so players in your cities can find you.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={selectedCities.length > 0 && cityDiscovery}
            disabled={selectedCities.length === 0}
            onClick={() => {
              if (selectedCities.length > 0) setCityDiscovery((current) => !current)
            }}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 rounded-full transition',
              selectedCities.length === 0
                ? 'cursor-not-allowed bg-slate-200 opacity-60'
                : cityDiscovery
                  ? 'bg-[#C25E46]'
                  : 'bg-slate-200',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition',
                selectedCities.length > 0 && cityDiscovery ? 'left-[22px]' : 'left-0.5',
              ].join(' ')}
            />
          </button>
        </div>
      </div>

      {errorMessages.submit ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-body-main text-rose-700">
          {errorMessages.submit}
        </div>
      ) : null}

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="ph-button-primary w-full justify-center py-4 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Saving...' : 'Save and start'}
        </button>
      </div>
    </form>
  )
}
