'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createMatch, nominateGuest, getAdmissionTargets, admissionTargetsToScopeUsers, inviteUserToMatch, type ScopeUser } from '@/lib/api/matches'
import { createRosterGuest } from '@/lib/api/roster'
import { getGroups } from '@/lib/api/groups'
import type { Group } from '@/lib/types/database'

type GuestDraft = { displayName: string; email: string; phone: string }

export default function NewMatchPage() {
  const [requiredCount, setRequiredCount] = useState(4)
  const [matchDate, setMatchDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [gameType, setGameType] = useState('doubles')
  const [canInvite, setCanInvite] = useState(false)
  const [canAddGuests, setCanAddGuests] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [scopeGroupIds, setScopeGroupIds] = useState<string[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [contactPlayers, setContactPlayers] = useState<GuestDraft[]>([])
  const [newGuestName, setNewGuestName] = useState('')
  const [newGuestEmail, setNewGuestEmail] = useState('')
  const [newGuestPhone, setNewGuestPhone] = useState('')
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null)
  const [inviteTargets, setInviteTargets] = useState<ScopeUser[]>([])
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<string>>(new Set())
  const [inviteLoading, setInviteLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    getGroups(supabase).then(setGroups).catch(console.error)
  }, [])

  const addContactPlayer = () => {
    const name = newGuestName.trim()
    const email = newGuestEmail.trim()
    const phone = newGuestPhone.trim()
    if (!name || (!email && !phone)) return
    setContactPlayers(prev => [...prev, { displayName: name, email, phone }])
    setNewGuestName('')
    setNewGuestEmail('')
    setNewGuestPhone('')
  }

  const removeContactPlayer = (i: number) => {
    setContactPlayers(prev => prev.filter((_, j) => j !== i))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createSupabaseBrowserClient()

    try {
      const match = await createMatch(supabase, {
        required_count: requiredCount,
        match_date: matchDate || undefined,
        start_time: startTime || undefined,
        duration_minutes: durationMinutes || undefined,
        game_type: gameType || undefined,
        invitation_scope_group_ids: scopeGroupIds.length > 0 ? scopeGroupIds : undefined,
        can_participants_invite_users: canInvite,
        can_participants_add_guests: canAddGuests,
        can_participants_manage_participants: canManage,
      })

      for (const g of contactPlayers) {
        const guest = await createRosterGuest(supabase, {
          display_name: g.displayName,
          email: g.email || null,
          phone: g.phone || null,
        })
        await nominateGuest(supabase, match.id, guest.id)
      }

      setCreatedMatchId(match.id)
      const targets = await getAdmissionTargets(supabase, match.id)
      setInviteTargets(admissionTargetsToScopeUsers(targets))
      setSelectedInviteIds(new Set())
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Failed to create match'
      setError(message)
      console.error('Create match error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleInviteSelected = async () => {
    if (!createdMatchId || selectedInviteIds.size === 0) return
    setInviteLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    try {
      for (const uid of selectedInviteIds) {
        await inviteUserToMatch(supabase, createdMatchId, uid)
      }
      setInviteTargets(prev => prev.filter(u => !selectedInviteIds.has(u.id)))
      setSelectedInviteIds(new Set())
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to invite')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleDone = () => {
    if (createdMatchId) router.push(`/matches/${createdMatchId}`)
  }

  if (createdMatchId) {
    return (
      <div style={{ maxWidth: '600px' }}>
        <h1>Invite People</h1>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          Match created. Invite registered users from your scope groups, or skip to go to the match.
        </p>
        <nav style={{ marginBottom: '1rem' }}>
          <Link href="/dashboard">Back to Dashboard</Link>
      {' · '}
          <Link href={`/matches/${createdMatchId}`}>Go to match</Link>
        </nav>

        {inviteTargets.length === 0 ? (
          <>
            <p style={{ color: '#888', fontSize: '0.9rem' }}>
              No eligible users in scope (everyone may already be invited, or no scope groups are defined).
            </p>
            <button type="button" onClick={handleDone} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
              Go to match
            </button>
          </>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {inviteTargets.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedInviteIds.has(u.id)}
                    onChange={e => {
                      setSelectedInviteIds(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(u.id)
                        else next.delete(u.id)
                        return next
                      })
                    }}
                  />
                  {u.display_name}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleInviteSelected}
                disabled={selectedInviteIds.size === 0 || inviteLoading}
                style={{ padding: '0.5rem 1rem' }}
              >
                {inviteLoading ? 'Inviting…' : `Invite selected (${selectedInviteIds.size})`}
              </button>
              <button
                type="button"
                onClick={handleDone}
                style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', background: '#f5f5f5' }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1>Create New Match</h1>

      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard">Back to Dashboard</Link>
      </nav>

      <form onSubmit={handleSubmit}>
        <fieldset style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <legend>Match Settings</legend>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="requiredCount" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Required Players *
            </label>
            <input
              id="requiredCount"
              type="number"
              min={1}
              max={20}
              data-testid="required-count"
              value={requiredCount}
              onChange={(e) => setRequiredCount(parseInt(e.target.value) || 4)}
              required
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
            <small style={{ color: '#666' }}>Number of confirmed players needed to form the match.</small>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="gameType" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Game Type
            </label>
            <select
              id="gameType"
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
            </select>
          </div>
        </fieldset>

        <fieldset style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <legend>Schedule (Optional)</legend>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="matchDate" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Date
            </label>
            <input
              id="matchDate"
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="startTime" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Start Time
            </label>
            <input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="duration" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Duration (minutes)
            </label>
            <input
               id="duration"
               type="number"
               min={15}
               step={15}
               data-testid="duration-minutes"
               value={durationMinutes}
               onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
               style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
             />

          </div>
        </fieldset>

        <fieldset style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <legend>Scope Groups</legend>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: 0 }}>
            Members of selected groups can request to join this match.
          </p>
          {groups.length === 0 && (
            <p style={{ fontSize: '0.9rem', color: '#999' }}>No groups found. Create a group first.</p>
          )}
          {groups.map((g) => (
            <label key={g.id} style={{ display: 'block', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={scopeGroupIds.includes(g.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setScopeGroupIds((prev) => [...prev, g.id])
                  } else {
                    setScopeGroupIds((prev) => prev.filter((id) => id !== g.id))
                  }
                }}
              />{' '}
              {g.name}
            </label>
          ))}
        </fieldset>

        <fieldset style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <legend>Add Contact Players</legend>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: 0 }}>
            Add non-registered players. Each needs at least email or phone.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Name *"
              value={newGuestName}
              onChange={e => setNewGuestName(e.target.value)}
              style={{ width: '120px', padding: '0.5rem', boxSizing: 'border-box' }}
            />
            <input
              type="email"
              placeholder="Email"
              value={newGuestEmail}
              onChange={e => setNewGuestEmail(e.target.value)}
              style={{ width: '140px', padding: '0.5rem', boxSizing: 'border-box' }}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newGuestPhone}
              onChange={e => setNewGuestPhone(e.target.value)}
              style={{ width: '120px', padding: '0.5rem', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={addContactPlayer}
              disabled={!newGuestName.trim() || (!newGuestEmail.trim() && !newGuestPhone.trim())}
              style={{ padding: '0.5rem 0.8rem' }}
            >
              Add
            </button>
          </div>
          {contactPlayers.length > 0 && (
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
              {contactPlayers.map((g, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>
                  {g.displayName} — {g.email || g.phone || ''}
                  <button type="button" onClick={() => removeContactPlayer(i)} style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <fieldset style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <legend>Participant Capabilities</legend>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: 0 }}>
            Allow confirmed participants to:
          </p>

          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={canInvite}
              onChange={(e) => setCanInvite(e.target.checked)}
            />{' '}
            Nominate users
          </label>

          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={canAddGuests}
              onChange={(e) => setCanAddGuests(e.target.checked)}
            />{' '}
            Add Contact Players
          </label>

          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={canManage}
              onChange={(e) => setCanManage(e.target.checked)}
            />{' '}
            Manage participants (approve/remove)
          </label>
        </fieldset>

        {error && (
          <div style={{ color: 'red', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          data-testid="create-match"
          disabled={loading}
          style={{ padding: '0.75rem 1.5rem' }}
           >
          {loading ? 'Creating...' : 'Create Match'}
          </button>

      </form>
    </div>
  )
}
