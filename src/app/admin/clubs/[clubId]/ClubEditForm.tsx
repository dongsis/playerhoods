'use client'

import { useState, useTransition } from 'react'
import type { Club } from '@/lib/types/database'

interface Props {
  club: Club
  onSubmit: (formData: FormData) => Promise<void>
}

const TIMEZONES = [
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Australia/Sydney',
]

export function ClubEditForm({ club, onSubmit }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await onSubmit(formData)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2000)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to update club')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
      {error && <p style={{ width: '100%', color: 'red', margin: 0 }}>{error}</p>}
      {success && <p style={{ width: '100%', color: 'green', margin: 0 }}>Saved.</p>}

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Name</label>
        <input name="name" defaultValue={club.name} style={{ padding: '0.4rem', width: '180px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Location</label>
        <input name="location_text" defaultValue={club.location_text ?? ''} style={{ padding: '0.4rem', width: '180px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Timezone</label>
        <select name="timezone" defaultValue={club.timezone} style={{ padding: '0.4rem' }}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Notes</label>
        <input name="notes" defaultValue={club.notes ?? ''} style={{ padding: '0.4rem', width: '220px' }} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        style={{ padding: '0.4rem 1rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
