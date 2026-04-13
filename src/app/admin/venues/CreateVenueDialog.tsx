'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createVenue } from '@/lib/api/venues'
import type { VenueAccessType, VenueKind } from '@/lib/types/database'

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

export function CreateVenueDialog() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        await createVenue(supabase, {
          name: (formData.get('name') as string).trim(),
          location_text: (formData.get('location_text') as string)?.trim() || undefined,
          timezone: (formData.get('timezone') as string) || 'America/Toronto',
          notes: (formData.get('notes') as string)?.trim() || undefined,
          venue_kind: ((formData.get('venue_kind') as string) || 'club') as VenueKind,
          access_type: ((formData.get('access_type') as string) || 'members') as VenueAccessType,
        })
        formRef.current?.reset()
        setOpen(false)
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to create venue')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '0.45rem 1rem',
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '0.88rem',
        }}
      >
        + New Venue
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => !isPending && setOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
          />
          {/* Dialog */}
          <div
            style={{
              position: 'relative',
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '420px',
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem' }}>Create Venue</h2>
            <form ref={formRef} onSubmit={handleSubmit}>
              {error && (
                <p style={{ color: 'red', margin: '0 0 0.75rem', fontSize: '0.85rem' }}>{error}</p>
              )}
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Name *
                </label>
                <input
                  name="name"
                  required
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Location
                </label>
                <input
                  name="location_text"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Venue kind
                </label>
                <select
                  name="venue_kind"
                  defaultValue="club"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                >
                  {VENUE_KIND_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Access type
                </label>
                <select
                  name="access_type"
                  defaultValue="members"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                >
                  {ACCESS_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Timezone
                </label>
                <select
                  name="timezone"
                  defaultValue="America/Toronto"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Notes
                </label>
                <input
                  name="notes"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  style={{ padding: '0.4rem 0.9rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: '0.4rem 1rem',
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {isPending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
