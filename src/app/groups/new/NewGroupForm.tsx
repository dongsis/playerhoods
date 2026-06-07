'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addContactPlayerToGroup, addMemberToGroup, type GroupAddMemberResult } from '@/lib/api/groups'
import { GROUP_LEVEL_RATING_OPTIONS } from '@/lib/profile-options'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Sport, Venue } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'
import { BrandLogo } from '@/app/components/BrandLogo'
import { GroupDetailPageShell } from '../[groupId]/GroupDetailPageShell'
import { createGroupAction } from './actions'

type Props = {
  sports: Sport[]
  venues: (Venue & { is_primary?: boolean })[]
  invitableUsers: { id: string; display_name: string }[]
  contacts: { guest_id: string; display_name: string }[]
}

function normalizeInviteFeedback(result: GroupAddMemberResult) {
  switch (result.result) {
    case 'direct_add_success':
      return null
    case 'approval_required_request_created':
      return null
    case 'already_member':
      return null
    case 'already_pending':
      return null
    case 'not_allowed':
    default:
      return result.message || 'Could not add this player.'
  }
}

function normalizeContactError(message?: string) {
  if (message === 'not_authorized') return 'You need to be an active member of this Shared Group.'
  if (message === 'guest_not_accessible') return 'You can only add contact players you can already view.'
  return message ?? 'Failed to add contact.'
}

