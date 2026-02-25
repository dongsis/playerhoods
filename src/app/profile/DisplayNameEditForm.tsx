'use client'

import { useState, useTransition } from 'react'

interface Props {
  displayName: string
  onSave: (newName: string) => Promise<void>
}

/**
 * Inline edit form for the user's global display_name.
 * v1.5 Identity: display_name is the primary global identity layer.
 * Max 50 chars; non-empty required.
 */
export function DisplayNameEditForm({ displayName, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(displayName)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) { setError('Display name cannot be empty'); return }
    if (trimmed.length > 50) { setError('Max 50 characters'); return }
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await onSave(trimmed)
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Failed to save')
      }
    })
  }

  const handleCancel = () => {
    setValue(displayName)
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '1rem' }}>{displayName}</span>
        {saved && <span style={{ color: '#2d8a4e', fontSize: '0.8rem' }}>Saved</span>}
        <button
          onClick={() => { setEditing(true); setSaved(false) }}
          style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        maxLength={50}
        placeholder="Your display name"
        autoFocus
        style={{ padding: '0.35rem 0.5rem', fontSize: '0.95rem', minWidth: '180px', flex: 1 }}
      />
      <span style={{ fontSize: '0.75rem', color: '#aaa', whiteSpace: 'nowrap' }}>
        {value.trim().length}/50
      </span>
      <button
        type="submit"
        disabled={isPending || !value.trim()}
        style={{ padding: '0.3rem 0.7rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
      >
        {isPending ? '...' : 'Save'}
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}
      >
        Cancel
      </button>
      {error && <p style={{ width: '100%', color: 'red', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>{error}</p>}
    </form>
  )
}
