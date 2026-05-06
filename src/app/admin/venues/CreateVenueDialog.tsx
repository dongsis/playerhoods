'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createVenue } from '@/lib/api/venues'
import type {
  VenueAccessType,
  VenueCostType,
  VenueFacilityType,
  VenueIndoorOutdoor,
  VenueKind,
} from '@/lib/types/database'

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

const INDOOR_OUTDOOR_OPTIONS: { value: VenueIndoorOutdoor; label: string }[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'indoor_outdoor', label: 'Indoor/Outdoor' },
]

const FACILITY_TYPE_OPTIONS: { value: VenueFacilityType; label: string }[] = [
  { value: 'court_only', label: 'Court Only' },
  { value: 'full_facility', label: 'Full Facility' },
]

const COST_TYPE_OPTIONS: { value: VenueCostType; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
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
          abbreviation: (formData.get('abbreviation') as string)?.trim() || undefined,
          location_text: (formData.get('location_text') as string)?.trim() || undefined,
          city: (formData.get('city') as string)?.trim() || undefined,
          province: (formData.get('province') as string)?.trim() || undefined,
          postal_code: (formData.get('postal_code') as string)?.trim() || undefined,
          country: (formData.get('country') as string)?.trim() || undefined,
          website_url: (formData.get('website_url') as string)?.trim() || undefined,
          contact_name: (formData.get('contact_name') as string)?.trim() || undefined,
          contact_phone: (formData.get('contact_phone') as string)?.trim() || undefined,
          contact_email: (formData.get('contact_email') as string)?.trim() || undefined,
          venue_phone: (formData.get('venue_phone') as string)?.trim() || undefined,
          venue_email: (formData.get('venue_email') as string)?.trim() || undefined,
          latitude: formData.get('latitude') ? Number(formData.get('latitude')) : null,
          longitude: formData.get('longitude') ? Number(formData.get('longitude')) : null,
          indoor_outdoor: ((formData.get('indoor_outdoor') as string) || undefined) as VenueIndoorOutdoor | undefined,
          facility_type: ((formData.get('facility_type') as string) || undefined) as VenueFacilityType | undefined,
          booking_required: formData.get('booking_required') === '' ? null : formData.get('booking_required') === 'true',
          cost_type: ((formData.get('cost_type') as string) || undefined) as VenueCostType | undefined,
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
                  Abbreviation
                </label>
                <input
                  name="abbreviation"
                  placeholder="ORTC"
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
                  placeholder="Street address"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  City
                </label>
                <input
                  name="city"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Province / State
                </label>
                <input
                  name="province"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Postal code
                </label>
                <input
                  name="postal_code"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Country
                </label>
                <input
                  name="country"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Contact person
                </label>
                <input
                  name="contact_name"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Contact phone
                </label>
                <input
                  name="contact_phone"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Contact email
                </label>
                <input
                  name="contact_email"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Venue phone
                </label>
                <input
                  name="venue_phone"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Venue email
                </label>
                <input
                  name="venue_email"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Latitude
                </label>
                <input
                  name="latitude"
                  type="number"
                  step="any"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Longitude
                </label>
                <input
                  name="longitude"
                  type="number"
                  step="any"
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
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Indoor / Outdoor
                </label>
                <select
                  name="indoor_outdoor"
                  defaultValue=""
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                >
                  <option value="">Unknown</option>
                  {INDOOR_OUTDOOR_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Facility type
                </label>
                <select
                  name="facility_type"
                  defaultValue=""
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', marginBottom: '0.75rem' }}
                >
                  <option value="">Unknown</option>
                  {FACILITY_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Booking required
                </label>
                <select
                  name="booking_required"
                  defaultValue=""
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', marginBottom: '0.75rem' }}
                >
                  <option value="">Unknown</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Cost
                </label>
                <select
                  name="cost_type"
                  defaultValue=""
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', marginBottom: '0.75rem' }}
                >
                  <option value="">Unknown</option>
                  {COST_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Website
                </label>
                <input
                  name="website_url"
                  placeholder="https://"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', marginBottom: '0.75rem' }}
                />
                <label
                  style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.2rem', fontWeight: 500 }}
                >
                  Description
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', resize: 'vertical' }}
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
