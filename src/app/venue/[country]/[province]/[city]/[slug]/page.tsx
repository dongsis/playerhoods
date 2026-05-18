import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import { getVenueByCanonicalPath, getVenueCourts, getVenueSports } from '@/lib/api/venues'
import { listSports } from '@/lib/api/sports'
import type { Venue } from '@/lib/types/database'
import { getVenueCanonicalPath } from '@/lib/venues/slug'
import { getVenueDisplayName } from '@/lib/venues/display'
import { getAbsoluteUrl } from '@/lib/site-url'
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

type VenueRouteParams = Awaited<Props['params']>

async function getVenueForParams(params: VenueRouteParams) {
  const supabase = createSupabasePublicServerClient()
  const venue = await getVenueByCanonicalPath(supabase, {
    country: params.country.toLowerCase(),
    province: params.province.toLowerCase(),
    city: params.city.toLowerCase(),
    slug: params.slug.toLowerCase(),
  })

  return { supabase, venue }
}

function getVenueSeoTitle(venue: Venue) {
  const location = [venue.city, venue.province].filter(Boolean).join(', ')
  return `${getVenueDisplayName(venue)}${location ? ` in ${location}` : ''} | PlayerHoods`
}

function getVenueSeoDescription(venue: Venue) {
  const sports = [
    venue.supports_tennis ? 'tennis' : null,
    venue.supports_pickleball ? 'pickleball' : null,
  ].filter(Boolean)
  const sportText = sports.length > 0 ? sports.join(' and ') : 'sports'
  const location = [venue.city, venue.province, venue.country].filter(Boolean).join(', ')
  return `${getVenueDisplayName(venue)} is a ${sportText} venue${location ? ` in ${location}` : ''}. Find venue details and playing opportunities on PlayerHoods.`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params
  const { venue } = await getVenueForParams(resolvedParams)

  if (!venue) {
    return {
      title: 'Venue not found | PlayerHoods',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const canonicalPath = getVenueCanonicalPath(venue)
  const title = getVenueSeoTitle(venue)
  const description = getVenueSeoDescription(venue)
  const canonicalUrl = getAbsoluteUrl(canonicalPath)

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'PlayerHoods',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function CanonicalVenuePage({ params }: Props) {
  const resolvedParams = await params
  const { country, province, city, slug } = resolvedParams
  const { supabase, venue } = await getVenueForParams(resolvedParams)

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
