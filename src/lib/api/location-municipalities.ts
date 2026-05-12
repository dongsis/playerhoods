import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, LocationMunicipality } from '@/lib/types/database'

type Client = SupabaseClient<Database>
type VenueLocationRow = Pick<Database['public']['Tables']['venues']['Row'], 'city' | 'province' | 'country'>

export type LocationCityOption = {
  city_name: string
  region: string
  country: string
  province_code: string
  country_code: string
  region_english: string
  municipality_type: string
  upper_tier_county_district: string
}

function isMissingLocationMunicipalitiesSchemaError(error: { code?: string; message?: string; details?: string | null }) {
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    error.code === '42P01'
    || error.code === 'PGRST200'
    || error.code === 'PGRST205'
    || text.includes('location_municipalities')
  )
}

const CA_PROVINCE_NAME_BY_CODE: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
}

const CA_PROVINCE_CODE_BY_NAME = new Map(
  Object.entries(CA_PROVINCE_NAME_BY_CODE).map(([code, name]) => [name.toLowerCase(), code]),
)

function normalizeCountryCode(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (!normalized) return ''
  if (normalized === 'ca' || normalized === 'can' || normalized === 'canada') return 'CA'
  if (normalized === 'us' || normalized === 'usa' || normalized === 'united states' || normalized === 'united states of america') return 'US'
  return normalized.toUpperCase()
}

function normalizeCountryName(value: string | null | undefined): string {
  const countryCode = normalizeCountryCode(value)
  if (countryCode === 'CA') return 'Canada'
  if (countryCode === 'US') return 'United States'
  return value?.trim() || countryCode
}

function normalizeProvinceCode(value: string | null | undefined): string {
  const normalized = value?.trim() ?? ''
  if (!normalized) return ''
  const upper = normalized.toUpperCase()
  if (CA_PROVINCE_NAME_BY_CODE[upper]) return upper
  return CA_PROVINCE_CODE_BY_NAME.get(normalized.toLowerCase()) ?? upper
}

function optionKey(option: Pick<LocationCityOption, 'city_name' | 'region' | 'country'>): string {
  return `${option.city_name.toLowerCase()}::${option.region.toLowerCase()}::${option.country.toLowerCase()}`
}

async function listVenueCityOptions(
  supabase: Client,
  params: { countryCode?: string; provinceCode?: string } = {},
): Promise<LocationCityOption[]> {
  const result: LocationCityOption[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('venues')
      .select('city, province, country')
      .not('city', 'is', null)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('[location-municipalities] failed to load venue city options:', error)
      return result
    }

    const rows = (data ?? []) as VenueLocationRow[]

    for (const row of rows) {
      const cityName = row.city?.trim()
      const region = normalizeProvinceCode(row.province)
      const countryCode = normalizeCountryCode(row.country)
      const country = normalizeCountryName(row.country)

      if (!cityName || !region || !country) continue
      if (params.countryCode && countryCode !== normalizeCountryCode(params.countryCode)) continue
      if (params.provinceCode && region !== normalizeProvinceCode(params.provinceCode)) continue

      result.push({
        city_name: cityName,
        region,
        country,
        province_code: region,
        country_code: countryCode,
        region_english: CA_PROVINCE_NAME_BY_CODE[region] ?? region,
        municipality_type: 'venue_city',
        upper_tier_county_district: '',
      })
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return result
}

export async function listLocationCityOptions(
  supabase: Client,
  params: { countryCode?: string; provinceCode?: string } = {},
): Promise<LocationCityOption[]> {
  let query = supabase
    .from('location_municipalities')
    .select('country_code, country_name, province_code, province_name, region_english, upper_tier_county_district, municipality_type, city_municipality')
    .order('city_municipality', { ascending: true })

  if (params.countryCode) query = query.eq('country_code', params.countryCode)
  if (params.provinceCode) query = query.eq('province_code', params.provinceCode)

  const { data, error } = await query
  if (error && !isMissingLocationMunicipalitiesSchemaError(error)) {
    throw error
  }

  const rows = error ? [] : (data ?? []) as Pick<
    LocationMunicipality,
    | 'country_code'
    | 'country_name'
    | 'province_code'
    | 'province_name'
    | 'region_english'
    | 'upper_tier_county_district'
    | 'municipality_type'
    | 'city_municipality'
  >[]
  const options = new Map<string, LocationCityOption>()

  for (const row of rows) {
    const cityName = row.city_municipality.trim()
    const region = row.province_code.trim()
    const country = row.country_name.trim()
    const key = optionKey({ city_name: cityName, region, country })
    if (options.has(key)) continue

    options.set(key, {
      city_name: cityName,
      region,
      country,
      province_code: row.province_code,
      country_code: row.country_code,
      region_english: row.region_english,
      municipality_type: row.municipality_type,
      upper_tier_county_district: row.upper_tier_county_district,
    })
  }

  const venueCityOptions = await listVenueCityOptions(supabase, params)
  for (const option of venueCityOptions) {
    const key = optionKey(option)
    if (options.has(key)) continue
    options.set(key, option)
  }

  return Array.from(options.values()).sort((left, right) => left.city_name.localeCompare(right.city_name))
}
