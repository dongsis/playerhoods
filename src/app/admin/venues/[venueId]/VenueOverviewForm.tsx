'use client'

import { useState, useTransition } from 'react'
import type {
  Venue,
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
            Address
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
            City
          </label>
          <input
            name="city"
            defaultValue={venue.city ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Province / State
          </label>
          <input
            name="province"
            defaultValue={venue.province ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Postal code
          </label>
          <input
            name="postal_code"
            defaultValue={venue.postal_code ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Country
          </label>
          <input
            name="country"
            defaultValue={venue.country ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Contact person
          </label>
          <input
            name="contact_name"
            defaultValue={venue.contact_name ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Contact phone
          </label>
          <input
            name="contact_phone"
            defaultValue={venue.contact_phone ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Contact email
          </label>
          <input
            name="contact_email"
            defaultValue={venue.contact_email ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Venue phone
          </label>
          <input
            name="venue_phone"
            defaultValue={venue.venue_phone ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Venue email
          </label>
          <input
            name="venue_email"
            defaultValue={venue.venue_email ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Latitude
          </label>
          <input
            name="latitude"
            type="number"
            step="any"
            defaultValue={venue.latitude ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Longitude
          </label>
          <input
            name="longitude"
            type="number"
            step="any"
            defaultValue={venue.longitude ?? ''}
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
            Indoor / Outdoor
          </label>
          <select
            name="indoor_outdoor"
            defaultValue={venue.indoor_outdoor ?? ''}
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
            Facility type
          </label>
          <select
            name="facility_type"
            defaultValue={venue.facility_type ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          >
            <option value="">Unknown</option>
            {FACILITY_TYPE_OPTIONS.map(option => (
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
            Website
          </label>
          <input
            name="website_url"
            defaultValue={venue.website_url ?? ''}
            placeholder="https://"
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Booking required
          </label>
          <select
            name="booking_required"
            defaultValue={venue.booking_required == null ? '' : String(venue.booking_required)}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          >
            <option value="">Unknown</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div>
          <label
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}
          >
            Cost
          </label>
          <select
            name="cost_type"
            defaultValue={venue.cost_type ?? ''}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
          >
            <option value="">Unknown</option>
            {COST_TYPE_OPTIONS.map(option => (
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
            Description
          </label>
          <textarea
            name="notes"
            defaultValue={venue.notes ?? ''}
            rows={3}
            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', resize: 'vertical' }}
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
