import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, LocationMunicipality } from '@/lib/types/database'

type Client = SupabaseClient<Database>

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
  if (error) {
    if (isMissingLocationMunicipalitiesSchemaError(error)) return []
    throw error
  }

  const rows = (data ?? []) as Pick<
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
    const key = `${cityName.toLowerCase()}::${region.toLowerCase()}::${country.toLowerCase()}`
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

  return Array.from(options.values()).sort((left, right) => left.city_name.localeCompare(right.city_name))
}
