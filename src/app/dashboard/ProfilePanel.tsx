'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, VenueIdentity, Venue, Sport, UserSportProfile } from '@/lib/types/database'
import { AvatarUpload } from './AvatarUpload'
import { DisplayNameEditForm } from '@/app/profile/DisplayNameEditForm'
import { SportsPreferenceForm } from '@/app/profile/SportsPreferenceForm'
import { DiscoveryAndInvitesSection } from '@/app/profile/DiscoveryAndInvitesSection'
import { SportProfilesEditor } from '@/app/profile/SportProfilesEditor'
import {
  LOOKING_TO_PLAY_OPTIONS,
  PREFERRED_PLAY_TIME_OPTIONS,
} from '@/lib/profile-options'

type ProfileData = Pick<
  Profile,
  | 'display_name'
  | 'first_name'
  | 'last_name'
  | 'gender'
  | 'primary_venue_id'
  | 'contact_channel'
  | 'contact_email'
  | 'contact_phone'
  | 'avatar_url'
  | 'show_in_venue_member_discovery'
  | 'allow_non_group_invites'
  | 'looking_to_play'
  | 'preferred_play_times'
>

type VenuePreferenceParams = {
  visible_in_venue_member_discovery?: 'true' | 'false' | 'inherit'
  accept_non_group_invites_in_venue?: 'true' | 'false' | 'inherit'
}

interface Props {
  userId: string
  profile: ProfileData
  userEmail?: string | null
  myIdentities: (VenueIdentity & { venue: Venue })[]
  myVenuePrefs: Venue[]
  joinableVenues: Venue[]
  sports: Sport[]
  mySportIds: number[]
  mySportProfiles: UserSportProfile[]
  onUpdateProfile: (formData: FormData) => Promise<void>
  onSetDisplayName: (newName: string) => Promise<void>
  onAvatarSaved: () => Promise<void>
  onSetPrimaryVenue: (venueId: string) => Promise<void>
  onLeaveVenue: (venueId: string) => Promise<void>
  onRemoveVenuePreference: (venueId: string) => Promise<void>
  onJoinVenue: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onSaveGlobalPreferences: (params: {
    show_in_venue_member_discovery?: boolean
    allow_non_group_invites?: boolean
  }) => Promise<void>
  onSetVenuePreferences: (venueId: string, params: VenuePreferenceParams) => Promise<void>
  onSetSports: (codes: string[]) => Promise<void>
  onSaveSportProfile: (input: {
    sport_id: number
    level?: string | null
    years_playing?: number | null
    preferred_formats?: string[]
    current_frequency?: string | null
    play_style?: string | null
    competition_experience?: string | null
    teams_played_on?: string | null
    line_played?: string | null
    highlights?: string | null
    gear_primary?: string | null
    gear_secondary?: string | null
    gear_shoes?: string | null
  }) => Promise<void>
}

function SectionCard({
  title,
  description,
  children,
  tone = 'default',
}: {
  title: string
  description?: string
  children: ReactNode
  tone?: 'default' | 'soft'
}) {
  const toneClass = tone === 'soft'
    ? 'border-slate-200 bg-slate-50/85'
    : 'border-slate-200 bg-white'

  return (
    <section className={`rounded-[28px] border ${toneClass} p-6 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]`}>
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function PanelCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.28)]">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
      {children}
    </label>
  )
}

function normalizeActionError(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const maybeMessage = Reflect.get(error, 'message')
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage
    const maybeError = Reflect.get(error, 'error')
    if (typeof maybeError === 'string' && maybeError.trim()) return maybeError
  }
  return fallback
}

