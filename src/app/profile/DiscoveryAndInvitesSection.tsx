'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { UserPlayCity, VenueIdentity, Venue } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'
import { DEFAULT_PLAY_COUNTRY, DEFAULT_PLAY_REGION } from '@/lib/play-location-defaults'
import type { DashboardPreferenceSaveResult } from '@/app/dashboard/dashboard.actions'

interface Props {
  showTitle?: boolean
  visibleInCityDiscovery: boolean
  searchableByEmailOrPhone: boolean
  playCities: UserPlayCity[]
  identities: (VenueIdentity & { venue: Venue })[]
  onSaveGlobal: (params: {
    visible_in_city_discovery?: boolean
    searchable_by_email_or_phone?: boolean
    play_cities?: Array<{ city_name: string; region?: string | null; country?: string | null }>
  }) => Promise<DashboardPreferenceSaveResult>
  onSetVenueMemberDiscovery: (venueId: string, visibleInVenueMemberDiscovery: boolean) => Promise<DashboardPreferenceSaveResult>
}

function normalizeCityName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function DiscoveryAndInvitesSection({
  showTitle = true,
  visibleInCityDiscovery,
  searchableByEmailOrPhone,
  playCities,
  identities,
  onSaveGlobal,
  onSetVenueMemberDiscovery,
}: Props) {
  const router = useRouter()
  const [cityDiscovery, setCityDiscovery] = useState(visibleInCityDiscovery)
  const [emailOrPhoneLookup, setEmailOrPhoneLookup] = useState(searchableByEmailOrPhone)
  const [cityInput, setCityInput] = useState('')
  const [localPlayCities, setLocalPlayCities] = useState(
    playCities.map((city) => ({
      city_name: city.city_name,
      region: city.region ?? DEFAULT_PLAY_REGION,
      country: city.country ?? DEFAULT_PLAY_COUNTRY,
    })),
  )
  const [venueVisibility, setVenueVisibility] = useState<Record<string, boolean>>({})
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [venuePending, setVenuePending] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const mountedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSnapshotRef = useRef('')

  const getErrorMessage = (err: unknown): string => {
    const message =
      err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : err instanceof Error
          ? err.message
          : null
    return message && !message.startsWith('{') ? message : 'Failed to update discovery settings.'
  }

  useEffect(() => {
    const nextCities = playCities.map((city) => ({
      city_name: city.city_name,
      region: city.region ?? DEFAULT_PLAY_REGION,
      country: city.country ?? DEFAULT_PLAY_COUNTRY,
    }))
    setCityDiscovery(visibleInCityDiscovery)
    setEmailOrPhoneLookup(searchableByEmailOrPhone)
    setLocalPlayCities(nextCities)

    const nextVisibility = Object.fromEntries(
      identities.map((identity) => [
        identity.venue_id,
        identity.visible_in_venue_member_discovery ?? true,
      ]),
    )
    setVenueVisibility(nextVisibility)

    lastSavedSnapshotRef.current = JSON.stringify({
      visible_in_city_discovery: visibleInCityDiscovery,
      searchable_by_email_or_phone: searchableByEmailOrPhone,
      play_cities: nextCities,
    })
    setSaveState('idle')
  }, [identities, playCities, searchableByEmailOrPhone, visibleInCityDiscovery])

  const sortedIdentities = useMemo(
    () =>
      [...identities].sort((left, right) =>
        getVenueDisplayName(left.venue).localeCompare(getVenueDisplayName(right.venue)),
      ),
    [identities],
  )

  const currentSnapshot = JSON.stringify({
    visible_in_city_discovery: cityDiscovery,
    searchable_by_email_or_phone: emailOrPhoneLookup,
    play_cities: localPlayCities,
  })

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    if (currentSnapshot === lastSavedSnapshotRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    setError(null)
    setSaveState('saving')

    saveTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const result = await onSaveGlobal({
            visible_in_city_discovery: cityDiscovery,
            searchable_by_email_or_phone: emailOrPhoneLookup,
            play_cities: localPlayCities,
          })
          if (!result.ok) {
            setError(result.error)
            setSaveState('error')
            return
          }
          lastSavedSnapshotRef.current = currentSnapshot
          router.refresh()
          setSaveState('saved')
          window.setTimeout(() => {
            setSaveState((previous) => (previous === 'saved' ? 'idle' : previous))
          }, 1200)
        } catch (saveError) {
          setError(getErrorMessage(saveError))
          setSaveState('error')
        }
      })
    }, 350)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [cityDiscovery, currentSnapshot, emailOrPhoneLookup, localPlayCities, onSaveGlobal, router, startTransition])

  const statusLabel =
    saveState === 'saving' || isPending
      ? 'Saving changes...'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Could not save'
          : 'Auto-save on'

  const clubDiscoveryEnabled =
    sortedIdentities.length > 0
      ? sortedIdentities.every((identity) => venueVisibility[identity.venue_id] ?? true)
      : false

  const addCity = () => {
    const nextCity = normalizeCityName(cityInput)
    if (!nextCity) return
    if (localPlayCities.some((city) => city.city_name.toLowerCase() === nextCity.toLowerCase())) {
      setError('That city is already listed.')
      return
    }
    if (localPlayCities.length >= 8) {
      setError('You can add up to 8 play cities.')
      return
    }
    setError(null)
    setLocalPlayCities((current) => [
      ...current,
      {
        city_name: nextCity,
        region: DEFAULT_PLAY_REGION,
        country: DEFAULT_PLAY_COUNTRY,
      },
    ])
    setCityInput('')
  }

  const removeCity = (cityName: string) => {
    setError(null)
    setLocalPlayCities((current) => current.filter((city) => city.city_name !== cityName))
  }

  const handleSetVisible = (venueId: string, value: boolean) => {
    setVenueVisibility((current) => ({ ...current, [venueId]: value }))
    setVenuePending(venueId)
    setError(null)
    onSetVenueMemberDiscovery(venueId, value)
      .then((result) => {
        if (!result.ok) {
          setVenueVisibility((current) => ({
            ...current,
            [venueId]: !value,
          }))
          setError(result.error)
          return
        }
        router.refresh()
      })
      .catch((venueError) => {
        setVenueVisibility((current) => ({
          ...current,
          [venueId]: !value,
        }))
        setError(getErrorMessage(venueError))
      })
      .finally(() => setVenuePending(null))
  }

  const handleSetAllClubVisibility = (nextValue: boolean) => {
    if (sortedIdentities.length === 0) return
    setError(null)
    setVenueVisibility((current) => {
      const next = { ...current }
      for (const identity of sortedIdentities) {
        next[identity.venue_id] = nextValue
      }
      return next
    })

    startTransition(async () => {
      try {
        const results = await Promise.all(
          sortedIdentities.map((identity) =>
            onSetVenueMemberDiscovery(identity.venue_id, nextValue),
          ),
        )
        const firstError = results.find((result) => !result.ok)
        if (firstError && !firstError.ok) {
          setError(firstError.error)
          router.refresh()
          return
        }
        router.refresh()
      } catch (venueError) {
        setError(getErrorMessage(venueError))
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {showTitle ? <h2 className="text-h2 text-[#1E293B]">Discovery Settings</h2> : null}

      <div className="rounded-[24px] border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-3 text-sm text-[#475569]">
        Discover players. Save them to your Hood. Invite them to play.
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-h2 text-[#1E293B]">Cities where I play</h3>
          <p className="mt-1 text-body-sub text-[#64748B]">
            Add up to 8 cities where you usually play.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {localPlayCities.map((city) => (
            <span
              key={`${city.country}:${city.region}:${city.city_name}`}
              className="inline-flex items-center gap-2 rounded-full border border-[#D7E0EC] bg-white px-3 py-1.5 text-sm font-medium text-[#334155]"
            >
              {city.city_name}
              <button
                type="button"
                onClick={() => removeCity(city.city_name)}
                className="text-[#94A3B8] transition hover:text-[#475569]"
                aria-label={`Remove ${city.city_name}`}
              >
                x
              </button>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={cityInput}
            onChange={(event) => setCityInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addCity()
              }
            }}
            placeholder="Add a city"
            className="min-w-[220px] flex-1 rounded-2xl border border-[#D7E0EC] bg-white px-4 py-2.5 text-sm text-[#1E293B] outline-none transition focus:border-[#C25E46]"
          />
          <button
            type="button"
            onClick={addCity}
            className="rounded-full bg-[#1E293B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0F172A]"
          >
            Add city
          </button>
        </div>

        <p className="text-xs text-[#94A3B8]">
          {localPlayCities.length}/8 cities
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-h2 text-[#1E293B]">Who can find me?</h3>
          <p className="mt-1 text-body-sub text-[#64748B]">
            Choose whether other registered players can discover and save you.
          </p>
        </div>

        <div className="space-y-4 rounded-[24px] border border-[#E2E8F0] bg-white p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={clubDiscoveryEnabled}
              onChange={(event) => handleSetAllClubVisibility(event.target.checked)}
              disabled={sortedIdentities.length === 0 || isPending}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <div>
              <div className="text-body-main font-semibold text-[#1E293B]">Let members of my clubs find me</div>
              <p className="mt-1 text-body-sub text-[#64748B]">
                Members of the same club or venue can find and save you.
              </p>
              {sortedIdentities.length === 0 ? (
                <p className="mt-2 inline-block rounded-xl bg-amber-50 px-3 py-2 text-body-sub text-amber-700">
                  Add clubs or venues to control where club discovery is active.
                </p>
              ) : null}
            </div>
          </label>

          {sortedIdentities.length > 0 ? (
            <div className="space-y-2 pl-7">
              {sortedIdentities.map((identity) => (
                <label
                  key={identity.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FBFF] px-3 py-2 transition"
                >
                  <input
                    type="checkbox"
                    checked={venueVisibility[identity.venue_id] ?? true}
                    onChange={(event) => handleSetVisible(identity.venue_id, event.target.checked)}
                    disabled={venuePending === identity.venue_id || isPending}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-[#334155]">
                    Visible to members of {getVenueDisplayName(identity.venue)}
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={cityDiscovery}
              onChange={(event) => setCityDiscovery(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
              <div>
                <div className="text-body-main font-semibold text-[#1E293B]">Let players in my play cities find me</div>
                <p className="mt-1 text-body-sub text-[#64748B]">
                  Players searching in your selected cities can find and save you.
                </p>
            </div>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={emailOrPhoneLookup}
              onChange={(event) => setEmailOrPhoneLookup(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <div>
              <div className="text-body-main font-semibold text-[#1E293B]">Let people who know my email or phone find me</div>
              <p className="mt-1 text-body-sub text-[#64748B]">
                Search People uses exact email or phone only. Your email and phone are never shown in search results.
              </p>
            </div>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#E2E8F0] bg-white px-4 py-3">
        <span className="text-sm font-medium text-[#64748B]">{statusLabel}</span>
        {error ? <span className="text-sm font-medium text-rose-600">{error}</span> : null}
      </div>
    </div>
  )
}
