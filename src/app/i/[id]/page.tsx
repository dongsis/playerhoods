import { redirect } from 'next/navigation'
import { resolveInvitationToken } from '@/lib/invitations/invitation-token'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ShortInvitationPage({ params }: Props) {
  const { id } = await params
  const supabase = createSupabasePublicServerClient()
  const invitationId = await resolveInvitationToken(supabase, id)
  redirect(`/invitations/${encodeURIComponent(invitationId ?? id)}`)
}
