'use client'

import { useState, useTransition } from 'react'
import type { Court } from '@/lib/types/database'

interface Props {
  courts: Court[]
  onCreateCourt: (formData: FormData) => Promise<void>
  onUpdateCourt: (courtId: string, formData: FormData) => Promise<void>
  onDeleteCourt: (courtId: string) => Promise<void>
}

function CourtRow({
  court,
  onUpdate,
  onDelete,
}: {
  court: Court
  onUpdate: (courtId: string, formData: FormData) => Promise<void>
  onDelete: (courtId: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await onUpdate(court.id, formData)
        setEditing(false)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to update court')
      }
    })
  }

  const handleDelete = () => {
    if (!confirm(`Delete court "${court.court_code}"?`)) return
    startTransition(async () => {
      try {
        await onDelete(court.id)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to delete court')
      }
    })
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid #eee' }}>
        <span style={{ minWidth: '80px', fontWeight: 500 }}>{court.court_code}</span>
        {court.surface && <span style={{ color: '#666', fontSize: '0.85rem' }}>{court.surface}</span>}
        {court.notes && <span style={{ color: '#888', fontSize: '0.8rem', flex: 1 }}>{court.notes}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setEditing(true)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>Edit</button>
          <button onClick={handleDelete} disabled={isPending} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', color: 'red' }}>
            {isPending ? '...' : 'Delete'}
          </button>
        </div>
        {error && <span style={{ color: 'red', fontSize: '0.8rem' }}>{error}</span>}
      </div>
    )
  }

  return (
    <form onSubmit={handleUpdate} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
      {error && <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.85rem' }}>{error}</p>}
      <input name="court_code" defaultValue={court.court_code} style={{ padding: '0.3rem', width: '80px' }} />
      <input name="surface" defaultValue={court.surface ?? ''} placeholder="Surface" style={{ padding: '0.3rem', width: '100px' }} />
      <input name="notes" defaultValue={court.notes ?? ''} placeholder="Notes" style={{ padding: '0.3rem', width: '160px' }} />
      <button type="submit" disabled={isPending} style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem', background: '#333', color: 'white', border: 'none' }}>
        {isPending ? '...' : 'Save'}
      </button>
      <button type="button" onClick={() => setEditing(false)} style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}>
        Cancel
      </button>
    </form>
  )
}

function AddCourtForm({ onSubmit }: { onSubmit: (formData: FormData) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    if (!formData.get('court_code')?.toString().trim()) {
      setError('Court code is required')
      return
    }
    startTransition(async () => {
      try {
        await onSubmit(formData)
        form.reset()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to add court')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap' }}>
      {error && <p style={{ width: '100%', color: 'red', margin: 0, fontSize: '0.85rem' }}>{error}</p>}
      <input name="court_code" placeholder="Code *" required style={{ padding: '0.35rem', width: '80px' }} />
      <input name="surface" placeholder="Surface" style={{ padding: '0.35rem', width: '100px' }} />
      <input name="notes" placeholder="Notes" style={{ padding: '0.35rem', width: '160px' }} />
      <button
        type="submit"
        disabled={isPending}
        style={{ padding: '0.35rem 0.8rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
      >
        {isPending ? 'Adding...' : '+ Add Court'}
      </button>
    </form>
  )
}

export function CourtsManager({ courts, onCreateCourt, onUpdateCourt, onDeleteCourt }: Props) {
  return (
    <div>
      {courts.length === 0 && <p style={{ color: '#888', margin: '0 0 0.5rem' }}>No courts yet.</p>}
      <div>
        {courts.map(court => (
          <CourtRow
            key={court.id}
            court={court}
            onUpdate={onUpdateCourt}
            onDelete={onDeleteCourt}
          />
        ))}
      </div>
      <AddCourtForm onSubmit={onCreateCourt} />
    </div>
  )
}
