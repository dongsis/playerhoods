import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getMatches } from '@/lib/api/matches'

export default async function MatchesPage() {
  const supabase = await createSupabaseServerClient()
  const matches = await getMatches(supabase)

  // Group matches by status
  const activeMatches = matches.filter((m) => m.status === 'active')
  const cancelledMatches = matches.filter((m) => m.status === 'cancelled')
  const archivedMatches = matches.filter((m) => m.status === 'archived')

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Matches</h1>
        <Link href="/matches/new">
          <button>New Match</button>
        </Link>
      </header>

      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard">Dashboard</Link>
      </nav>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Active ({activeMatches.length})</h2>
        {activeMatches.length === 0 ? (
          <p>No active matches. <Link href="/matches/new">Create one</Link></p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {activeMatches.map((match) => (
              <li key={match.id} style={{ padding: '1rem', border: '1px solid #ccc', marginBottom: '0.5rem' }}>
                <Link href={`/matches/${match.id}`}>
                  <strong>{match.game_type || 'Match'}</strong>
                </Link>
                <br />
                <small>
                  Date: {match.match_date || 'TBD'} | Required: {match.required_count}
                  {match.formed_at && ' | FORMED'}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cancelledMatches.length > 0 && (
        <details style={{ marginBottom: '2rem' }}>
          <summary style={{ cursor: 'pointer' }}>Cancelled ({cancelledMatches.length})</summary>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
            {cancelledMatches.map((match) => (
              <li key={match.id} style={{ padding: '0.5rem', border: '1px solid #d9534f', marginBottom: '0.25rem', opacity: 0.6 }}>
                <Link href={`/matches/${match.id}`}>
                  {match.game_type || 'Match'} - {match.match_date || 'TBD'}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {archivedMatches.length > 0 && (
        <details style={{ marginBottom: '2rem' }}>
          <summary style={{ cursor: 'pointer' }}>Archived ({archivedMatches.length})</summary>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
            {archivedMatches.map((match) => (
              <li key={match.id} style={{ padding: '0.5rem', border: '1px solid #999', marginBottom: '0.25rem', opacity: 0.6 }}>
                <Link href={`/matches/${match.id}`}>
                  {match.game_type || 'Match'} - {match.match_date || 'TBD'}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
