import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getVenue } from '@/lib/api/venues'
import { getMyVenueRelationships } from '@/lib/api/identities'
import { getInviteCircleList } from '@/lib/api/play-network'
import { getVenueDisplayName } from '@/lib/venues/display'
import { BrandLogo } from '@/app/components/BrandLogo'
import { VenueMembersSection } from '@/app/venues/[venueId]/VenueMembersSection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface Props {
  params: Promise<{ venueId: string }>
}

export default async function AppVenueMembersPage({ params }: Props) {
  const { venueId } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const [venue, relationships, inviteCircle] = await Promise.all([
    getVenue(supabase, venueId).catch(() => null),
    getMyVenueRelationships(supabase, user.id).catch(() => []),
    getInviteCircleList(supabase).catch(() => []),
  ])

  if (!venue) notFound()

  const isMember = relationships.some(
    (item) => item.venue_id === venueId && item.relationship_type === 'member',
  )
  if (!isMember) notFound()

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <BrandLogo variant="horizontal" href="/dashboard" />
      </div>
      <nav className="mb-6 text-sm text-gray-400">
        <Link href={`/app/venues/${venueId}`} className="hover:text-gray-600">
          &larr; {getVenueDisplayName(venue)}
        </Link>
      </nav>
      <VenueMembersSection
        venueId={venueId}
        initialSavedPlayerIds={inviteCircle.map((row) => row.target_user_id)}
      />
    </main>
  )
}
