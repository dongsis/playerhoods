export type CitySuggestionOption = {
  city_name: string
  region?: string | null
  province_code?: string | null
}

const PROVINCE_CODE_BY_NAME = new Map<string, string>([
  ['alberta', 'AB'],
  ['british columbia', 'BC'],
  ['manitoba', 'MB'],
  ['new brunswick', 'NB'],
  ['newfoundland and labrador', 'NL'],
  ['nova scotia', 'NS'],
  ['northwest territories', 'NT'],
  ['nunavut', 'NU'],
  ['ontario', 'ON'],
  ['prince edward island', 'PE'],
  ['quebec', 'QC'],
  ['saskatchewan', 'SK'],
  ['yukon', 'YT'],
])

const CITY_PRIORITY_BY_PROVINCE: Record<string, string[]> = {
  ON: [
    'Toronto',
    'Ottawa',
    'Mississauga',
    'Brampton',
    'Hamilton',
    'London',
    'Markham',
    'Vaughan',
    'Kitchener',
    'Windsor',
    'Richmond Hill',
    'Oakville',
    'Burlington',
    'Oshawa',
    'Barrie',
    'St. Catharines',
    'Cambridge',
    'Guelph',
    'Waterloo',
    'Kingston',
    'Milton',
    'Ajax',
    'Whitby',
    'Pickering',
    'Caledon',
    'Newmarket',
    'Aurora',
    'Halton Hills',
    'Niagara Falls',
    'Brantford',
    'Peterborough',
    'Thunder Bay',
    'Greater Sudbury',
    'Sault Ste. Marie',
    'North Bay',
    'Belleville',
    'Cornwall',
    'Orillia',
    'Orangeville',
    'Georgetown',
    'Acton',
  ],
}

export function normalizeProvinceForCitySuggestions(value: string | null | undefined): string {
  const normalized = value?.trim() ?? ''
  if (!normalized) return 'ON'
  const upper = normalized.toUpperCase()
  if (upper.length <= 3) return upper
  return PROVINCE_CODE_BY_NAME.get(normalized.toLowerCase()) ?? upper
}

function normalizeCityName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function getOptionProvince(option: CitySuggestionOption) {
  return normalizeProvinceForCitySuggestions(option.province_code ?? option.region)
}

function getPriorityIndex(cityName: string, provinceCode: string) {
  const priorityList = CITY_PRIORITY_BY_PROVINCE[provinceCode] ?? []
  const normalizedCity = normalizeCityName(cityName).toLowerCase()
  const index = priorityList.findIndex((city) => city.toLowerCase() === normalizedCity)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export function sortCityNamesByProvincePriority(
  cityNames: string[],
  provinceCode: string | null | undefined = 'ON',
): string[] {
  const normalizedProvince = normalizeProvinceForCitySuggestions(provinceCode)
  return [...cityNames].sort((left, right) => {
    const leftPriority = getPriorityIndex(left, normalizedProvince)
    const rightPriority = getPriorityIndex(right, normalizedProvince)
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return left.localeCompare(right)
  })
}

export function sortCityOptionsByProvincePriority<T extends CitySuggestionOption>(
  cityOptions: T[],
  provinceCode: string | null | undefined = 'ON',
): T[] {
  const normalizedProvince = normalizeProvinceForCitySuggestions(provinceCode)
  return [...cityOptions].sort((left, right) => {
    const leftProvince = getOptionProvince(left)
    const rightProvince = getOptionProvince(right)
    const leftInProvince = leftProvince === normalizedProvince
    const rightInProvince = rightProvince === normalizedProvince
    if (leftInProvince !== rightInProvince) return leftInProvince ? -1 : 1

    const leftPriority = getPriorityIndex(left.city_name, normalizedProvince)
    const rightPriority = getPriorityIndex(right.city_name, normalizedProvince)
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return left.city_name.localeCompare(right.city_name)
  })
}

export function getPrioritizedQuickCityGroups(
  cityOptions: CitySuggestionOption[],
  selectedCities: string[],
  provinceCode: string | null | undefined = 'ON',
  limit = 10,
) {
  const normalizedProvince = normalizeProvinceForCitySuggestions(provinceCode)
  const selectedLowerNames = new Set(selectedCities.map((city) => normalizeCityName(city).toLowerCase()))
  const optionByLowerName = new Map<string, CitySuggestionOption>()

  for (const option of sortCityOptionsByProvincePriority(cityOptions, normalizedProvince)) {
    if (getOptionProvince(option) !== normalizedProvince) continue
    const cityName = normalizeCityName(option.city_name)
    if (!cityName) continue
    const key = cityName.toLowerCase()
    if (selectedLowerNames.has(key) || optionByLowerName.has(key)) continue
    optionByLowerName.set(key, { ...option, city_name: cityName })
  }

  const cities = Array.from(optionByLowerName.values())
    .slice(0, limit)
    .map((option) => option.city_name)

  return cities.length > 0 ? [{ label: normalizedProvince, cities }] : []
}
