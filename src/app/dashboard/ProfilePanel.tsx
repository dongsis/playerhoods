'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { IdentityLinkCandidate, Profile, UserPlayCity, UserVerifiedEmail, VenueIdentity, Venue, VenueKind, VenueSport, Sport, UserSportProfile } from '@/lib/types/database'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  approveMatchProxyBinding,
  declineMatchProxyBinding,
  getMatchProxyDashboard,
  revokeMatchProxyBindingSelf,
  type MatchProxyDashboardRow,
} from '@/lib/api/matches'
import { AvatarUpload } from './AvatarUpload'
import { IdentityLinkReviewCard } from '@/app/components/IdentityLinkReviewCard'
import { DisplayNameEditForm } from '@/app/profile/DisplayNameEditForm'
import { SportsPreferenceForm } from '@/app/profile/SportsPreferenceForm'
import { DiscoveryAndInvitesSection } from '@/app/profile/DiscoveryAndInvitesSection'
import { SportProfilesEditor } from '@/app/profile/SportProfilesEditor'
import { DEFAULT_PLAY_COUNTRY, DEFAULT_PLAY_REGION } from '@/lib/play-location-defaults'
import type { DashboardPreferenceSaveResult, IdentityLinkActionResult } from './dashboard.actions'
import type { LocationCityOption } from '@/lib/api/location-municipalities'
import {
  PREFERRED_PLAY_TIME_OPTIONS,
  getAvailabilityStatusDotClass,
  getPreferredPlayTimeLabel,
} from '@/lib/profile-options'
import { getVenueDisplayName } from '@/lib/venues/display'

type ProfileData = Pick<
  Profile,
  | 'display_name'
  | 'first_name'
  | 'last_name'
  | 'gender'
  | 'availability_status'
  | 'availability_note'
  | 'availability_until'
  | 'primary_venue_id'
  | 'contact_channel'
  | 'contact_email'
  | 'profile_contact_email_normalized'
  | 'profile_contact_email_verified_at'
  | 'contact_phone'
    | 'avatar_url'
    | 'visible_in_city_discovery'
    | 'searchable_by_contact_info'
    | 'allow_non_group_invites'
    | 'shared_group_join_preference'
    | 'looking_to_play'
  | 'preferred_play_times'
>

interface Props {
  userId: string
  profile: ProfileData
  userEmail?: string | null
  verifiedEmails: UserVerifiedEmail[]
  identityLinkCandidates: IdentityLinkCandidate[]
  myIdentities: (VenueIdentity & { venue: Venue })[]
  myVenuePrefs: Venue[]
  joinableVenues: Venue[]
  venueSports: VenueSport[]
  sports: Sport[]
  mySportIds: number[]
  mySportProfiles: UserSportProfile[]
  myPlayCities: UserPlayCity[]
  availablePlayCities: LocationCityOption[]
  onUpdateProfile: (formData: FormData) => Promise<void>
  onAcceptIdentityLink: (guestId: string) => Promise<IdentityLinkActionResult>
  onKeepSeparateIdentityLink: (guestId: string) => Promise<IdentityLinkActionResult>
  onSetDisplayName: (newName: string) => Promise<void>
  onAvatarSaved: () => Promise<void>
  onSetPrimaryVenue: (venueId: string) => Promise<void>
  onLeaveVenue: (venueId: string) => Promise<void>
  onSaveVenuePreference: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onRemoveVenuePreference: (venueId: string) => Promise<void>
  onJoinVenue: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onSaveGlobalPreferences: (params: {
    visible_in_city_discovery?: boolean
    searchable_by_email_or_phone?: boolean
    play_cities?: Array<{ city_name: string; region?: string | null; country?: string | null }>
    allow_non_group_invites?: boolean
    shared_group_join_preference?: 'auto_join_saved_players' | 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
  }) => Promise<DashboardPreferenceSaveResult>
  onSetVenueMemberDiscovery: (venueId: string, visibleInVenueMemberDiscovery: boolean) => Promise<DashboardPreferenceSaveResult>
  onSetSports: (codes: string[]) => Promise<void>
  onSaveSportProfile: (input: {
    sport_id: number
    level?: string | null
    years_playing?: number | null
    preferred_formats?: string[]
    current_frequency?: string | null
    play_style?: string | null
    competition_experience?: string | null
    teams_played_on?: string | null
    line_played?: string | null
    highlights?: string | null
    gear_primary?: string | null
    gear_secondary?: string | null
    gear_shoes?: string | null
  }) => Promise<void>
}

