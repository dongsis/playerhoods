import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatches } from '@/lib/api/matches'
import { getGroups } from '@/lib/api/groups'
import { LogoutButton } from './LogoutButton'

export default async function DashboardPage() {
  const user = await getUser()
  const supabase = await createSupabaseServerClient()

  // Fetch user's matches and groups
  const [matches, groups] = await Promise.all([
    getMatches(supabase).catch(() => []),
    getGroups(supabase).catch(() => []),
  ])

  // Filter active matches
  const activeMatches = matches.filter((m) => m.status === 'active')

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Dashboard</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>{user?.email}</span>
          <LogoutButton />
        </div>
      </header>

      <nav style={{ marginBottom: '2rem' }}>
        <Link href="/groups" style={{ marginRight: '1rem' }}>Groups</Link>
        <Link href="/matches" style={{ marginRight: '1rem' }}>Matches</Link>
      </nav>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Active Matches ({activeMatches.length})</h2>
        {activeMatches.length === 0 ? (
          <p>No active matches. <Link href="/matches/new">Create one</Link></p>
        ) : (
          <ul>
            {activeMatches.slice(0, 5).map((match) => (
              <li key={match.id}>
                <Link href={`/matches/${match.id}`}>
                  {match.game_type || 'Match'} - {match.match_date || 'TBD'}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {activeMatches.length > 5 && (
          <Link href="/matches">View all matches</Link>
        )}
      </section>

      <section>
        <h2>My Groups ({groups.length})</h2>
        {groups.length === 0 ? (
          <p>No groups. <Link href="/groups/new">Create one</Link></p>
        ) : (
          <ul>
            {groups.slice(0, 5).map((group) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`}>{group.name}</Link>
              </li>
            ))}
          </ul>
        )}
        {groups.length > 5 && (
          <Link href="/groups">View all groups</Link>
        )}
      </section>
    </div>
  )
}
