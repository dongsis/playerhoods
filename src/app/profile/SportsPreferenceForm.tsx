'use client'

import { useState } from 'react'
import type { Sport } from '@/lib/types/database'

interface Props {
  sports: Sport[]
  initialSportIds: number[]
  onSave: (codes: string[]) => Promise<void>
}

export function SportsPreferenceForm({ sports, initialSportIds, onSave }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(initialSportIds))
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSuccess(false)
  }

  const hasChanges = (() => {
    const initial = new Set(initialSportIds)
    if (initial.size !== selectedIds.size) return true
    for (const id of selectedIds) {
      if (!initial.has(id)) return true
    }
    return false
  })()

  const handleSave = async () => {
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      const codes = sports
        .filter(s => selectedIds.has(s.id))
        .map(s => s.code)
      await onSave(codes)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
        {sports.map(s => (
          <label key={s.id} style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedIds.has(s.id)}
              onChange={() => toggle(s.id)}
            />{' '}
            {s.display_name}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {success && <span style={{ color: 'green', fontSize: '0.8rem' }}>Saved!</span>}
        {error && <span style={{ color: 'red', fontSize: '0.8rem' }}>{error}</span>}
      </div>
    </div>
  )
}
