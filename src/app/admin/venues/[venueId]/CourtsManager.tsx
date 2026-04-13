'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Court, Sport } from '@/lib/types/database'

type ToastItem = { id: number; msg: string; ok: boolean }

type CourtDraft = {
  sport_id: number
  court_code: string
  surface: string
  notes: string
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: '0.5rem 1rem',
            background: toast.ok ? '#2d8a4e' : '#c0392b',
            color: '#fff',
            borderRadius: '5px',
            fontSize: '0.85rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {toast.msg}
        </div>
      ))}
    </div>
  )
}

function CourtRow({
  court,
  sports,
  locked,
  onUpdate,
  onDelete,
}: {
  court: Court
  sports: Sport[]
  locked: boolean
  onUpdate: (courtId: string, data: CourtDraft) => Promise<void>
  onDelete: (courtId: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)

  if (court.id.startsWith('temp-')) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.5rem 0',
          borderBottom: '1px solid #eee',
          opacity: 0.55,
        }}
      >
        <span style={{ minWidth: '80px', fontWeight: 500 }}>{court.court_code}</span>
        {court.surface && <span style={{ color: '#666', fontSize: '0.85rem' }}>{court.surface}</span>}
        <span style={{ fontSize: '0.75rem', color: '#aaa', marginLeft: 'auto' }}>Saving...</span>
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.5rem 0',
          borderBottom: '1px solid #eee',
        }}
      >
        <span style={{ minWidth: '80px', fontWeight: 500 }}>{court.court_code}</span>
        {court.surface && <span style={{ color: '#666', fontSize: '0.85rem' }}>{court.surface}</span>}
        {court.notes && <span style={{ color: '#999', fontSize: '0.8rem', flex: 1 }}>{court.notes}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={locked}
            style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(court.id)}
            disabled={locked}
            style={{
              fontSize: '0.78rem',
              padding: '0.2rem 0.5rem',
              color: '#c0392b',
              border: '1px solid #f5c6c6',
              background: 'none',
              cursor: 'pointer',
              borderRadius: '3px',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        onUpdate(court.id, {
          sport_id: parseInt(formData.get('sport_id') as string, 10),
          court_code: (formData.get('court_code') as string).trim(),
          surface: (formData.get('surface') as string).trim(),
          notes: (formData.get('notes') as string).trim(),
        })
          .then(() => setEditing(false))
          .catch(() => {
            // toast handles visible error
          })
      }}
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0.4rem 0',
        borderBottom: '1px solid #eee',
        flexWrap: 'wrap',
      }}
    >
      <select name="sport_id" defaultValue={court.sport_id.toString()} style={{ padding: '0.3rem', minWidth: '140px' }}>
        {sports.map((sport) => (
          <option key={sport.id} value={sport.id}>
            {sport.display_name}
          </option>
        ))}
      </select>
      <input name="court_code" defaultValue={court.court_code} style={{ padding: '0.3rem', width: '100px' }} />
      <input
        name="surface"
        defaultValue={court.surface ?? ''}
        placeholder="Surface"
        style={{ padding: '0.3rem', width: '110px' }}
      />
      <input
        name="notes"
        defaultValue={court.notes ?? ''}
        placeholder="Notes"
        style={{ padding: '0.3rem', width: '180px' }}
      />
      <button
        type="submit"
        style={{
          fontSize: '0.8rem',
          padding: '0.25rem 0.6rem',
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
        }}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
      >
        Cancel
      </button>
    </form>
  )
}

