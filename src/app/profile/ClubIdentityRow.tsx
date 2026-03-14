'use client'

import { useState, useTransition } from 'react'
import type { ClubIdentity, Club } from '@/lib/types/database'

interface Props {
  identity: ClubIdentity & { club: Club }
  isPrimary: boolean
  onRename: (clubId: string, newHandle: string) => Promise<void>
  onSetPrimary: (clubId: string) => Promise<void>
}

export function ClubIdentityRow({
  identity,
  isPrimary,
  onRename,
  onSetPrimary,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [handle, setHandle] = useState(identity.club_handle)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = handle.trim()
    if (!trimmed) { setError('Handle cannot be empty'); return }
    setError(null)
    startTransition(async () => {
      try {
        await onRename(identity.club_id, trimmed)
        setEditing(false)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to rename')
      }
    })
  }

  const handleSetPrimary = () => {
    setError(null)
    startTransition(async () => {
      try {
        await onSetPrimary(identity.club_id)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to set primary')
      }
    })
  }

  return (
    <div style={{ padding: '0.75rem 0', borderBottom: '1px solid #eee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <strong>{identity.club.name}</strong>
          {isPrimary && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: '#333', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
              primary
            </span>
          )}
          <div style={{ color: '#555', fontSize: '0.9rem', marginTop: '0.15rem' }}>
            Handle: <strong>{identity.club_handle}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {!isPrimary && (
            <button
              onClick={handleSetPrimary}
              disabled={isPending}
              style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
            >
              Set Primary
            </button>
          )}
          <button
            onClick={() => { setEditing(e => !e); setError(null) }}
            style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
          >
            {editing ? 'Cancel' : 'Rename'}
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={handleRename} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
          <input
            value={handle}
            onChange={e => setHandle(e.target.value)}
            style={{ padding: '0.3rem', width: '180px' }}
            placeholder="New handle"
          />
          <button
            type="submit"
            disabled={isPending}
            style={{ fontSize: '0.85rem', padding: '0.3rem 0.7rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            {isPending ? '...' : 'Save'}
          </button>
        </form>
      )}

      {error && <p style={{ color: 'red', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>{error}</p>}
    </div>
  )
}
