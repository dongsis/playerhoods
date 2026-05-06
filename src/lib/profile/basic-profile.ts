import { DEFAULT_PLAY_COUNTRY, DEFAULT_PLAY_REGION } from '@/lib/play-location-defaults'

export type BasicPlayCityInput = {
  city_name?: string | null
  city?: string | null
  region?: string | null
  country?: string | null
}

export type CompleteFirstOnboardingInput = {
  display_name: string
  sport_ids: number[]
  play_cities: BasicPlayCityInput[]
  club_or_venue_ids: string[]
  visible_in_city_discovery: boolean
  visible_in_club_member_discovery: boolean
}

export type NormalizedPlayCityInput = {
  city_name: string
  region: string
  country: string
}

export type NormalizedCompleteFirstOnboardingInput = {
  display_name: string
  sport_ids: number[]
  play_cities: NormalizedPlayCityInput[]
  club_or_venue_ids: string[]
  visible_in_city_discovery: boolean
  visible_in_club_member_discovery: boolean
}

export class BasicProfileValidationError extends Error {
  code: string

  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'BasicProfileValidationError'
  }
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)))
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

export function normalizeDisplayName(value: string) {
  return normalizeWhitespace(value)
}

export function normalizePlayCities(cities: BasicPlayCityInput[]) {
  const normalizedCities = cities.map((city) => {
    const cityName = normalizeWhitespace(city.city_name ?? city.city ?? '')
    const region = normalizeWhitespace(city.region ?? DEFAULT_PLAY_REGION) || DEFAULT_PLAY_REGION
    const country = normalizeWhitespace(city.country ?? DEFAULT_PLAY_COUNTRY) || DEFAULT_PLAY_COUNTRY
    return {
      city_name: cityName,
      region,
      country,
    }
  })

  if (normalizedCities.some((city) => city.city_name.length === 0)) {
    throw new BasicProfileValidationError('city_required', 'Each play city needs a name.')
  }

  if (normalizedCities.length > 8) {
    throw new BasicProfileValidationError('too_many_play_cities', 'You can add up to 8 play cities.')
  }

  const seen = new Set<string>()
  for (const city of normalizedCities) {
    const key = `${city.country.toLowerCase()}::${city.region.toLowerCase()}::${city.city_name.toLowerCase()}`
    if (seen.has(key)) {
      throw new BasicProfileValidationError('duplicate_play_city', 'A play city is listed more than once.')
    }
    seen.add(key)
  }

  return normalizedCities
}

export function normalizeCompleteFirstOnboardingInput(
  input: CompleteFirstOnboardingInput,
): NormalizedCompleteFirstOnboardingInput {
  const displayName = normalizeDisplayName(input.display_name)
  if (!displayName) {
    throw new BasicProfileValidationError('display_name_required', 'Please enter your display name.')
  }

  const sportIds = uniqueNumbers(input.sport_ids)
  if (sportIds.length === 0) {
    throw new BasicProfileValidationError('sports_required', 'Choose at least one sport.')
  }

  const playCities = normalizePlayCities(input.play_cities)
  const venueIds = uniqueStrings(input.club_or_venue_ids)

  return {
    display_name: displayName,
    sport_ids: sportIds,
    play_cities: playCities,
    club_or_venue_ids: venueIds,
    visible_in_city_discovery: input.visible_in_city_discovery,
    visible_in_club_member_discovery: input.visible_in_club_member_discovery,
  }
}
