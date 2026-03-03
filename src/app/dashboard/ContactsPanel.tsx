'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { listRosterGuests, createRosterGuest } from '@/lib/api/roster'
import { listSports, setGuestSports } from '@/lib/api/sports'
import type { Guest, Sport, GuestSport } from '@/lib/types/database'

export function ContactsPanel() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [sports, setSports] = useState<Sport[]>([])
  const [guestSportsMap, setGuestSportsMap] = useState<Map<string, number[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Create form state
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedSportCodes, setSelectedSportCodes] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fetchData = async () => {
    const supabase = createSupabaseBrowserClient()
    try {
      const [guestList, sportList] = await Promise.all([
        listRosterGuests(supabase),
        listSports(supabase),
      ])
      setGuests(guestList)
      setSports(sportList)

      // Fetch guest sports for all guests (frontend join)
      if (guestList.length > 0) {
        const guestIds = guestList.map(g => g.id)
        const { data: gsData } = await supabase
          .from('guest_sports')
          .select('*')
          .in('guest_id', guestIds)
        const map = new Map<string, number[]>()
        for (const row of (gsData ?? []) as GuestSport[]) {
          const existing = map.get(row.guest_id) ?? []
          existing.push(row.sport_id)
          map.set(row.guest_id, existing)
        }
        setGuestSportsMap(map)
      }
    } catch (err) {
      console.error('[ContactsPanel] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setCreating(true)

    const supabase = createSupabaseBrowserClient()
    try {
      // Step 1: Create guest + auto-bookmark
      const newGuest = await createRosterGuest(supabase, {
        display_name: displayName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      })

      // Step 2: Set sport tags if any selected
      if (selectedSportCodes.length > 0) {
        await setGuestSports(supabase, newGuest.id, selectedSportCodes)
      }

      setSuccess(true)
      setDisplayName('')
      setEmail('')
      setPhone('')
      setNotes('')
      setSelectedSportCodes([])
      setShowForm(false)

      // Refresh list
      setLoading(true)
      await fetchData()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to create contact player')
    } finally {
      setCreating(false)
    }
  }

  const toggleSport = (code: string) => {
    setSelectedSportCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const sportById = new Map(sports.map(s => [s.id, s]))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>My Contact Players</h2>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(false) }}
          style={{
            padding: '0.3rem 0.8rem',
            fontSize: '0.85rem',
            background: showForm ? '#e5e5e5' : '#333',
            color: showForm ? '#333' : 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {success && (
        <p style={{ color: 'green', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Contact player created!
        </p>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '1.5rem', background: '#fafafa' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.2rem', color: '#555' }}>Name *</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              placeholder="Display name"
              style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.2rem', color: '#555' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Optional"
                style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.2rem', color: '#555' }}>Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Optional"
                style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.2rem', color: '#555' }}>Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
              style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
            />
          </div>
          {sports.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: '#555' }}>Plays</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {sports.map(s => (
                  <label key={s.id} style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedSportCodes.includes(s.code)}
                      onChange={() => toggleSport(s.code)}
                    />{' '}
                    {s.display_name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && <p style={{ color: 'red', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{error}</p>}
          <button type="submit" disabled={creating || !displayName.trim()} style={{ padding: '0.4rem 1rem' }}>
            {creating ? 'Creating...' : 'Create Contact Player'}
          </button>
        </form>
      )}

      {/* Guest list */}
      {loading ? (
        <p style={{ color: '#888', fontSize: '0.85rem' }}>Loading...</p>
      ) : guests.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.85rem' }}>No contact players yet. Add one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {guests.map(g => {
            const sportIds = guestSportsMap.get(g.id) ?? []
            return (
              <div
                key={g.id}
                style={{
                  padding: '0.6rem 0.8rem',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  background: 'white',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{g.display_name}</strong>
                  {sportIds.map(sid => {
                    const sport = sportById.get(sid)
                    return sport ? (
                      <span key={sid} style={{ background: '#f0f9ff', color: '#0369a1', padding: '0.05rem 0.35rem', fontSize: '0.7rem', borderRadius: '8px' }}>
                        {sport.display_name}
                      </span>
                    ) : null
                  })}
                </div>
                {(g.email || g.phone || g.notes) && (
                  <div style={{ fontSize: '0.78rem', color: '#888', marginTop: '0.2rem' }}>
                    {[g.email, g.phone, g.notes].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
