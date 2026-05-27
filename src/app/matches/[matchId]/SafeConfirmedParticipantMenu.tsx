'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { userWithdraw } from '@/lib/api/matches'

type Props = {
  matchId: string
}

export function SafeConfirmedParticipantMenu({ matchId }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const cancelParticipation = () => {
    setOpen(false)
    setError(null)
    startTransition(async () => {
      try {
        await userWithdraw(supabase, matchId)
        router.refresh()
        window.dispatchEvent(new Event('playerhoods:dashboard-live-refresh'))
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Could not cancel participation')
      }
    })
  }

  return (
    <div style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open player actions"
        onClick={() => setOpen((value) => !value)}
        disabled={isPending}
        style={{
          width: '2rem',
          height: '2rem',
          borderRadius: '999px',
          border: '1px solid #D9E5F4',
          background: '#fff',
          color: '#64748b',
          fontWeight: 900,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        ...
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: '2.35rem',
            zIndex: 20,
            minWidth: '12rem',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            background: '#fff',
            boxShadow: '0 18px 38px rgba(15, 23, 42, 0.14)',
            padding: '0.35rem',
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={cancelParticipation}
            style={{
              width: '100%',
              border: 0,
              borderRadius: '10px',
              background: '#fff',
              color: '#B91C1C',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 800,
              padding: '0.65rem 0.75rem',
              textAlign: 'left',
            }}
          >
            {isPending ? 'Updating...' : 'Cancel Participation'}
          </button>
        </div>
      ) : null}
      {error ? (
        <p style={{ position: 'absolute', right: 0, top: '2.45rem', width: '14rem', color: '#B91C1C', fontSize: '0.75rem', fontWeight: 700 }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
