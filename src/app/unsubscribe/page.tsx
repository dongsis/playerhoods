import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import { unsubscribeContactCommunication } from '@/lib/contact-communication'

type Props = {
  searchParams: Promise<{
    invitation?: string
    channel?: string
    scope?: string
  }>
}

function normalizeChannel(value: string | undefined): 'email' | 'sms' | null {
  return value === 'email' || value === 'sms' ? value : null
}

function normalizeScope(value: string | undefined): 'all' | 'playerhoods' | 'contact_invites' | 'match_invites' {
  if (value === 'all' || value === 'playerhoods' || value === 'contact_invites' || value === 'match_invites') {
    return value
  }
  return 'contact_invites'
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const params = await searchParams
  const invitationId = params.invitation?.trim()
  const channel = normalizeChannel(params.channel)
  const scope = normalizeScope(params.scope)
  let status: 'missing' | 'success' | 'error' = 'missing'

  if (invitationId) {
    try {
      const supabase = createSupabasePublicServerClient()
      await unsubscribeContactCommunication(supabase, {
        invitationId,
        channel,
        scope,
        reason: 'public_unsubscribe_link',
      })
      status = 'success'
    } catch (error) {
      console.error('[unsubscribe] failed:', error)
      status = 'error'
    }
  }

  return (
    <main className="min-h-screen bg-[#F3F8FF] px-5 py-12 text-[#0F172A]">
      <section className="mx-auto max-w-xl rounded-2xl border border-[#DCE7F5] bg-white p-8 shadow-sm">
        <p className="text-label text-[#64748B]">PlayerHoods</p>
        <h1 className="mt-2 text-h1">
          {status === 'success' ? 'You are unsubscribed' : 'Unsubscribe'}
        </h1>
        {status === 'success' ? (
          <p className="mt-3 text-body-main text-[#475569]">
            We will stop sending these contact invitation messages to this destination.
          </p>
        ) : status === 'error' ? (
          <p className="mt-3 text-body-main text-[#B42318]">
            This unsubscribe link could not be processed. The invitation may no longer be available.
          </p>
        ) : (
          <p className="mt-3 text-body-main text-[#475569]">
            This unsubscribe link is missing an invitation id.
          </p>
        )}
      </section>
    </main>
  )
}
