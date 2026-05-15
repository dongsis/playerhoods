import { redirect } from 'next/navigation'
import { resolveInvitationToken } from '@/lib/invitations/invitation-token'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ShortStopPage({ params }: Props) {
  const { id } = await params
  const supabase = createSupabasePublicServerClient()
  const invitationId = await resolveInvitationToken(supabase, id)
  redirect(`/unsubscribe?invitation=${encodeURIComponent(invitationId ?? id)}&channel=sms&scope=contact_invites`)
}
