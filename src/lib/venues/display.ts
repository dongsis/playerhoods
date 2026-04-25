import type { Venue } from '@/lib/types/database'

type VenueLabelSource = Pick<Venue, 'name' | 'abbreviation'>
type VenueLabelInput = VenueLabelSource | { name: string; abbreviation?: string | null }

export function getVenueDisplayName(venue: VenueLabelInput | null | undefined): string {
  if (!venue) return ''
  const abbreviation = venue.abbreviation?.trim()
  return abbreviation && abbreviation.length > 0 ? abbreviation : venue.name
}
