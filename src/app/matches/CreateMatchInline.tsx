'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createMatch, getClubs, getCourts } from '@/lib/api/matches'
import { getGroups } from '@/lib/api/groups'
import type { Group, Club, Court } from '@/lib/types/database'

function buildTimeSlots(): { label: string; value: string }[] {
  const slots: { label: string; value: string }[] = []
  for (let h = 9; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 21 && m > 0) break
      const hh = h.toString().padStart(2, '0')
      const mm = m.toString().padStart(2, '0')
      const value = `${hh}:${mm}`
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h
      const ampm = h >= 12 ? 'PM' : 'AM'
      const label = `${hour12}:${mm} ${ampm}`
      slots.push({ label, value })
    }
  }
  return slots
}

const TIME_SLOTS = buildTimeSlots()

function MiniCalendar({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const days = useMemo(() => {
    const first = new Date(year, month, 1)
    const startDay = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [year, month])

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const toDateStr = (d: number) => {
    const mm = (month + 1).toString().padStart(2, '0')
    const dd = d.toString().padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  return (
    <div style={{ userSelect: 'none', maxWidth: '220px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <button type="button" onClick={prevMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0' }}>&lt;</button>
        <strong style={{ fontSize: '0.8rem' }}>{monthNames[month]} {year}</strong>
        <button type="button" onClick={nextMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0' }}>&gt;</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', textAlign: 'center', fontSize: '0.7rem' }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ fontWeight: 'bold', padding: '0.15rem', color: '#666' }}>{d}</div>
        ))}
        {days.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} />
          const dateStr = toDateStr(d)
          const isSelected = dateStr === selected
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => !isPast && onSelect(dateStr)}
              disabled={isPast}
              style={{
                padding: '0.2rem',
                border: isToday ? '1px solid #333' : '1px solid transparent',
                background: isSelected ? '#333' : 'transparent',
                color: isSelected ? 'white' : isPast ? '#ccc' : '#333',
                cursor: isPast ? 'default' : 'pointer',
                borderRadius: '2px',
                fontSize: '0.7rem',
                lineHeight: '1.2',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CreateMatchInline({ defaultClubId }: { defaultClubId?: string }) {
  const [requiredCount, setRequiredCount] = useState(4)
  const [matchDate, setMatchDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [gameType, setGameType] = useState('doubles')
  const [clubId, setClubId] = useState(defaultClubId || '')
  const [courtIds, setCourtIds] = useState<string[]>([])
  const [scopeGroupIds, setScopeGroupIds] = useState<string[]>([])

  const [groups, setGroups] = useState<Group[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    getGroups(supabase).then(setGroups).catch(console.error)
    getClubs(supabase).then(setClubs).catch(console.error)
  }, [])

  useEffect(() => {
    if (!clubId) { setCourts([]); setCourtIds([]); return }
    const supabase = createSupabaseBrowserClient()
    getCourts(supabase, clubId).then(setCourts).catch(console.error)
    setCourtIds([])
  }, [clubId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createSupabaseBrowserClient()

    try {
      const match = await createMatch(supabase, {
        required_count: requiredCount,
        match_date: matchDate || undefined,
        start_time: startTime ? `${startTime}:00` : undefined,
        duration_minutes: durationMinutes || undefined,
        game_type: gameType || undefined,
        club_id: clubId || undefined,
        court_slots: courtIds.length > 0
          ? courtIds.map(cid => {
              const court = courts.find(c => c.id === cid)
              return { court_label: court?.court_code || cid }
            })
          : undefined,
        invitation_scope_group_ids: scopeGroupIds.length > 0 ? scopeGroupIds : undefined,
        can_participants_invite_users: true,
        can_participants_add_guests: false,
        can_participants_manage_participants: false,
      })
      router.push(`/matches/${match.id}`)
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to create match')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Row 1: Game type + Required count */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Game Type</label>
          <select value={gameType} onChange={e => setGameType(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
        </div>
        <div style={{ width: '100px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Players</label>
          <input type="number" min={1} max={20} value={requiredCount} onChange={e => setRequiredCount(parseInt(e.target.value) || 4)} style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Row 2: Calendar + Time */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Date</label>
          <MiniCalendar selected={matchDate} onSelect={setMatchDate} />
          {matchDate && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
              Selected: <strong>{matchDate}</strong>
              <button type="button" onClick={() => setMatchDate('')} style={{ marginLeft: '0.5rem', border: 'none', background: 'none', color: '#999', cursor: 'pointer', fontSize: '0.8rem' }}>clear</button>
            </div>
          )}
        </div>
        <div style={{ width: '140px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Start Time</label>
          <select value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
            <option value="">-- Select --</option>
            {TIME_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Duration</label>
            <select value={durationMinutes} onChange={e => setDurationMinutes(parseInt(e.target.value))} style={{ width: '100%', padding: '0.4rem' }}>
              {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Row 3: Club + Courts */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Club</label>
          <select value={clubId} onChange={e => setClubId(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
            <option value="">-- Select Club --</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {courts.length > 0 && (
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Courts</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {courts.map(c => (
                <label key={c.id} style={{ fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={courtIds.includes(c.id)}
                    onChange={e => {
                      if (e.target.checked) setCourtIds(prev => [...prev, c.id])
                      else setCourtIds(prev => prev.filter(id => id !== c.id))
                    }}
                  />{' '}
                  {c.court_code}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Row 4: Scope groups */}
      {groups.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Scope Groups</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {groups.map(g => (
              <label key={g.id} style={{ fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={scopeGroupIds.includes(g.id)}
                  onChange={e => {
                    if (e.target.checked) setScopeGroupIds(prev => [...prev, g.id])
                    else setScopeGroupIds(prev => prev.filter(id => id !== g.id))
                  }}
                />{' '}
                {g.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: 'red', marginBottom: '0.5rem' }}>{error}</p>}

      <button type="submit" disabled={loading} style={{ padding: '0.5rem 1.5rem' }}>
        {loading ? 'Creating...' : 'Create Match'}
      </button>
    </form>
  )
}
