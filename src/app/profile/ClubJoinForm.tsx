'use client'

import { useState, useTransition, useCallback, useRef } from 'react'
import type { Venue } from '@/lib/types/database'

interface Props {
  venues: Venue[]
  defaultHandle?: string
  onCheckHandle: (venueId: string, handle: string) => Promise<{ available: boolean; suggestions: string[] }>
  onJoin: (venueId: string, handle: string) => Promise<void>
}

export function VenueJoinForm({ venues, defaultHandle = '', onCheckHandle, onJoin }: Props) {
  const [selectedVenue, setSelectedVenue] = useState<string>('')
  const [handle, setHandle] = useState(defaultHandle)
  const [checkResult, setCheckResult] = useState<{ available: boolean; suggestions: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleCheck = useCallback((venueId: string, h: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setCheckResult(null)
    if (!venueId || h.trim().length < 2) return
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const result = await onCheckHandle(venueId, h.trim())
          setCheckResult(result)
        } catch {
          // ignore check errors silently
        }
      })
    }, 500)
  }, [onCheckHandle])

  const handleHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setHandle(val)
    setError(null)
    scheduleCheck(selectedVenue, val)
  }

  const handleVenueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedVenue(e.target.value)
    setCheckResult(null)
    setError(null)
    scheduleCheck(e.target.value, handle)
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = handle.trim()
    if (!selectedVenue) { setError('Please select a venue'); return }
    if (!trimmed) { setError('Handle is required'); return }
    setError(null)
    startTransition(async () => {
      try {
        await onJoin(selectedVenue, trimmed)
        setHandle('')
        setSelectedVenue('')
        setCheckResult(null)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to join venue')
      }
    })
  }

  if (venues.length === 0) {
    return <p style={{ color: '#888', fontSize: '0.9rem' }}>You have joined all available venues.</p>
  }

  return (
    <form onSubmit={handleJoin} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
      {error && <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.85rem' }}>{error}</p>}

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Venue</label>
        <select
          value={selectedVenue}
          onChange={handleVenueChange}
          style={{ padding: '0.4rem', minWidth: '180px' }}
        >
          <option value="">Select a venue...</option>
          {venues.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Your Handle</label>
        <input
          value={handle}
          onChange={handleHandleChange}
          placeholder="2–30 chars, no @"
          style={{ padding: '0.4rem', width: '180px' }}
          disabled={!selectedVenue}
        />
        {checkResult !== null && (
          <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            {checkResult.available ? (
              <span style={{ color: 'green' }}>✓ Available</span>
            ) : (
              <span style={{ color: '#c00' }}>
                Taken.
                {checkResult.suggestions.length > 0 && (
                  <> Try: {checkResult.suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setHandle(s); scheduleCheck(selectedVenue, s) }}
                      style={{ marginLeft: '0.3rem', fontSize: '0.8rem', padding: '0 0.3rem', cursor: 'pointer' }}
                    >
                      {s}
                    </button>
                  ))}</>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !selectedVenue || !handle.trim() || checkResult?.available === false}
        style={{ padding: '0.4rem 1rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        {isPending ? 'Joining...' : 'Join Venue'}
      </button>
    </form>
  )
}
