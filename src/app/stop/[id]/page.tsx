import { redirect } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ShortStopPage({ params }: Props) {
  const { id } = await params
  redirect(`/unsubscribe?invitation=${encodeURIComponent(id)}&channel=sms&scope=contact_invites`)
}
