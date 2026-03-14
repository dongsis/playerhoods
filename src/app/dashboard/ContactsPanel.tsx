'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getContactPlayerResolution, createRosterGuest } from '@/lib/api/roster'
import { inviteUserToGroup } from '@/lib/api/groups'
import { listSports, setGuestSports } from '@/lib/api/sports'
import type { Sport, GuestSport } from '@/lib/types/database'
import type { GroupWithMembers } from '@/lib/api/players'

interface Props {
  groups?: GroupWithMembers[]
}

export function ContactsPanel({ groups = [] }: Props) {
  const [resolved, setResolved] = useState<Awaited<ReturnType<typeof getContactPlayerResolution>>>([])
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
  const [invitingKey, setInvitingKey] = useState<string | null>(null)

  const fetchData = async () => {
    const supabase = createSupabaseBrowserClient()
    try {
      const [resolvedList, sportList] = await Promise.all([
        getContactPlayerResolution(supabase),
        listSports(supabase),
      ])
      setResolved(resolvedList)
      setSports(sportList)

      if (resolvedList.length > 0) {
        const guestIds = resolvedList.map(r => r.guest_id)
        const gsRes = await supabase.from('guest_sports').select('*').in('guest_id', guestIds)
        const map = new Map<string, number[]>()
        for (const row of (gsRes.data ?? []) as GuestSport[]) {
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
      const emailVal = email.trim() || null
      const phoneVal = phone.trim() || null
      if (!emailVal && !phoneVal) {
        setError('Please enter either email or phone number.')
        setCreating(false)
        return
      }

      const newGuest = await createRosterGuest(supabase, {
        display_name: displayName.trim(),
        email: emailVal,
        phone: phoneVal,
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

  const handleInviteToGroup = async (guestId: string, userId: string, groupId: string) => {
    const supabase = createSupabaseBrowserClient()
    setError(null)
    setInvitingKey(`${guestId}:${groupId}`)
    try {
      await inviteUserToGroup(supabase, groupId, userId)
      await fetchData()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to invite')
    } finally {
      setInvitingKey(null)
    }
  }

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
      {error && (
        <p style={{ color: 'red', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>
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
                placeholder="Email or phone required"
                style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.2rem', color: '#555' }}>Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Email or phone required"
                style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#666', margin: '-0.25rem 0 0.5rem' }}>At least one of email or phone is required.</p>
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
          <button type="submit" disabled={creating || !displayName.trim() || (!email.trim() && !phone.trim())} style={{ padding: '0.4rem 1rem' }}>
            {creating ? 'Creating...' : 'Create Contact Player'}
          </button>
        </form>
      )}

      {/* Contact Player list */}
      {loading ? (
        <p style={{ color: '#888', fontSize: '0.85rem' }}>Loading...</p>
      ) : resolved.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.85rem' }}>No contact players yet. Add one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {resolved.map(r => {
            const sportIds = guestSportsMap.get(r.guest_id) ?? []
            const linkedUserId = r.linked_user_id
            return (
              <div
                key={r.guest_id}
                style={{
                  padding: '0.6rem 0.8rem',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  background: 'white',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{r.display_name}</strong>
                  {sportIds.map(sid => {
                    const sport = sportById.get(sid)
                    return sport ? (
                      <span key={sid} style={{ background: '#f0f9ff', color: '#0369a1', padding: '0.05rem 0.35rem', fontSize: '0.7rem', borderRadius: '8px' }}>
                        {sport.display_name}
                      </span>
                    ) : null
                  })}
                </div>
                {(r.email || r.phone || r.notes) && (
                  <div style={{ fontSize: '0.78rem', color: '#888', marginTop: '0.2rem' }}>
                    {[r.email, r.phone, r.notes].filter(Boolean).join(' · ')}
                  </div>
                )}
                {linkedUserId && (
                  <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: '#2d8a4e' }}>已加入 playerhoods.com</span>
                    {groups.length > 0 && (
                      <span style={{ fontSize: '0.8rem', color: '#666' }}>
                        Invite to Group:
                        {groups.map(gr => {
                          const key = `${r.guest_id}:${gr.group.id}`
                          const isInviting = invitingKey === key
                          return (
                            <button
                              key={gr.group.id}
                              type="button"
                              onClick={() => handleInviteToGroup(r.guest_id, linkedUserId, gr.group.id)}
                              disabled={!!invitingKey}
                              style={{
                                marginLeft: '0.35rem',
                                fontSize: '0.75rem',
                                padding: '0.15rem 0.4rem',
                                background: '#0369a1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isInviting ? 'wait' : 'pointer',
                              }}
                            >
                              {isInviting ? 'Inviting…' : gr.group.name}
                            </button>
                          )
                        })}
                      </span>
                    )}
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
