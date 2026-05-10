'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { joinVenue } from '@/lib/api/identities'
import type { GroupLocation, Sport, Venue } from '@/lib/types/database'
import type { GroupLocationInput, GroupLocationWithVenue } from '@/lib/api/groups'
import type { LocationCityOption } from '@/lib/api/location-municipalities'
import { DEFAULT_PLAY_COUNTRY, DEFAULT_PLAY_REGION } from '@/lib/play-location-defaults'
import { GROUP_LEVEL_RATING_OPTIONS } from '@/lib/profile-options'
import { getVenueDisplayName } from '@/lib/venues/display'

type Props = {
  groupName: string
  description: string | null
  primarySportId: number | null
  recommendedLevelMin: number | null
  recommendedLevelMax: number | null
  venueId: string | null
  openToClubMembers: boolean
  sports: Sport[]
  venues: Venue[]
  allVenues: Venue[]
  groupLocations: GroupLocationWithVenue[]
  cityOptions: LocationCityOption[]
  onSave: (data: {
    name: string
    description?: string | null
    primary_sport_id?: number | null
    venue_id?: string | null
    open_to_club_members?: boolean
    recommended_level_min?: number | null
    recommended_level_max?: number | null
  }) => Promise<void>
  onSaveLocations: (locations: GroupLocationInput[]) => Promise<void>
}

type CitySelection = {
  kind: 'city'
  city_name: string
  region: string | null
  country: string
}

type PrimaryOption = {
  key: string
  label: string
  input: GroupLocationInput
}

function normalizeCityName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function cityKey(city: Pick<CitySelection, 'city_name' | 'region' | 'country'>) {
  return `city:${city.city_name.trim().toLowerCase()}:${(city.region ?? '').trim().toLowerCase()}:${city.country.trim().toLowerCase()}`
}

function venueKey(venueIdValue: string) {
  return `venue:${venueIdValue}`
}

function getLocationPrimaryKey(location: GroupLocation): string | null {
  if (location.location_kind === 'city' && location.city_name && location.country) {
    return cityKey({
      city_name: location.city_name,
      region: location.region,
      country: location.country,
    })
  }
  if (location.location_kind === 'venue' && location.venue_id) {
    return venueKey(location.venue_id)
  }
  return null
}