function AddCourtForm({
  sports,
  defaultSportId,
  onAdd,
}: {
  sports: Sport[]
  defaultSportId: number
  onAdd: (data: CourtDraft) => Promise<void>
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const courtCode = (formData.get('court_code') as string).trim()
    if (!courtCode) {
      setError('Court code is required')
      return
    }

    setError(null)
    setLoading(true)
    onAdd({
      sport_id: parseInt(formData.get('sport_id') as string, 10),
      court_code: courtCode,
      surface: (formData.get('surface') as string).trim(),
      notes: (formData.get('notes') as string).trim(),
    })
      .then(() => {
        formRef.current?.reset()
        if (formRef.current) {
          const sportField = formRef.current.elements.namedItem('sport_id') as HTMLSelectElement | null
          if (sportField) sportField.value = defaultSportId.toString()
        }
      })
      .catch((err: unknown) => {
        setError((err as { message?: string })?.message || 'Failed to add court')
      })
      .finally(() => setLoading(false))
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {error && <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.82rem' }}>{error}</p>}
      <select name="sport_id" defaultValue={defaultSportId.toString()} style={{ padding: '0.35rem', minWidth: '150px' }}>
        {sports.map((sport) => (
          <option key={sport.id} value={sport.id}>
            {sport.display_name}
          </option>
        ))}
      </select>
      <input name="court_code" placeholder="Code *" style={{ padding: '0.35rem', width: '100px' }} />
      <input name="surface" placeholder="Surface" style={{ padding: '0.35rem', width: '110px' }} />
      <input name="notes" placeholder="Notes" style={{ padding: '0.35rem', width: '180px' }} />
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '0.35rem 0.8rem',
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        {loading ? 'Adding...' : '+ Add court'}
      </button>
    </form>
  )
}

interface Props {
  courts: Court[]
  sports: Sport[]
  onCreateCourt: (formData: FormData) => Promise<void>
  onUpdateCourt: (courtId: string, formData: FormData) => Promise<void>
  onDeleteCourt: (courtId: string) => Promise<void>
}

export function CourtsManager({
  courts: initialCourts,
  sports,
  onCreateCourt,
  onUpdateCourt,
  onDeleteCourt,
}: Props) {
  const [courts, setCourts] = useState<Court[]>(initialCourts)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [activeSportId, setActiveSportId] = useState<number>(sports[0]?.id ?? 1)
  const [, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    setCourts(initialCourts)
  }, [initialCourts])

  useEffect(() => {
    if (sports.length === 0) return
    const hasActive = courts.some((court) => court.sport_id === activeSportId)
    if (!hasActive && !sports.some((sport) => sport.id === activeSportId)) {
      setActiveSportId(sports[0].id)
    }
  }, [activeSportId, courts, sports])

  const sportMap = useMemo(
    () => new Map(sports.map((sport) => [sport.id, sport.display_name])),
    [sports],
  )

  const groupedCourts = useMemo(
    () =>
      sports.map((sport) => ({
        sport,
        courts: courts
          .filter((court) => court.sport_id === sport.id)
          .sort((left, right) => left.court_code.localeCompare(right.court_code)),
      })),
    [courts, sports],
  )

  function pushToast(msg: string, ok = true) {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, msg, ok }])
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3000)
  }

  const handleAdd = async (data: CourtDraft) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: Court = {
      id: tempId,
      venue_id: '',
      sport_id: data.sport_id,
      court_code: data.court_code,
      surface: data.surface || null,
      notes: data.notes || null,
      created_at: new Date().toISOString(),
    }
    setCourts((prev) => [...prev, optimistic])
    setActiveSportId(data.sport_id)

    const formData = new FormData()
    formData.set('sport_id', data.sport_id.toString())
    formData.set('court_code', data.court_code)
    formData.set('surface', data.surface)
    formData.set('notes', data.notes)

    try {
      await onCreateCourt(formData)
      startTransition(() => {
        router.refresh()
      })
      pushToast(`Court added to ${sportMap.get(data.sport_id) ?? 'this sport'}`)
    } catch (err: unknown) {
      setCourts((prev) => prev.filter((court) => court.id !== tempId))
      pushToast((err as { message?: string })?.message || 'Failed to add court', false)
      throw err
    }
  }

  const handleUpdate = async (courtId: string, data: CourtDraft) => {
    const backup = courts.find((court) => court.id === courtId)
    setCourts((prev) =>
      prev.map((court) =>
        court.id === courtId
          ? {
              ...court,
              sport_id: data.sport_id,
              court_code: data.court_code,
              surface: data.surface || null,
              notes: data.notes || null,
            }
          : court,
      ),
    )

    const formData = new FormData()
    formData.set('sport_id', data.sport_id.toString())
    formData.set('court_code', data.court_code)
    formData.set('surface', data.surface)
    formData.set('notes', data.notes)

    try {
      await onUpdateCourt(courtId, formData)
      startTransition(() => {
        router.refresh()
      })
      pushToast('Court updated')
    } catch (err: unknown) {
      if (backup) {
        setCourts((prev) => prev.map((court) => (court.id === courtId ? backup : court)))
      }
      pushToast((err as { message?: string })?.message || 'Failed to update court', false)
      throw err
    }
  }

  const handleDelete = async (courtId: string) => {
    if (!confirm('Delete this court?')) return

    const backup = courts.find((court) => court.id === courtId)
    setCourts((prev) => prev.filter((court) => court.id !== courtId))

    try {
      await onDeleteCourt(courtId)
      startTransition(() => {
        router.refresh()
      })
      pushToast('Court deleted')
    } catch (err: unknown) {
      if (backup) {
        setCourts((prev) => [...prev, backup])
      }
      pushToast((err as { message?: string })?.message || 'Failed to delete court', false)
    }
  }

  return (
    <div>
      <ToastContainer toasts={toasts} />

      <p style={{ color: '#666', margin: '0 0 1rem', fontSize: '0.9rem' }}>
        Court numbering is managed separately for each sport inside a venue.
      </p>

      {sports.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {sports.map((sport) => (
            <button
              key={sport.id}
              type="button"
              onClick={() => setActiveSportId(sport.id)}
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: '999px',
                border: sport.id === activeSportId ? '1px solid #111827' : '1px solid #d1d5db',
                background: sport.id === activeSportId ? '#111827' : '#fff',
                color: sport.id === activeSportId ? '#fff' : '#374151',
                cursor: 'pointer',
                fontSize: '0.82rem',
              }}
            >
              {sport.display_name}
            </button>
          ))}
        </div>
      )}

      {groupedCourts.map(({ sport, courts: sportCourts }) => {
        const hidden = sport.id !== activeSportId
        return (
          <section key={sport.id} style={{ display: hidden ? 'none' : 'block' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{sport.display_name}</h3>
              <p style={{ margin: '0.25rem 0 0', color: '#888', fontSize: '0.82rem' }}>
                {sportCourts.length === 0
                  ? 'No courts configured for this sport yet.'
                  : `${sportCourts.length} court${sportCourts.length === 1 ? '' : 's'} configured`}
              </p>
            </div>

            <div>
              {sportCourts.map((court) => (
                <CourtRow
                  key={court.id}
                  court={court}
                  sports={sports}
                  locked={false}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>

            <AddCourtForm sports={sports} defaultSportId={sport.id} onAdd={handleAdd} />
          </section>
        )
      })}
    </div>
  )
}
