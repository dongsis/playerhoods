'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Court, MatchCourtPlanMode, MatchDoublesFormat } from '@/lib/types/database'
import type { MatchCourtPlanUpdateInput } from './match-detail.actions'

interface Props {
  requiredCount: number
  minRequiredCount?: number
  gameType: string | null
  doublesFormat: MatchDoublesFormat | null
  matchDate: string | null
  startTime: string | null
  durationMinutes: number | null
  courtPlanMode: MatchCourtPlanMode
  courtNote: string | null
  finalCourtLabel: string | null
  venueCourts: Court[]
  onSaveMatchDetails: (data: {
    required_count?: number | null
    doubles_format?: MatchDoublesFormat | null
    match_date: string | null
    start_time: string | null
    duration_minutes: number | null
  }) => Promise<void>
  onSaveCourtPlan: (data: MatchCourtPlanUpdateInput) => Promise<void>
}

const COURT_PLAN_OPTIONS: { value: MatchCourtPlanMode; label: string }[] = [
  { value: 'secured', label: 'Court already secured' },
  { value: 'walk_in', label: 'Walk-in / no advance booking' },
  { value: 'self_book_later', label: 'Host will book it later' },
  { value: 'needs_help_booking', label: 'Participants can help secure a court' },
]

const DOUBLES_FORMAT_OPTIONS: { value: MatchDoublesFormat; label: string }[] = [
  { value: 'open', label: 'Open doubles' },
  { value: 'mens_doubles', label: "Men's doubles" },
  { value: 'womens_doubles', label: "Women's doubles" },
  { value: 'mixed_doubles', label: 'Mixed doubles' },
]

