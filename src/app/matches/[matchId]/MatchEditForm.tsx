'use client'

import { useState, useTransition, useEffect } from 'react'
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
  onSetCourts: (courtLabels: string[]) => Promise<void>
}

export function MatchEditForm({
  matchDate,
  startTime,
  durationMinutes,
  currentCourts,
  clubCourts,
  onSave,
  onSetCourts,
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
  // Court slots: array of labels (at least one if club has courts)
  const [courtLabels, setCourtLabels] = useState<string[]>(() =>
    currentCourts.length > 0
      ? currentCourts.map(c => c.court_label)
      : clubCourts.length > 0 ? [clubCourts[0].court_code] : ['']
  )

  // When opening the form, init court slots from current match courts
  useEffect(() => {
    if (!open) return
    if (currentCourts.length > 0) {
      setCourtLabels(currentCourts.map(c => c.court_label))
    } else if (clubCourts.length > 0) {
      setCourtLabels([clubCourts[0].court_code])
    }
  }, [open])

  const addCourt = () => setCourtLabels(prev => [...prev, clubCourts[0]?.court_code ?? ''])
  const removeCourt = (i: number) => setCourtLabels(prev => prev.filter((_, j) => j !== i))
  const setCourtLabelAt = (i: number, value: string) =>
    setCourtLabels(prev => prev.map((l, j) => (j === i ? value : l)))

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
        const labels = courtLabels.map(l => l.trim()).filter(Boolean)
        const currentLabels = currentCourts.map(c => c.court_label)
        const same = labels.length === currentLabels.length && labels.every((l, i) => l === currentLabels[i])
        if (!same) {
          await onSetCourts(labels)
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

      {(clubCourts.length > 0 || courtLabels.length > 0) && (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.8rem', color: '#666' }}>
              Courts ({courtLabels.length})
            </label>
            <button
              type="button"
              onClick={addCourt}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', background: '#f5f5f5', cursor: 'pointer' }}
            >
              + Add court
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {courtLabels.map((label, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#888', width: '1.5rem' }}>{i + 1}.</span>
                {clubCourts.length > 0 ? (
                  <select
                    value={label}
                    onChange={e => setCourtLabelAt(i, e.target.value)}
                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', flex: 1, maxWidth: '200px' }}
                  >
                    <option value="">— No court —</option>
                    {clubCourts.map(c => (
                      <option key={c.id} value={c.court_code}>
                        {c.court_code}{c.surface ? ` (${c.surface})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={label}
                    onChange={e => setCourtLabelAt(i, e.target.value)}
                    placeholder="Court name"
                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', flex: 1, maxWidth: '200px' }}
                  />
                )}
                {courtLabels.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCourt(i)}
                    aria-label="Remove court"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#c00', border: '1px solid #fcc', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
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
