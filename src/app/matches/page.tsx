// DEPRECATED: This page is superseded by /dashboard. Do not link here directly.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData } from '@/lib/api/matches'
import { isSuperAdmin, getMyAdminVenues } from '@/lib/api/venues'
import type { Profile } from '@/lib/types/database'
import { BrandLogo } from '@/app/components/BrandLogo'
import { MatchesPageClient } from './MatchesPageClient'

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
        <div className="mb-5">
          <BrandLogo variant="horizontal" />
        </div>
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h1 text-[#1E293B]">Matches</h1>

          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/venues"
                className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#1E293B] transition hover:border-[#0d6efd]/30 hover:bg-[#eff6ff]"
              >
                Venue Admin
              </Link>
            </div>
          ) : null}
        </header>

        <MatchesPageClient items={items} userId={user.id} defaultVenueId={defaultVenueId} />
      </div>
    </div>
  )
}