export function GroupSettingsPanel({
  groupName,
  description,
  primarySportId,
  recommendedLevelMin,
  recommendedLevelMax,
  venueId,
  openToClubMembers,
  sports,
  venues,
  allVenues,
  groupLocations,
  cityOptions,
  onSave,
  onSaveLocations,
}: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState(groupName)
  const [announcement, setAnnouncement] = useState(description ?? '')
  const [sportId, setSportId] = useState(primarySportId ? String(primarySportId) : '')
  const [levelMin, setLevelMin] = useState(recommendedLevelMin != null ? recommendedLevelMin.toFixed(1) : '')
  const [levelMax, setLevelMax] = useState(recommendedLevelMax != null ? recommendedLevelMax.toFixed(1) : '')
  const [selectedCities, setSelectedCities] = useState<CitySelection[]>(
    groupLocations
      .filter((location) => location.location_kind === 'city' && location.city_name && location.country)
      .map((location) => ({
        kind: 'city',
        city_name: location.city_name!,
        region: location.region ?? DEFAULT_PLAY_REGION,
        country: location.country ?? DEFAULT_PLAY_COUNTRY,
      })),
  )
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>(
    groupLocations.some((location) => location.location_kind === 'venue')
      ? groupLocations
          .filter((location) => location.location_kind === 'venue' && location.venue_id)
          .map((location) => location.venue_id!)
      : venueId
        ? [venueId]
        : [],
  )
  const initialPrimaryKey =
    groupLocations.find((location) => location.is_primary)
      ? getLocationPrimaryKey(groupLocations.find((location) => location.is_primary)!)
      : null
  const [primaryLocationKey, setPrimaryLocationKey] = useState<string>(
    initialPrimaryKey ?? (venueId ? venueKey(venueId) : ''),
  )
  const [cityInput, setCityInput] = useState('')
  const [venueSearch, setVenueSearch] = useState('')
  const [availableVenues, setAvailableVenues] = useState<Venue[]>(venues)
  const [joiningVenueId, setJoiningVenueId] = useState<string | null>(null)
  const [openToClub, setOpenToClub] = useState(openToClubMembers)
  const [error, setError] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedVenueSet = new Set(selectedVenueIds)
  const availableVenueMap = new Map(availableVenues.map((venue) => [venue.id, venue]))
  const selectedVenues = selectedVenueIds
    .map((id) => availableVenueMap.get(id) ?? allVenues.find((venue) => venue.id === id) ?? null)
    .filter((venue): venue is Venue => Boolean(venue))
  const primaryOptions: PrimaryOption[] = [
    ...selectedCities.map((city) => ({
      key: cityKey(city),
      label: city.region ? `${city.city_name}, ${city.region}` : city.city_name,
      input: {
        kind: 'city' as const,
        city_name: city.city_name,
        region: city.region,
        country: city.country,
      },
    })),
    ...selectedVenues.map((venue) => ({
      key: venueKey(venue.id),
      label: getVenueDisplayName(venue),
      input: {
        kind: 'venue' as const,
        venue_id: venue.id,
      },
    })),
  ]
  const effectivePrimaryKey =
    primaryOptions.length === 1
      ? primaryOptions[0].key
      : primaryOptions.some((option) => option.key === primaryLocationKey)
        ? primaryLocationKey
        : primaryOptions[0]?.key ?? ''
  const filteredCityOptions = useMemo(() => {
    const query = normalizeCityName(cityInput).toLowerCase()
    return cityOptions.filter((option) => {
      if (selectedCities.some((city) => cityKey(city) === cityKey(option))) return false
      const searchBlob = [
        option.city_name,
        option.region,
        option.country,
        option.region_english,
        option.upper_tier_county_district,
        option.municipality_type,
      ].join(' ').toLowerCase()
      return !query || searchBlob.includes(query)
    }).slice(0, 40)
  }, [cityInput, cityOptions, selectedCities])
  const venueSearchResults = useMemo(() => {
    const query = venueSearch.trim().toLowerCase()
    if (!query) return []
    const availableIds = new Set(availableVenues.map((venue) => venue.id))
    return allVenues
      .filter((venue) => !availableIds.has(venue.id))
      .filter((venue) => {
        const blob = [venue.name, venue.abbreviation, venue.city, venue.province, venue.country]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return blob.includes(query)
      })
      .slice(0, 8)
  }, [allVenues, availableVenues, venueSearch])

  const addCity = (option: LocationCityOption) => {
    const nextCity: CitySelection = {
      kind: 'city',
      city_name: option.city_name,
      region: option.region,
      country: option.country,
    }
    if (selectedCities.some((city) => cityKey(city) === cityKey(nextCity))) {
      setLocationError('This city is already selected.')
      return
    }
    setLocationError(null)
    setSelectedCities((current) => [...current, nextCity])
    setCityInput('')
    if (primaryOptions.length === 0) {
      setPrimaryLocationKey(cityKey(nextCity))
    }
  }

  const removeCity = (key: string) => {
    setLocationError(null)
    setSelectedCities((current) => current.filter((city) => cityKey(city) !== key))
    if (primaryLocationKey === key) setPrimaryLocationKey('')
  }

  const toggleVenue = (nextVenueId: string) => {
    setLocationError(null)
    setSelectedVenueIds((current) => {
      if (current.includes(nextVenueId)) {
        return current.filter((id) => id !== nextVenueId)
      }
      if (primaryOptions.length === 0) {
        setPrimaryLocationKey(venueKey(nextVenueId))
      }
      return [...current, nextVenueId]
    })
    if (primaryLocationKey === venueKey(nextVenueId)) setPrimaryLocationKey('')
  }

  const addExternalVenue = async (venue: Venue) => {
    setLocationError(null)
    setJoiningVenueId(venue.id)
    try {
      const supabase = createSupabaseBrowserClient()
      await joinVenue(supabase, venue.id)
      setAvailableVenues((current) => current.some((item) => item.id === venue.id) ? current : [...current, venue])
      setSelectedVenueIds((current) => current.includes(venue.id) ? current : [...current, venue.id])
      if (primaryOptions.length === 0) {
        setPrimaryLocationKey(venueKey(venue.id))
      }
      setVenueSearch('')
      router.refresh()
    } catch (joinError) {
      setLocationError((joinError as { message?: string })?.message ?? 'Could not add this venue.')
    } finally {
      setJoiningVenueId(null)
    }
  }

  const buildLocationPayload = (): GroupLocationInput[] => {
    const primaryKey = effectivePrimaryKey
    return primaryOptions.map((option) => ({
      ...option.input,
      is_primary: option.key === primaryKey,
    }))
  }

  const handleSave = () => {
    setError(null)
    setSuccess(null)
    setLocationError(null)
    if (levelMin && levelMax && Number(levelMin) > Number(levelMax)) {
      setError('Level minimum cannot be higher than level maximum.')
      return
    }
    startTransition(async () => {
      try {
        const locationPayload = buildLocationPayload()
        await onSave({
          name,
          description: announcement.trim() || null,
          primary_sport_id: sportId ? Number(sportId) : null,
          venue_id: selectedVenueIds.includes(effectivePrimaryKey.replace(/^venue:/, ''))
            ? effectivePrimaryKey.replace(/^venue:/, '')
            : selectedVenueIds[0] ?? null,
          open_to_club_members: openToClub,
          recommended_level_min: levelMin ? Number(levelMin) : null,
          recommended_level_max: levelMax ? Number(levelMax) : null,
        })
        if (locationPayload.length > 0) {
          await onSaveLocations(locationPayload)
          setPrimaryLocationKey(effectivePrimaryKey)
        }
        setSuccess('Saved.')
        setIsOpen(false)
        router.refresh()
      } catch (saveError) {
        const message = (saveError as { message?: string })?.message
        if (message === 'group_location_required' || message === 'invalid_group_city') {
          setLocationError(message === 'invalid_group_city' ? 'Choose a city from the approved city list.' : 'Add at least one city or venue.')
        } else {
          setError(message ?? 'Could not save settings.')
        }
      }
    })
  }

  return (
    <section
      style={{
        display: 'grid',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={{
          width: '100%',
          borderRadius: '14px',
          border: '1px solid #1e293b',
          background: '#fff',
          color: '#0f172a',
          padding: '0.8rem 1rem',
          fontSize: '0.92rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Group Settings
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Group Settings"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(15, 23, 42, 0.42)',
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: 'min(760px, 100%)',
              maxHeight: 'calc(100vh - 2rem)',
              overflow: 'auto',
              borderRadius: '24px',
              background: '#fff',
              border: '1px solid #dbe4ee',
              boxShadow: '0 28px 70px rgba(15, 23, 42, 0.22)',
            }}
          >
            <header
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1rem 1.1rem',
                borderBottom: '1px solid #e2e8f0',
                background: '#fff',
              }}
            >
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 900 }}>
                Group Settings
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close group settings"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '999px',
                  border: '1px solid #dbe4ee',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                x
              </button>
            </header>
            <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem 1.1rem 1.15rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>Group Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Group name"
              style={{
                width: '100%',
                padding: '0.72rem 0.8rem',
                fontSize: '0.88rem',
                borderRadius: '12px',
                border: '1px solid #d0d5dd',
                color: '#0f172a',
                background: '#fff',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>Sport</span>
            <select
              value={sportId}
              onChange={(event) => setSportId(event.target.value)}
              style={{
                width: '100%',
                padding: '0.72rem 0.8rem',
                fontSize: '0.88rem',
                borderRadius: '12px',
                border: '1px solid #d0d5dd',
                color: '#0f172a',
                background: '#fff',
              }}
            >
              <option value="">Sport to be assigned</option>
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>{sport.display_name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
          <div style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>
            Recommended Level Range
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
            <select
              value={levelMin}
              onChange={(event) => setLevelMin(event.target.value)}
              aria-label="Recommended level minimum"
              style={{
                width: '100%',
                padding: '0.72rem 0.8rem',
                fontSize: '0.88rem',
                borderRadius: '12px',
                border: '1px solid #d0d5dd',
                color: '#0f172a',
                background: '#fff',
              }}
            >
              <option value="">No min level</option>
              {GROUP_LEVEL_RATING_OPTIONS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
            <select
              value={levelMax}
              onChange={(event) => setLevelMax(event.target.value)}
              aria-label="Recommended level maximum"
              style={{
                width: '100%',
                padding: '0.72rem 0.8rem',
                fontSize: '0.88rem',
                borderRadius: '12px',
                border: '1px solid #d0d5dd',
                color: '#0f172a',
                background: '#fff',
              }}
            >
              <option value="">No max level</option>
              {GROUP_LEVEL_RATING_OPTIONS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
          </div>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>Group Note</span>
            <textarea
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value)}
              placeholder="Announcement / group note"
              rows={3}
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '0.72rem 0.8rem',
                fontSize: '0.88rem',
                borderRadius: '12px',
                border: '1px solid #d0d5dd',
                color: '#0f172a',
                background: '#fff',
              }}
            />
          </label>
          <div style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>Access</div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
                gap: '0.6rem',
              borderRadius: '12px',
              border: '1px solid #d0d5dd',
              background: '#fff',
              padding: '0.78rem 0.8rem',
              color: '#0f172a',
              fontSize: '0.86rem',
              lineHeight: 1.45,
            }}
          >
            <input
              type="checkbox"
              checked={openToClub}
              onChange={(event) => setOpenToClub(event.target.checked)}
              style={{ margin: 0 }}
            />
              <span>
              <span style={{ display: 'block', fontWeight: 700 }}>Open to club members</span>
              <span style={{ display: 'block', color: '#667085', fontSize: '0.78rem' }}>
                {selectedVenueIds.length > 0 ? 'Discoverable from selected venues.' : 'Add a venue first.'}
              </span>
            </span>
          </label>
          <section
            style={{
              borderRadius: '18px',
              border: '1px solid #dbe4ee',
              background: '#ffffff',
              padding: '0.9rem',
              display: 'grid',
              gap: '0.85rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '0.98rem', lineHeight: 1.2, fontWeight: 800 }}>
                Where this group plays
              </h3>
            </div>

            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <label style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>Play cities</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {selectedCities.map((city) => {
                  const key = cityKey(city)
                  return (
                    <span
                      key={key}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        borderRadius: '999px',
                        border: '1px solid #dbe4ee',
                        background: '#f8fbff',
                        color: '#0f172a',
                        padding: '0.34rem 0.55rem',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                      }}
                    >
                      {city.city_name}
                      <button
                        type="button"
                        onClick={() => removeCity(key)}
                        aria-label={`Remove ${city.city_name}`}
                        style={{ border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 900 }}
                      >
                        x
                      </button>
                    </span>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '0.45rem' }}>
                <input
                  type="text"
                  value={cityInput}
                  onChange={(event) => setCityInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const firstMatch = filteredCityOptions[0]
                      if (firstMatch) addCity(firstMatch)
                    }
                  }}
                  placeholder="Search and select a city"
                  style={{
                    minWidth: 0,
                    flex: 1,
                    padding: '0.62rem 0.72rem',
                    fontSize: '0.82rem',
                    borderRadius: '12px',
                    border: '1px solid #d0d5dd',
                    color: '#0f172a',
                    background: '#fff',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const firstMatch = filteredCityOptions[0]
                    if (firstMatch) addCity(firstMatch)
                  }}
                  disabled={filteredCityOptions.length === 0}
                  style={{
                    borderRadius: '12px',
                    border: 'none',
                    background: '#1e293b',
                    color: '#fff',
                    padding: '0 0.78rem',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: filteredCityOptions.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: filteredCityOptions.length === 0 ? 0.55 : 1,
                  }}
                >
                  Add
                </button>
              </div>
              {cityInput || filteredCityOptions.length > 0 ? (
                <div style={{ maxHeight: '10rem', overflow: 'auto', borderRadius: '12px', border: '1px solid #dbe4ee', background: '#fff' }}>
                  {filteredCityOptions.length > 0 ? filteredCityOptions.map((option) => (
                    <button
                      key={cityKey(option)}
                      type="button"
                      onClick={() => addCity(option)}
                      style={{
                        display: 'flex',
                        width: '100%',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.6rem',
                        border: '0',
                        borderBottom: '1px solid #eef2f7',
                        background: '#fff',
                        padding: '0.55rem 0.65rem',
                        color: '#0f172a',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800 }}>{option.city_name}</span>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b' }}>
                          {option.region_english}
                        </span>
                      </span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Select</span>
                    </button>
                  )) : (
                    <div style={{ padding: '0.65rem', color: '#b42318', fontSize: '0.74rem', fontWeight: 700 }}>
                      City must be selected from the approved city table.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <label style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>Regular venues</label>
              {availableVenues.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>No member venues available.</div>
              ) : (
                <div style={{ display: 'grid', gap: '0.38rem' }}>
                  {availableVenues.map((venue) => {
                    const checked = selectedVenueSet.has(venue.id)
                    return (
                      <label
                        key={venue.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.55rem',
                          borderRadius: '12px',
                          border: checked ? '1px solid #93c5fd' : '1px solid #dbe4ee',
                          background: checked ? '#eff6ff' : '#f8fbff',
                          padding: '0.55rem 0.65rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleVenue(venue.id)}
                          style={{ margin: 0 }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', color: '#0f172a', fontSize: '0.8rem', fontWeight: 800 }}>
                            {getVenueDisplayName(venue)}
                          </span>
                          {venue.city ? (
                            <span style={{ display: 'block', color: '#64748b', fontSize: '0.72rem' }}>
                              {[venue.city, venue.province].filter(Boolean).join(', ')}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.45rem' }}>
                <input
                  type="text"
                  value={venueSearch}
                  onChange={(event) => setVenueSearch(event.target.value)}
                  placeholder="Search more venues"
                  style={{
                    width: '100%',
                    padding: '0.62rem 0.72rem',
                    fontSize: '0.82rem',
                    borderRadius: '12px',
                    border: '1px solid #d0d5dd',
                    color: '#0f172a',
                    background: '#fff',
                  }}
                />
                {venueSearch.trim() ? (
                  <div style={{ maxHeight: '12rem', overflow: 'auto', borderRadius: '12px', border: '1px solid #dbe4ee', background: '#fff' }}>
                    {venueSearchResults.length > 0 ? venueSearchResults.map((venue) => {
                      const isJoining = joiningVenueId === venue.id
                      return (
                        <button
                          key={venue.id}
                          type="button"
                          onClick={() => addExternalVenue(venue)}
                          disabled={Boolean(joiningVenueId)}
                          style={{
                            display: 'flex',
                            width: '100%',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.7rem',
                            border: 0,
                            borderBottom: '1px solid #eef2f7',
                            background: '#fff',
                            padding: '0.58rem 0.65rem',
                            color: '#0f172a',
                            cursor: joiningVenueId ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            opacity: joiningVenueId && !isJoining ? 0.55 : 1,
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800 }}>{getVenueDisplayName(venue)}</span>
                            <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b' }}>
                              {[venue.city, venue.province].filter(Boolean).join(', ') || 'Venue'}
                            </span>
                          </span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>
                            {isJoining ? 'Adding' : 'Add'}
                          </span>
                        </button>
                      )
                    }) : (
                      <div style={{ padding: '0.65rem', color: '#94a3b8', fontSize: '0.74rem', fontWeight: 700 }}>
                        No matching venues.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <label htmlFor="group-primary-location" style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 800 }}>
                Primary location
              </label>
              <select
                id="group-primary-location"
                value={effectivePrimaryKey}
                onChange={(event) => setPrimaryLocationKey(event.target.value)}
                disabled={primaryOptions.length <= 1}
                style={{
                  width: '100%',
                  padding: '0.62rem 0.72rem',
                  fontSize: '0.82rem',
                  borderRadius: '12px',
                  border: '1px solid #d0d5dd',
                  color: '#0f172a',
                  background: primaryOptions.length <= 1 ? '#f8fafc' : '#fff',
                }}
              >
                {primaryOptions.length === 0 ? <option value="">No locations selected</option> : null}
                {primaryOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {locationError ? <p style={{ color: '#b42318', fontSize: '0.78rem', margin: 0 }}>{locationError}</p> : null}
          </section>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            style={{
              width: '100%',
              padding: '0.72rem 0.9rem',
              borderRadius: '12px',
              border: 'none',
              background: '#0f172a',
              color: '#fff',
              fontSize: '0.86rem',
              fontWeight: 700,
              opacity: isPending ? 0.6 : 1,
              cursor: 'pointer',
            }}
          >
            {isPending ? 'Saving...' : 'Save settings'}
          </button>
          {error ? <p style={{ color: '#b42318', fontSize: '0.78rem', margin: 0 }}>{error}</p> : null}
          {success ? <p style={{ color: '#15803d', fontSize: '0.78rem', margin: 0 }}>{success}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
