'use client'

import { useState, useTransition } from 'react'
import type { Venue, VenueAccessType, VenueKind } from '@/lib/types/database'

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

const VENUE_KIND_OPTIONS: { value: VenueKind; label: string }[] = [
  { value: 'club', label: 'Club' },
  { value: 'park', label: 'Park' },
  { value: 'community_centre', label: 'Community Centre' },
  { value: 'condo', label: 'Condo' },
  { value: 'school', label: 'School' },
  { value: 'private_facility', label: 'Private Facility' },
]

const ACCESS_TYPE_OPTIONS: { value: VenueAccessType; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'members', label: 'Members' },
  { value: 'private', label: 'Private' },
  { value: 'restricted', label: 'Restricted' },
]

interface Props {
  venue: Venue
  onSubmit: (formData: FormData) => Promise<void>
}

export function VenueOverviewForm({ venue, onSubmit }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await onSubmit(formData)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to save')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <p style={{ color: 'red', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>
      )}
      {saved && (
        <p style={{ color: '#2d8a4e', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Saved.</p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          marginBottom: '0.9rem',
        }}
      >
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Name
          </label>
          <input
            name="name"
            defaultValue={venue.name}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Abbreviation
          </label>
          <input
            name="abbreviation"
            defaultValue={venue.abbreviation ?? ''}
            placeholder="ORTC"
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Location
          </label>
          <input
            name="location_text"
            defaultValue={venue.location_text ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Timezone
          </label>
          <select
            name="timezone"
            defaultValue={venue.timezone}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
            </select>
          </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Venue kind
          </label>
          <select
            name="venue_kind"
            defaultValue={venue.venue_kind}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          >
            {VENUE_KIND_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Access type
          </label>
          <select
            name="access_type"
            defaultValue={venue.access_type}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          >
            {ACCESS_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Notes
          </label>
          <input
            name="notes"
            defaultValue={venue.notes ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: '0.4rem 1.1rem',
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.88rem',
        }}
      >
        {isPending ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