function SectionCard({
  title,
  description,
  children,
  tone = 'default',
}: {
  title: string
  description?: string
  children: ReactNode
  tone?: 'default' | 'soft'
}) {
  const toneClass = tone === 'soft'
    ? 'border-[#E2E8F0] bg-[#F8FBFF]'
    : 'border-[#E2E8F0] bg-white'

  return (
    <section className={`rounded-[28px] border ${toneClass} p-6 shadow-[0_18px_40px_-30px_rgba(30,41,59,0.18)]`}>
      <div className="mb-5">
        <h2 className="text-h2 text-[#1E293B]">{title}</h2>
        {description && (
          <p className="mt-1 text-body-sub text-[#64748B]">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function PanelCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-[#E2E8F0] bg-white p-6 shadow-[0_16px_40px_-28px_rgba(30,41,59,0.16)]">
      <div className="mb-4">
        <h2 className="text-h2 text-[#1E293B]">{title}</h2>
        {description && (
          <p className="mt-1 text-body-sub text-[#64748B]">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-label mb-1.5 block">
      {children}
    </label>
  )
}

function ReadOnlyInfoField({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="text-body-main min-h-[44px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
        {value}
      </div>
    </div>
  )
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

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized || null
}

function ProfileInfoRow({
  label,
  children,
  alignStart = false,
}: {
  label: string
  children: ReactNode
  alignStart?: boolean
}) {
  return (
    <div className={`grid gap-2.5 border-t border-slate-200/80 pt-3.5 sm:grid-cols-[102px_minmax(0,1fr)] ${alignStart ? 'sm:items-start' : 'sm:items-center'}`}>
      <div className="pt-1">
        <span className="text-label">{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function CompactLocationEditor({
  country,
  region,
  playCities,
  availableCities,
  onSave,
}: {
  country: string
  region: string
  playCities: UserPlayCity[]
  availableCities: Array<{ city_name: string; region?: string | null; country?: string | null }>
  onSave: (params: {
    play_cities: Array<{ city_name: string; region?: string | null; country?: string | null }>
  }) => Promise<DashboardPreferenceSaveResult>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [cityInput, setCityInput] = useState('')
  const [draftCities, setDraftCities] = useState(
    playCities.map((city) => city.city_name?.trim?.() ?? '').filter(Boolean),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setDraftCities(playCities.map((city) => city.city_name?.trim?.() ?? '').filter(Boolean))
  }, [playCities])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const citySummary = draftCities.length > 0 ? draftCities.join(', ') : 'Click to add city'
  const isDirty =
    JSON.stringify(draftCities) !==
    JSON.stringify(playCities.map((city) => city.city_name?.trim?.() ?? '').filter(Boolean))
  const cityMetaMap = useMemo(() => {
    const map = new Map<string, { region: string | null; country: string | null }>()
    for (const city of availableCities) {
      const normalized = normalizeCityName(city.city_name ?? '')
      if (!normalized || map.has(normalized.toLowerCase())) continue
      map.set(normalized.toLowerCase(), {
        region: city.region ?? region,
        country: city.country ?? country,
      })
    }
    for (const city of playCities) {
      const normalized = normalizeCityName(city.city_name ?? '')
      if (!normalized || map.has(normalized.toLowerCase())) continue
      map.set(normalized.toLowerCase(), {
        region: city.region ?? region,
        country: city.country ?? country,
      })
    }
    return map
  }, [availableCities, country, playCities, region])
  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...availableCities.map((city) => normalizeCityName(city.city_name ?? '')),
          ...playCities.map((city) => normalizeCityName(city.city_name ?? '')),
        ].filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right)),
    [availableCities, playCities],
  )
  const filteredCities = useMemo(() => {
    const query = normalizeCityName(cityInput).toLowerCase()
    return cityOptions.filter((city) => {
      if (draftCities.some((entry) => entry.toLowerCase() === city.toLowerCase())) return false
      return !query || city.toLowerCase().includes(query)
    })
  }, [cityInput, cityOptions, draftCities])
  const quickCityGroups = useMemo(
    () => getQuickCityGroups(cityOptions, draftCities),
    [cityOptions, draftCities],
  )

  const addCity = (value: string) => {
    const nextCity = normalizeCityName(value)
    if (!nextCity) return
    if (draftCities.some((city) => city.toLowerCase() === nextCity.toLowerCase())) {
      setError('That city is already listed.')
      return
    }
    setError(null)
    setDraftCities((current) => [...current, nextCity])
    setCityInput('')
    setIsDropdownOpen(false)
  }

  const removeCity = (cityName: string) => {
    setError(null)
    setDraftCities((current) => current.filter((city) => city !== cityName))
  }

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await onSave({
          play_cities: draftCities.map((city_name) => ({
            city_name,
            region: cityMetaMap.get(city_name.toLowerCase())?.region ?? region,
            country: cityMetaMap.get(city_name.toLowerCase())?.country ?? country,
          })),
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setIsOpen(false)
      } catch (saveError) {
        const message =
          saveError && typeof saveError === 'object' && 'message' in saveError && typeof (saveError as { message?: unknown }).message === 'string'
            ? (saveError as { message: string }).message
            : 'Could not save cities.'
        setError(message)
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <span className="text-label inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
          {country}
        </span>
        <span className="text-label inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
          {region}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
      >
        <div className="text-label text-slate-400">City</div>
        <div className="text-body-main mt-1 text-slate-800">{citySummary}</div>
      </button>

      {isOpen ? (
        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
          <div className="flex flex-wrap gap-2">
            {draftCities.length > 0 ? draftCities.map((city) => (
              <span
                key={city}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                {city}
                <button
                  type="button"
                  onClick={() => removeCity(city)}
                  className="text-slate-400 transition hover:text-slate-700"
                  aria-label={`Remove ${city}`}
                >
                  ×
                </button>
              </span>
            )) : (
              <span className="text-body-sub text-slate-400">No city yet.</span>
            )}
          </div>

          <div ref={dropdownRef} className="relative">
            <input
              type="text"
              value={cityInput}
              onChange={(event) => {
                setCityInput(event.target.value)
                setIsDropdownOpen(true)
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Search and select a city..."
              className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
            />

            {quickCityGroups.length > 0 ? (
              <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
                {quickCityGroups.map((group) => (
                  <div key={group.label} className="flex shrink-0 items-center gap-1.5">
                    {group.cities.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => addCity(city)}
                        className="inline-flex h-8 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}

            {isDropdownOpen ? (
              <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-[20px] border border-[#E2E8F0] bg-white shadow-[0_20px_42px_-34px_rgba(15,23,42,0.24)]">
                {filteredCities.length > 0 ? (
                  filteredCities.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => addCity(city)}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left text-body-main text-[#334155] transition hover:bg-[#F8FBFF] last:border-b-0"
                    >
                      <span>{city}</span>
                      <span className="text-label text-[#94A3B8]">Select</span>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-body-sub text-[#94A3B8]">
                    No cities found.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-body-sub text-slate-400">
              Click a city chip to remove it.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftCities(playCities.map((city) => city.city_name?.trim?.() ?? '').filter(Boolean))
                  setCityInput('')
                  setError(null)
                  setIsDropdownOpen(false)
                  setIsOpen(false)
                }}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || !isDirty}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? 'Saving...' : 'Save cities'}
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

const VENUE_KIND_FILTER_OPTIONS: Array<{ value: 'all' | VenueKind; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'club', label: 'Club' },
  { value: 'park', label: 'Park' },
  { value: 'community_centre', label: 'Community Centre' },
  { value: 'condo', label: 'Condo' },
  { value: 'school', label: 'School' },
  { value: 'private_facility', label: 'Private Facility' },
]

type VenueSportFilter = 'tennis' | 'pickleball'

const VENUE_SPORT_FILTER_OPTIONS: Array<{ value: VenueSportFilter; label: string }> = [
  { value: 'tennis', label: 'Tennis' },
  { value: 'pickleball', label: 'Pickleball' },
]

function getVenueKindLabel(kind: Venue['venue_kind'] | null | undefined): string {
  switch (kind) {
    case 'club':
      return 'Club'
    case 'park':
      return 'Park'
    case 'community_centre':
      return 'Community Centre'
    case 'condo':
      return 'Condo'
    case 'school':
      return 'School'
    case 'private_facility':
      return 'Private Facility'
    default:
      return 'Venue'
  }
}

function getVenueAccessLabel(accessType: Venue['access_type'] | null | undefined): string {
  switch (accessType) {
    case 'public':
      return 'Public access'
    case 'members':
      return 'Members access'
    case 'private':
      return 'Private access'
    case 'restricted':
      return 'Restricted access'
    default:
      return 'Access not set'
  }
}

function getVenueMetaLine(venue: Venue): string {
  const parts = [
    venue.location_text?.trim() || null,
    venue.city?.trim() || null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' • ')
}

function venueUsesMemberRelationship(kind: Venue['venue_kind'] | null | undefined): boolean {
  return kind === 'club' || kind === 'private_facility' || kind === 'condo' || kind === 'school'
}

function VenueBadge({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'type' | 'member' | 'starred' | 'primary'
}) {
  const toneClass =
    tone === 'type'
      ? 'bg-[#071A44] text-white'
      : tone === 'member'
        ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
      : tone === 'starred'
          ? 'border border-sky-100 bg-sky-50 text-sky-700'
      : tone === 'primary'
            ? 'border border-blue-100 bg-blue-50 text-blue-700'
            : 'bg-slate-100 text-slate-500'

  return (
    <span className={`text-label inline-flex items-center rounded-md px-2 py-0.5 uppercase tracking-[0.12em] ${toneClass}`}>
      {children}
    </span>
  )
}

function BasicLocationEditor({
  country,
  region,
  playCities,
  availableCities,
  onSave,
}: {
  country: string
  region: string
  playCities: UserPlayCity[]
  availableCities: Array<{ city_name: string; region?: string | null; country?: string | null }>
  onSave: (params: {
    play_cities: Array<{ city_name: string; region?: string | null; country?: string | null }>
  }) => Promise<DashboardPreferenceSaveResult>
}) {
  const [cityInput, setCityInput] = useState('')
  const [draftCities, setDraftCities] = useState(
    playCities.map((city) => city.city_name?.trim?.() ?? '').filter(Boolean),
  )
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setDraftCities(playCities.map((city) => city.city_name?.trim?.() ?? '').filter(Boolean))
  }, [playCities])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const cityMetaMap = useMemo(() => {
    const map = new Map<string, { region: string | null; country: string | null }>()
    for (const city of availableCities) {
      const normalized = normalizeCityName(city.city_name ?? '')
      if (!normalized || map.has(normalized.toLowerCase())) continue
      map.set(normalized.toLowerCase(), {
        region: city.region ?? region,
        country: city.country ?? country,
      })
    }
    for (const city of playCities) {
      const normalized = normalizeCityName(city.city_name ?? '')
      if (!normalized || map.has(normalized.toLowerCase())) continue
      map.set(normalized.toLowerCase(), {
        region: city.region ?? region,
        country: city.country ?? country,
      })
    }
    return map
  }, [availableCities, country, playCities, region])

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...availableCities.map((city) => normalizeCityName(city.city_name ?? '')),
          ...playCities.map((city) => normalizeCityName(city.city_name ?? '')),
        ].filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right)),
    [availableCities, playCities],
  )

  const filteredCities = useMemo(() => {
    const query = normalizeCityName(cityInput).toLowerCase()
    return cityOptions.filter((city) => {
      if (draftCities.some((entry) => entry.toLowerCase() === city.toLowerCase())) return false
      return !query || city.toLowerCase().includes(query)
    })
  }, [cityInput, cityOptions, draftCities])
  const quickCityGroups = useMemo(
    () => getQuickCityGroups(cityOptions, draftCities),
    [cityOptions, draftCities],
  )

  const saveCities = (nextCities: string[]) => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await onSave({
          play_cities: nextCities.map((city_name) => ({
            city_name,
            region: cityMetaMap.get(city_name.toLowerCase())?.region ?? region,
            country: cityMetaMap.get(city_name.toLowerCase())?.country ?? country,
          })),
        })
        if (!result.ok) {
          setError(result.error)
        }
      } catch (saveError) {
        const message =
          saveError && typeof saveError === 'object' && 'message' in saveError && typeof (saveError as { message?: unknown }).message === 'string'
            ? (saveError as { message: string }).message
            : 'Could not save cities.'
        setError(message)
      }
    })
  }

  const addCity = (value: string) => {
    const nextCity = normalizeCityName(value)
    if (!nextCity) return
    if (draftCities.some((city) => city.toLowerCase() === nextCity.toLowerCase())) return
    const nextCities = [...draftCities, nextCity]
    setDraftCities(nextCities)
    setCityInput('')
    setIsDropdownOpen(false)
    saveCities(nextCities)
  }

  const removeCity = (cityName: string) => {
    const nextCities = draftCities.filter((city) => city !== cityName)
    setDraftCities(nextCities)
    saveCities(nextCities)
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-[11px] font-bold text-[#071A44]">Location</h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[10px] font-medium text-[#071A44]">Country</label>
          <div className="flex h-8 items-center gap-2.5 rounded-md border border-[#CBD5E1] bg-white px-3 text-[10px] text-[#071A44]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 12h18M12 3c2.4 2.4 3.6 5.4 3.6 9S14.4 18.6 12 21M12 3c-2.4 2.4-3.6 5.4-3.6 9S9.6 18.6 12 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="min-w-0 flex-1 truncate">{country}</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] font-medium text-[#071A44]">Province / State</label>
          <div className="flex h-8 items-center gap-2.5 rounded-md border border-[#CBD5E1] bg-white px-3 text-[10px] text-[#071A44]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true">
              <path d="M12 2.8a7 7 0 0 0-7 7c0 5.2 7 11.4 7 11.4s7-6.2 7-11.4a7 7 0 0 0-7-7Zm0 9.7a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z" />
            </svg>
            <span className="min-w-0 flex-1 truncate">{region}</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div ref={dropdownRef} className="relative">
        <label className="mb-1.5 block text-[10px] font-medium text-[#071A44]">Play in Cities</label>
        <div className="flex min-h-8 items-center rounded-md border border-[#CBD5E1] bg-white px-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {draftCities.length > 0 ? draftCities.map((city) => (
              <span key={city} className="inline-flex h-6 items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 text-[10px] text-[#071A44] shadow-sm">
                {city}
                <button type="button" onClick={() => removeCity(city)} className="text-[#071A44]" aria-label={`Remove ${city}`}>
                  x
                </button>
              </span>
            )) : null}
            <input
              value={cityInput}
              onChange={(event) => {
                setCityInput(event.target.value)
                setIsDropdownOpen(true)
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={draftCities.length === 0 ? 'Add City' : ''}
              className="h-6 min-w-[72px] flex-1 bg-transparent px-1.5 text-[10px] text-[#071A44] outline-none"
            />
          </div>
          <div className="ml-2 h-6 w-px bg-slate-200" />
          <button type="button" onClick={() => setIsDropdownOpen((current) => !current)} disabled={isPending} className="ml-2 inline-flex h-6 w-6 items-center justify-center text-[#071A44] disabled:opacity-50" aria-label="Choose city">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {quickCityGroups.length > 0 ? (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
            {quickCityGroups.map((group) => (
              <div key={group.label} className="flex shrink-0 items-center gap-1">
                {group.cities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => addCity(city)}
                    disabled={isPending}
                    className="inline-flex h-6 shrink-0 items-center rounded-full border border-[#CBD5E1] bg-white px-2 text-[9px] font-semibold text-[#071A44] transition hover:border-[#94A3B8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {city}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {isDropdownOpen ? (
          <div className="relative z-20 mt-1.5 max-h-40 w-full overflow-y-auto rounded-lg border border-[#CBD5E1] bg-white shadow-[0_20px_42px_-34px_rgba(15,23,42,0.24)]">
            {filteredCities.length > 0 ? filteredCities.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => addCity(city)}
                className="flex w-full items-center justify-between border-b border-slate-100 px-2.5 py-2 text-left text-[10px] text-[#071A44] transition hover:bg-[#F5F8FC] last:border-b-0"
              >
                <span>{city}</span>
                <span className="text-[9px] font-bold uppercase text-[#64748B]">Add</span>
              </button>
            )) : (
              <div className="px-2.5 py-2 text-[10px] text-[#64748B]">No cities found.</div>
            )}
          </div>
        ) : null}
        {error ? <p className="mt-1.5 text-[10px] text-rose-600">{error}</p> : null}
      </div>
    </div>
  )
}

function getSportLookupId(sports: Sport[], key: 'tennis' | 'pickleball'): number | null {
  const sport = sports.find((entry) => {
    const haystack = `${entry.code} ${entry.display_name}`.toLowerCase()
    return haystack.includes(key)
  })
  if (sport) return sport.id
  return key === 'tennis' ? 1 : 2
}

function SportBadge({
  sport,
}: {
  sport: 'tennis' | 'pickleball' | 'unknown'
}) {
  if (sport === 'unknown') {
    return (
      <span className="text-body-sub inline-flex h-7 items-center rounded-lg border border-slate-200 bg-white/80 px-2.5 text-slate-500">
        Sport Unknown
      </span>
    )
  }

  const isTennis = sport === 'tennis'

  return (
    <span className="text-body-sub inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#D8E3F0] bg-white/80 px-2.5 font-medium text-[#0B1F4D]">
      <img
        src={isTennis ? '/match-tennis-racket-icon.png' : '/match-pickleball-paddle-icon.png'}
        alt=""
        aria-hidden="true"
        className="h-4 w-4 shrink-0 object-contain"
      />
      {isTennis ? 'Tennis' : 'Pickleball'}
    </span>
  )
}

function AccordionSection({
  title,
  description,
  eyebrow,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  description?: string
  eyebrow?: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className={`overflow-hidden rounded-[28px] border transition-all ${
      isOpen
        ? 'border-[#D7E0EC] bg-white shadow-[0_20px_46px_-32px_rgba(30,41,59,0.18)]'
        : 'border-[#E2E8F0] bg-white shadow-[0_14px_30px_-28px_rgba(30,41,59,0.12)]'
    }`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition ${
          isOpen ? 'bg-[#F8FBFF]' : 'bg-white'
        }`}
      >
        <div className="min-w-0">
          <div className="text-h2 text-[#1E293B]">{title}</div>
        </div>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-lg font-medium transition ${
          isOpen
            ? 'border-[#C25E46] bg-[#C25E46] text-white'
            : 'border-[#E2E8F0] bg-[#F8FBFF] text-[#64748B]'
        }`}>
          {isOpen ? '−' : '+'}
        </span>
      </button>
      <div className={`${isOpen ? 'block border-t border-[#EEF3F8]' : 'hidden'}`}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </section>
  )
}

function SubCard({
  title,
  description,
  children,
}: {
  title?: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-[#F8FBFF] p-5">
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-title-main text-[#1E293B]">{title}</h3>}
          {description && <p className="text-body-sub mt-1 text-[#64748B]">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

type AvailabilityMode = 'very_open' | 'open' | 'occasional' | 'busy' | 'away' | 'not_looking'

const AVAILABILITY_MODE_OPTIONS: Array<{
  value: AvailabilityMode
  label: string
  availabilityStatus: NonNullable<Profile['availability_status']>
  lookingToPlay: string
}> = [
  {
    value: 'very_open',
    label: 'Very open',
    availabilityStatus: 'available',
    lookingToPlay: 'very_open',
  },
  {
    value: 'open',
    label: 'Open',
    availabilityStatus: 'available',
    lookingToPlay: 'open',
  },
  {
    value: 'occasional',
    label: 'Occasionally',
    availabilityStatus: 'available',
    lookingToPlay: 'occasional',
  },
  {
    value: 'busy',
    label: 'Busy',
    availabilityStatus: 'busy',
    lookingToPlay: 'quite_full',
  },
  {
    value: 'away',
    label: 'Away',
    availabilityStatus: 'away',
    lookingToPlay: 'not_looking',
  },
  {
    value: 'not_looking',
    label: 'Not looking right now',
    availabilityStatus: 'inactive',
    lookingToPlay: 'not_looking',
  },
]

function deriveAvailabilityMode(
  availabilityStatus: Profile['availability_status'] | null | undefined,
  lookingToPlay: string | null | undefined,
): AvailabilityMode {
  if (availabilityStatus === 'away') return 'away'
  if (availabilityStatus === 'inactive') return 'not_looking'
  if (availabilityStatus === 'busy') return 'busy'
  if (lookingToPlay === 'very_open') return 'very_open'
  if (lookingToPlay === 'open') return 'open'
  if (lookingToPlay === 'occasional') return 'occasional'
  if (lookingToPlay === 'not_looking') return 'not_looking'
  return 'open'
}

function normalizeActionError(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const maybeMessage = Reflect.get(error, 'message')
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage
    const maybeError = Reflect.get(error, 'error')
    if (typeof maybeError === 'string' && maybeError.trim()) return maybeError
  }
  return fallback
}

function formatProxyDate(value: string | null | undefined): string {
  if (!value) return 'recently'
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return 'recently'
  }
}

function AvailabilityDot({ value }: { value: string | null | undefined }) {
  const dotClassName = getAvailabilityStatusDotClass(value)
  if (!dotClassName) return null
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClassName}`} aria-hidden="true" />
}

function formatPreferredTimeChip(value: string): string {
  return getPreferredPlayTimeLabel(value) ?? value
}

function PreferredTimesField({
  preferredPlayTimes,
  customPreferredTime,
  onTogglePreset,
  onRemove,
  onCustomPreferredTimeChange,
  onAddCustom,
}: {
  preferredPlayTimes: string[]
  customPreferredTime: string
  onTogglePreset: (value: string) => void
  onRemove: (value: string) => void
  onCustomPreferredTimeChange: (value: string) => void
  onAddCustom: () => void
}) {
  const availablePresets = PREFERRED_PLAY_TIME_OPTIONS.filter(
    (option) => !preferredPlayTimes.includes(option.value),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {preferredPlayTimes.length > 0 ? (
          preferredPlayTimes.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRemove(value)}
              className="text-body-main inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3.5 py-2 text-white shadow-sm transition hover:bg-slate-700"
            >
              <span>{formatPreferredTimeChip(value)}</span>
              <span aria-hidden="true" className="text-body-sub leading-none text-slate-200">×</span>
            </button>
          ))
        ) : (
          <p className="text-body-sub text-slate-500">No preferred times added yet.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {availablePresets.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onTogglePreset(option.value)}
            className="text-body-main inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={customPreferredTime}
          onChange={e => onCustomPreferredTimeChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAddCustom()
            }
          }}
          placeholder="Add custom time, e.g. Friday lunch or Weeknights after 8"
          className="text-body-main h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
        />
        <button
          type="button"
          onClick={onAddCustom}
          className="text-body-main inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Add time
        </button>
      </div>
    </div>
  )
}

function MatchProxySection({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const [rows, setRows] = useState<MatchProxyDashboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actingBindingId, setActingBindingId] = useState<string | null>(null)

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    try {
      const nextRows = await getMatchProxyDashboard(supabase)
      setRows(nextRows)
    } catch (loadError) {
      setRows([])
      setError(normalizeActionError(loadError, 'Failed to load Match Proxy settings'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const pendingRows = rows.filter((row) => row.status === 'pending')
  const forMeRows = rows.filter((row) => row.relationship_role === 'for_me' && row.status === 'active')
  const iActForRows = rows.filter((row) => row.relationship_role === 'i_act_for' && row.status === 'active')
  const historyRows = rows.filter((row) => row.status === 'revoked' || row.status === 'rejected' || row.status === 'expired')

  const sections: Array<{ title: string; rows: MatchProxyDashboardRow[]; empty: string }> = [
    {
      title: 'Pending',
      rows: pendingRows,
      empty: 'No pending Match Proxy requests need attention right now.',
    },
    {
      title: 'Who Can Act for Me',
      rows: forMeRows,
      empty: 'No active Match Proxy relationships are enabled for you yet.',
    },
    {
      title: 'I Can Act For',
      rows: iActForRows,
      empty: 'You are not currently acting as Match Proxy for anyone else.',
    },
    {
      title: 'History',
      rows: historyRows,
      empty: 'No prior Match Proxy decisions yet.',
    },
  ]

  const handleApprove = async (bindingId: string) => {
    const supabase = createSupabaseBrowserClient()
    setActingBindingId(bindingId)
    setError(null)
    setMessage(null)
    try {
      await approveMatchProxyBinding(supabase, bindingId)
      setMessage('Match Proxy request approved.')
      await loadRows()
      router.refresh()
    } catch (actionError) {
      setError(normalizeActionError(actionError, 'Failed to approve Match Proxy request'))
    } finally {
      setActingBindingId(null)
    }
  }

  const handleDecline = async (bindingId: string) => {
    const supabase = createSupabaseBrowserClient()
    setActingBindingId(bindingId)
    setError(null)
    setMessage(null)
    try {
      await declineMatchProxyBinding(supabase, bindingId)
      setMessage('Match Proxy request declined.')
      await loadRows()
      router.refresh()
    } catch (actionError) {
      setError(normalizeActionError(actionError, 'Failed to decline Match Proxy request'))
    } finally {
      setActingBindingId(null)
    }
  }

  const handleRevoke = async (bindingId: string) => {
    const supabase = createSupabaseBrowserClient()
    setActingBindingId(bindingId)
    setError(null)
    setMessage(null)
    try {
      await revokeMatchProxyBindingSelf(supabase, bindingId)
      setMessage('Match Proxy relationship revoked.')
      await loadRows()
      router.refresh()
    } catch (actionError) {
      setError(normalizeActionError(actionError, 'Failed to revoke Match Proxy relationship'))
    } finally {
      setActingBindingId(null)
    }
  }

  const summary = (
    <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Pending requests', pendingRows.length],
          ['Active proxies for me', forMeRows.length],
          ['People I can act for', iActForRows.length],
        ].map(([label, count]) => (
          <div
            key={label}
            className="rounded-[26px] border border-slate-200 bg-slate-50/85 p-5"
          >
            <div className="text-label text-slate-400">{label}</div>
            <div className="text-h1 mt-2 text-slate-900">{count}</div>
          </div>
        ))}
      </div>
  )

  const body = (
    <>
      {message && (
        <div className="text-body-main rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="text-body-main rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {error}
        </div>
      )}
      {loading ? (
        <div className="text-body-main rounded-[26px] border border-slate-200 bg-slate-50 px-4 py-5 text-slate-500">
          Loading Match Proxy settings...
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[28px] border border-slate-200 bg-slate-50/65 p-5"
            >
              <div>
                <h3 className="text-h2 text-slate-900">{section.title}</h3>
                <p className="text-body-sub mt-1 leading-6 text-slate-500">
                  {section.title === 'Pending'
                    ? 'Only direct Match Proxy changes that need your attention appear here.'
                    : section.title === 'Who Can Act for Me'
                      ? 'These people can manage player-side match actions for you while your own controls stay fully active.'
                      : section.title === 'I Can Act For'
                        ? 'These are the people whose player-side match actions you can currently manage.'
                        : 'Past Match Proxy decisions stay visible here without turning Hoods into a notification center.'}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {section.rows.length === 0 ? (
                  <div className="text-body-main rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-slate-500">
                    {section.empty}
                  </div>
                ) : (
                  section.rows.map((row) => {
                    const isActing = actingBindingId === row.binding_id
                    const statusTone =
                      row.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : row.status === 'pending'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                    const relationshipCopy =
                      row.relationship_role === 'for_me'
                        ? `${row.proxy_name} can act for you`
                        : `You can act for ${row.principal_name}`

                    return (
                      <div key={row.binding_id} className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-title-main text-slate-900">{relationshipCopy}</h4>
                              <span className={`text-body-sub rounded-full px-2.5 py-1 font-medium ${statusTone}`}>
                                {row.status}
                              </span>
                            </div>
                            <p className="text-body-sub mt-2 leading-5 text-slate-500">
                              {row.relationship_role === 'for_me'
                                ? 'A Match Proxy can only handle player-side match actions. Organizer powers do not transfer.'
                                : 'You can only handle player-side match actions for this person. Organizer powers do not transfer.'}
                            </p>
                            <p className="text-body-sub mt-2 text-slate-400">
                              Updated {formatProxyDate(row.updated_at)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {row.can_approve && (
                              <button
                                type="button"
                                onClick={() => void handleApprove(row.binding_id)}
                                disabled={isActing}
                                className="text-body-sub rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                              >
                                {isActing ? 'Working...' : 'Approve'}
                              </button>
                            )}
                            {row.can_decline && (
                              <button
                                type="button"
                                onClick={() => void handleDecline(row.binding_id)}
                                disabled={isActing}
                                className="text-body-sub rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                              >
                                {isActing ? 'Working...' : 'Decline'}
                              </button>
                            )}
                            {row.can_revoke && (
                              <button
                                type="button"
                                onClick={() => void handleRevoke(row.binding_id)}
                                disabled={isActing}
                                className="text-body-sub rounded-full border border-rose-200 bg-white px-3 py-1.5 font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
                              >
                                {isActing ? 'Working...' : 'Revoke'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )

  if (embedded) {
    return (
      <div id="match-proxy" className="space-y-5">
        {summary}
        {body}
      </div>
    )
  }

  return (
    <section
      id="match-proxy"
      className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.28)] sm:p-8"
    >
      <div className="max-w-2xl">
        <h2 className="text-h1 text-slate-900">Proxy Management</h2>
        <p className="text-body-main mt-2 leading-6 text-slate-600">
          Long-term delegate relationships for player-side match actions.
        </p>
      </div>
      <div className="mt-6 space-y-5">
        {summary}
        {body}
      </div>
    </section>
  )
}

export function ProfilePanel({
  userId,
  profile,
  userEmail,
  verifiedEmails,
  identityLinkCandidates,
  myIdentities,
  myVenuePrefs,
  joinableVenues,
  venueSports,
  sports,
  mySportIds,
  mySportProfiles,
  myPlayCities,
  availablePlayCities,
  onUpdateProfile,
  onAcceptIdentityLink,
  onKeepSeparateIdentityLink,
  onSetDisplayName,
  onAvatarSaved,
  onSetPrimaryVenue,
  onLeaveVenue,
  onSaveVenuePreference,
  onRemoveVenuePreference,
  onJoinVenue,
  onSaveGlobalPreferences,
  onSetVenueMemberDiscovery,
  onSetSports,
  onSaveSportProfile,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [activeSection, setActiveSection] = useState(() => (
    searchParams.get('section') === 'venues' ? 'venues' : 'basic'
  ))
  const [selectedJoinVenueId, setSelectedJoinVenueId] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [isJoiningVenue, startJoiningVenue] = useTransition()
  const [joiningVenueId, setJoiningVenueId] = useState<string | null>(null)
  const [venueCitySearch, setVenueCitySearch] = useState('')
  const [venueNameSearch, setVenueNameSearch] = useState('')
  const [venueTypeFilter, setVenueTypeFilter] = useState<'all' | VenueKind>('all')
  const [venueSportFilter, setVenueSportFilter] = useState<VenueSportFilter>('tennis')
  const [openVenueMenuId, setOpenVenueMenuId] = useState<string | null>(null)
  const [venueActionError, setVenueActionError] = useState<string | null>(null)
  const [pendingVenueAction, setPendingVenueAction] = useState<{ id: string; kind: 'primary' | 'delete' | 'remove_saved' } | null>(null)
  const [isVenueActionPending, startVenueAction] = useTransition()
  const [firstName, setFirstName] = useState(profile.first_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [displayNameDraft, setDisplayNameDraft] = useState(profile.display_name ?? '')
  const [gender, setGender] = useState<Profile['gender']>(profile.gender ?? 'unspecified')
  const [availabilityStatus, setAvailabilityStatus] = useState<Profile['availability_status']>(profile.availability_status ?? 'available')
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>(
    deriveAvailabilityMode(profile.availability_status, profile.looking_to_play),
  )
  const [availabilityNote, setAvailabilityNote] = useState(profile.availability_note ?? '')
  const [availabilityUntil, setAvailabilityUntil] = useState(profile.availability_until ?? '')
  const [contactEmail, setContactEmail] = useState(profile.contact_email ?? '')
  const [contactPhone, setContactPhone] = useState(profile.contact_phone ?? '')
  const [contactChannel, setContactChannel] = useState<'email' | 'sms'>(profile.contact_channel === 'sms' ? 'sms' : 'email')
  const [lookingToPlay, setLookingToPlay] = useState(profile.looking_to_play ?? '')
  const [preferredPlayTimes, setPreferredPlayTimes] = useState<string[]>(
    profile.preferred_play_times ?? [],
  )
  const [customPreferredTime, setCustomPreferredTime] = useState('')
  const [selectedSportIds, setSelectedSportIds] = useState<number[]>(mySportIds)
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)
  const lastSavedSnapshotRef = useRef('')
  const normalizedAuthEmail = normalizeEmail(userEmail)
  const normalizedProfileContactEmail = normalizeEmail(contactEmail)
  const verifiedAuthEmailEntry = useMemo(
    () => verifiedEmails.find((entry) => entry.email_type === 'auth' && entry.email_normalized === normalizedAuthEmail)
      ?? verifiedEmails.find((entry) => entry.email_type === 'auth')
      ?? null,
    [normalizedAuthEmail, verifiedEmails],
  )
  const verifiedContactEmailEntry = useMemo(
    () => (
      normalizedProfileContactEmail
        ? verifiedEmails.find((entry) => entry.email_normalized === normalizedProfileContactEmail) ?? null
        : null
    ),
    [normalizedProfileContactEmail, verifiedEmails],
  )

  const normalizedDisplayName = profile.display_name?.trim() ?? ''
  const joinedVenueIds = new Set(myIdentities.map(identity => identity.venue_id))
  const publicVenuePrefs = myVenuePrefs.filter(venue => !joinedVenueIds.has(venue.id))
  const defaultJoinVenueId =
    profile.primary_venue_id && joinableVenues.some(venue => venue.id === profile.primary_venue_id)
      ? profile.primary_venue_id
      : ''
  const sortedJoinedIdentities = useMemo(
    () => [...myIdentities].sort((a, b) => {
      const aPrimary = a.venue_id === profile.primary_venue_id ? 1 : 0
      const bPrimary = b.venue_id === profile.primary_venue_id ? 1 : 0
      if (aPrimary !== bPrimary) return bPrimary - aPrimary
      return getVenueDisplayName(a.venue).localeCompare(getVenueDisplayName(b.venue))
    }),
    [myIdentities, profile.primary_venue_id],
  )
  const sortedPublicVenuePrefs = useMemo(
    () => [...publicVenuePrefs].sort((a, b) => getVenueDisplayName(a).localeCompare(getVenueDisplayName(b))),
    [publicVenuePrefs],
  )
  const tennisSportId = useMemo(() => getSportLookupId(sports, 'tennis'), [sports])
  const pickleballSportId = useMemo(() => getSportLookupId(sports, 'pickleball'), [sports])
  const venueSportIdsByVenueId = useMemo(() => {
    const map = new Map<string, Set<number>>()
    venueSports.forEach((entry) => {
      const current = map.get(entry.venue_id) ?? new Set<number>()
      current.add(entry.sport_id)
      map.set(entry.venue_id, current)
    })
    return map
  }, [venueSports])
  const getVenueSportIds = (venueId: string) => venueSportIdsByVenueId.get(venueId) ?? new Set<number>()
  const renderVenueSportBadges = (venueId: string) => {
    const sportIds = getVenueSportIds(venueId)
    const hasTennis = tennisSportId != null && sportIds.has(tennisSportId)
    const hasPickleball = pickleballSportId != null && sportIds.has(pickleballSportId)

    if (!hasTennis && !hasPickleball) {
      return <SportBadge sport="unknown" />
    }

    return (
      <>
        {hasTennis ? <SportBadge sport="tennis" /> : null}
        {hasPickleball ? <SportBadge sport="pickleball" /> : null}
      </>
    )
  }
  const filteredJoinableVenues = useMemo(() => {
    const cityQuery = venueCitySearch.trim().toLowerCase()
    const nameQuery = venueNameSearch.trim().toLowerCase()
    const savedVenueIds = new Set(publicVenuePrefs.map((venue) => venue.id))

    if (!cityQuery && !nameQuery) {
      return []
    }

    return joinableVenues.filter((venue) => {
      if (savedVenueIds.has(venue.id)) return false
      const matchesType = venueTypeFilter === 'all' || venue.venue_kind === venueTypeFilter
      const venueName = [
        getVenueDisplayName(venue),
        venue.name,
        venue.abbreviation ?? '',
        venue.location_text ?? '',
      ]
        .join(' ')
        .toLowerCase()
      const venueLocation = [
        venue.city ?? '',
        venue.province ?? '',
        venue.country ?? '',
        venue.location_text ?? '',
      ]
        .join(' ')
        .toLowerCase()
      const matchesName = !nameQuery || venueName.includes(nameQuery)
      const matchesCity = !cityQuery || venueLocation.includes(cityQuery)
      const venueSportIds = venueSportIdsByVenueId.get(venue.id) ?? new Set<number>()
      const hasTennis = tennisSportId != null && venueSportIds.has(tennisSportId)
      const hasPickleball = pickleballSportId != null && venueSportIds.has(pickleballSportId)
      const matchesSport =
        (venueSportFilter === 'tennis' && hasTennis)
        || (venueSportFilter === 'pickleball' && hasPickleball)
      return matchesType && matchesName && matchesCity && matchesSport
    })
  }, [joinableVenues, pickleballSportId, publicVenuePrefs, tennisSportId, venueCitySearch, venueNameSearch, venueSportFilter, venueSportIdsByVenueId, venueTypeFilter])
  const hasVenueDiscoveryQuery = venueCitySearch.trim().length > 0 || venueNameSearch.trim().length > 0

  useEffect(() => {
    setSelectedJoinVenueId(defaultJoinVenueId)
  }, [defaultJoinVenueId])

  useEffect(() => {
    setSelectedSportIds(mySportIds)
  }, [mySportIds])

  useEffect(() => {
    if (!openVenueMenuId) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      const menuRoot = document.querySelector(`[data-venue-menu-root="${openVenueMenuId}"]`)
      if (menuRoot instanceof HTMLElement && !menuRoot.contains(target)) {
        setOpenVenueMenuId(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenVenueMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openVenueMenuId])

  const currentSnapshot = JSON.stringify({
    first_name: firstName,
    last_name: lastName,
    gender,
    availability_status: availabilityStatus,
    availability_note: availabilityNote,
    availability_until: availabilityUntil,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    contact_channel: contactChannel,
    looking_to_play: lookingToPlay,
    preferred_play_times: [...preferredPlayTimes].sort(),
  })

  useEffect(() => {
    const nextFirstName = profile.first_name ?? ''
    const nextLastName = profile.last_name ?? ''
    const nextGender = profile.gender ?? 'unspecified'
    const nextAvailabilityStatus = profile.availability_status ?? 'available'
    const nextAvailabilityNote = profile.availability_note ?? ''
    const nextAvailabilityUntil = profile.availability_until ?? ''
    const nextContactEmail = profile.contact_email ?? ''
    const nextContactPhone = profile.contact_phone ?? ''
    const nextContactChannel = profile.contact_channel === 'sms' ? 'sms' : 'email'
    const nextLookingToPlay = profile.looking_to_play ?? ''
    const nextPreferredPlayTimes = profile.preferred_play_times ?? []

    setFirstName(nextFirstName)
    setLastName(nextLastName)
    setDisplayNameDraft(profile.display_name ?? '')
    setGender(nextGender)
    setAvailabilityStatus(nextAvailabilityStatus)
    setAvailabilityMode(deriveAvailabilityMode(nextAvailabilityStatus, nextLookingToPlay))
    setAvailabilityNote(nextAvailabilityNote)
    setAvailabilityUntil(nextAvailabilityUntil)
    setContactEmail(nextContactEmail)
    setContactPhone(nextContactPhone)
    setContactChannel(nextContactChannel)
    setLookingToPlay(nextLookingToPlay)
    setPreferredPlayTimes(nextPreferredPlayTimes)
    setCustomPreferredTime('')
    lastSavedSnapshotRef.current = JSON.stringify({
      first_name: nextFirstName,
      last_name: nextLastName,
      gender: nextGender,
      availability_status: nextAvailabilityStatus,
      availability_note: nextAvailabilityNote,
      availability_until: nextAvailabilityUntil,
      contact_email: nextContactEmail,
      contact_phone: nextContactPhone,
      contact_channel: nextContactChannel,
      looking_to_play: nextLookingToPlay,
      preferred_play_times: [...nextPreferredPlayTimes].sort(),
    })
    setAutoSaveState('idle')
  }, [
    profile.first_name,
    profile.last_name,
    profile.gender,
    profile.availability_status,
    profile.availability_note,
    profile.availability_until,
    profile.contact_email,
    profile.contact_phone,
    profile.contact_channel,
    profile.looking_to_play,
    profile.preferred_play_times,
  ])

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    if (currentSnapshot === lastSavedSnapshotRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setAutoSaveState('saving')

    saveTimerRef.current = setTimeout(() => {
      const formData = new FormData()
      formData.set('first_name', firstName)
      formData.set('last_name', lastName)
      formData.set('gender', gender ?? 'unspecified')
      formData.set('availability_status', availabilityStatus ?? 'available')
      formData.set('availability_note', availabilityNote)
      formData.set('availability_until', availabilityUntil)
      formData.set('contact_email', contactEmail)
      formData.set('contact_phone', contactPhone)
      formData.set('contact_channel', contactChannel)
      formData.set('looking_to_play', lookingToPlay)
      formData.set('preferred_play_times_present', '1')
      preferredPlayTimes.forEach((value) => formData.append('preferred_play_times', value))

      startTransition(async () => {
        try {
          await onUpdateProfile(formData)
          lastSavedSnapshotRef.current = currentSnapshot
          setAutoSaveState('saved')
          setTimeout(() => {
            setAutoSaveState(prev => (prev === 'saved' ? 'idle' : prev))
          }, 1200)
        } catch {
          setAutoSaveState('error')
        }
      })
    }, 500)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [availabilityNote, availabilityStatus, availabilityUntil, contactChannel, contactEmail, contactPhone, currentSnapshot, firstName, gender, lastName, lookingToPlay, onUpdateProfile, preferredPlayTimes, startTransition])

  const inputClass = 'text-body-main h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'
  const emailSelected = contactChannel === 'email'
  const smsSelected = contactChannel === 'sms'
  const showAvailabilityDetails =
    availabilityMode === 'busy' || availabilityMode === 'away' || availabilityMode === 'not_looking'
  const playLocationCountry = myPlayCities[0]?.country?.trim() || DEFAULT_PLAY_COUNTRY
  const playLocationRegion = myPlayCities[0]?.region?.trim() || DEFAULT_PLAY_REGION
  const playLocationCities = myPlayCities.length > 0
    ? myPlayCities
        .map((city) => city.city_name?.trim?.() ?? '')
        .filter(Boolean)
        .join(', ')
    : 'Not set yet'
  const availablePlayCityChoices = useMemo(() => {
    const cityMap = new Map<string, { city_name: string; region?: string | null; country?: string | null }>()

    for (const city of availablePlayCities) {
      const normalized = normalizeCityName(city.city_name)
      if (!normalized || cityMap.has(normalized.toLowerCase())) continue
      cityMap.set(normalized.toLowerCase(), {
        city_name: normalized,
        region: city.region,
        country: city.country,
      })
    }

    for (const city of myPlayCities) {
      const normalized = normalizeCityName(city.city_name ?? '')
      if (!normalized || cityMap.has(normalized.toLowerCase())) continue
      cityMap.set(normalized.toLowerCase(), {
        city_name: normalized,
        region: city.region ?? DEFAULT_PLAY_REGION,
        country: city.country ?? DEFAULT_PLAY_COUNTRY,
      })
    }

    return Array.from(cityMap.values()).sort((left, right) => left.city_name.localeCompare(right.city_name))
  }, [availablePlayCities, myPlayCities])

  const handleAvailabilityModeChange = (mode: AvailabilityMode) => {
    const next = AVAILABILITY_MODE_OPTIONS.find((option) => option.value === mode)
    if (!next) return
    setAvailabilityMode(mode)
    setAvailabilityStatus(next.availabilityStatus)
    setLookingToPlay(next.lookingToPlay)
  }

  const toggleSection = (sectionId: string) => {
    setActiveSection((previous) => (previous === sectionId ? '' : sectionId))
  }

  useEffect(() => {
    if (searchParams.get('section') === 'venues') {
      setActiveSection('venues')
    }
  }, [searchParams])

  const basicInfoSection = () => (
    <AccordionSection
      title="Basic Info"
      description="Identity, contact, and playing context."
      eyebrow="Profile"
      isOpen={activeSection === 'basic'}
      onToggle={() => toggleSection('basic')}
    >
      <div className="rounded-lg border border-[#D7E0EC] bg-white px-4 py-4 shadow-[0_22px_45px_-36px_rgba(15,23,42,0.38)] sm:px-5 md:px-5 md:py-5">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={handleBasicSave}
          disabled={isPending || autoSaveState === 'saving'}
          className="inline-flex h-8 min-w-[58px] items-center justify-center rounded-md bg-[#071A44] px-5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#0B255D] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending || autoSaveState === 'saving' ? 'Saving' : 'Save'}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:gap-5">
        <div className="space-y-7 lg:pb-5">
          <div className="grid gap-4 sm:grid-cols-[86px_minmax(0,1fr)] sm:items-center">
            <AvatarUpload
              userId={userId}
              currentAvatarUrl={profile.avatar_url ?? null}
              onSaved={handleAvatarSaved}
              compact
            />
            <div>
              <label className="mb-2 block text-[11px] font-bold text-[#071A44]">Display Name</label>
              <input
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                placeholder="Display Name"
                maxLength={50}
                className="h-[35px] w-full rounded-md border border-[#CBD5E1] bg-white px-4 text-[11px] text-[#071A44] outline-none transition focus:border-[#94A3B8] focus:ring-2 focus:ring-slate-100"
              />
            </div>
          </div>

          <div>
            <div className="mb-2.5 flex flex-wrap items-center gap-4">
              <h3 className="text-[11px] font-bold text-[#071A44]">Your Name</h3>
              <span className="text-[10px] font-medium text-[#64748B]">Not Shown On This Website</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="first_name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="h-8 rounded-md border border-[#CBD5E1] bg-white px-3 text-[10px] text-[#071A44] outline-none transition placeholder:text-[#64748B] focus:border-[#94A3B8] focus:ring-2 focus:ring-slate-100"
                placeholder="First Name"
              />
              <input
                name="last_name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="h-8 rounded-md border border-[#CBD5E1] bg-white px-3 text-[10px] text-[#071A44] outline-none transition placeholder:text-[#64748B] focus:border-[#94A3B8] focus:ring-2 focus:ring-slate-100"
                placeholder="Last Name"
              />
            </div>
          </div>

          <div>
            <h3 className="mb-2.5 text-[11px] font-bold text-[#071A44]">Gender</h3>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-[#CBD5E1] bg-white">
              {[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'unspecified', label: 'Another' },
              ].map((option) => {
                const selected = (gender ?? 'unspecified') === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGender(option.value as Profile['gender'])}
                    className={`h-8 border-r border-[#CBD5E1] px-2 text-[10px] transition last:border-r-0 ${
                      selected ? 'bg-[#071A44] font-medium text-white' : 'bg-white text-[#071A44] hover:bg-[#F8FBFF]'
                    }`}
                    aria-pressed={selected}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {sports.length > 0 ? (
            <div>
              <h3 className="mb-2.5 text-[11px] font-bold text-[#071A44]">Sports</h3>
              <div className="flex flex-wrap gap-2">
                {sports
                  .filter((sport) => {
                    const label = `${sport.code} ${sport.display_name}`.toLowerCase()
                    return label.includes('tennis') || label.includes('pickleball')
                  })
                  .map((sport) => {
                    const selected = selectedSportIds.includes(sport.id)
                    return (
                      <button
                        key={sport.id}
                        type="button"
                        onClick={() => {
                          const nextIds = selected
                            ? selectedSportIds.filter((id) => id !== sport.id)
                            : [...selectedSportIds, sport.id]
                          setSelectedSportIds(nextIds)
                          void handleSetSports(sports.filter((entry) => nextIds.includes(entry.id)).map((entry) => entry.code))
                        }}
                        className={`h-8 min-w-[72px] rounded-md border px-5 text-[10px] transition ${
                          selected
                            ? 'border-[#071A44] bg-[#071A44] font-medium text-white shadow-sm'
                            : 'border-[#CBD5E1] bg-white text-[#071A44] hover:bg-[#F8FBFF]'
                        }`}
                        aria-pressed={selected}
                      >
                        {sport.display_name}
                      </button>
                    )
                  })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="hidden bg-[#D7E0EC] lg:block" />

        <div className="space-y-5 lg:pb-5">
          <div>
            <label className="mb-2.5 block text-[11px] font-bold text-[#071A44]">Login Email</label>
            <div className="flex h-[37px] items-center gap-3 rounded-md border border-[#CBD5E1] bg-white px-3 text-[11px] text-[#071A44]">
              <span className="text-[15px] font-black leading-none text-[#4285F4]">G</span>
              <span className="min-w-0 flex-1 truncate">{userEmail?.trim() || 'No login email available'}</span>
              <span className="shrink-0 text-[10px] font-medium text-[#64748B]">Google Sign-In</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2.5 text-[11px] font-bold text-[#071A44]">Receive Notice Via</h3>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[#CBD5E1] bg-white">
              <button
                type="button"
                onClick={() => setContactChannel('email')}
                className={`h-8 text-[10px] transition ${emailSelected ? 'bg-[#071A44] font-medium text-white' : 'bg-white text-[#071A44] hover:bg-[#F8FBFF]'}`}
                aria-pressed={emailSelected}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setContactChannel('sms')}
                className={`h-8 border-l border-[#CBD5E1] text-[10px] transition ${smsSelected ? 'bg-[#071A44] font-medium text-white' : 'bg-white text-[#071A44] hover:bg-[#F8FBFF]'}`}
                aria-pressed={smsSelected}
              >
                SMS
              </button>
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
            <div>
              <label className="mb-2 block text-[11px] font-bold text-[#071A44]">Contact Email</label>
              <input
                type="email"
                name="contact_email"
                placeholder={userEmail ?? 'Add a contact email'}
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                className="h-[34px] w-full rounded-md border border-[#CBD5E1] bg-white px-4 text-[10px] text-[#071A44] outline-none transition placeholder:text-[#64748B] focus:border-[#94A3B8] focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-bold text-[#071A44]">Phone</label>
              <div className="flex h-[34px] items-center gap-2.5 rounded-md border border-[#CBD5E1] bg-white px-3 text-[10px] text-[#071A44]">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true">
                  <path d="M7.2 3.2 10 6c.6.6.7 1.5.3 2.2l-1.1 1.9a12.9 12.9 0 0 0 4.7 4.7l1.9-1.1c.7-.4 1.6-.3 2.2.3l2.8 2.8c.5.5.6 1.3.2 2a4.1 4.1 0 0 1-3.6 2.2C9.5 21 3 14.5 3 6.6c0-1.5.9-2.9 2.2-3.6.7-.4 1.5-.3 2 .2Z" />
                </svg>
                  <input
                    type="tel"
                    name="contact_phone"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#64748B]"
                  />
              </div>
            </div>
          </div>

          <BasicLocationEditor
            country={playLocationCountry}
            region={playLocationRegion}
            playCities={myPlayCities}
            availableCities={availablePlayCityChoices}
            onSave={(params) => onSaveGlobalPreferences(params)}
          />
        </div>
      </div>
      </div>
    </AccordionSection>
  )

  const availabilitySection = () => (
    <AccordionSection
      title="Playing Availability"
      description="One place for how open you are and when you usually play."
      eyebrow="Schedule"
      isOpen={activeSection === 'availability'}
      onToggle={() => toggleSection('availability')}
    >
      <SubCard>
        <div className="space-y-5">
          <div>
            <FieldLabel>Current status</FieldLabel>
            <div className="flex flex-wrap gap-2.5">
              {AVAILABILITY_MODE_OPTIONS.map((option) => {
                const selected = availabilityMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleAvailabilityModeChange(option.value)}
                    className={`text-body-main inline-flex items-center rounded-full border px-3.5 py-2 transition ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                    }`}
                    aria-pressed={selected}
                  >
                    <span className="mr-2">
                      <AvailabilityDot value={option.value} />
                    </span>
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {showAvailabilityDetails && (
            <div className="grid gap-4 rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <FieldLabel>Note</FieldLabel>
                <input
                  name="availability_note"
                  value={availabilityNote}
                  onChange={e => setAvailabilityNote(e.target.value)}
                  placeholder="Vacation, exam season, hard to commit right now..."
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>Available again</FieldLabel>
                <input
                  type="date"
                  name="availability_until"
                  value={availabilityUntil}
                  onChange={e => setAvailabilityUntil(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-5">
            <FieldLabel>Preferred times</FieldLabel>
            <PreferredTimesField
              preferredPlayTimes={preferredPlayTimes}
              customPreferredTime={customPreferredTime}
              onTogglePreset={togglePreferredPlayTime}
              onRemove={removePreferredPlayTime}
              onCustomPreferredTimeChange={setCustomPreferredTime}
              onAddCustom={addCustomPreferredTime}
            />
          </div>
        </div>
      </SubCard>
    </AccordionSection>
  )

  const sportProfilesSection = () => sports.length > 0 ? (
    <AccordionSection
      title="Sport Profiles"
      description="One profile per sport."
      eyebrow="Sports"
      isOpen={activeSection === 'sports'}
      onToggle={() => toggleSection('sports')}
    >
      <SportProfilesEditor
        sports={sports}
        activeSportIds={selectedSportIds}
        initialProfiles={mySportProfiles}
        onSaveProfile={onSaveSportProfile}
      />
    </AccordionSection>
  ) : null

  const privacySection = () => (
    <AccordionSection
      title="Discovery Settings"
      description="Choose where other registered players can find you."
      eyebrow="Sharing"
      isOpen={activeSection === 'privacy'}
      onToggle={() => toggleSection('privacy')}
    >
      <DiscoveryAndInvitesSection
        showTitle={false}
        visibleInCityDiscovery={profile.visible_in_city_discovery ?? false}
        searchableByEmailOrPhone={profile.searchable_by_contact_info ?? false}
        sharedGroupJoinPreference={profile.shared_group_join_preference ?? 'auto_join_saved_players'}
        playCities={myPlayCities}
        identities={myIdentities}
        onSaveGlobal={onSaveGlobalPreferences}
        onSetVenueMemberDiscovery={onSetVenueMemberDiscovery}
      />
    </AccordionSection>
  )

  const proxySection = () => (
    <AccordionSection
      title="Proxy Management"
      description="Long-term delegate relationships for player-side match actions."
      eyebrow="Delegation"
      isOpen={activeSection === 'proxy'}
      onToggle={() => toggleSection('proxy')}
    >
      <MatchProxySection embedded />
    </AccordionSection>
  )

  const venuesSection = () => (
    <AccordionSection
      title="Venues & Membership"
      description="Your current clubs, public courts, and venue joins."
      eyebrow="Places"
      isOpen={activeSection === 'venues'}
      onToggle={() => toggleSection('venues')}
    >
      <div className="space-y-5">
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="text-h2 text-slate-900">Your Venues</h3>
            <span className="text-label text-slate-400">
              {sortedJoinedIdentities.length + sortedPublicVenuePrefs.length} Saved
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {sortedJoinedIdentities.length === 0 && sortedPublicVenuePrefs.length === 0 ? (
              <div className="text-body-main rounded-[24px] border-2 border-dashed border-slate-200 bg-white px-5 py-10 text-center text-slate-400 md:col-span-2">
                No venues saved yet.
              </div>
            ) : (
              <>
                {sortedJoinedIdentities.map((identity) => {
                  const menuKey = `joined:${identity.id}`
                  const venueName = getVenueDisplayName(identity.venue)
                  return (
                    <div
                      key={identity.id}
                      className="flex h-full items-center justify-between gap-4 rounded-[24px] border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_-30px_rgba(15,23,42,0.18)] transition hover:border-slate-300"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 overflow-hidden">
                          <h4 className="text-title-main truncate text-slate-900">{venueName}</h4>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <VenueBadge tone="type">{getVenueKindLabel(identity.venue.venue_kind)}</VenueBadge>
                            <VenueBadge tone="member">Member</VenueBadge>
                            {profile.primary_venue_id === identity.venue_id ? (
                              <VenueBadge tone="primary">Primary</VenueBadge>
                            ) : null}
                            {renderVenueSportBadges(identity.venue_id)}
                          </div>
                        </div>
                        <p className="text-body-sub mt-1 truncate text-slate-400">
                          {getVenueMetaLine(identity.venue)}
                        </p>
                      </div>

                      <div className="relative shrink-0" data-venue-menu-root={menuKey}>
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={openVenueMenuId === menuKey}
                          onClick={() => {
                            setVenueActionError(null)
                            setOpenVenueMenuId(prev => (prev === menuKey ? null : menuKey))
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                        >
                          <span className="flex items-center gap-1" aria-hidden="true">
                            <span className="h-1 w-1 rounded-full bg-current" />
                            <span className="h-1 w-1 rounded-full bg-current" />
                            <span className="h-1 w-1 rounded-full bg-current" />
                          </span>
                        </button>
                        {openVenueMenuId === menuKey ? (
                          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                            {profile.primary_venue_id === identity.venue_id ? (
                              <div className="text-label px-3 py-2 text-slate-400">
                                Primary venue
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetPrimaryVenue(identity.venue_id)}
                                disabled={isVenueActionPending}
                                className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {pendingVenueAction?.id === identity.venue_id && pendingVenueAction.kind === 'primary'
                                  ? 'Setting primary...'
                                  : 'Set primary'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteVenue(identity.venue_id, identity.venue.name)}
                              disabled={isVenueActionPending}
                              className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {pendingVenueAction?.id === identity.venue_id && pendingVenueAction.kind === 'delete'
                                ? 'Deleting...'
                                : 'Delete'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}

                {sortedPublicVenuePrefs.map((venue) => {
                  const menuKey = `public:${venue.id}`
                  return (
                    <div
                      key={venue.id}
                      className="flex h-full items-center justify-between gap-4 rounded-[24px] border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_-30px_rgba(15,23,42,0.18)] transition hover:border-slate-300"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 overflow-hidden">
                          <h4 className="text-title-main truncate text-slate-900">{getVenueDisplayName(venue)}</h4>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <VenueBadge tone="type">{getVenueKindLabel(venue.venue_kind)}</VenueBadge>
                            <VenueBadge tone="starred">Saved</VenueBadge>
                            {renderVenueSportBadges(venue.id)}
                          </div>
                        </div>
                        <p className="text-body-sub mt-1 truncate text-slate-400">
                          {getVenueMetaLine(venue)}
                        </p>
                      </div>

                      <div className="relative shrink-0" data-venue-menu-root={menuKey}>
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={openVenueMenuId === menuKey}
                          onClick={() => {
                            setVenueActionError(null)
                            setOpenVenueMenuId(prev => (prev === menuKey ? null : menuKey))
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                        >
                          <span className="flex items-center gap-1" aria-hidden="true">
                            <span className="h-1 w-1 rounded-full bg-current" />
                            <span className="h-1 w-1 rounded-full bg-current" />
                            <span className="h-1 w-1 rounded-full bg-current" />
                          </span>
                        </button>
                        {openVenueMenuId === menuKey ? (
                          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                            <button
                              type="button"
                              onClick={() => handleRemoveSavedVenue(venue.id, venue.name)}
                              disabled={isVenueActionPending}
                              className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {pendingVenueAction?.id === venue.id && pendingVenueAction.kind === 'remove_saved'
                                ? 'Unsaving...'
                                : 'Unsave'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#DCE7F3] bg-[#F5F8FC] p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.12)] md:p-5">
          <div className="mb-4">
            <h3 className="text-h2 text-slate-900">Discover Venues</h3>
            <p className="text-body-sub mt-1 text-slate-500">Search and save clubs, parks, and courts near you.</p>
          </div>

          {!normalizedDisplayName && joinableVenues.length > 0 ? (
            <div className="text-body-main mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              Set your display name above before joining a venue.
            </div>
          ) : null}

          <div className="grid gap-2.5 xl:grid-cols-12">
            <div className="xl:col-span-2">
              <input
                type="text"
                value={venueCitySearch}
                onChange={(event) => setVenueCitySearch(event.target.value)}
                placeholder="City or area"
                className={`${inputClass} bg-white`}
              />
            </div>
            <div className="xl:col-span-4">
              <input
                type="text"
                value={venueNameSearch}
                onChange={(event) => setVenueNameSearch(event.target.value)}
                placeholder="Club, park, or court name"
                className={`${inputClass} bg-white`}
              />
            </div>
            <div className="xl:col-span-2">
              <select
                value={venueTypeFilter}
                onChange={(event) => setVenueTypeFilter(event.target.value as 'all' | VenueKind)}
                className={`${inputClass} bg-white`}
              >
                {VENUE_KIND_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="flex rounded-2xl border border-slate-200 bg-white p-1 xl:col-span-4">
              {VENUE_SPORT_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVenueSportFilter(option.value)}
                  className={`min-h-10 flex-1 rounded-xl px-2 text-center text-[12px] font-semibold leading-tight transition ${
                    venueSportFilter === option.value
                      ? 'bg-[#071A44] text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {filteredJoinableVenues.map((venue) => renderJoinableVenueCard(venue))}
          </div>

          {joinableVenues.length === 0 ? (
            <div className="text-body-main mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-400">
              You have already joined all available venues.
            </div>
          ) : !hasVenueDiscoveryQuery ? (
            <div className="text-body-main mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-400">
              Start typing a city or venue name to search.
            </div>
          ) : filteredJoinableVenues.length === 0 ? (
            <div className="text-body-main mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-400">
              No venues found for the current filters.
            </div>
          ) : null}
        </div>

        {venueActionError ? <p className="text-body-main text-rose-600">{venueActionError}</p> : null}
        {joinError ? <p className="text-body-main text-rose-600">{joinError}</p> : null}
      </div>
    </AccordionSection>
  )

  const renderedProfile = () => (
    <div className="mx-auto max-w-[1140px] space-y-5">
      <div className="px-1 pt-2">
        <div>
          <h1 className="text-h1 text-[#071A44]">Profile Settings</h1>
        </div>
      </div>

      {identityLinkCandidates.length > 0 ? (
        <IdentityLinkReviewCard
          title="Review previous invitations"
          body="We found matches linked to your contact information."
          candidates={identityLinkCandidates}
          onAccept={onAcceptIdentityLink}
          onKeepSeparate={onKeepSeparateIdentityLink}
        />
      ) : null}

      {basicInfoSection()}
      {venuesSection()}
      {sportProfilesSection()}
      {privacySection()}
      {availabilitySection()}
    </div>
  )

  const togglePreferredPlayTime = (value: string) => {
    setPreferredPlayTimes((previous) =>
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value],
    )
  }

  const removePreferredPlayTime = (value: string) => {
    setPreferredPlayTimes((previous) => previous.filter((item) => item !== value))
  }

  const addCustomPreferredTime = () => {
    const normalized = customPreferredTime.trim()
    if (!normalized) return
    setPreferredPlayTimes((previous) =>
      previous.includes(normalized) ? previous : [...previous, normalized],
    )
    setCustomPreferredTime('')
  }

  const handleSetSports = async (codes: string[]) => {
    await onSetSports(codes)
    setSelectedSportIds(
      sports.filter((sport) => codes.includes(sport.code)).map((sport) => sport.id),
    )
  }

  const handleBasicSave = () => {
    const trimmedDisplayName = displayNameDraft.trim()
    startTransition(async () => {
      try {
        if (trimmedDisplayName && trimmedDisplayName !== (profile.display_name ?? '').trim()) {
          await onSetDisplayName(trimmedDisplayName)
        }

        const formData = new FormData()
        formData.set('first_name', firstName)
        formData.set('last_name', lastName)
        formData.set('gender', gender ?? 'unspecified')
        formData.set('availability_status', availabilityStatus ?? 'available')
        formData.set('availability_note', availabilityNote)
        formData.set('availability_until', availabilityUntil)
        formData.set('contact_email', contactEmail)
        formData.set('contact_phone', contactPhone)
        formData.set('contact_channel', contactChannel)
        formData.set('looking_to_play', lookingToPlay)
        formData.set('preferred_play_times_present', '1')
        preferredPlayTimes.forEach((value) => formData.append('preferred_play_times', value))
        await onUpdateProfile(formData)
        lastSavedSnapshotRef.current = currentSnapshot
        setAutoSaveState('saved')
        setTimeout(() => {
          setAutoSaveState(prev => (prev === 'saved' ? 'idle' : prev))
        }, 1200)
        router.refresh()
      } catch {
        setAutoSaveState('error')
      }
    })
  }

  const handleAvatarSaved = async () => {
    await onAvatarSaved()
    router.refresh()
  }

  const handleJoinVenue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!normalizedDisplayName) {
      setJoinError('Set your display name first, then you can join venues.')
      return
    }
    if (!selectedJoinVenueId) {
      setJoinError('Please select a venue.')
      return
    }

    const joinVenueId = selectedJoinVenueId
    setJoinError(null)
    setJoiningVenueId(joinVenueId)
    startJoiningVenue(async () => {
      try {
        const result = await onJoinVenue(joinVenueId)
        if (!result.ok) {
          setJoinError(result.error)
          return
        }
        setSelectedJoinVenueId('')
        router.refresh()
      } catch (err: unknown) {
        setJoinError(normalizeActionError(err, 'Failed to join venue'))
      } finally {
        setJoiningVenueId(null)
      }
    })
  }

  const handleQuickJoinVenue = (venueId: string, relationship: 'member' | 'save' | null = null) => {
    const venue = joinableVenues.find((entry) => entry.id === venueId)
    if (!venue) {
      setJoinError('That venue could not be found.')
      return
    }

    if (!normalizedDisplayName) {
      setJoinError('Set your display name first, then you can join venues.')
      return
    }

    setJoinError(null)
    setOpenVenueMenuId(null)
    setSelectedJoinVenueId(venueId)
    setJoiningVenueId(venueId)
    startJoiningVenue(async () => {
      try {
        const actionMode = relationship ?? (venueUsesMemberRelationship(venue.venue_kind) ? 'member' : 'save')
        const result = actionMode === 'member'
          ? await onJoinVenue(venueId)
          : await onSaveVenuePreference(venueId)
        if (!result.ok) {
          setJoinError(result.error)
          return
        }
        setSelectedJoinVenueId('')
        router.refresh()
      } catch (err: unknown) {
        setJoinError(
          normalizeActionError(
            err,
            relationship === 'save' ? 'Failed to save venue' : 'Failed to join venue',
          ),
        )
      } finally {
        setJoiningVenueId(null)
      }
    })
  }

  const renderJoinableVenueCard = (venue: Venue) => {
    const menuKey = `join-${venue.id}`
    const usesMemberRelationship = venueUsesMemberRelationship(venue.venue_kind)
    const isMenuOpen = openVenueMenuId === menuKey
    const isBusy = isJoiningVenue && joiningVenueId === venue.id

    return (
      <div
        key={venue.id}
        className="flex items-center justify-between gap-4 rounded-[18px] border border-[#DCE7F3] bg-white/70 p-3.5 transition hover:border-[#C8D7EA] hover:bg-white"
      >
        <Link
          href={`/app/venues/${venue.id}`}
          className="min-w-0 flex-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-body-main truncate font-semibold text-slate-900">{getVenueDisplayName(venue)}</h4>
            <VenueBadge tone="type">{getVenueKindLabel(venue.venue_kind)}</VenueBadge>
            {renderVenueSportBadges(venue.id)}
          </div>
          <p className="text-label mt-1 truncate text-slate-400">
            {getVenueMetaLine(venue)}
          </p>
        </Link>

        <div className="relative shrink-0" data-venue-menu-root={menuKey}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => {
              setJoinError(null)
              setOpenVenueMenuId((prev) => (prev === menuKey ? null : menuKey))
            }}
            disabled={isJoiningVenue || !normalizedDisplayName}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${usesMemberRelationship ? 'Choose membership type for' : 'Save'} ${getVenueDisplayName(venue)}`}
            title={`${usesMemberRelationship ? 'Choose membership type for' : 'Save'} ${getVenueDisplayName(venue)}`}
          >
            {isBusy ? '...' : '+'}
          </button>

          {isMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[190px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
              {usesMemberRelationship ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleQuickJoinVenue(venue.id, 'member')}
                    disabled={isJoiningVenue}
                    className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    I'm a member
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickJoinVenue(venue.id, 'save')}
                    disabled={isJoiningVenue}
                    className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save this venue
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleQuickJoinVenue(venue.id, 'save')}
                  disabled={isJoiningVenue}
                  className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save venue
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const handleSetPrimaryVenue = (venueId: string) => {
    setVenueActionError(null)
    setPendingVenueAction({ id: venueId, kind: 'primary' })
    startVenueAction(async () => {
      try {
        await onSetPrimaryVenue(venueId)
        setOpenVenueMenuId(null)
        router.refresh()
      } catch (err: unknown) {
        setVenueActionError(normalizeActionError(err, 'Failed to set primary venue'))
      } finally {
        setPendingVenueAction(null)
      }
    })
  }

  const handleDeleteVenue = (venueId: string, venueName: string) => {
    if (!confirm(`Delete ${venueName} from your venues?`)) return

    setVenueActionError(null)
    setPendingVenueAction({ id: venueId, kind: 'delete' })
    startVenueAction(async () => {
      try {
        await onLeaveVenue(venueId)
        setOpenVenueMenuId(null)
        router.refresh()
      } catch (err: unknown) {
        setVenueActionError(normalizeActionError(err, 'Failed to delete venue'))
      } finally {
        setPendingVenueAction(null)
      }
    })
  }

  const handleRemoveSavedVenue = (venueId: string, venueName: string) => {
    if (!confirm(`Unsave ${venueName}?`)) return

    setVenueActionError(null)
    setPendingVenueAction({ id: venueId, kind: 'remove_saved' })
    startVenueAction(async () => {
      try {
        await onRemoveVenuePreference(venueId)
        setOpenVenueMenuId(null)
        router.refresh()
      } catch (err: unknown) {
        setVenueActionError(normalizeActionError(err, 'Failed to unsave venue'))
      } finally {
        setPendingVenueAction(null)
      }
    })
  }

  return renderedProfile()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.28)] sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-h1 text-slate-900">Profile settings</h1>
            <p className="mt-2 text-body-sub text-slate-600">
              Identity, venues, and playing schedule.
            </p>
          </div>
          <div className={`text-body-sub inline-flex items-center rounded-full px-3.5 py-1.5 font-medium ${
            autoSaveState === 'error'
              ? 'bg-rose-50 text-rose-600'
              : autoSaveState === 'saving' || isPending
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}>
            {autoSaveState === 'error'
              ? 'Could not save'
              : autoSaveState === 'saving' || isPending
                ? 'Saving...'
                : 'Live sync'}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
          <div className="space-y-5">
            <PanelCard title="Basic Info" description="Identity, contact, and playing context.">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(296px,0.94fr)]">
                <div className="space-y-3.5 xl:border-r xl:border-slate-200 xl:pr-5">
                  <div className="grid gap-2.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start">
                    <div className="pt-1">
                      <span className="text-label">Identity</span>
                    </div>
                    <div className="flex items-start gap-3.5">
                      <div className="shrink-0">
                        <AvatarUpload
                          userId={userId}
                          currentAvatarUrl={profile.avatar_url ?? null}
                          onSaved={handleAvatarSaved}
                          compact
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <FieldLabel>Display name</FieldLabel>
                        {profile.display_name ? (
                          <DisplayNameEditForm displayName={profile.display_name} onSave={onSetDisplayName} />
                        ) : (
                          <p className="text-body-sub text-slate-500">Set your display name to control how you appear.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <ProfileInfoRow label="Gender">
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        { value: 'male', label: 'Male' },
                        { value: 'female', label: 'Female' },
                        { value: 'unspecified', label: 'Another' },
                      ].map((option) => {
                        const selected = (gender ?? 'unspecified') === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setGender(option.value as Profile['gender'])}
                            className={`text-body-main inline-flex items-center rounded-full border px-3.5 py-2 transition ${
                              selected
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                            }`}
                            aria-pressed={selected}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </ProfileInfoRow>

                  {sports.length > 0 && (
                    <ProfileInfoRow label="Engaged sports" alignStart>
                      <SportsPreferenceForm
                        sports={sports}
                        initialSportIds={mySportIds}
                        onSave={handleSetSports}
                      />
                    </ProfileInfoRow>
                  )}

                  <ProfileInfoRow label="Location" alignStart>
                    <CompactLocationEditor
                      country={playLocationCountry}
                      region={playLocationRegion}
                      playCities={myPlayCities}
                      availableCities={availablePlayCityChoices}
                      onSave={(params) => onSaveGlobalPreferences(params)}
                    />
                  </ProfileInfoRow>
                </div>

                <div className="space-y-3.5 xl:pl-1">
                  <div className="pb-0.5">
                    <h3 className="text-label px-1 text-slate-400">Contact & official</h3>
                  </div>

                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <label className="text-label text-slate-800">Receive via</label>
                      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() => setContactChannel('email')}
                          className={`text-label rounded-md px-3 py-1 transition ${
                            emailSelected ? 'bg-slate-900 text-white' : 'text-slate-400'
                          }`}
                        >
                          Email
                        </button>
                        <button
                          type="button"
                          onClick={() => setContactChannel('sms')}
                          className={`text-label rounded-md px-3 py-1 transition ${
                            smsSelected ? 'bg-slate-900 text-white' : 'text-slate-400'
                          }`}
                        >
                          SMS
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2.5">
                      <div>
                        <FieldLabel>Contact email</FieldLabel>
                        <input
                          type="email"
                          name="contact_email"
                          placeholder={userEmail ?? 'Your registered email'}
                          value={contactEmail}
                          onChange={e => setContactEmail(e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <FieldLabel>Contact phone</FieldLabel>
                        <input
                          type="tel"
                          name="contact_phone"
                          value={contactPhone}
                          onChange={e => setContactPhone(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-3.5">
                    <FieldLabel>Court booking name</FieldLabel>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <input
                        name="first_name"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        className={inputClass}
                        placeholder="First name"
                      />
                      <input
                        name="last_name"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        className={inputClass}
                        placeholder="Last name"
                      />
                    </div>
                    <p className="mt-2 px-1 text-body-sub italic text-slate-400">
                      Your real name will be shared with other players in the same match to make court booking easier.
                    </p>
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard
              title="Playing availability"
              description="One place for how open you are and when you usually play."
            >
              <div className="space-y-5">
                <div>
                  <FieldLabel>Current status</FieldLabel>
                  <div className="flex flex-wrap gap-2.5">
                    {AVAILABILITY_MODE_OPTIONS.map((option) => {
                      const selected = availabilityMode === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleAvailabilityModeChange(option.value)}
                          className={`text-body-main inline-flex items-center rounded-full border px-3.5 py-2 transition ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                          }`}
                          aria-pressed={selected}
                        >
                          <span className="mr-2">
                            <AvailabilityDot value={option.value} />
                          </span>
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {showAvailabilityDetails && (
                  <div className="grid gap-4 rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div>
                      <FieldLabel>Note</FieldLabel>
                      <input
                        name="availability_note"
                        value={availabilityNote}
                        onChange={e => setAvailabilityNote(e.target.value)}
                        placeholder="Vacation, exam season, hard to commit right now..."
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <FieldLabel>Available again</FieldLabel>
                      <input
                        type="date"
                        name="availability_until"
                        value={availabilityUntil}
                        onChange={e => setAvailabilityUntil(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-5">
                  <FieldLabel>Preferred times</FieldLabel>
                  <PreferredTimesField
                    preferredPlayTimes={preferredPlayTimes}
                    customPreferredTime={customPreferredTime}
                    onTogglePreset={togglePreferredPlayTime}
                    onRemove={removePreferredPlayTime}
                    onCustomPreferredTimeChange={setCustomPreferredTime}
                    onAddCustom={addCustomPreferredTime}
                  />
                </div>
              </div>
            </PanelCard>

            {sports.length > 0 && (
              <PanelCard
                title="Sport Profiles"
                description="One profile per sport."
              >
                <SportProfilesEditor
                  sports={sports}
                  activeSportIds={selectedSportIds}
                  initialProfiles={mySportProfiles}
                  onSaveProfile={onSaveSportProfile}
                />
              </PanelCard>
            )}
          </div>

          <div className="space-y-5">
            <PanelCard title="Photo">
              <AvatarUpload
                userId={userId}
                currentAvatarUrl={profile.avatar_url ?? null}
                onSaved={handleAvatarSaved}
              />
            </PanelCard>
          </div>
        </div>
      </section>
      <div className="space-y-6">
        <SectionCard title="Venues & Membership">
          <div className="space-y-5">
            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-h2 text-slate-900">Your Venues</h3>
                <span className="text-label text-slate-400">{sortedJoinedIdentities.length + sortedPublicVenuePrefs.length} Saved</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {sortedJoinedIdentities.length === 0 && sortedPublicVenuePrefs.length === 0 ? (
                  <div className="text-body-main rounded-[24px] border-2 border-dashed border-slate-200 bg-white px-5 py-10 text-center text-slate-400 md:col-span-2">
                    No venues saved yet.
                  </div>
                ) : (
                  <>
                    {sortedJoinedIdentities.map((identity) => {
                      const menuKey = `joined:${identity.id}`
                      const venueName = getVenueDisplayName(identity.venue)
                      return (
                        <div
                          key={identity.id}
                          className="flex h-full items-center justify-between gap-4 rounded-[24px] border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_-30px_rgba(15,23,42,0.18)] transition hover:border-slate-300"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 overflow-hidden">
                              <h4 className="text-title-main truncate text-slate-900">{venueName}</h4>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <VenueBadge tone="type">{getVenueKindLabel(identity.venue.venue_kind)}</VenueBadge>
                                <VenueBadge tone="member">Member</VenueBadge>
                                {profile.primary_venue_id === identity.venue_id ? (
                                  <VenueBadge tone="primary">Primary</VenueBadge>
                                ) : null}
                                {renderVenueSportBadges(identity.venue_id)}
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sub text-slate-400">
                              <span>{getVenueMetaLine(identity.venue)}</span>
                            </div>
                          </div>

                          <div className="relative shrink-0" data-venue-menu-root={menuKey}>
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={openVenueMenuId === menuKey}
                              onClick={() => {
                                setVenueActionError(null)
                                setOpenVenueMenuId(prev => (prev === menuKey ? null : menuKey))
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                            >
                              <span className="flex items-center gap-1" aria-hidden="true">
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                              </span>
                            </button>
                            {openVenueMenuId === menuKey && (
                              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                                {profile.primary_venue_id === identity.venue_id ? (
                                  <div className="text-label px-3 py-2 text-slate-400">
                                    Primary venue
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSetPrimaryVenue(identity.venue_id)}
                                    disabled={isVenueActionPending}
                                    className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {pendingVenueAction?.id === identity.venue_id && pendingVenueAction.kind === 'primary'
                                      ? 'Setting primary...'
                                      : 'Set primary'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVenue(identity.venue_id, identity.venue.name)}
                                  disabled={isVenueActionPending}
                                  className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {pendingVenueAction?.id === identity.venue_id && pendingVenueAction.kind === 'delete'
                                    ? 'Deleting...'
                                    : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {sortedPublicVenuePrefs.map((venue) => {
                      const menuKey = `public:${venue.id}`
                      return (
                        <div
                          key={venue.id}
                          className="flex h-full items-center justify-between gap-4 rounded-[24px] border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_-30px_rgba(15,23,42,0.18)] transition hover:border-slate-300"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 overflow-hidden">
                              <h4 className="text-title-main truncate text-slate-900">{getVenueDisplayName(venue)}</h4>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <VenueBadge tone="type">{getVenueKindLabel(venue.venue_kind)}</VenueBadge>
                                <VenueBadge tone="starred">Saved</VenueBadge>
                                {renderVenueSportBadges(venue.id)}
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sub text-slate-400">
                              <span>{getVenueMetaLine(venue)}</span>
                            </div>
                          </div>

                          <div className="relative shrink-0" data-venue-menu-root={menuKey}>
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={openVenueMenuId === menuKey}
                              onClick={() => {
                                setVenueActionError(null)
                                setOpenVenueMenuId(prev => (prev === menuKey ? null : menuKey))
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                            >
                              <span className="flex items-center gap-1" aria-hidden="true">
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                              </span>
                            </button>
                            {openVenueMenuId === menuKey && (
                              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSavedVenue(venue.id, venue.name)}
                                  disabled={isVenueActionPending}
                                  className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {pendingVenueAction?.id === venue.id && pendingVenueAction.kind === 'remove_saved'
                                    ? 'Unsaving...'
                                    : 'Unsave'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#DCE7F3] bg-[#F5F8FC] p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.12)] md:p-5">
              <div className="mb-4">
                <h3 className="text-h2 text-slate-900">Discover Venues</h3>
                <p className="text-body-sub mt-1 text-slate-500">Search and save clubs, parks, and courts near you.</p>
              </div>

              {!normalizedDisplayName && joinableVenues.length > 0 ? (
                <div className="text-body-main mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                  Set your display name above before joining a venue.
                </div>
              ) : null}

              <div className="grid gap-2.5 xl:grid-cols-12">
                <div className="xl:col-span-2">
                  <input
                    type="text"
                    value={venueCitySearch}
                    onChange={(event) => setVenueCitySearch(event.target.value)}
                    placeholder="City or area"
                    className={`${inputClass} bg-white`}
                  />
                </div>
                <div className="xl:col-span-4">
                  <input
                    type="text"
                    value={venueNameSearch}
                    onChange={(event) => setVenueNameSearch(event.target.value)}
                    placeholder="Club, park, or court name"
                    className={`${inputClass} bg-white`}
                  />
                </div>
                <div className="xl:col-span-2">
                  <select
                    value={venueTypeFilter}
                    onChange={(event) => setVenueTypeFilter(event.target.value as 'all' | VenueKind)}
                    className={`${inputClass} bg-white`}
                  >
                    {VENUE_KIND_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex rounded-2xl border border-slate-200 bg-white p-1 xl:col-span-4">
                  {VENUE_SPORT_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setVenueSportFilter(option.value)}
                      className={`min-h-10 flex-1 rounded-xl px-2 text-center text-[12px] font-semibold leading-tight transition ${
                        venueSportFilter === option.value
                          ? 'bg-[#071A44] text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredJoinableVenues.map((venue) => (
                  <div
                    key={venue.id}
                    className="flex items-center justify-between gap-4 rounded-[18px] border border-[#DCE7F3] bg-white/70 p-3.5 transition hover:border-[#C8D7EA] hover:bg-white"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-body-main truncate font-semibold text-slate-900">{getVenueDisplayName(venue)}</h4>
                        <VenueBadge tone="type">{getVenueKindLabel(venue.venue_kind)}</VenueBadge>
                        {renderVenueSportBadges(venue.id)}
                      </div>
                      <p className="text-label mt-1 truncate text-slate-400">
                        {getVenueMetaLine(venue)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickJoinVenue(venue.id)}
                      disabled={isJoiningVenue || !normalizedDisplayName}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Add ${getVenueDisplayName(venue)}`}
                      title={`Add ${getVenueDisplayName(venue)}`}
                    >
                      {isJoiningVenue && joiningVenueId === venue.id ? '…' : '+'}
                    </button>
                  </div>
                ))}
              </div>

              {joinableVenues.length === 0 ? (
                <div className="text-body-main mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-400">
                  You have already joined all available venues.
                </div>
              ) : !hasVenueDiscoveryQuery ? (
                <div className="text-body-main mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-400">
                  Start typing a city or venue name to search.
                </div>
              ) : filteredJoinableVenues.length === 0 ? (
                <div className="text-body-main mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-400">
                  No venues found for the current filters.
                </div>
              ) : null}
            </div>
          </div>

          {venueActionError ? <p className="text-body-main mt-4 text-rose-600">{venueActionError}</p> : null}
          {joinError ? <p className="text-body-main mt-3 text-rose-600">{joinError}</p> : null}
        </SectionCard>

        <SectionCard
          title="Discovery Settings"
          description="Choose where other registered players can find you."
          tone="soft"
        >
        <DiscoveryAndInvitesSection
            showTitle={false}
            visibleInCityDiscovery={profile.visible_in_city_discovery ?? false}
            searchableByEmailOrPhone={profile.searchable_by_contact_info ?? false}
            sharedGroupJoinPreference={profile.shared_group_join_preference ?? 'auto_join_saved_players'}
            playCities={myPlayCities}
            identities={myIdentities}
            onSaveGlobal={onSaveGlobalPreferences}
          onSetVenueMemberDiscovery={onSetVenueMemberDiscovery}
          />
        </SectionCard>
      </div>
    </div>
  )
}