export function MatchEditForm({
  requiredCount,
  minRequiredCount = 1,
  gameType,
  doublesFormat,
  matchDate,
  startTime,
  durationMinutes,
  courtPlanMode,
  courtNote,
  finalCourtLabel,
  venueCourts,
  onSaveMatchDetails,
  onSaveCourtPlan,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [players, setPlayers] = useState(requiredCount.toString())
  const [date, setDate] = useState(matchDate ?? '')
  const [time, setTime] = useState(startTime ?? '')
  const [duration, setDuration] = useState(durationMinutes?.toString() ?? '')
  const [nextDoublesFormat, setNextDoublesFormat] = useState<MatchDoublesFormat>(doublesFormat ?? 'open')
  const [planMode, setPlanMode] = useState<MatchCourtPlanMode>(courtPlanMode)
  const [planNote, setPlanNote] = useState(courtNote ?? '')
  const [courtLabel, setCourtLabel] = useState(finalCourtLabel ?? '')

  useEffect(() => {
    if (!open) return

    setPlayers(requiredCount.toString())
    setDate(matchDate ?? '')
    setTime(startTime ?? '')
    setDuration(durationMinutes?.toString() ?? '')
    setNextDoublesFormat(doublesFormat ?? 'open')
    setPlanMode(courtPlanMode)
    setPlanNote(courtNote ?? '')
    setCourtLabel(finalCourtLabel ?? '')
  }, [open, requiredCount, doublesFormat, matchDate, startTime, durationMinutes, courtPlanMode, courtNote, finalCourtLabel])

  useEffect(() => {
    if (planMode !== 'secured') return
    if (courtLabel.trim()) return
    if (venueCourts.length === 0) return
    setCourtLabel(venueCourts[0].court_code)
  }, [courtLabel, planMode, venueCourts])

  const nextRequiredCount = players ? parseInt(players, 10) : null
  const nextDate = date || null
  const nextTime = time || null
  const nextDuration = duration ? parseInt(duration, 10) : null
  const nextCourtNote = planNote.trim() || null
  const normalizedCourtLabel = courtLabel.trim()
  const nextCourtLabel = planMode === 'secured' ? (normalizedCourtLabel || null) : null
  const courtNotePlaceholder =
    planMode === 'walk_in'
      ? 'Walk-in only, meet early'
      : planMode === 'self_book_later'
        ? 'Host will confirm the court later'
        : planMode === 'needs_help_booking'
          ? 'Use the match message area to coordinate court booking'
          : 'Optional court note'

  const detailsChanged =
    nextRequiredCount !== requiredCount
    || (gameType === 'doubles' && nextDoublesFormat !== (doublesFormat ?? 'open'))
    || nextDate !== (matchDate ?? null)
    || nextTime !== (startTime ?? null)
    || nextDuration !== (durationMinutes ?? null)

  const scheduleChanged =
    nextDate !== (matchDate ?? null)
    || nextTime !== (startTime ?? null)
    || nextDuration !== (durationMinutes ?? null)

  const courtPlanChanged =
    planMode !== courtPlanMode
    || nextCourtNote !== (courtNote ?? null)
    || nextCourtLabel !== (finalCourtLabel ?? null)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (nextRequiredCount == null || Number.isNaN(nextRequiredCount)) {
      setError('Players is required')
      return
    }
    if (nextRequiredCount < minRequiredCount) {
      setError(`Players cannot be less than ${minRequiredCount}`)
      return
    }
    if (planMode === 'secured' && venueCourts.length > 0 && !normalizedCourtLabel) {
      setError('Please choose the secured court.')
      return
    }

    startTransition(async () => {
      try {
        if (detailsChanged) {
          await onSaveMatchDetails({
            required_count: nextRequiredCount,
            doubles_format: gameType === 'doubles' ? nextDoublesFormat : null,
            match_date: nextDate,
            start_time: nextTime,
            duration_minutes: nextDuration,
          })
        }

        if (courtPlanChanged) {
          await onSaveCourtPlan({
            court_plan_mode: planMode,
            court_note: nextCourtNote,
            final_court_label: nextCourtLabel,
          })
        }

        if (!detailsChanged && !courtPlanChanged) {
          setNotice('No changes were saved.')
        } else if (scheduleChanged) {
          setNotice('Saved. Participants will be asked to confirm again because the schedule changed.')
        } else {
          setNotice('Saved.')
        }

        setOpen(false)
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to save')
      }
    })
  }

  if (!open) {
    return (
      <div style={{ display: 'grid', justifyItems: 'end', gap: '0.45rem' }}>
        {notice && (
          <p style={{ color: '#166534', margin: 0, fontSize: '0.8rem', maxWidth: '18rem', textAlign: 'right' }}>
            {notice}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setError(null)
            setOpen(true)
          }}
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            padding: '0.48rem 1rem',
            border: '1px solid #d0d5dd',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.92)',
            cursor: 'pointer',
            color: '#344054',
            boxShadow: '0 8px 16px -14px rgba(15, 23, 42, 0.3)',
          }}
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSave}
      style={{
        width: '100%',
        marginTop: '0.35rem',
        padding: '1rem',
        border: '1px solid #d9e2ec',
        borderRadius: '16px',
        background: '#ffffff',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-end',
      }}
    >
      {error && (
        <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.85rem' }}>{error}</p>
      )}

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
          Players
        </label>
        <input
          type="number"
          min={minRequiredCount}
          max={12}
          step={1}
          value={players}
          onChange={(e) => setPlayers(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', width: '88px' }}
        />
      </div>

      {gameType === 'doubles' && (
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
            Doubles format
          </label>
          <select
            value={nextDoublesFormat}
            onChange={(e) => setNextDoublesFormat(e.target.value as MatchDoublesFormat)}
            style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '170px' }}
          >
            {DOUBLES_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
          onChange={(e) => setTime(e.target.value)}
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
          onChange={(e) => setDuration(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', width: '80px' }}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '420px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
              Court plan
            </label>
            <select
              value={planMode}
              onChange={(e) => setPlanMode(e.target.value as MatchCourtPlanMode)}
              style={{ width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
            >
              {COURT_PLAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {planMode === 'secured' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
                Final court
              </label>
              {venueCourts.length > 0 ? (
                <select
                  value={courtLabel}
                  onChange={(e) => setCourtLabel(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
                >
                  {venueCourts.map((court) => (
                    <option key={court.id} value={court.court_code}>
                      {court.court_code}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={courtLabel}
                  onChange={(e) => setCourtLabel(e.target.value)}
                  placeholder="Court 2"
                  style={{ width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
                />
              )}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
              Court note
            </label>
            <input
              type="text"
              value={planNote}
              onChange={(e) => setPlanNote(e.target.value)}
              placeholder={courtNotePlaceholder}
              style={{ width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>

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
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setOpen(false)
          }}
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
