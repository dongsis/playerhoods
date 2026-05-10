import { notFound, permanentRedirect } from 'next/navigation'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import { getVenueByCanonicalPath, getVenueCourts, getVenueSports } from '@/lib/api/venues'
import { listSports } from '@/lib/api/sports'
import { getVenueCanonicalPath } from '@/lib/venues/slug'
import { PublicVenuePageContent } from './PublicVenuePageContent'

export const revalidate = 3600
export const dynamic = 'force-static'

interface Props {
  params: Promise<{
    country: string
    province: string
    city: string
    slug: string
  }>
}

export default async function CanonicalVenuePage({ params }: Props) {
  const { country, province, city, slug } = await params
  const supabase = createSupabasePublicServerClient()
  const venue = await getVenueByCanonicalPath(supabase, {
    country: country.toLowerCase(),
    province: province.toLowerCase(),
    city: city.toLowerCase(),
    slug: slug.toLowerCase(),
  })

  if (!venue) notFound()

  const canonicalPath = getVenueCanonicalPath(venue)
  const requestedPath = `/venue/${country}/${province}/${city}/${slug}`.toLowerCase()
  if (requestedPath !== canonicalPath) {
    permanentRedirect(canonicalPath)
  }

  const [courts, sports, venueSports] = await Promise.all([
    getVenueCourts(supabase, venue.id),
    listSports(supabase),
    getVenueSports(supabase, venue.id),
  ])

  return (
    <PublicVenuePageContent
      venue={venue}
      courts={courts}
      sports={sports}
      venueSports={venueSports}
    />
  )
}
