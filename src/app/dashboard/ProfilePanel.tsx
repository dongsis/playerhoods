'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, VenueIdentity, Venue, Sport, UserSportProfile } from '@/lib/types/database'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  approveMatchProxyBinding,
  declineMatchProxyBinding,
  getMatchProxyDashboard,
  revokeMatchProxyBindingSelf,
  type MatchProxyDashboardRow,
} from '@/lib/api/matches'
import { AvatarUpload } from './AvatarUpload'
import { DisplayNameEditForm } from '@/app/profile/DisplayNameEditForm'
import { SportsPreferenceForm } from '@/app/profile/SportsPreferenceForm'
import { DiscoveryAndInvitesSection } from '@/app/profile/DiscoveryAndInvitesSection'
import { SportProfilesEditor } from '@/app/profile/SportProfilesEditor'
import {
  PREFERRED_PLAY_TIME_OPTIONS,
  getAvailabilityStatusDotClass,
  getPreferredPlayTimeLabel,
} from '@/lib/profile-options'
import { getVenueDisplayName } from '@/lib/venues/display'

type ProfileData = Pick<
  Profile,
  | 'display_name'
  | 'first_name'
  | 'last_name'
  | 'gender'
  | 'availability_status'
  | 'availability_note'
  | 'availability_until'
  | 'primary_venue_id'
  | 'contact_channel'
  | 'contact_email'
  | 'contact_phone'
  | 'avatar_url'
  | 'show_in_venue_member_discovery'
  | 'allow_non_group_invites'
  | 'shared_group_join_preference'
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
    shared_group_join_preference?: 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
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
    ? 'border-[#E2E8F0] bg-[#F8FBFF]'
    : 'border-[#E2E8F0] bg-white'

  return (
    <section className={`rounded-[28px] border ${toneClass} p-6 shadow-[0_18px_40px_-30px_rgba(30,41,59,0.18)]`}>
      <div className="mb-5">
        <h2 className="text-h2 text-[#1E293B]">{title}</h2>
        {description && (
          <p className="mt-1 text-body-sub text-[#64748B]">{description}</p>
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
    <section className="rounded-[28px] border border-[#E2E8F0] bg-white p-6 shadow-[0_16px_40px_-28px_rgba(30,41,59,0.16)]">
      <div className="mb-4">
        <h2 className="text-h2 text-[#1E293B]">{title}</h2>
        {description && (
          <p className="mt-1 text-body-sub text-[#64748B]">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-label mb-1.5 block">
      {children}
    </label>
  )
}

function AccordionSection({
  title,
  description,
  eyebrow,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  description?: string
  eyebrow?: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className={`overflow-hidden rounded-[28px] border transition-all ${
      isOpen
        ? 'border-[#D7E0EC] bg-white shadow-[0_20px_46px_-32px_rgba(30,41,59,0.18)]'
        : 'border-[#E2E8F0] bg-white shadow-[0_14px_30px_-28px_rgba(30,41,59,0.12)]'
    }`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition ${
          isOpen ? 'bg-[#F8FBFF]' : 'bg-white'
        }`}
      >
        <div className="min-w-0">
          <div className="text-h2 text-[#1E293B]">{title}</div>
        </div>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-lg font-medium transition ${
          isOpen
            ? 'border-[#C25E46] bg-[#C25E46] text-white'
            : 'border-[#E2E8F0] bg-[#F8FBFF] text-[#64748B]'
        }`}>
          {isOpen ? '−' : '+'}
        </span>
      </button>
      <div className={`${isOpen ? 'block border-t border-[#EEF3F8]' : 'hidden'}`}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </section>
  )
}

function SubCard({
  title,
  description,
  children,
}: {
  title?: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-[#F8FBFF] p-5">
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-title-main text-[#1E293B]">{title}</h3>}
          {description && <p className="text-body-sub mt-1 text-[#64748B]">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

type AvailabilityMode = 'very_open' | 'open' | 'occasional' | 'busy' | 'away' | 'not_looking'

const AVAILABILITY_MODE_OPTIONS: Array<{
  value: AvailabilityMode
  label: string
  availabilityStatus: NonNullable<Profile['availability_status']>
  lookingToPlay: string
}> = [
  {
    value: 'very_open',
    label: 'Very open',
    availabilityStatus: 'available',
    lookingToPlay: 'very_open',
  },
  {
    value: 'open',
    label: 'Open',
    availabilityStatus: 'available',
    lookingToPlay: 'open',
  },
  {
    value: 'occasional',
    label: 'Occasionally',
    availabilityStatus: 'available',
    lookingToPlay: 'occasional',
  },
  {
    value: 'busy',
    label: 'Busy',
    availabilityStatus: 'busy',
    lookingToPlay: 'quite_full',
  },
  {
    value: 'away',
    label: 'Away',
    availabilityStatus: 'away',
    lookingToPlay: 'not_looking',
  },
  {
    value: 'not_looking',
    label: 'Not looking right now',
    availabilityStatus: 'inactive',
    lookingToPlay: 'not_looking',
  },
]

function deriveAvailabilityMode(
  availabilityStatus: Profile['availability_status'] | null | undefined,
  lookingToPlay: string | null | undefined,
): AvailabilityMode {
  if (availabilityStatus === 'away') return 'away'
  if (availabilityStatus === 'inactive') return 'not_looking'
  if (availabilityStatus === 'busy') return 'busy'
  if (lookingToPlay === 'very_open') return 'very_open'
  if (lookingToPlay === 'open') return 'open'
  if (lookingToPlay === 'occasional') return 'occasional'
  if (lookingToPlay === 'not_looking') return 'not_looking'
  return 'open'
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

function formatProxyDate(value: string | null | undefined): string {
  if (!value) return 'recently'
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return 'recently'
  }
}

function AvailabilityDot({ value }: { value: string | null | undefined }) {
  const dotClassName = getAvailabilityStatusDotClass(value)
  if (!dotClassName) return null
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClassName}`} aria-hidden="true" />
}

function formatPreferredTimeChip(value: string): string {
  return getPreferredPlayTimeLabel(value) ?? value
}

function PreferredTimesField({
  preferredPlayTimes,
  customPreferredTime,
  onTogglePreset,
  onRemove,
  onCustomPreferredTimeChange,
  onAddCustom,
}: {
  preferredPlayTimes: string[]
  customPreferredTime: string
  onTogglePreset: (value: string) => void
  onRemove: (value: string) => void
  onCustomPreferredTimeChange: (value: string) => void
  onAddCustom: () => void
}) {
  const availablePresets = PREFERRED_PLAY_TIME_OPTIONS.filter(
    (option) => !preferredPlayTimes.includes(option.value),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {preferredPlayTimes.length > 0 ? (
          preferredPlayTimes.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRemove(value)}
              className="text-body-main inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3.5 py-2 text-white shadow-sm transition hover:bg-slate-700"
            >
              <span>{formatPreferredTimeChip(value)}</span>
              <span aria-hidden="true" className="text-body-sub leading-none text-slate-200">×</span>
            </button>
          ))
        ) : (
          <p className="text-body-sub text-slate-500">No preferred times added yet.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {availablePresets.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onTogglePreset(option.value)}
            className="text-body-main inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={customPreferredTime}
          onChange={e => onCustomPreferredTimeChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAddCustom()
            }
          }}
          placeholder="Add custom time, e.g. Friday lunch or Weeknights after 8"
          className="text-body-main h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
        />
        <button
          type="button"
          onClick={onAddCustom}
          className="text-body-main inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Add time
        </button>
      </div>
    </div>
  )
}

function MatchProxySection({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const [rows, setRows] = useState<MatchProxyDashboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actingBindingId, setActingBindingId] = useState<string | null>(null)

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    try {
      const nextRows = await getMatchProxyDashboard(supabase)
      setRows(nextRows)
    } catch (loadError) {
      setRows([])
      setError(normalizeActionError(loadError, 'Failed to load Match Proxy settings'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const pendingRows = rows.filter((row) => row.status === 'pending')
  const forMeRows = rows.filter((row) => row.relationship_role === 'for_me' && row.status === 'active')
  const iActForRows = rows.filter((row) => row.relationship_role === 'i_act_for' && row.status === 'active')
  const historyRows = rows.filter((row) => row.status === 'revoked' || row.status === 'rejected' || row.status === 'expired')

  const sections: Array<{ title: string; rows: MatchProxyDashboardRow[]; empty: string }> = [
    {
      title: 'Pending',
      rows: pendingRows,
      empty: 'No pending Match Proxy requests need attention right now.',
    },
    {
      title: 'Who Can Act for Me',
      rows: forMeRows,
      empty: 'No active Match Proxy relationships are enabled for you yet.',
    },
    {
      title: 'I Can Act For',
      rows: iActForRows,
      empty: 'You are not currently acting as Match Proxy for anyone else.',
    },
    {
      title: 'History',
      rows: historyRows,
      empty: 'No prior Match Proxy decisions yet.',
    },
  ]

  const handleApprove = async (bindingId: string) => {
    const supabase = createSupabaseBrowserClient()
    setActingBindingId(bindingId)
    setError(null)
    setMessage(null)
    try {
      await approveMatchProxyBinding(supabase, bindingId)
      setMessage('Match Proxy request approved.')
      await loadRows()
      router.refresh()
    } catch (actionError) {
      setError(normalizeActionError(actionError, 'Failed to approve Match Proxy request'))
    } finally {
      setActingBindingId(null)
    }
  }

  const handleDecline = async (bindingId: string) => {
    const supabase = createSupabaseBrowserClient()
    setActingBindingId(bindingId)
    setError(null)
    setMessage(null)
    try {
      await declineMatchProxyBinding(supabase, bindingId)
      setMessage('Match Proxy request declined.')
      await loadRows()
      router.refresh()
    } catch (actionError) {
      setError(normalizeActionError(actionError, 'Failed to decline Match Proxy request'))
    } finally {
      setActingBindingId(null)
    }
  }

  const handleRevoke = async (bindingId: string) => {
    const supabase = createSupabaseBrowserClient()
    setActingBindingId(bindingId)
    setError(null)
    setMessage(null)
    try {
      await revokeMatchProxyBindingSelf(supabase, bindingId)
      setMessage('Match Proxy relationship revoked.')
      await loadRows()
      router.refresh()
    } catch (actionError) {
      setError(normalizeActionError(actionError, 'Failed to revoke Match Proxy relationship'))
    } finally {
      setActingBindingId(null)
    }
  }

  const summary = (
    <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Pending requests', pendingRows.length],
          ['Active proxies for me', forMeRows.length],
          ['People I can act for', iActForRows.length],
        ].map(([label, count]) => (
          <div
            key={label}
            className="rounded-[26px] border border-slate-200 bg-slate-50/85 p-5"
          >
            <div className="text-label text-slate-400">{label}</div>
            <div className="text-h1 mt-2 text-slate-900">{count}</div>
          </div>
        ))}
      </div>
  )

  const body = (
    <>
      {message && (
        <div className="text-body-main rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="text-body-main rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {error}
        </div>
      )}
      {loading ? (
        <div className="text-body-main rounded-[26px] border border-slate-200 bg-slate-50 px-4 py-5 text-slate-500">
          Loading Match Proxy settings...
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[28px] border border-slate-200 bg-slate-50/65 p-5"
            >
              <div>
                <h3 className="text-h2 text-slate-900">{section.title}</h3>
                <p className="text-body-sub mt-1 leading-6 text-slate-500">
                  {section.title === 'Pending'
                    ? 'Only direct Match Proxy changes that need your attention appear here.'
                    : section.title === 'Who Can Act for Me'
                      ? 'These people can manage player-side match actions for you while your own controls stay fully active.'
                      : section.title === 'I Can Act For'
                        ? 'These are the people whose player-side match actions you can currently manage.'
                        : 'Past Match Proxy decisions stay visible here without turning Hoods into a notification center.'}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {section.rows.length === 0 ? (
                  <div className="text-body-main rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-slate-500">
                    {section.empty}
                  </div>
                ) : (
                  section.rows.map((row) => {
                    const isActing = actingBindingId === row.binding_id
                    const statusTone =
                      row.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : row.status === 'pending'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                    const relationshipCopy =
                      row.relationship_role === 'for_me'
                        ? `${row.proxy_name} can act for you`
                        : `You can act for ${row.principal_name}`

                    return (
                      <div key={row.binding_id} className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-title-main text-slate-900">{relationshipCopy}</h4>
                              <span className={`text-body-sub rounded-full px-2.5 py-1 font-medium ${statusTone}`}>
                                {row.status}
                              </span>
                            </div>
                            <p className="text-body-sub mt-2 leading-5 text-slate-500">
                              {row.relationship_role === 'for_me'
                                ? 'A Match Proxy can only handle player-side match actions. Organizer powers do not transfer.'
                                : 'You can only handle player-side match actions for this person. Organizer powers do not transfer.'}
                            </p>
                            <p className="text-body-sub mt-2 text-slate-400">
                              Updated {formatProxyDate(row.updated_at)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {row.can_approve && (
                              <button
                                type="button"
                                onClick={() => void handleApprove(row.binding_id)}
                                disabled={isActing}
                                className="text-body-sub rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                              >
                                {isActing ? 'Working...' : 'Approve'}
                              </button>
                            )}
                            {row.can_decline && (
                              <button
                                type="button"
                                onClick={() => void handleDecline(row.binding_id)}
                                disabled={isActing}
                                className="text-body-sub rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                              >
                                {isActing ? 'Working...' : 'Decline'}
                              </button>
                            )}
                            {row.can_revoke && (
                              <button
                                type="button"
                                onClick={() => void handleRevoke(row.binding_id)}
                                disabled={isActing}
                                className="text-body-sub rounded-full border border-rose-200 bg-white px-3 py-1.5 font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
                              >
                                {isActing ? 'Working...' : 'Revoke'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )

  if (embedded) {
    return (
      <div id="match-proxy" className="space-y-5">
        {summary}
        {body}
      </div>
    )
  }

  return (
    <section
      id="match-proxy"
      className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.28)] sm:p-8"
    >
      <div className="max-w-2xl">
        <h2 className="text-h1 text-slate-900">Proxy Management</h2>
        <p className="text-body-main mt-2 leading-6 text-slate-600">
          Long-term delegate relationships for player-side match actions.
        </p>
      </div>
      <div className="mt-6 space-y-5">
        {summary}
        {body}
      </div>
    </section>
  )
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
  const [activeSection, setActiveSection] = useState('basic')
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
  const [availabilityStatus, setAvailabilityStatus] = useState<Profile['availability_status']>(profile.availability_status ?? 'available')
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>(
    deriveAvailabilityMode(profile.availability_status, profile.looking_to_play),
  )
  const [availabilityNote, setAvailabilityNote] = useState(profile.availability_note ?? '')
  const [availabilityUntil, setAvailabilityUntil] = useState(profile.availability_until ?? '')
  const [contactEmail, setContactEmail] = useState(profile.contact_email ?? '')
  const [contactPhone, setContactPhone] = useState(profile.contact_phone ?? '')
  const [contactChannel, setContactChannel] = useState<'email' | 'sms'>(profile.contact_channel === 'sms' ? 'sms' : 'email')
  const [lookingToPlay, setLookingToPlay] = useState(profile.looking_to_play ?? '')
  const [preferredPlayTimes, setPreferredPlayTimes] = useState<string[]>(
    profile.preferred_play_times ?? [],
  )
  const [customPreferredTime, setCustomPreferredTime] = useState('')
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
    availability_status: availabilityStatus,
    availability_note: availabilityNote,
    availability_until: availabilityUntil,
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
    const nextAvailabilityStatus = profile.availability_status ?? 'available'
    const nextAvailabilityNote = profile.availability_note ?? ''
    const nextAvailabilityUntil = profile.availability_until ?? ''
    const nextContactEmail = profile.contact_email ?? ''
    const nextContactPhone = profile.contact_phone ?? ''
    const nextContactChannel = profile.contact_channel === 'sms' ? 'sms' : 'email'
    const nextLookingToPlay = profile.looking_to_play ?? ''
    const nextPreferredPlayTimes = profile.preferred_play_times ?? []

    setFirstName(nextFirstName)
    setLastName(nextLastName)
    setGender(nextGender)
    setAvailabilityStatus(nextAvailabilityStatus)
    setAvailabilityMode(deriveAvailabilityMode(nextAvailabilityStatus, nextLookingToPlay))
    setAvailabilityNote(nextAvailabilityNote)
    setAvailabilityUntil(nextAvailabilityUntil)
    setContactEmail(nextContactEmail)
    setContactPhone(nextContactPhone)
    setContactChannel(nextContactChannel)
    setLookingToPlay(nextLookingToPlay)
    setPreferredPlayTimes(nextPreferredPlayTimes)
    setCustomPreferredTime('')
    lastSavedSnapshotRef.current = JSON.stringify({
      first_name: nextFirstName,
      last_name: nextLastName,
      gender: nextGender,
      availability_status: nextAvailabilityStatus,
      availability_note: nextAvailabilityNote,
      availability_until: nextAvailabilityUntil,
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
    profile.availability_status,
    profile.availability_note,
    profile.availability_until,
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
      formData.set('availability_status', availabilityStatus ?? 'available')
      formData.set('availability_note', availabilityNote)
      formData.set('availability_until', availabilityUntil)
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
  }, [availabilityNote, availabilityStatus, availabilityUntil, contactChannel, contactEmail, contactPhone, currentSnapshot, firstName, gender, lastName, lookingToPlay, onUpdateProfile, preferredPlayTimes, startTransition])

  const inputClass = 'text-body-main h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'
  const emailSelected = contactChannel === 'email'
  const smsSelected = contactChannel === 'sms'
  const showAvailabilityDetails =
    availabilityMode === 'busy' || availabilityMode === 'away' || availabilityMode === 'not_looking'

  const handleAvailabilityModeChange = (mode: AvailabilityMode) => {
    const next = AVAILABILITY_MODE_OPTIONS.find((option) => option.value === mode)
    if (!next) return
    setAvailabilityMode(mode)
    setAvailabilityStatus(next.availabilityStatus)
    setLookingToPlay(next.lookingToPlay)
  }

  const toggleSection = (sectionId: string) => {
    setActiveSection((previous) => (previous === sectionId ? '' : sectionId))
  }

  const basicInfoSection = () => (
    <AccordionSection
      title="Basic Info"
      description="Identity, contact, and player context."
      eyebrow="Profile"
      isOpen={activeSection === 'basic'}
      onToggle={() => toggleSection('basic')}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SubCard>
            <div className="space-y-6">
              <div>
                <h4 className="text-label px-1 text-slate-400">Identity</h4>
                <div className="mt-4 flex gap-4 items-start">
                  <div className="shrink-0">
                    <AvatarUpload
                      userId={userId}
                      currentAvatarUrl={profile.avatar_url ?? null}
                      onSaved={handleAvatarSaved}
                      compact
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <FieldLabel>Display name</FieldLabel>
                    {profile.display_name ? (
                      <DisplayNameEditForm displayName={profile.display_name} onSave={onSetDisplayName} />
                    ) : (
                      <p className="text-body-sub text-slate-500">Set your display name to control how you appear.</p>
                    )}
                  </div>
                </div>
              </div>

              {sports.length > 0 && (
                <div className="border-t border-slate-200 pt-5">
                  <FieldLabel>Engaged sports</FieldLabel>
                  <SportsPreferenceForm
                    sports={sports}
                    initialSportIds={mySportIds}
                    onSave={handleSetSports}
                  />
                </div>
              )}

              <div className="border-t border-slate-200 pt-5 max-w-sm">
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
              </div>
            </div>
          </SubCard>
        </div>

        <div className="space-y-5">
          <SubCard>
            <div className="space-y-4">
              <div>
                <h4 className="text-label px-1 text-slate-400">Contact & official</h4>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <label className="text-label text-slate-800">Receive via</label>
                  <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setContactChannel('email')}
                      className={`text-label rounded-md px-3 py-1 transition ${
                        emailSelected ? 'bg-slate-900 text-white' : 'text-slate-400'
                      }`}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactChannel('sms')}
                      className={`text-label rounded-md px-3 py-1 transition ${
                        smsSelected ? 'bg-slate-900 text-white' : 'text-slate-400'
                      }`}
                    >
                      SMS
                    </button>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div>
                    <FieldLabel>Contact email</FieldLabel>
                    <input
                      type="email"
                      name="contact_email"
                      placeholder={userEmail ?? 'Your registered email'}
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      className={`${inputClass} ${emailSelected ? 'border-slate-300 bg-white shadow-sm' : ''}`}
                    />
                  </div>

                  <div>
                    <FieldLabel>Contact phone</FieldLabel>
                    <input
                      type="tel"
                      name="contact_phone"
                      placeholder="+1 234 567 8900"
                      value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)}
                      className={`${inputClass} ${smsSelected ? 'border-slate-300 bg-white shadow-sm' : ''}`}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <FieldLabel>Court booking name</FieldLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    name="first_name"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className={inputClass}
                    placeholder="First name"
                  />
                  <input
                    name="last_name"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className={inputClass}
                    placeholder="Last name"
                  />
                </div>
                <p className="text-body-sub mt-2 px-1 italic text-slate-400">
                  Your real name will be shared with other players in the same match to make court booking easier.
                </p>
              </div>
            </div>
          </SubCard>
        </div>
      </div>
    </AccordionSection>
  )

  const availabilitySection = () => (
    <AccordionSection
      title="Playing Availability"
      description="One place for how open you are and when you usually play."
      eyebrow="Schedule"
      isOpen={activeSection === 'availability'}
      onToggle={() => toggleSection('availability')}
    >
      <SubCard>
        <div className="space-y-5">
          <div>
            <FieldLabel>Current status</FieldLabel>
            <div className="flex flex-wrap gap-2.5">
              {AVAILABILITY_MODE_OPTIONS.map((option) => {
                const selected = availabilityMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleAvailabilityModeChange(option.value)}
                    className={`text-body-main inline-flex items-center rounded-full border px-3.5 py-2 transition ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                    }`}
                    aria-pressed={selected}
                  >
                    <span className="mr-2">
                      <AvailabilityDot value={option.value} />
                    </span>
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {showAvailabilityDetails && (
            <div className="grid gap-4 rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <FieldLabel>Note</FieldLabel>
                <input
                  name="availability_note"
                  value={availabilityNote}
                  onChange={e => setAvailabilityNote(e.target.value)}
                  placeholder="Vacation, exam season, hard to commit right now..."
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>Available again</FieldLabel>
                <input
                  type="date"
                  name="availability_until"
                  value={availabilityUntil}
                  onChange={e => setAvailabilityUntil(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-5">
            <FieldLabel>Preferred times</FieldLabel>
            <PreferredTimesField
              preferredPlayTimes={preferredPlayTimes}
              customPreferredTime={customPreferredTime}
              onTogglePreset={togglePreferredPlayTime}
              onRemove={removePreferredPlayTime}
              onCustomPreferredTimeChange={setCustomPreferredTime}
              onAddCustom={addCustomPreferredTime}
            />
          </div>
        </div>
      </SubCard>
    </AccordionSection>
  )

  const sportProfilesSection = () => sports.length > 0 ? (
    <AccordionSection
      title="Sport Profiles"
      description="One profile per sport."
      eyebrow="Sports"
      isOpen={activeSection === 'sports'}
      onToggle={() => toggleSection('sports')}
    >
      <SportProfilesEditor
        sports={sports}
        activeSportIds={selectedSportIds}
        initialProfiles={mySportProfiles}
        onSaveProfile={onSaveSportProfile}
      />
    </AccordionSection>
  ) : null

  const privacySection = () => (
    <AccordionSection
      title="Privacy & Groups"
      description="Choose where you appear and who can invite you."
      eyebrow="Sharing"
      isOpen={activeSection === 'privacy'}
      onToggle={() => toggleSection('privacy')}
    >
      <SubCard>
        <DiscoveryAndInvitesSection
          showTitle={false}
          showInVenueMemberDiscovery={profile.show_in_venue_member_discovery ?? true}
          allowNonGroupInvites={profile.allow_non_group_invites ?? true}
          sharedGroupJoinPreference={profile.shared_group_join_preference ?? 'approval_required_all'}
          identities={myIdentities}
          onSaveGlobal={onSaveGlobalPreferences}
          onSetVenuePreferences={onSetVenuePreferences}
        />
      </SubCard>
    </AccordionSection>
  )

  const proxySection = () => (
    <AccordionSection
      title="Proxy Management"
      description="Long-term delegate relationships for player-side match actions."
      eyebrow="Delegation"
      isOpen={activeSection === 'proxy'}
      onToggle={() => toggleSection('proxy')}
    >
      <MatchProxySection embedded />
    </AccordionSection>
  )

  const venuesSection = () => (
    <AccordionSection
      title="Venues & Membership"
      description="Your current clubs, public courts, and venue joins."
      eyebrow="Places"
      isOpen={activeSection === 'venues'}
      onToggle={() => toggleSection('venues')}
    >
      <div className="space-y-5">
        <SubCard title="Current venues">
          <div className="space-y-6">
            <div>
              <p className="text-body-main font-medium text-slate-500">The venues you joined</p>
              {myIdentities.length === 0 ? (
                <div className="text-body-main mt-3 rounded-[18px] border border-dashed border-slate-300 bg-white px-4 py-5 text-slate-500">
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
                          <span className="text-title-main truncate text-slate-900">{getVenueDisplayName(identity.venue)}</span>
                          {profile.primary_venue_id === identity.venue_id && (
                            <span className="text-label rounded-full bg-slate-900 px-2.5 py-1 text-white">
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
                                <div className="text-label px-3 py-2 text-slate-400">
                                  Primary venue
                                </div>
                              )}
                              {profile.primary_venue_id !== identity.venue_id && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryVenue(identity.venue_id)}
                                  disabled={isVenueActionPending}
                                  className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                                className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="text-body-main font-medium text-slate-500">The public courts you play</p>
                <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-2 py-1.5">
                  {publicVenuePrefs.map(venue => {
                    const menuKey = `public:${venue.id}`
                    return (
                      <div
                        key={venue.id}
                        className="flex items-center justify-between gap-4 rounded-[16px] px-2 py-2"
                      >
                        <span className="text-title-main truncate text-slate-900">{getVenueDisplayName(venue)}</span>

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
                                className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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

          {venueActionError && <p className="text-body-main mt-4 text-rose-600">{venueActionError}</p>}
        </SubCard>

        <SubCard title="Add a venue" description="Choose a venue. Your display name is used automatically.">
          {!normalizedDisplayName && joinableVenues.length > 0 && (
            <div className="text-body-main mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              Set your display name above before joining a venue.
            </div>
          )}
          {joinableVenues.length === 0 ? (
            <p className="text-body-main leading-6 text-slate-500">You have already joined all available venues.</p>
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
                className="text-body-main inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isJoiningVenue ? 'Joining...' : 'Join venue'}
              </button>
            </form>
          )}
          {joinError && <p className="text-body-main mt-3 text-rose-600">{joinError}</p>}
        </SubCard>
      </div>
    </AccordionSection>
  )

  const renderedProfile = () => (
    <div className="mx-auto max-w-4xl space-y-3">
      <div className="px-1 py-1">
        <div>
          <h1 className="text-h1 text-slate-900">Profile Settings</h1>
        </div>
      </div>

      {basicInfoSection()}
      {venuesSection()}
      {availabilitySection()}
      {sportProfilesSection()}
      {privacySection()}
    </div>
  )

  const togglePreferredPlayTime = (value: string) => {
    setPreferredPlayTimes((previous) =>
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value],
    )
  }

  const removePreferredPlayTime = (value: string) => {
    setPreferredPlayTimes((previous) => previous.filter((item) => item !== value))
  }

  const addCustomPreferredTime = () => {
    const normalized = customPreferredTime.trim()
    if (!normalized) return
    setPreferredPlayTimes((previous) =>
      previous.includes(normalized) ? previous : [...previous, normalized],
    )
    setCustomPreferredTime('')
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

  return renderedProfile()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.28)] sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-h1 text-slate-900">Profile settings</h1>
            <p className="mt-2 text-body-sub text-slate-600">
              Identity, venues, and playing schedule.
            </p>
          </div>
          <div className={`text-body-sub inline-flex items-center rounded-full px-3.5 py-1.5 font-medium ${
            autoSaveState === 'error'
              ? 'bg-rose-50 text-rose-600'
              : autoSaveState === 'saving' || isPending
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}>
            {autoSaveState === 'error'
              ? 'Could not save'
              : autoSaveState === 'saving' || isPending
                ? 'Saving...'
                : 'Live sync'}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
          <div className="space-y-5">
            <PanelCard title="Basic Info" description="Identity, contact, and playing context.">
              <div className="space-y-6">
                <div>
                  <div className="mb-3">
                    <h3 className="text-title-main text-slate-900">Display name</h3>
                    <p className="mt-1 text-body-sub text-slate-500">
                      Shown to other players in matches and venues.
                    </p>
                  </div>
                  {profile.display_name ? (
                    <DisplayNameEditForm displayName={profile.display_name} onSave={onSetDisplayName} />
                  ) : (
                    <p className="text-body-sub text-slate-500">Set your display name to control how you appear.</p>
                  )}
                </div>

                {sports.length > 0 && (
                  <div className="border-t border-slate-200 pt-6">
                    <div className="mb-4">
                      <h3 className="text-title-main text-slate-900">My sports</h3>
                      <p className="mt-1 text-body-sub text-slate-500">
                        Keep your player context light and current.
                      </p>
                    </div>
                    <SportsPreferenceForm
                      sports={sports}
                      initialSportIds={mySportIds}
                      onSave={handleSetSports}
                    />
                  </div>
                )}

                <div className="border-t border-slate-200 pt-6">
                  <div className="mb-4">
                    <h3 className="text-title-main text-slate-900">Full name</h3>
                    <p className="mt-1 text-body-sub text-slate-500">
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
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
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
                      <p className="mt-2 text-body-sub text-slate-500">
                        Used only as lightweight roster guidance for men&apos;s, women&apos;s, and mixed doubles.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="mb-4">
                    <h3 className="text-title-main text-slate-900">Invitation contact</h3>
                    <p className="mt-1 text-body-sub text-slate-500">
                      Choose how invites reach you.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setContactChannel('email')}
                        className={`text-body-main inline-flex items-center rounded-full border px-4 py-2 font-medium transition ${
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
                        className={`text-body-main inline-flex items-center rounded-full border px-4 py-2 font-medium transition ${
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
                </div>
              </div>
            </PanelCard>

            <PanelCard
              title="Playing availability"
              description="One place for how open you are and when you usually play."
            >
              <div className="space-y-5">
                <div>
                  <FieldLabel>Current status</FieldLabel>
                  <div className="flex flex-wrap gap-2.5">
                    {AVAILABILITY_MODE_OPTIONS.map((option) => {
                      const selected = availabilityMode === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleAvailabilityModeChange(option.value)}
                          className={`text-body-main inline-flex items-center rounded-full border px-3.5 py-2 transition ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                          }`}
                          aria-pressed={selected}
                        >
                          <span className="mr-2">
                            <AvailabilityDot value={option.value} />
                          </span>
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {showAvailabilityDetails && (
                  <div className="grid gap-4 rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div>
                      <FieldLabel>Note</FieldLabel>
                      <input
                        name="availability_note"
                        value={availabilityNote}
                        onChange={e => setAvailabilityNote(e.target.value)}
                        placeholder="Vacation, exam season, hard to commit right now..."
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <FieldLabel>Available again</FieldLabel>
                      <input
                        type="date"
                        name="availability_until"
                        value={availabilityUntil}
                        onChange={e => setAvailabilityUntil(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-5">
                  <FieldLabel>Preferred times</FieldLabel>
                  <PreferredTimesField
                    preferredPlayTimes={preferredPlayTimes}
                    customPreferredTime={customPreferredTime}
                    onTogglePreset={togglePreferredPlayTime}
                    onRemove={removePreferredPlayTime}
                    onCustomPreferredTimeChange={setCustomPreferredTime}
                    onAddCustom={addCustomPreferredTime}
                  />
                </div>
              </div>
            </PanelCard>

            {sports.length > 0 && (
              <PanelCard
                title="Sport Profiles"
                description="One profile per sport."
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
          </div>
        </div>
      </section>
      <div className="space-y-6">
        <SectionCard title="Venues & Membership">
          <div className="space-y-6">
            <div>
              <p className="text-body-main font-medium text-slate-500">The venues you joined</p>
              {myIdentities.length === 0 ? (
                <div className="text-body-main mt-3 rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-slate-500">
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
                          <span className="text-title-main truncate text-slate-900">{getVenueDisplayName(identity.venue)}</span>
                          {profile.primary_venue_id === identity.venue_id && (
                            <span className="text-label rounded-full bg-slate-900 px-2.5 py-1 text-white">
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
                                <div className="text-label px-3 py-2 text-slate-400">
                                  Primary venue
                                </div>
                              )}
                              {profile.primary_venue_id !== identity.venue_id && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryVenue(identity.venue_id)}
                                  disabled={isVenueActionPending}
                                  className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                                className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                <p className="text-body-main font-medium text-slate-500">The public courts you play</p>
                <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-2 py-1.5">
                  {publicVenuePrefs.map(venue => {
                    const menuKey = `public:${venue.id}`
                    return (
                      <div
                        key={venue.id}
                        className="flex items-center justify-between gap-4 rounded-[16px] px-2 py-2"
                      >
                        <span className="text-title-main truncate text-slate-900">{getVenueDisplayName(venue)}</span>

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
                                className="text-body-main flex w-full items-center rounded-xl px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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

          {venueActionError && <p className="text-body-main mt-3 text-rose-600">{venueActionError}</p>}

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="mb-4">
              <h3 className="text-title-main text-slate-900">Add a venue</h3>
              <p className="text-body-sub mt-1 text-slate-500">
                Choose a venue. Your display name is used automatically.
              </p>
            </div>
            {!normalizedDisplayName && joinableVenues.length > 0 && (
              <div className="text-body-main mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                Set your display name above before joining a venue.
              </div>
            )}
            {joinableVenues.length === 0 ? (
              <p className="text-body-main leading-6 text-slate-500">You have already joined all available venues.</p>
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
                  className="text-body-main inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isJoiningVenue ? 'Joining...' : 'Join venue'}
                </button>
              </form>
            )}
          {joinError && <p className="text-body-main mt-3 text-rose-600">{joinError}</p>}
          </div>
        </SectionCard>

        <SectionCard
          title="Privacy & Groups"
          description="Choose where you appear and who can invite you."
          tone="soft"
        >
          <DiscoveryAndInvitesSection
            showTitle={false}
            showInVenueMemberDiscovery={profile.show_in_venue_member_discovery ?? true}
            allowNonGroupInvites={profile.allow_non_group_invites ?? true}
            sharedGroupJoinPreference={profile.shared_group_join_preference ?? 'approval_required_all'}
            identities={myIdentities}
            onSaveGlobal={onSaveGlobalPreferences}
            onSetVenuePreferences={onSetVenuePreferences}
          />
        </SectionCard>
      </div>
    </div>
  )
}