export function NewGroupForm({ sports, venues, invitableUsers, contacts }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sportId, setSportId] = useState('')
  const initialVenueIds = useMemo(() => venues.filter((venue) => venue.is_primary).map((venue) => venue.id), [venues])
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>(initialVenueIds)
  const [primaryVenueId, setPrimaryVenueId] = useState(initialVenueIds[0] ?? '')
  const [levelMin, setLevelMin] = useState('')
  const [levelMax, setLevelMax] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const toggleUser = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  const toggleContact = (guestId: string) => {
    setSelectedGuestIds((current) =>
      current.includes(guestId) ? current.filter((id) => id !== guestId) : [...current, guestId],
    )
  }

  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues])
  const selectedVenues = selectedVenueIds
    .map((venueId) => venueById.get(venueId))
    .filter((venue): venue is Venue & { is_primary?: boolean } => Boolean(venue))
  const availableVenues = venues.filter((venue) => !selectedVenueIds.includes(venue.id))

  const addVenue = (venueId: string) => {
    setSelectedVenueIds((current) => {
      if (current.includes(venueId)) return current
      if (!primaryVenueId) setPrimaryVenueId(venueId)
      return [...current, venueId]
    })
  }

  const removeVenue = (venueId: string) => {
    setSelectedVenueIds((current) => {
      const next = current.filter((id) => id !== venueId)
      if (primaryVenueId === venueId) {
        setPrimaryVenueId(next[0] ?? '')
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (levelMin && levelMax && Number(levelMin) > Number(levelMax)) {
        setError('Level minimum cannot be higher than level maximum.')
        setLoading(false)
        return
      }

      const group = await createGroupAction({
        name,
        description,
        primary_sport_id: sportId ? Number(sportId) : null,
        venue_id: primaryVenueId || selectedVenueIds[0] || null,
        recommended_level_min: levelMin ? Number(levelMin) : null,
        recommended_level_max: levelMax ? Number(levelMax) : null,
        locations: selectedVenueIds.map((venueId) => ({
          kind: 'venue',
          venue_id: venueId,
          is_primary: venueId === (primaryVenueId || selectedVenueIds[0]),
        })),
      })

      const supabase = createSupabaseBrowserClient()
      const memberErrors: string[] = []

      for (const userId of selectedUserIds) {
        try {
          const result = await addMemberToGroup(supabase, group.id, userId)
          const message = normalizeInviteFeedback(result)
          if (message) memberErrors.push(message)
        } catch (memberError) {
          memberErrors.push((memberError as { message?: string })?.message ?? 'Failed to add member.')
        }
      }

      for (const guestId of selectedGuestIds) {
        try {
          await addContactPlayerToGroup(supabase, group.id, guestId)
        } catch (contactError) {
          memberErrors.push(normalizeContactError((contactError as { message?: string })?.message))
        }
      }

      if (memberErrors.length > 0) {
        setError(`Group created, but some members could not be added: ${memberErrors[0]}`)
      }
      router.push(`/groups/${group.id}`)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Failed to create group'
      setError(message)
      console.error('Create group error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <GroupDetailPageShell>
      <div className="max-w-[720px] pr-4 max-[768px]:max-w-none max-[768px]:pr-0 max-[768px]:pb-24">
        <div
          className="hidden max-[768px]:grid"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            alignItems: 'center',
            gap: '0.75rem',
            minHeight: '3.65rem',
            padding: '0.55rem 0.85rem',
            borderBottom: '1px solid #e2e8f0',
            background: '#ffffff',
          }}
        >
          <Link
            href="/groups"
            style={{
              color: '#0f172a',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {'<'} Groups
          </Link>
          <h1
            style={{
              margin: 0,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              color: '#0f172a',
              fontSize: '1rem',
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            New Group
          </h1>
        </div>

        <div className="mb-6 max-[768px]:hidden">
          <BrandLogo variant="horizontal" href="/dashboard" />
        </div>
        <nav className="mb-6 text-[11px] font-black uppercase tracking-[0.16em] text-[#94A3B8] max-[768px]:hidden">
          <Link href="/groups" className="ph-link">
            Back to Groups
          </Link>
        </nav>

        <section className="ph-card px-6 py-6 max-[768px]:rounded-none max-[768px]:border-0 max-[768px]:px-4 max-[768px]:py-5 max-[768px]:shadow-none">
          <div className="ph-kicker mb-2 max-[768px]:hidden">Shared Group</div>
          <h1 className="ph-title max-[768px]:hidden">Create New Group</h1>
          <p className="ph-subtitle mb-6 mt-2 max-[768px]:hidden">
            Start a lightweight coordination group for regular players and shared match access.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="ph-kicker mb-2 block">
                Group Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="ph-input"
              />
            </div>

            <div>
              <div>
                <label htmlFor="sport" className="ph-kicker mb-2 block">
                  Sport
                </label>
                <select
                  id="sport"
                  value={sportId}
                  onChange={(e) => setSportId(e.target.value)}
                  className="ph-input"
                >
                  <option value="">Sport to be assigned</option>
                  {sports.map((sport) => (
                    <option key={sport.id} value={sport.id}>
                      {sport.display_name}
                    </option>
                  ))}
                </select>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <label htmlFor="levelMin" className="ph-kicker mb-2 block">
                      Level Min
                    </label>
                    <select
                      id="levelMin"
                      value={levelMin}
                      onChange={(e) => setLevelMin(e.target.value)}
                      className="ph-input"
                    >
                      <option value="">No minimum</option>
                      {GROUP_LEVEL_RATING_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="levelMax" className="ph-kicker mb-2 block">
                      Level Max
                    </label>
                    <select
                      id="levelMax"
                      value={levelMax}
                      onChange={(e) => setLevelMax(e.target.value)}
                      className="ph-input"
                    >
                      <option value="">No maximum</option>
                      {GROUP_LEVEL_RATING_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="ph-kicker mb-2">Club / Venue</div>
                  <div className="rounded-[18px] border border-[#D9E2EC] bg-[#F8FAFC] p-3">
                    {selectedVenues.length === 0 ? (
                      <div className="text-body-sub rounded-[14px] border border-dashed border-[#D9E2EC] bg-white px-3 py-3 text-[#94A3B8]">
                        No group venues selected yet. Add one from your venues below.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedVenues.map((venue) => {
                          const isPrimary = venue.id === (primaryVenueId || selectedVenueIds[0])
                          return (
                            <div
                              key={venue.id}
                              className="flex flex-col gap-3 rounded-[16px] border border-[#E2E8F0] bg-white px-3 py-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-body-main font-semibold text-[#1E293B]">{getVenueDisplayName(venue)}</span>
                                  {isPrimary ? (
                                    <span className="rounded-full bg-[#EAF3FF] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#0B5BD3]">
                                      Primary
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-body-sub mt-1 text-[#64748B]">
                                  {[venue.location_text, [venue.city, venue.province].filter(Boolean).join(', ')].filter(Boolean)[0] ?? 'Venue'}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                {!isPrimary ? (
                                  <button
                                    type="button"
                                    onClick={() => setPrimaryVenueId(venue.id)}
                                    className="rounded-full border border-[#D9E2EC] bg-white px-3 py-1.5 text-[12px] font-bold text-[#0B1F4D]"
                                  >
                                    Set primary
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => removeVenue(venue.id)}
                                  className="rounded-full border border-[#FECACA] bg-white px-3 py-1.5 text-[12px] font-bold text-[#B91C1C]"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="mt-3">
                      <div className="text-label mb-2 text-[#94A3B8]">Add from my venues</div>
                      {availableVenues.length === 0 ? (
                        <div className="text-body-sub rounded-[14px] border border-dashed border-[#D9E2EC] bg-white px-3 py-3 text-[#94A3B8]">
                          All of your venues are already included.
                        </div>
                      ) : (
                        <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                          {availableVenues.map((venue) => (
                            <button
                              key={venue.id}
                              type="button"
                              onClick={() => addVenue(venue.id)}
                              className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#E2E8F0] bg-white px-3 py-2.5 text-left transition hover:border-[#CBD5E1]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-body-main font-semibold text-[#1E293B]">
                                  {getVenueDisplayName(venue)}
                                </span>
                                <span className="block truncate text-body-sub text-[#64748B]">
                                  {[venue.location_text, [venue.city, venue.province].filter(Boolean).join(', ')].filter(Boolean)[0] ?? 'Venue'}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-full bg-[#eff6ff] px-3 py-1 text-[12px] font-black text-[#0B5BD3]">
                                + Add
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="description" className="ph-kicker mb-2 block">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="ph-input"
              />
            </div>

            <div className="rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="ph-kicker mb-2">Add Members</div>
              <p className="ph-subtitle mb-4">
                Pick people to add right away. You can still add more after the group is created.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-label mb-2 text-[#94A3B8]">Saved Registered Players</div>
                  {invitableUsers.length === 0 ? (
                    <div className="text-body-sub rounded-[16px] border border-dashed border-[#D9E2EC] bg-white px-3 py-3 text-[#94A3B8]">
                      No saved players available right now.
                    </div>
                  ) : (
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {invitableUsers.map((user) => {
                        const checked = selectedUserIds.includes(user.id)
                        return (
                          <label
                            key={user.id}
                            className={[
                              'flex cursor-pointer items-center gap-3 rounded-[16px] border px-3 py-2.5 transition',
                              checked
                                ? 'border-[#0d6efd]/35 bg-[#eff6ff]'
                                : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUser(user.id)}
                              className="h-4 w-4 rounded border-[#CBD5E1] text-[#0d6efd] focus:ring-[#0d6efd]/20"
                            />
                            <span className="text-body-main text-[#1E293B]">{user.display_name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-label mb-2 text-[#94A3B8]">Contacts</div>
                  {contacts.length === 0 ? (
                    <div className="text-body-sub rounded-[16px] border border-dashed border-[#D9E2EC] bg-white px-3 py-3 text-[#94A3B8]">
                      No contacts available right now.
                    </div>
                  ) : (
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {contacts.map((contact) => {
                        const checked = selectedGuestIds.includes(contact.guest_id)
                        return (
                          <label
                            key={contact.guest_id}
                            className={[
                              'flex cursor-pointer items-center gap-3 rounded-[16px] border px-3 py-2.5 transition',
                              checked
                                ? 'border-[#0d6efd]/35 bg-[#eff6ff]'
                                : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleContact(contact.guest_id)}
                              className="h-4 w-4 rounded border-[#CBD5E1] text-[#0d6efd] focus:ring-[#0d6efd]/20"
                            />
                            <span className="text-body-main text-[#1E293B]">{contact.display_name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-[16px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="ph-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60 max-[768px]:fixed max-[768px]:bottom-4 max-[768px]:left-4 max-[768px]:right-4 max-[768px]:z-40 max-[768px]:w-auto"
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </section>
      </div>
    </GroupDetailPageShell>
  )
}
