import type { Venue } from '@/lib/types/database'

const VENUE_SUFFIX_PATTERN = /\b(?:tennis|pickleball|racquet|sports?)\s+(?:club|court|courts|centre|center|facility|facilities)\b$/i

export function slugifyVenueSegment(value: string | null | undefined): string {
  const normalized = (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'venue'
}

export function getVenueSlug(venue: Pick<Venue, 'name'>): string {
  const trimmedName = venue.name.trim()
  const shortenedName = trimmedName.replace(VENUE_SUFFIX_PATTERN, '').trim()
  return slugifyVenueSegment(shortenedName || trimmedName)
}

export function getVenueCanonicalPath(
  venue: Pick<Venue, 'name' | 'city' | 'province' | 'country'>,
): string {
  const country = slugifyVenueSegment(venue.country === 'Canada' ? 'ca' : venue.country)
  const province = slugifyVenueSegment(venue.province === 'Ontario' ? 'on' : venue.province)
  const city = slugifyVenueSegment(venue.city)
  const slug = getVenueSlug(venue)

  return `/venue/${country}/${province}/${city}/${slug}`
}