export function ProfilePanel({
  userId,
  profile,
  userEmail,
  myIdentities,
  myVenuePrefs,
  joinableVenues,
  sports,
  mySportIds,
  mySportProfiles,
  onUpdateProfile,
  onSetDisplayName,
  onAvatarSaved,
  onSetPrimaryVenue,
  onLeaveVenue,
  onRemoveVenuePreference,
  onJoinVenue,
  onSaveGlobalPreferences,
  onSetVenuePreferences,
  onSetSports,
  onSaveSportProfile,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedJoinVenueId, setSelectedJoinVenueId] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [isJoiningVenue, startJoiningVenue] = useTransition()
  const [openVenueMenuId, setOpenVenueMenuId] = useState<string | null>(null)
  const [venueActionError, setVenueActionError] = useState<string | null>(null)
  const [pendingVenueAction, setPendingVenueAction] = useState<{ id: string; kind: 'primary' | 'delete' | 'remove_saved' } | null>(null)
  const [isVenueActionPending, startVenueAction] = useTransition()
  const [firstName, setFirstName] = useState(profile.first_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [gender, setGender] = useState<Profile['gender']>(profile.gender ?? 'unspecified')
  const [contactEmail, setContactEmail] = useState(profile.contact_email ?? '')
  const [contactPhone, setContactPhone] = useState(profile.contact_phone ?? '')
  const [contactChannel, setContactChannel] = useState<'email' | 'sms'>(profile.contact_channel === 'sms' ? 'sms' : 'email')
  const [lookingToPlay, setLookingToPlay] = useState(profile.looking_to_play ?? '')
  const [preferredPlayTimes, setPreferredPlayTimes] = useState<string[]>(
    profile.preferred_play_times ?? [],
  )
  const [selectedSportIds, setSelectedSportIds] = useState<number[]>(mySportIds)
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)
  const lastSavedSnapshotRef = useRef('')

  const normalizedDisplayName = profile.display_name?.trim() ?? ''
  const joinedVenueIds = new Set(myIdentities.map(identity => identity.venue_id))
  const publicVenuePrefs = myVenuePrefs.filter(venue => !joinedVenueIds.has(venue.id))
  const defaultJoinVenueId =
    profile.primary_venue_id && joinableVenues.some(venue => venue.id === profile.primary_venue_id)
      ? profile.primary_venue_id
      : ''

  useEffect(() => {
    setSelectedJoinVenueId(defaultJoinVenueId)
  }, [defaultJoinVenueId])

  useEffect(() => {
    setSelectedSportIds(mySportIds)
  }, [mySportIds])

  useEffect(() => {
    if (!openVenueMenuId) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      const menuRoot = document.querySelector(`[data-venue-menu-root="${openVenueMenuId}"]`)
      if (menuRoot instanceof HTMLElement && !menuRoot.contains(target)) {
        setOpenVenueMenuId(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenVenueMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openVenueMenuId])

  const currentSnapshot = JSON.stringify({
    first_name: firstName,
    last_name: lastName,
    gender,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    contact_channel: contactChannel,
    looking_to_play: lookingToPlay,
    preferred_play_times: [...preferredPlayTimes].sort(),
  })

  useEffect(() => {
    const nextFirstName = profile.first_name ?? ''
    const nextLastName = profile.last_name ?? ''
    const nextGender = profile.gender ?? 'unspecified'
    const nextContactEmail = profile.contact_email ?? ''
    const nextContactPhone = profile.contact_phone ?? ''
    const nextContactChannel = profile.contact_channel === 'sms' ? 'sms' : 'email'
    const nextLookingToPlay = profile.looking_to_play ?? ''
    const nextPreferredPlayTimes = profile.preferred_play_times ?? []

    setFirstName(nextFirstName)
    setLastName(nextLastName)
    setGender(nextGender)
    setContactEmail(nextContactEmail)
    setContactPhone(nextContactPhone)
    setContactChannel(nextContactChannel)
    setLookingToPlay(nextLookingToPlay)
    setPreferredPlayTimes(nextPreferredPlayTimes)
    lastSavedSnapshotRef.current = JSON.stringify({
      first_name: nextFirstName,
      last_name: nextLastName,
      gender: nextGender,
      contact_email: nextContactEmail,
      contact_phone: nextContactPhone,
      contact_channel: nextContactChannel,
      looking_to_play: nextLookingToPlay,
      preferred_play_times: [...nextPreferredPlayTimes].sort(),
    })
    setAutoSaveState('idle')
  }, [
    profile.first_name,
    profile.last_name,
    profile.gender,
    profile.contact_email,
    profile.contact_phone,
    profile.contact_channel,
    profile.looking_to_play,
    profile.preferred_play_times,
  ])

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    if (currentSnapshot === lastSavedSnapshotRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setAutoSaveState('saving')

    saveTimerRef.current = setTimeout(() => {
      const formData = new FormData()
      formData.set('first_name', firstName)
      formData.set('last_name', lastName)
      formData.set('gender', gender ?? 'unspecified')
      formData.set('contact_email', contactEmail)
      formData.set('contact_phone', contactPhone)
      formData.set('contact_channel', contactChannel)
      formData.set('looking_to_play', lookingToPlay)
      formData.set('preferred_play_times_present', '1')
      preferredPlayTimes.forEach((value) => formData.append('preferred_play_times', value))

      startTransition(async () => {
        try {
          await onUpdateProfile(formData)
          lastSavedSnapshotRef.current = currentSnapshot
          setAutoSaveState('saved')
          setTimeout(() => {
            setAutoSaveState(prev => (prev === 'saved' ? 'idle' : prev))
          }, 1200)
        } catch {
          setAutoSaveState('error')
        }
      })
    }, 500)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [contactChannel, contactEmail, contactPhone, currentSnapshot, firstName, gender, lastName, lookingToPlay, onUpdateProfile, preferredPlayTimes, startTransition])

  const autoSaveLabel =
    autoSaveState === 'saving' || isPending
      ? 'Saving...'
      : autoSaveState === 'error'
        ? 'Could not save'
        : 'Saved automatically'

  const inputClass = 'h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'
  const emailSelected = contactChannel === 'email'
  const smsSelected = contactChannel === 'sms'

  const togglePreferredPlayTime = (value: string) => {
    setPreferredPlayTimes((previous) =>
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value],
    )
  }

  const handleSetSports = async (codes: string[]) => {
    await onSetSports(codes)
    setSelectedSportIds(
      sports.filter((sport) => codes.includes(sport.code)).map((sport) => sport.id),
    )
  }

  const handleAvatarSaved = async () => {
    await onAvatarSaved()
    router.refresh()
  }

  const handleJoinVenue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!normalizedDisplayName) {
      setJoinError('Set your display name first, then you can join venues.')
      return
    }
    if (!selectedJoinVenueId) {
      setJoinError('Please select a venue.')
      return
    }

    setJoinError(null)
    startJoiningVenue(async () => {
      try {
        const result = await onJoinVenue(selectedJoinVenueId)
        if (!result.ok) {
          setJoinError(result.error)
          return
        }
        setSelectedJoinVenueId('')
        router.refresh()
      } catch (err: unknown) {
        setJoinError(normalizeActionError(err, 'Failed to join venue'))
      }
    })
  }

  const handleSetPrimaryVenue = (venueId: string) => {
    setVenueActionError(null)
    setPendingVenueAction({ id: venueId, kind: 'primary' })
    startVenueAction(async () => {
      try {
        await onSetPrimaryVenue(venueId)
        setOpenVenueMenuId(null)
        router.refresh()
      } catch (err: unknown) {
        setVenueActionError(normalizeActionError(err, 'Failed to set primary venue'))
      } finally {
        setPendingVenueAction(null)
      }
    })
  }

  const handleDeleteVenue = (venueId: string, venueName: string) => {
    if (!confirm(`Delete ${venueName} from your venues?`)) return

    setVenueActionError(null)
    setPendingVenueAction({ id: venueId, kind: 'delete' })
    startVenueAction(async () => {
      try {
        await onLeaveVenue(venueId)
        setOpenVenueMenuId(null)
        router.refresh()
      } catch (err: unknown) {
        setVenueActionError(normalizeActionError(err, 'Failed to delete venue'))
      } finally {
        setPendingVenueAction(null)
      }
    })
  }

  const handleRemoveSavedVenue = (venueId: string, venueName: string) => {
    if (!confirm(`Delete ${venueName} from your public courts?`)) return

    setVenueActionError(null)
    setPendingVenueAction({ id: venueId, kind: 'remove_saved' })
    startVenueAction(async () => {
      try {
        await onRemoveVenuePreference(venueId)
        setOpenVenueMenuId(null)
        router.refresh()
      } catch (err: unknown) {
        setVenueActionError(normalizeActionError(err, 'Failed to delete public court'))
      } finally {
        setPendingVenueAction(null)
      }
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.28)] sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Profile settings</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Manage how you appear in venues, how invitations reach you, and the quick context unfamiliar players see before they reach out.
            </p>
          </div>
          <div className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium ${
            autoSaveState === 'error'
              ? 'bg-rose-50 text-rose-600'
              : autoSaveState === 'saving' || isPending
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}>
            {autoSaveLabel}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
          <div className="space-y-5">
            <PanelCard title="Basic profile" description="Keep your player identity clear and recognizable.">
              <div className="space-y-6">
                <div>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-slate-900">Display name</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Shown to other players in matches and venues.
                    </p>
                  </div>
                  {profile.display_name ? (
                    <DisplayNameEditForm displayName={profile.display_name} onSave={onSetDisplayName} />
                  ) : (
                    <p className="text-sm text-slate-500">Set your display name to control how you appear.</p>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-slate-900">Full name</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Used for court bookings and partner coordination.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel>First name</FieldLabel>
                      <input
                        name="first_name"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <FieldLabel>Last name</FieldLabel>
                      <input
                        name="last_name"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="mt-4 max-w-[220px]">
                    <FieldLabel>Gender</FieldLabel>
                    <select
                      name="gender"
                      value={gender ?? 'unspecified'}
                      onChange={e => setGender((e.target.value as Profile['gender']) ?? 'unspecified')}
                      className={inputClass}
                    >
                      <option value="unspecified">Unspecified</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                    <p className="mt-2 text-sm text-slate-500">
                      Used only as lightweight roster guidance for men&apos;s, women&apos;s, and mixed doubles.
                    </p>
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard
              title="Playing availability"
              description="Lightweight signals that help the right people know when to invite you."
            >
              <div className="space-y-5">
                <div>
                  <FieldLabel>Looking to play</FieldLabel>
                  <div className="flex flex-wrap gap-2.5">
                    {LOOKING_TO_PLAY_OPTIONS.map((option) => {
                      const selected = lookingToPlay === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLookingToPlay(option.value)}
                          className={`inline-flex items-center rounded-full border px-3.5 py-2 text-sm transition ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                          }`}
                          aria-pressed={selected}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <FieldLabel>Preferred times</FieldLabel>
                  <div className="flex flex-wrap gap-2.5">
                    {PREFERRED_PLAY_TIME_OPTIONS.map((option) => {
                      const selected = preferredPlayTimes.includes(option.value)
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => togglePreferredPlayTime(option.value)}
                          className={`inline-flex items-center rounded-full border px-3.5 py-2 text-sm transition ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                          }`}
                          aria-pressed={selected}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    Other players see these as friendly planning cues, not a strict schedule.
                  </p>
                </div>
              </div>
            </PanelCard>

            {sports.length > 0 && (
              <PanelCard title="Sports" description="Choose the sports you play.">
                <SportsPreferenceForm
                  sports={sports}
                  initialSportIds={mySportIds}
                  onSave={handleSetSports}
                />
              </PanelCard>
            )}

            {sports.length > 0 && (
              <PanelCard
                title="Sport profiles"
                description="Each sport gets its own playing profile, competition context, and gear notes."
              >
                <SportProfilesEditor
                  sports={sports}
                  activeSportIds={selectedSportIds}
                  initialProfiles={mySportProfiles}
                  onSaveProfile={onSaveSportProfile}
                />
              </PanelCard>
            )}
          </div>

          <div className="space-y-5">
            <PanelCard title="Photo">
              <AvatarUpload
                userId={userId}
                currentAvatarUrl={profile.avatar_url ?? null}
                onSaved={handleAvatarSaved}
              />
            </PanelCard>

            <PanelCard title="Invitation contact" description="Choose how invitations reach you.">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setContactChannel('email')}
                    className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                      emailSelected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                    aria-pressed={emailSelected}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactChannel('sms')}
                    className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                      smsSelected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                    aria-pressed={smsSelected}
                  >
                    SMS
                  </button>
                </div>

                <div className="grid gap-4">
                  <div className={`rounded-[22px] border p-4 transition ${
                    emailSelected ? 'border-slate-300 bg-slate-50/80 shadow-sm' : 'border-slate-200 bg-white'
                  }`}>
                    <FieldLabel>Contact email</FieldLabel>
                    <input
                      type="email"
                      name="contact_email"
                      placeholder={userEmail ?? 'Your registered email'}
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className={`rounded-[22px] border p-4 transition ${
                    smsSelected ? 'border-slate-300 bg-slate-50/80 shadow-sm' : 'border-slate-200 bg-white'
                  }`}>
                    <FieldLabel>Contact phone</FieldLabel>
                    <input
                      type="tel"
                      name="contact_phone"
                      placeholder="+1 234 567 8900"
                      value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </PanelCard>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <SectionCard title="Venues">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-slate-500">The venues you joined</p>
              {myIdentities.length === 0 ? (
                <div className="mt-3 rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No venues yet.
                </div>
              ) : (
                <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-2 py-1.5">
                  {myIdentities.map(identity => {
                    const menuKey = `joined:${identity.id}`
                    return (
                      <div
                        key={identity.id}
                        className="flex items-center justify-between gap-4 rounded-[16px] px-2 py-2"
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span className="truncate text-[15px] font-semibold text-slate-900">{identity.venue.name}</span>
                          {profile.primary_venue_id === identity.venue_id && (
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                              primary
                            </span>
                          )}
                        </div>

                        <div
                          className="relative shrink-0"
                          data-venue-menu-root={menuKey}
                        >
                          <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={openVenueMenuId === menuKey}
                            onClick={() => {
                              setVenueActionError(null)
                              setOpenVenueMenuId(prev => (prev === menuKey ? null : menuKey))
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                          >
                            <span className="flex items-center gap-1" aria-hidden="true">
                              <span className="h-1 w-1 rounded-full bg-current" />
                              <span className="h-1 w-1 rounded-full bg-current" />
                              <span className="h-1 w-1 rounded-full bg-current" />
                            </span>
                          </button>
                          {openVenueMenuId === menuKey && (
                            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                              {profile.primary_venue_id === identity.venue_id && (
                                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Primary venue
                                </div>
                              )}
                              {profile.primary_venue_id !== identity.venue_id && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryVenue(identity.venue_id)}
                                  disabled={isVenueActionPending}
                                  className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {pendingVenueAction?.id === identity.venue_id && pendingVenueAction.kind === 'primary'
                                    ? 'Setting primary...'
                                    : 'Set primary'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteVenue(identity.venue_id, identity.venue.name)}
                                disabled={isVenueActionPending}
                                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {pendingVenueAction?.id === identity.venue_id && pendingVenueAction.kind === 'delete'
                                  ? 'Deleting...'
                                  : 'Delete'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {publicVenuePrefs.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-500">The public courts you play</p>
                <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-2 py-1.5">
                  {publicVenuePrefs.map(venue => {
                    const menuKey = `public:${venue.id}`
                    return (
                      <div
                        key={venue.id}
                        className="flex items-center justify-between gap-4 rounded-[16px] px-2 py-2"
                      >
                        <span className="truncate text-[15px] font-medium text-slate-900">{venue.name}</span>

                        <div
                          className="relative shrink-0"
                          data-venue-menu-root={menuKey}
                        >
                          <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={openVenueMenuId === menuKey}
                            onClick={() => {
                              setVenueActionError(null)
                              setOpenVenueMenuId(prev => (prev === menuKey ? null : menuKey))
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                          >
                            <span className="flex items-center gap-1" aria-hidden="true">
                              <span className="h-1 w-1 rounded-full bg-current" />
                              <span className="h-1 w-1 rounded-full bg-current" />
                              <span className="h-1 w-1 rounded-full bg-current" />
                            </span>
                          </button>
                          {openVenueMenuId === menuKey && (
                            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                              <button
                                type="button"
                                onClick={() => handleRemoveSavedVenue(venue.id, venue.name)}
                                disabled={isVenueActionPending}
                                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {pendingVenueAction?.id === venue.id && pendingVenueAction.kind === 'remove_saved'
                                  ? 'Deleting...'
                                  : 'Delete'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {venueActionError && <p className="mt-3 text-sm text-rose-600">{venueActionError}</p>}

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Add a venue</h3>
              <p className="mt-1 text-sm text-slate-500">
                Choose a venue. Your display name is used automatically.
              </p>
            </div>
            {!normalizedDisplayName && joinableVenues.length > 0 && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Set your display name above before joining a venue.
              </div>
            )}
            {joinableVenues.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">You have already joined all available venues.</p>
            ) : (
              <form onSubmit={handleJoinVenue} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <FieldLabel>Venue</FieldLabel>
                  <select
                    value={selectedJoinVenueId}
                    onChange={e => {
                      setSelectedJoinVenueId(e.target.value)
                      setJoinError(null)
                    }}
                    className={inputClass}
                  >
                    <option value="">Select a venue...</option>
                    {joinableVenues.map(venue => (
                      <option key={venue.id} value={venue.id}>{venue.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isJoiningVenue || !selectedJoinVenueId || !normalizedDisplayName}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isJoiningVenue ? 'Joining...' : 'Join venue'}
                </button>
              </form>
            )}
            {joinError && <p className="mt-3 text-sm text-rose-600">{joinError}</p>}
          </div>
        </SectionCard>

        <SectionCard
          title="Discovery and invites"
          description="Choose where you appear and who can invite you."
          tone="soft"
        >
          <DiscoveryAndInvitesSection
            showTitle={false}
            showInVenueMemberDiscovery={profile.show_in_venue_member_discovery ?? true}
            allowNonGroupInvites={profile.allow_non_group_invites ?? true}
            identities={myIdentities}
            onSaveGlobal={onSaveGlobalPreferences}
            onSetVenuePreferences={onSetVenuePreferences}
          />
        </SectionCard>
      </div>
    </div>
  )
}
