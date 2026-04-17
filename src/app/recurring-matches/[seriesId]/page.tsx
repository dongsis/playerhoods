import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getRecurringMatchSeriesDetail } from '@/lib/api/recurring-matches'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { formatTimeWindow } from '@/lib/utils/format-time'

type Props = {
  params: Promise<{ seriesId: string }>
}

function formatDateLabel(dateStr: string | null) {
  if (!dateStr) return 'Date TBD'
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function getInstanceLabel(index: number) {
  if (index === 0) return 'This week'
  if (index === 1) return 'Next week'
  return `Week ${index + 1}`
}

export default async function RecurringMatchSeriesPage({ params }: Props) {
  const { seriesId } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const detail = await getRecurringMatchSeriesDetail(supabase, user.id, seriesId)

  if (!detail) {
    notFound()
  }

  const formatLabel = detail.series.doubles_format
    ? detail.series.doubles_format.replace(/_/g, ' ')
    : null

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', padding: '1rem' }}>
      <nav style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: '#94a3b8',
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          &lt; Matches
        </Link>
      </nav>

      <section
        style={{
          marginBottom: '1.25rem',
          border: '1px solid #e8eef6',
          borderRadius: '28px',
          background: '#fff',
          boxShadow: '0 14px 32px -28px rgba(15, 23, 42, 0.28)',
          padding: '1.2rem 1.3rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <p
              style={{
                margin: '0 0 0.28rem',
                fontSize: '0.65rem',
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#94a3b8',
              }}
            >
              Recurring Match
            </p>
            <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a' }}>
              {detail.series.name}
            </h1>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: '#64748b' }}>
              Shared defaults for weekly match instances. Players sign up for each instance separately.
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '999px',
              background: '#ecfdf5',
              color: '#15803d',
              padding: '0.35rem 0.7rem',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {detail.matches.length} upcoming
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.9rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Sport</p>
            <p style={{ margin: '0.28rem 0 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{detail.sportName ?? 'Tennis'}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Venue</p>
            <p style={{ margin: '0.28rem 0 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{detail.venueName ?? 'Venue TBD'}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Schedule</p>
            <p style={{ margin: '0.28rem 0 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              {formatDateLabel(detail.series.start_date)} · {detail.series.start_time?.slice(0, 5) ?? 'Time TBD'}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Defaults</p>
            <p style={{ margin: '0.28rem 0 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              {detail.series.required_count} players
              {formatLabel ? ` · ${formatLabel}` : ''}
            </p>
          </div>
        </div>

        {detail.series.organizer_note?.trim() ? (
          <div
            style={{
              marginTop: '1rem',
              borderRadius: '18px',
              border: '1px solid #fdedd3',
              background: '#fffaf0',
              padding: '0.9rem 1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ea580c' }}>
              Organizer Note
            </p>
            <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-line', fontSize: '0.92rem', lineHeight: 1.6, color: '#7c2d12' }}>
              {detail.series.organizer_note.trim()}
            </p>
          </div>
        ) : null}
      </section>

      <section
        style={{
          border: '1px solid #e8eef6',
          borderRadius: '28px',
          background: '#fff',
          boxShadow: '0 14px 32px -28px rgba(15, 23, 42, 0.28)',
          padding: '1.15rem 1.3rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', marginBottom: '0.9rem' }}>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#94a3b8',
              }}
            >
              Upcoming Match Instances
            </p>
            <h2 style={{ margin: '0.35rem 0 0', fontSize: '1.25rem', color: '#0f172a' }}>Manage each week separately</h2>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.85rem' }}>
          {detail.matches.map((item, index) => (
            <div
              key={item.match.id}
              style={{
                border: '1px solid #edf2f7',
                borderRadius: '22px',
                padding: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f97316' }}>
                  {getInstanceLabel(index)}
                </p>
                <p style={{ margin: '0.22rem 0 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  {formatTimeWindow(
                    item.match.start_at_utc,
                    item.match.match_date,
                    item.match.start_time,
                    item.match.duration_minutes,
                    item.venueTimezone,
                  )}
                </p>
                <p style={{ margin: '0.22rem 0 0', fontSize: '0.86rem', color: '#64748b' }}>
                  {item.venueName ?? detail.venueName ?? 'Venue TBD'} · {item.confirmedCount}/{item.match.required_count} confirmed
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: '999px',
                    padding: '0.28rem 0.7rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    background: item.match.status === 'cancelled' ? '#fee2e2' : '#eff6ff',
                    color: item.match.status === 'cancelled' ? '#b91c1c' : '#1d4ed8',
                  }}
                >
                  {item.match.status}
                </span>
                <Link
                  href={`/matches/${item.match.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '14px',
                    background: '#0f172a',
                    color: '#fff',
                    textDecoration: 'none',
                    padding: '0.7rem 1rem',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                  }}
                >
                  Open match
                </Link>
              </div>
            </div>
          ))}

          {detail.matches.length === 0 ? (
            <div
              style={{
                borderRadius: '22px',
                border: '1px dashed #dbe3ef',
                padding: '1.2rem',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.95rem',
              }}
            >
              No upcoming instances yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
