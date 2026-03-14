'use client'

import { useState, useTransition } from 'react'

interface Props {
  onReconcile: () => Promise<void>
}

/** Shown when user may be a Contact Player who registered — allows manual identity link. */
export function ReconcileIdentityButton({ onReconcile }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      try {
        await onReconcile()
      } catch (err) {
        setError((err as { message?: string })?.message ?? 'Failed to link account')
      }
    })
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        style={{
          background: '#0369a1',
          color: 'white',
          border: 'none',
          padding: '0.4rem 0.8rem',
          fontSize: '0.85rem',
          borderRadius: '4px',
          cursor: isPending ? 'wait' : 'pointer',
        }}
      >
        {isPending ? 'Linking…' : 'Link my account'}
      </button>
      {error && <p style={{ color: 'red', fontSize: '0.85rem', marginTop: '0.3rem' }}>{error}</p>}
    </div>
  )
}
