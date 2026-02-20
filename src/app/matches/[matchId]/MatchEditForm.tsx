'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Court, MatchCourt } from '@/lib/types/database'

interface Props {
  matchDate: string | null
  startTime: string | null
  durationMinutes: number | null
  currentCourts: MatchCourt[]
  clubCourts: Court[]          // courts available in the match's club
  onSave: (data: {
    match_date: string | null
    start_time: string | null
    duration_minutes: number | null
  }) => Promise<void>
  onSetCourt: (courtLabel: string | null) => Promise<void>
}

export function MatchEditForm({
  matchDate,
  startTime,
  durationMinutes,
  currentCourts,
  clubCourts,
  onSave,
  onSetCourt,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local form state
  const [date, setDate] = useState(matchDate ?? '')
  const [time, setTime] = useState(startTime ?? '')
  const [duration, setDuration] = useState(durationMinutes?.toString() ?? '')
  // Current court: first slot's label or empty
  const [courtLabel, setCourtLabel] = useState(currentCourts[0]?.court_label ?? '')

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await onSave({
          match_date: date || null,
          start_time: time || null,
          duration_minutes: duration ? parseInt(duration, 10) : null,
        })
        // Update court if changed
        const newLabel = courtLabel.trim() || null
        const oldLabel = currentCourts[0]?.court_label ?? null
        if (newLabel !== oldLabel) {
          await onSetCourt(newLabel)
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to save')
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: '0.8rem',
          padding: '0.25rem 0.75rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          background: 'none',
          cursor: 'pointer',
          color: '#555',
        }}
      >
        Edit details
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSave}
      style={{
        marginTop: '0.75rem',
        padding: '1rem',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        background: '#fafafa',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-end',
      }}
    >
      {error && (
        <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.85rem' }}>{error}</p>
      )}
      {saved && (
        <p style={{ width: '100%', color: 'green', margin: 0, fontSize: '0.85rem' }}>Saved.</p>
      )}

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
          Start time
        </label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
          Duration (min)
        </label>
        <input
          type="number"
          min={15}
          max={480}
          step={15}
          value={duration}
          onChange={e => setDuration(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', width: '80px' }}
        />
      </div>

      {clubCourts.length > 0 && (
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
            Court
          </label>
          <select
            value={courtLabel}
            onChange={e => setCourtLabel(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
          >
            <option value="">— No court —</option>
            {clubCourts.map(c => (
              <option key={c.id} value={c.court_code}>
                {c.court_code}{c.surface ? ` (${c.surface})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: '0.35rem 0.9rem',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            padding: '0.35rem 0.75rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
