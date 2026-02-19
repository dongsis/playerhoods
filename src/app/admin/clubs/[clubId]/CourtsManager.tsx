'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Court } from '@/lib/types/database'

// ---- Toast ----

type ToastItem = { id: number; msg: string; ok: boolean }

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
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            padding: '0.5rem 1rem',
            background: t.ok ? '#2d8a4e' : '#c0392b',
            color: '#fff',
            borderRadius: '5px',
            fontSize: '0.85rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ---- Court Row (inline edit) ----

function CourtRow({
  court,
  locked,
  onUpdate,
  onDelete,
}: {
  court: Court
  locked: boolean
  onUpdate: (courtId: string, data: { court_code: string; surface: string; notes: string }) => Promise<void>
  onDelete: (courtId: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)

  // Optimistic / pending rows (temp IDs) shown as saving
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
        {court.surface && (
          <span style={{ color: '#666', fontSize: '0.85rem' }}>{court.surface}</span>
        )}
        <span style={{ fontSize: '0.75rem', color: '#aaa', marginLeft: 'auto' }}>Saving…</span>
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
        {court.surface && (
          <span style={{ color: '#666', fontSize: '0.85rem' }}>{court.surface}</span>
        )}
        {court.notes && (
          <span style={{ color: '#999', fontSize: '0.8rem', flex: 1 }}>{court.notes}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setEditing(true)}
            disabled={locked}
            style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
          >
            Edit
          </button>
          <button
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
      onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        onUpdate(court.id, {
          court_code: (fd.get('court_code') as string).trim(),
          surface: (fd.get('surface') as string).trim(),
          notes: (fd.get('notes') as string).trim(),
        })
          .then(() => setEditing(false))
          .catch(() => {
            /* error shown via toast */
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
      <input
        name="court_code"
        defaultValue={court.court_code}
        style={{ padding: '0.3rem', width: '80px' }}
      />
      <input
        name="surface"
        defaultValue={court.surface ?? ''}
        placeholder="Surface"
        style={{ padding: '0.3rem', width: '100px' }}
      />
      <input
        name="notes"
        defaultValue={court.notes ?? ''}
        placeholder="Notes"
        style={{ padding: '0.3rem', width: '160px' }}
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

// ---- Add Court Form ----

function AddCourtForm({
  onAdd,
}: {
  onAdd: (data: { court_code: string; surface: string; notes: string }) => Promise<void>
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const code = (fd.get('court_code') as string).trim()
    if (!code) {
      setError('Court code is required')
      return
    }
    setError(null)
    setLoading(true)
    onAdd({
      court_code: code,
      surface: (fd.get('surface') as string).trim(),
      notes: (fd.get('notes') as string).trim(),
    })
      .then(() => {
        formRef.current?.reset()
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
      {error && (
        <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.82rem' }}>{error}</p>
      )}
      <input
        name="court_code"
        placeholder="Code *"
        style={{ padding: '0.35rem', width: '80px' }}
      />
      <input name="surface" placeholder="Surface" style={{ padding: '0.35rem', width: '100px' }} />
      <input name="notes" placeholder="Notes" style={{ padding: '0.35rem', width: '160px' }} />
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
        {loading ? 'Adding…' : '+ Add'}
      </button>
    </form>
  )
}

// ---- Main export ----

interface Props {
  courts: Court[]
  onCreateCourt: (formData: FormData) => Promise<void>
  onUpdateCourt: (courtId: string, formData: FormData) => Promise<void>
  onDeleteCourt: (courtId: string) => Promise<void>
}

export function CourtsManager({
  courts: initialCourts,
  onCreateCourt,
  onUpdateCourt,
  onDeleteCourt,
}: Props) {
  const [courts, setCourts] = useState<Court[]>(initialCourts)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [, startTransition] = useTransition()
  const router = useRouter()

  // Sync with server state after router.refresh()
  useEffect(() => {
    setCourts(initialCourts)
  }, [initialCourts])

  function pushToast(msg: string, ok = true) {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, ok }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  const handleAdd = async (data: { court_code: string; surface: string; notes: string }) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: Court = {
      id: tempId,
      club_id: '',
      court_code: data.court_code,
      surface: data.surface || null,
      notes: data.notes || null,
      created_at: new Date().toISOString(),
    }
    setCourts(prev => [...prev, optimistic])

    const fd = new FormData()
    fd.set('court_code', data.court_code)
    fd.set('surface', data.surface)
    fd.set('notes', data.notes)

    try {
      await onCreateCourt(fd)
      startTransition(() => {
        router.refresh()
      })
      pushToast('Court added')
    } catch (err: unknown) {
      setCourts(prev => prev.filter(c => c.id !== tempId))
      pushToast((err as { message?: string })?.message || 'Failed to add court', false)
      throw err
    }
  }

  const handleUpdate = async (
    courtId: string,
    data: { court_code: string; surface: string; notes: string }
  ) => {
    const backup = courts.find(c => c.id === courtId)
    setCourts(prev =>
      prev.map(c =>
        c.id === courtId
          ? { ...c, court_code: data.court_code, surface: data.surface || null, notes: data.notes || null }
          : c
      )
    )

    const fd = new FormData()
    fd.set('court_code', data.court_code)
    fd.set('surface', data.surface)
    fd.set('notes', data.notes)

    try {
      await onUpdateCourt(courtId, fd)
      startTransition(() => {
        router.refresh()
      })
      pushToast('Court updated')
    } catch (err: unknown) {
      if (backup) setCourts(prev => prev.map(c => (c.id === courtId ? backup : c)))
      pushToast((err as { message?: string })?.message || 'Failed to update court', false)
      throw err
    }
  }

  const handleDelete = async (courtId: string) => {
    if (!confirm('Delete this court?')) return
    const backup = courts.find(c => c.id === courtId)
    setCourts(prev => prev.filter(c => c.id !== courtId))

    try {
      await onDeleteCourt(courtId)
      startTransition(() => {
        router.refresh()
      })
      pushToast('Court deleted')
    } catch (err: unknown) {
      if (backup)
        setCourts(prev =>
          [...prev, backup].sort((a, b) => a.court_code.localeCompare(b.court_code))
        )
      pushToast((err as { message?: string })?.message || 'Failed to delete court', false)
    }
  }

  return (
    <div>
      <ToastContainer toasts={toasts} />
      {courts.length === 0 && (
        <p style={{ color: '#aaa', margin: '0 0 0.5rem', fontSize: '0.85rem' }}>No courts yet.</p>
      )}
      <div>
        {courts.map(court => (
          <CourtRow
            key={court.id}
            court={court}
            locked={false}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </div>
      <AddCourtForm onAdd={handleAdd} />
    </div>
  )
}
