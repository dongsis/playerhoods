import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData } from '@/lib/api/matches'
import { isSuperAdmin, getMyAdminClubs } from '@/lib/api/clubs'
import type { Profile } from '@/lib/types/database'
import { MatchesShell } from './MatchesShell'
import { CreateMatchInline } from './CreateMatchInline'

export default async function MatchesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()

  // Fetch all items server-side; inbox/history split is done client-side in MatchesShell
  const [items, profileRes, superAdmin, myAdminClubs] = await Promise.all([
    getMatchListData(supabase, user.id),
    supabase.from('profiles').select('primary_club_id').eq('id', user.id).single(),
    isSuperAdmin(supabase),
    getMyAdminClubs(supabase).catch(() => []),
  ])

  const defaultClubId =
    (profileRes.data as Pick<Profile, 'primary_club_id'> | null)?.primary_club_id ?? ''

  const isAdmin = superAdmin || myAdminClubs.length > 0

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
              <Link href="/admin/clubs">Club Admin</Link>
            </>
          )}
        </nav>
      </header>

      {/* Tabs + match list (all splitting is client-side) */}
      <MatchesShell items={items} userId={user.id} />

      {/* Create match */}
      <section
        style={{
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: '6px',
          marginTop: '2rem',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '0.95rem' }}>Create Match</h2>
        <CreateMatchInline defaultClubId={defaultClubId} />
      </section>
    </div>
  )
}
