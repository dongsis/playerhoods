'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Sport } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'

type Props = {
  groupName: string
  description: string | null
  primarySportId: number | null
  venueId: string | null
  openToClubMembers: boolean
  sports: Sport[]
  venues: Array<{ id: string; name: string; abbreviation?: string | null }>
  onSave: (data: {
    name: string
    description?: string | null
    primary_sport_id?: number | null
    venue_id?: string | null
    open_to_club_members?: boolean
  }) => Promise<void>
}

export function GroupSettingsPanel({
  groupName,
  description,
  primarySportId,
  venueId,
  openToClubMembers,
  sports,
  venues,
  onSave,
}: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState(groupName)
  const [announcement, setAnnouncement] = useState(description ?? '')
  const [sportId, setSportId] = useState(primarySportId ? String(primarySportId) : '')
  const [selectedVenueId, setSelectedVenueId] = useState(venueId ?? '')
  const [openToClub, setOpenToClub] = useState(openToClubMembers)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        await onSave({
          name,
          description: announcement.trim() || null,
          primary_sport_id: sportId ? Number(sportId) : null,
          venue_id: selectedVenueId || null,
          open_to_club_members: openToClub,
        })
        setSuccess('Saved.')
        setIsOpen(false)
        router.refresh()
      } catch (saveError) {
        setError((saveError as { message?: string })?.message ?? 'Could not save settings.')
      }
    })
  }

  return (
    <section
      style={{
        borderRadius: '18px',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        padding: '0.8rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={{
          width: '100%',
          borderRadius: '14px',
          border: '1px solid #dbe4ee',
          background: '#fff',
          color: '#0f172a',
          padding: '0.8rem 1rem',
          fontSize: '0.92rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Settings
      </button>

      {isOpen ? (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Group name"
            style={{
              width: '100%',
              padding: '0.72rem 0.8rem',
              fontSize: '0.88rem',
              borderRadius: '12px',
              border: '1px solid #d0d5dd',
              color: '#0f172a',
              background: '#fff',
            }}
          />
          <select
            value={sportId}
            onChange={(event) => setSportId(event.target.value)}
            style={{
              width: '100%',
              padding: '0.72rem 0.8rem',
              fontSize: '0.88rem',
              borderRadius: '12px',
              border: '1px solid #d0d5dd',
              color: '#0f172a',
              background: '#fff',
            }}
          >
            <option value="">Sport to be assigned</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>{sport.display_name}</option>
            ))}
          </select>
          <select
            value={selectedVenueId}
            onChange={(event) => setSelectedVenueId(event.target.value)}
            style={{
              width: '100%',
              padding: '0.72rem 0.8rem',
              fontSize: '0.88rem',
              borderRadius: '12px',
              border: '1px solid #d0d5dd',
              color: '#0f172a',
              background: '#fff',
            }}
          >
            <option value="">No club venue</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>{getVenueDisplayName(venue)}</option>
            ))}
          </select>
          <textarea
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value)}
            placeholder="Announcement / group note"
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '0.72rem 0.8rem',
              fontSize: '0.88rem',
              borderRadius: '12px',
              border: '1px solid #d0d5dd',
              color: '#0f172a',
              background: '#fff',
            }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              borderRadius: '12px',
              border: '1px solid #d0d5dd',
              background: '#fff',
              padding: '0.78rem 0.8rem',
              color: '#0f172a',
              fontSize: '0.86rem',
              lineHeight: 1.45,
            }}
          >
            <input
              type="checkbox"
              checked={openToClub}
              onChange={(event) => setOpenToClub(event.target.checked)}
              style={{ margin: 0 }}
            />
            <span>
              <span style={{ display: 'block', fontWeight: 700 }}>Open to club members</span>
              <span style={{ display: 'block', color: '#667085', fontSize: '0.78rem' }}>
                {selectedVenueId
                  ? 'Let people from this club know the group is open to join.'
                  : 'Select a club venue first if you want this group to be discoverable there.'}
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            style={{
              width: '100%',
              padding: '0.72rem 0.9rem',
              borderRadius: '12px',
              border: 'none',
              background: '#0f172a',
              color: '#fff',
              fontSize: '0.86rem',
              fontWeight: 700,
              opacity: isPending ? 0.6 : 1,
              cursor: 'pointer',
            }}
          >
            {isPending ? 'Saving...' : 'Save settings'}
          </button>
          {error ? <p style={{ color: '#b42318', fontSize: '0.78rem', margin: 0 }}>{error}</p> : null}
          {success ? <p style={{ color: '#15803d', fontSize: '0.78rem', margin: 0 }}>{success}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
