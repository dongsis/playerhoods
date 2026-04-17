// DEPRECATED: This page is superseded by /dashboard. Do not link here directly.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData } from '@/lib/api/matches'
import { isSuperAdmin, getMyAdminVenues } from '@/lib/api/venues'
import type { Profile } from '@/lib/types/database'
import { MatchesShell } from './MatchesShell'
import { CreateMatchInline } from './CreateMatchInline'

export default async function MatchesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()

  // Fetch all items server-side; inbox/history split is done client-side in MatchesShell
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
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Matches</h1>
        <nav style={{ fontSize: '0.85rem' }}>
          <Link href="/dashboard">Dashboard</Link>
          {' · '}
          <Link href="/profile">Profile</Link>
          {isAdmin && (
            <>
              {' · '}
              <Link href="/admin/venues">Venue Admin</Link>
            </>
          )}
        </nav>
      </header>

      {/* Tabs + match list (all splitting is client-side) */}
      <MatchesShell items={items} userId={user.id} />

      {/* Create match */}
      <div style={{ marginTop: '2rem' }}>
        <CreateMatchInline defaultVenueId={defaultVenueId} />
      </div>
    </div>
  )
}
