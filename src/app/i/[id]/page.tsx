import { redirect } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ShortInvitationPage({ params }: Props) {
  const { id } = await params
  redirect(`/invitations/${encodeURIComponent(id)}`)
}
