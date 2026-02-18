import Link from 'next/link'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchesWithSummary } from '@/lib/api/matches'
import type { MatchSummary, Profile } from '@/lib/types/database'
import { CreateMatchInline } from './CreateMatchInline'

function formatDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return 'TBD'
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y, m, d] = dateStr.split('-').map(Number)
  const label = `${months[m - 1]} ${d}`
  if (timeStr) {
    return `${label} ${timeStr.slice(0, 5)}`
  }
  return label
}

function getMatchDatetime(m: MatchSummary): string {
  return `${m.match_date || ''}T${m.start_time || '00:00:00'}`
}

function MatchRow({ match }: { match: MatchSummary }) {
  const need = Math.max(match.required_count - match.confirmed_count, 0)
  const namesDisplay = match.confirmed_names.length > 0
    ? match.confirmed_names.join(', ') + (match.confirmed_count > 3 ? ' …' : '')
    : null

  return (
    <li style={{ padding: '0.75rem', border: '1px solid #ccc', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontFamily: 'monospace' }}>{formatDate(match.match_date, match.start_time)}</strong>
            <span>{match.game_type || 'Match'}</span>
            <span style={{ color: '#666' }}>by {match.organizer_name}</span>
            {match.formed_at ? (
              <span style={{ background: 'green', color: 'white', padding: '0.1rem 0.4rem', fontSize: '0.75rem', borderRadius: '3px' }}>
                FORMED
              </span>
            ) : (
              <span style={{ background: '#e68a00', color: 'white', padding: '0.1rem 0.4rem', fontSize: '0.75rem', borderRadius: '3px' }}>
                Pending
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.35rem' }}>
            {namesDisplay && <div>{namesDisplay}</div>}
            <span>
              confirmed {match.confirmed_count}
              {match.pending_count > 0 && ` · pending ${match.pending_count}`}
              {need > 0 && ` · need ${need}`}
            </span>
          </div>
        </div>

        <Link href={`/matches/${match.id}`} style={{ marginLeft: '1rem', whiteSpace: 'nowrap' }}>
          Details →
        </Link>
      </div>
    </li>
  )
}

export default async function MatchesPage() {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  const [matches, profileData] = await Promise.all([
    getMatchesWithSummary(supabase),
    user ? supabase.from('profiles').select('primary_club_id').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])
  const defaultClubId = (profileData.data as Pick<Profile, 'primary_club_id'> | null)?.primary_club_id || ''

  const now = new Date().toISOString()

  const incoming = matches
    .filter(m => m.status === 'active' && (
      !m.match_date || getMatchDatetime(m) >= now
    ))
    .sort((a, b) => getMatchDatetime(a).localeCompare(getMatchDatetime(b)))

  const history = matches
    .filter(m => !incoming.includes(m))
    .sort((a, b) => getMatchDatetime(b).localeCompare(getMatchDatetime(a)))

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1>Matches</h1>
        <nav><Link href="/dashboard">Dashboard</Link></nav>
      </header>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Incoming ({incoming.length})</h2>
        {incoming.length === 0 ? (
          <p style={{ color: '#666' }}>No upcoming matches.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {incoming.map(m => <MatchRow key={m.id} match={m} />)}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <details style={{ marginBottom: '2rem' }}>
          <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
            <strong>History ({history.length})</strong>
          </summary>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {history.map(m => <MatchRow key={m.id} match={m} />)}
            </ul>
          </div>
        </details>
      )}

      <section style={{ padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Create Match</h2>
        <CreateMatchInline defaultClubId={defaultClubId} />
      </section>
    </div>
  )
}
