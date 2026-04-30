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
  onCancelMatch: (reason: string) => Promise<void>
  onSaveCourtPlan: (data: MatchCourtPlanUpdateInput) => Promise<void>
}

const COURT_PLAN_OPTIONS: { value: MatchCourtPlanMode; label: string }[] = [
  { value: 'secured', label: 'Court already secured' },
  { value: 'walk_in', label: 'Walk-in / no advance booking' },
  { value: 'self_book_later', label: 'Host will book it later' },
  { value: 'needs_help_booking', label: 'Players can help secure a court' },
]

const DOUBLES_FORMAT_OPTIONS: { value: MatchDoublesFormat; label: string }[] = [
  { value: 'open', label: 'Open doubles' },
  { value: 'mens_doubles', label: "Men's doubles" },
  { value: 'womens_doubles', label: "Women's doubles" },
  { value: 'mixed_doubles', label: 'Mixed doubles' },
]

const SINGLES_FORMAT_OPTIONS: { value: MatchDoublesFormat; label: string }[] = [
  { value: 'open', label: 'Open singles' },
  { value: 'mens_doubles', label: "Men's singles" },
  { value: 'womens_doubles', label: "Women's singles" },
]

const secondaryButtonStyle: React.CSSProperties = {
  background: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  padding: '0.45rem 0.7rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.8rem',
}

const dangerButtonStyle: React.CSSProperties = {
  background: '#b42318',
  color: '#fff',
  border: 'none',
  padding: '0.45rem 0.7rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.8rem',
}

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
  onCancelMatch,
  onSaveCourtPlan,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
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
  const [cancelReason, setCancelReason] = useState('')

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

  useEffect(() => {
    if (gameType === 'singles' && nextDoublesFormat === 'mixed_doubles') {
      setNextDoublesFormat('open')
    }
  }, [gameType, nextDoublesFormat])

  useEffect(() => {
    if (planMode === 'secured' && planNote) {
      setPlanNote('')
    }
  }, [planMode, planNote])

  const nextRequiredCount = players ? parseInt(players, 10) : null
  const nextDate = date || null
  const nextTime = time || null
  const nextDuration = duration ? parseInt(duration, 10) : null
  const nextCourtNote = planMode === 'secured' ? null : (planNote.trim() || null)
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
    || nextDoublesFormat !== (doublesFormat ?? 'open')
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
            doubles_format: nextDoublesFormat,
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
          setNotice('Saved. Players will be asked to confirm again because the schedule changed.')
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

  const handleCancelMatch = () => {
    setError(null)

    if (!cancelReason.trim()) {
      setError('Cancel reason is required')
      return
    }

    startTransition(async () => {
      try {
        await onCancelMatch(cancelReason)
        setNotice('Match cancelled.')
        setCancelOpen(false)
        setOpen(false)
        setCancelReason('')
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to cancel match')
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
    <>
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
          display: 'grid',
          gap: '0.95rem',
        }}
      >
      {error && (
        <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.85rem' }}>{error}</p>
      )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
            gap: '0.8rem 0.9rem',
            alignItems: 'end',
          }}
        >
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
              style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
              Format
            </label>
            <select
              value={nextDoublesFormat}
              onChange={(e) => setNextDoublesFormat(e.target.value as MatchDoublesFormat)}
              style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
            >
              {(gameType === 'singles' ? SINGLES_FORMAT_OPTIONS : DOUBLES_FORMAT_OPTIONS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
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
              style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
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
              style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.75rem',
            maxWidth: '420px',
            paddingTop: '0.25rem',
            borderTop: '1px solid #eef2f7',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.2rem' }}>
              Booking status
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
                Court Plan
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

          {planMode !== 'secured' && (
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
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            paddingTop: '0.25rem',
            borderTop: '1px solid #eef2f7',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setError(null)
              setCancelOpen(true)
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#b42318',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Cancel the match
          </button>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setOpen(false)
              }}
              style={secondaryButtonStyle}
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                ...dangerButtonStyle,
                background: '#111827',
                opacity: isPending ? 0.6 : 1,
                cursor: isPending ? 'wait' : 'pointer',
              }}
            >
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </form>

      {cancelOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 70,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.14)',
              padding: '1rem',
              display: 'grid',
              gap: '0.75rem',
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>Cancel this match?</h4>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#667085', lineHeight: 1.45 }}>
                This will mark the match as cancelled and post the reason to the match chat.
              </p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#667085', marginBottom: '0.3rem' }}>
                Cancel reason
              </label>
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Why is this match being cancelled?"
                style={{
                  width: '100%',
                  minHeight: '96px',
                  resize: 'vertical',
                  padding: '0.7rem 0.8rem',
                  fontSize: '0.84rem',
                  borderRadius: '12px',
                  border: '1px solid #d0d5dd',
                  outline: 'none',
                }}
              />
            </div>
            {error ? (
              <p style={{ margin: 0, color: '#b42318', fontSize: '0.8rem' }}>{error}</p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setCancelOpen(false)
                  setCancelReason('')
                  setError(null)
                }}
                style={secondaryButtonStyle}
              >
                Keep match
              </button>
              <button
                type="button"
                onClick={handleCancelMatch}
                disabled={isPending}
                style={{
                  ...dangerButtonStyle,
                  opacity: isPending ? 0.6 : 1,
                  cursor: isPending ? 'wait' : 'pointer',
                }}
              >
                {isPending ? 'Cancelling...' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
