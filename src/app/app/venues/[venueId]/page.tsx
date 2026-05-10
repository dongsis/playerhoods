import { VenueDetailPageContent } from '@/app/venues/[venueId]/VenueDetailPageContent'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface Props {
  params: Promise<{ venueId: string }>
}

export default async function AppVenueWorkspacePage({ params }: Props) {
  const { venueId } = await params
  return <VenueDetailPageContent venueId={venueId} />
}
