import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { getInvitationById } from '@/lib/invitations/get-invitation-by-id'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'

type Props = {
  params: Promise<{ id: string }>
}

function formatGameType(value: string | null | undefined): string {
  if (!value) return 'Match'
  return value.replace(/_/g, ' ')
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return value
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatStatus(value: string): string {
  if (value === 'accepted') return 'Accepted'
  if (value === 'declined') return 'Declined'
  return 'Pending response'
}

export default async function GuestInvitationMatchPage({ params }: Props) {
  const { id } = await params
  const supabase = createSupabasePublicServerClient()
  const invitation = await getInvitationById(supabase, id)

  if (!invitation || invitation.related_type !== 'match') {
    notFound()
  }

  const summary = invitation.match_summary
  const matchType = formatGameType(summary?.game_type)
  const matchDate = formatDate(summary?.match_date)
  const startTime = summary?.start_time ?? null
  const venueName = summary?.club_name ?? 'Venue to be confirmed'

  return (
    <main className="min-h-screen bg-[#F3F8FF] px-5 py-8 text-[#0F172A]">
      <div className="mx-auto max-w-xl">
        <BrandLogo variant="horizontal" />
        <section className="mt-6 rounded-2xl border border-[#DCE7F5] bg-white p-6 shadow-sm">
          <p className="text-label text-[#64748B]">Guest match view</p>
          <h1 className="mt-2 text-h1">Match details</h1>
          <p className="mt-2 text-body-main text-[#475569]">
            This link shows the basics for your invitation. Create an account for the full match workspace.
          </p>

          <dl className="mt-6 grid gap-4 text-sm">
            <div>
              <dt className="text-label text-[#94A3B8]">Invited by</dt>
              <dd className="mt-1 font-semibold text-[#0B1F4D]">{invitation.inviter_display_name}</dd>
            </div>
            <div>
              <dt className="text-label text-[#94A3B8]">Match</dt>
              <dd className="mt-1 font-semibold text-[#0B1F4D]">{matchType}</dd>
            </div>
            <div>
              <dt className="text-label text-[#94A3B8]">Date and time</dt>
              <dd className="mt-1 font-semibold text-[#0B1F4D]">
                {[matchDate, startTime].filter(Boolean).join(' at ') || 'Time to be confirmed'}
              </dd>
            </div>
            <div>
              <dt className="text-label text-[#94A3B8]">Venue</dt>
              <dd className="mt-1 font-semibold text-[#0B1F4D]">{venueName}</dd>
            </div>
            <div>
              <dt className="text-label text-[#94A3B8]">Your RSVP</dt>
              <dd className="mt-1 font-semibold text-[#0B1F4D]">{formatStatus(invitation.status)}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-[#DCE7F5] bg-[#F8FBFF] p-4">
            <h2 className="text-base font-semibold text-[#0B1F4D]">Create your free PlayerHoods account</h2>
            <p className="mt-2 text-sm text-[#475569]">
              Manage this match, get updates, save {invitation.inviter_display_name} as a player contact, and join future matches faster.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/login?mode=register&next=${encodeURIComponent(`/i/${id}/match`)}`}
                className="rounded-full bg-[#0B1F4D] px-5 py-2 text-sm font-semibold text-white"
              >
                Create account
              </Link>
              <Link
                href={`/invitations/${id}`}
                className="rounded-full border border-[#CBD5E1] px-5 py-2 text-sm font-semibold text-[#0B1F4D]"
              >
                Maybe later
              </Link>
            </div>
          </div>
        </section>
        <p className="mt-6 text-sm text-[#64748B]">
          <Link href="/">PlayerHoods</Link>
        </p>
      </div>
    </main>
  )
}
