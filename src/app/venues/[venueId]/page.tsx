import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getVenue } from '@/lib/api/venues'
import { getVenueCanonicalPath } from '@/lib/venues/slug'

interface Props {
  params: Promise<{ venueId: string }>
}

export default async function VenueDetailPage({ params }: Props) {
  const { venueId } = await params
  const supabase = await createSupabaseServerClient()
  let venue

  try {
    venue = await getVenue(supabase, venueId)
  } catch {
    notFound()
  }

  const user = await getUser()
  if (user) {
    redirect(`/app/venues/${venueId}`)
  }

  permanentRedirect(getVenueCanonicalPath(venue))
}
