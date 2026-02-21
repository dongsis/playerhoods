'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createMatch } from '@/lib/api/matches'
import { getGroups } from '@/lib/api/groups'
import type { Group } from '@/lib/types/database'

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
  const router = useRouter()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    getGroups(supabase).then(setGroups).catch(console.error)
  }, [])

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
      router.push(`/matches/${match.id}`)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Failed to create match'
      setError(message)
      console.error('Create match error:', err)
    } finally {
      setLoading(false)
    }
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
            Add guests
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
