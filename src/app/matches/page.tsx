// DEPRECATED: This page is superseded by /dashboard. Do not link here directly.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData } from '@/lib/api/matches'
import { isSuperAdmin, getMyAdminVenues } from '@/lib/api/venues'
import type { Profile } from '@/lib/types/database'
import { BrandLogo } from '@/app/components/BrandLogo'
import { MatchesShell } from './MatchesShell'
import { CreateMatchInline } from './CreateMatchInline'

export default async function MatchesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()

  const [items, profileRes, superAdmin, myAdminVenues] = await Promise.all([
    getMatchListData(supabase, user.id),
    supabase.from('profiles').select('primary_venue_id').eq('id', user.id).single(),
    isSuperAdmin(supabase),
    getMyAdminVenues(supabase).catch(() => []),
  ])

  const defaultVenueId =
    (profileRes.data as Pick<Profile, 'primary_venue_id'> | null)?.primary_venue_id ?? ''

  const isAdmin = superAdmin || myAdminVenues.length > 0

  return (
    <div className="min-h-screen bg-[#F0F7FF]">
      <div className="mx-auto max-w-[1040px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <BrandLogo variant="horizontal" />
      </div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label text-[#94A3B8]">
            PlayerHoods
          </p>
          <h1 className="text-h1 mt-2 text-[#1E293B]">Matches</h1>
          <p className="text-body-main mt-2 text-[#64748B]">
            Stay on top of upcoming sessions, invitations, and recent match history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#1E293B] transition hover:border-[#0d6efd]/30 hover:bg-[#eff6ff]"
          >
            Dashboard
          </Link>
          <Link
            href="/profile"
            className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#1E293B] transition hover:border-[#0d6efd]/30 hover:bg-[#eff6ff]"
          >
            Profile
          </Link>
          {isAdmin ? (
            <Link
              href="/admin/venues"
              className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#1E293B] transition hover:border-[#0d6efd]/30 hover:bg-[#eff6ff]"
            >
              Venue Admin
            </Link>
          ) : null}
        </div>
      </header>

      <div className="space-y-8">
        <MatchesShell items={items} userId={user.id} />
        <div id="create-match">
          <CreateMatchInline defaultVenueId={defaultVenueId} />
        </div>
      </div>
      </div>
    </div>
  )
}
