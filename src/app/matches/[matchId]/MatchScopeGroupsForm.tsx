'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface GroupOption {
  id: string
  name: string
}

interface Props {
  groups: GroupOption[]
  currentScopeGroupIds: string[]
  onSave: (ids: string[]) => Promise<void>
}

export function MatchScopeGroupsForm({
  groups,
  currentScopeGroupIds,
  onSave,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentScopeGroupIds))

  useEffect(() => {
    if (open) setSelectedIds(new Set(currentScopeGroupIds))
  }, [open, currentScopeGroupIds])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleGroup = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await onSave(Array.from(selectedIds))
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
          marginLeft: '0.5rem',
        }}
      >
        Edit published groups
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
      }}
    >
      {error && <p style={{ color: 'red', margin: '0 0 0.5rem', fontSize: '0.85rem' }}>{error}</p>}
      {saved && <p style={{ color: 'green', margin: '0 0 0.5rem', fontSize: '0.85rem' }}>Saved.</p>}
      <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.5rem' }}>
        Members of selected groups can request to join this match.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {groups.map(g => (
          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedIds.has(g.id)}
              onChange={() => toggleGroup(g.id)}
            />
            {g.name}
          </label>
        ))}
      </div>
      {groups.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: '#999', margin: '0 0 0.5rem' }}>No groups found.</p>
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
