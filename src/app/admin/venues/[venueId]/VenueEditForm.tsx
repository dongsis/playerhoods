'use client'

import { useState, useTransition } from 'react'
import type { Venue } from '@/lib/types/database'

interface Props {
  venue: Venue
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

export function VenueEditForm({ venue, onSubmit }: Props) {
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
        setError((err as { message?: string })?.message || 'Failed to update venue')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
      {error && <p style={{ width: '100%', color: 'red', margin: 0 }}>{error}</p>}
      {success && <p style={{ width: '100%', color: 'green', margin: 0 }}>Saved.</p>}

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Name</label>
        <input name="name" defaultValue={venue.name} style={{ padding: '0.4rem', width: '180px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Address</label>
        <input name="location_text" defaultValue={venue.location_text ?? ''} style={{ padding: '0.4rem', width: '180px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>City</label>
        <input name="city" defaultValue={venue.city ?? ''} style={{ padding: '0.4rem', width: '140px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Postal code</label>
        <input name="postal_code" defaultValue={venue.postal_code ?? ''} style={{ padding: '0.4rem', width: '140px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Country</label>
        <input name="country" defaultValue={venue.country ?? ''} style={{ padding: '0.4rem', width: '140px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Contact person</label>
        <input name="contact_name" defaultValue={venue.contact_name ?? ''} style={{ padding: '0.4rem', width: '180px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Contact phone</label>
        <input name="contact_phone" defaultValue={venue.contact_phone ?? ''} style={{ padding: '0.4rem', width: '180px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Contact email</label>
        <input name="contact_email" defaultValue={venue.contact_email ?? ''} style={{ padding: '0.4rem', width: '220px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Venue phone</label>
        <input name="venue_phone" defaultValue={venue.venue_phone ?? ''} style={{ padding: '0.4rem', width: '180px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Venue email</label>
        <input name="venue_email" defaultValue={venue.venue_email ?? ''} style={{ padding: '0.4rem', width: '220px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Timezone</label>
        <select name="timezone" defaultValue={venue.timezone} style={{ padding: '0.4rem' }}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Website</label>
        <input name="website_url" defaultValue={venue.website_url ?? ''} style={{ padding: '0.4rem', width: '220px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Description</label>
        <input name="notes" defaultValue={venue.notes ?? ''} style={{ padding: '0.4rem', width: '220px' }} />
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
