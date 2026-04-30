'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import {
  getContactPlayerResolution,
  updateRosterGuest,
  type ContactPlayerResolved,
} from '@/lib/api/roster'
import { getPublicPlayerProfile, type PublicPlayerProfile, type PublicSportProfile } from '@/lib/api/player-profiles'
import {
  getAvailabilityStatusDotClass,
  getLevelLabel,
  getPreferredPlayTimeLabel,
  getSportFormatOptions,
} from '@/lib/profile-options'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { ParticipantDetailPanel, type DetailConnection, type DetailValue } from './ParticipantDetailPanel'

type ContactGender = 'male' | 'female' | 'unspecified' | null | undefined

export type ContactParticipantTarget = {
  guestId: string
  displayName: string
  avatarUrl?: string | null
  gender?: ContactGender
  savedByViewer?: boolean
  sharesGroupWithViewer?: boolean
}

interface Props {
  open: boolean
  target: ContactParticipantTarget
  items?: MatchListItem[]
  onClose: () => void
}

const CONTACT_GENDER_OPTIONS: Array<{
  value: Exclude<ContactGender, null> | ''
  label: string
}> = [
  { value: '', label: 'Not shared yet' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
]

function formatGenderLabel(gender: ContactGender) {
  switch (gender) {
    case 'female':
      return 'Female'
    case 'male':
      return 'Male'
    case 'unspecified':
      return 'Prefer not to say'
    default:
      return 'Not shared yet'
  }
}

function splitPlayStyle(value: string | null | undefined): string[] {
  if (!value) return []

  return value
    .split(/[,\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function pickPrimarySportProfile(profile: PublicPlayerProfile | null): PublicSportProfile | null {
  if (!profile || profile.sport_profiles.length === 0) return null

  return profile.sport_profiles.find((item) =>
    item.level
    || item.preferred_formats.length > 0
    || item.play_style
    || item.competition_experience,
  ) ?? profile.sport_profiles[0]
}

export function ContactParticipantDrawer({
  open,
  target,
  items = [],
  onClose,
}: Props) {
  const [contact, setContact] = useState<ContactPlayerResolved | null>(null)
  const [linkedProfile, setLinkedProfile] = useState<PublicPlayerProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [contactName, setContactName] = useState(target.displayName)
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactGender, setContactGender] = useState<ContactGender>(target.gender ?? null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setContact(null)
    setLinkedProfile(null)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()

    getContactPlayerResolution(supabase)
      .then(async (contacts) => {
        const nextContact = contacts.find((item) => item.guest_id === target.guestId) ?? null
        if (cancelled) return
        setContact(nextContact)

        if (nextContact?.linked_user_id) {
          try {
            const profile = await getPublicPlayerProfile(supabase, nextContact.linked_user_id)
            if (!cancelled) setLinkedProfile(profile)
          } catch {
            if (!cancelled) setLinkedProfile(null)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContact(null)
          setLinkedProfile(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, target.guestId])

  useEffect(() => {
    if (!open) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return

    setEditing(false)
    setSaveError(null)
    setContactName(contact?.display_name ?? target.displayName)
    setContactEmail(contact?.email ?? '')
    setContactPhone(contact?.phone ?? '')
    setContactGender(contact?.gender ?? target.gender ?? null)
  }, [contact, open, target.displayName, target.gender])

  const primarySportProfile = useMemo(
    () => pickPrimarySportProfile(linkedProfile),
    [linkedProfile],
  )

  const formatLabels = useMemo(() => {
    if (!primarySportProfile) return [] as string[]

    return primarySportProfile.preferred_formats
      .map((value) =>
        getSportFormatOptions(primarySportProfile.sport_code).find((option) => option.value === value)?.label ?? value,
      )
      .filter(Boolean)
  }, [primarySportProfile])

  const preferredTimes = useMemo(() => (
    (linkedProfile?.preferred_play_times ?? [])
      .map((value) => getPreferredPlayTimeLabel(value) ?? value)
      .filter(Boolean)
      .map((value) => value.trim())
  ), [linkedProfile])

  const sharedMatchCount = useMemo(() => (
    items.filter((item) =>
      item.participants.some((participant) => participant.guest_id === target.guestId),
    ).length
  ), [items, target.guestId])

  const connections = useMemo(() => {
    const next: DetailConnection[] = []

    if (linkedProfile?.shared_venue_names?.length) {
      next.push({
        key: 'venues',
        icon: 'venue',
        text: `Both play at ${linkedProfile.shared_venue_names.join(', ')}`,
      })
    }

    if (target.sharesGroupWithViewer) {
      next.push({
        key: 'groups',
        icon: 'groups',
        text: 'You share at least one group connection',
        iconClassName: 'text-sky-500',
      })
    }

    if (sharedMatchCount > 0) {
      next.push({
        key: 'matches',
        icon: 'matches',
        text: sharedMatchCount === 1 ? 'Played 1 match together' : `Played ${sharedMatchCount} matches together`,
        iconClassName: 'text-amber-500',
      })
    }

    return next
  }, [linkedProfile?.shared_venue_names, sharedMatchCount, target.sharesGroupWithViewer])

  const detailItems = useMemo(() => {
    const next: DetailValue[] = []

    if (contact?.phone?.trim()) {
      next.push({ key: 'phone', label: 'Phone', value: contact.phone.trim() })
    }
    if (contact?.email?.trim()) {
      next.push({ key: 'email', label: 'Email', value: contact.email.trim() })
    }
    if (contact?.gender ?? target.gender) {
      next.push({ key: 'gender', label: 'Gender', value: formatGenderLabel(contact?.gender ?? target.gender) })
    }
    if (contact?.linked_user_id) {
      next.push({ key: 'linked', label: 'Account', value: 'Linked to a PlayerHoods account' })
    }
    if (target.savedByViewer) {
      next.push({ key: 'saved', label: 'Saved', value: 'Saved to your people list' })
    }

    return next
  }, [contact, target.gender, target.savedByViewer])
  const isOwner = Boolean(contact)

  const handleSave = async () => {
    if (!contact || !contactName.trim()) return

    setSaving(true)
    setSaveError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      await updateRosterGuest(supabase, {
        guest_id: contact.guest_id,
        display_name: contactName.trim(),
        gender: contactGender ?? null,
        email: contactEmail.trim() || null,
        phone: contactPhone.trim() || null,
      })
      setContact((current) => current ? {
        ...current,
        display_name: contactName.trim(),
        gender: contactGender ?? null,
        email: contactEmail.trim() || null,
        phone: contactPhone.trim() || null,
      } : current)
      setEditing(false)
    } catch (error) {
      setSaveError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  if (loading) {
    return (
      <ParticipantDetailPanel
        open={open}
        displayName={target.displayName}
        avatarUrl={target.avatarUrl ?? null}
        avatarFallback="contact"
        connections={[{ key: 'loading', icon: 'groups', text: 'Loading player details...' }]}
        onClose={onClose}
      />
    )
  }

  return (
    <ParticipantDetailPanel
      open={open}
      displayName={editing ? contactName : (linkedProfile?.display_name ?? contact?.display_name ?? target.displayName)}
      avatarUrl={linkedProfile?.avatar_url ?? target.avatarUrl ?? null}
      avatarFallback="contact"
      statusClassName={getAvailabilityStatusDotClass(contact?.availability_status ?? linkedProfile?.looking_to_play)}
      level={getLevelLabel(primarySportProfile?.level) ?? primarySportProfile?.level ?? null}
      formatLabels={formatLabels}
      connections={connections}
      playStyles={splitPlayStyle(primarySportProfile?.play_style)}
      experience={primarySportProfile?.competition_experience ?? null}
      preferredTimes={preferredTimes}
      detailTitle={detailItems.length > 0 ? 'Contact Info' : null}
      detailItems={detailItems}
      extraContent={editing ? (
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Edit Contact
          </h3>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Name</span>
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Display name"
                className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Gender</span>
                <select
                  value={contactGender ?? ''}
                  onChange={(event) => setContactGender((event.target.value || null) as ContactGender)}
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                >
                  {CONTACT_GENDER_OPTIONS.map((option) => (
                    <option key={option.value || 'empty'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Phone</span>
                <input
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="+1 (000) 000-0000"
                  className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Email</span>
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="Enter email address"
                className="text-body-main w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            {saveError ? (
              <p className="text-body-sub text-rose-600">{saveError}</p>
            ) : null}
          </div>
        </section>
      ) : null}
      footer={isOwner ? (
        <div className="flex flex-wrap gap-3">
          {editing ? (
            <>
              <button
                type="button"
                disabled={saving || !contactName.trim()}
                onClick={() => void handleSave()}
                className="text-body-main rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save contact'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false)
                  setSaveError(null)
                  setContactName(contact?.display_name ?? target.displayName)
                  setContactEmail(contact?.email ?? '')
                  setContactPhone(contact?.phone ?? '')
                  setContactGender(contact?.gender ?? target.gender ?? null)
                }}
                className="text-body-main rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-body-main rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Edit contact
            </button>
          )}
        </div>
      ) : undefined}
      onClose={onClose}
    />
  )
}
