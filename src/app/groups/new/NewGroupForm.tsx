'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addContactPlayerToGroup, addMemberToGroup, type GroupAddMemberResult } from '@/lib/api/groups'
import { GROUP_LEVEL_RATING_OPTIONS } from '@/lib/profile-options'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Sport, Venue } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'
import { GroupDetailPageShell } from '../[groupId]/GroupDetailPageShell'
import { createGroupAction } from './actions'

type Props = {
  sports: Sport[]
  venues: Venue[]
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
  const [venueId, setVenueId] = useState('')
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
        venue_id: venueId || null,
        recommended_level_min: levelMin ? Number(levelMin) : null,
        recommended_level_max: levelMax ? Number(levelMax) : null,
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
      <div className="max-w-[720px] pr-4">
        <nav className="mb-6 text-[11px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">
          <Link href="/groups" className="ph-link">
            Back to Groups
          </Link>
        </nav>

        <section className="ph-card px-6 py-6">
          <div className="ph-kicker mb-2">Shared Group</div>
          <h1 className="ph-title">Create New Group</h1>
          <p className="ph-subtitle mb-6 mt-2">
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
                <label htmlFor="venue" className="ph-kicker mb-2 mt-4 block">
                  Club / Venue
                </label>
                <select
                  id="venue"
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
                  className="ph-input"
                >
                  <option value="">No club venue</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {getVenueDisplayName(venue)}
                    </option>
                  ))}
                </select>
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
                                ? 'border-[#C25E46]/35 bg-[#FFF7ED]'
                                : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUser(user.id)}
                              className="h-4 w-4 rounded border-[#CBD5E1] text-[#C25E46] focus:ring-[#C25E46]/20"
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
                                ? 'border-[#C25E46]/35 bg-[#FFF7ED]'
                                : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleContact(contact.guest_id)}
                              className="h-4 w-4 rounded border-[#CBD5E1] text-[#C25E46] focus:ring-[#C25E46]/20"
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

            <button type="submit" disabled={loading} className="ph-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </section>
      </div>
    </GroupDetailPageShell>
  )
}
