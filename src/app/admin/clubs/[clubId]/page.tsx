import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ clubId: string }>
}

export default async function LegacyAdminClubDetailPage({ params }: Props) {
  const { clubId } = await params
  redirect(`/admin/venues/${clubId}`)
}
