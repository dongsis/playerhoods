'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MatchListItem } from '@/lib/api/matches'
import { getContactPlayerResolution, type ContactPlayerResolved } from '@/lib/api/roster'
import { getPublicPlayerProfile, type PublicPlayerProfile, type PublicSportProfile } from '@/lib/api/player-profiles'
import {
  getAvailabilityStatusDotClass,
  getLevelLabel,
  getPreferredPlayTimeLabel,
  getSportFormatOptions,
} from '@/lib/profile-options'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Avatar } from './Avatar'

type ContactGender = 'male' | 'female' | 'unspecified' | null | undefined

export type ParticipantQuickPreviewTarget = {
  userId?: string | null
  guestId?: string | null
  displayName: string
  avatarUrl?: string | null
  gender?: ContactGender
  savedByViewer?: boolean
  sharesGroupWithViewer?: boolean
}

interface Props {
  open: boolean
  anchor: { x: number; y: number } | null
  target: ParticipantQuickPreviewTarget
  items?: MatchListItem[]
  onClose: () => void
}

const CARD_WIDTH = 344
const CARD_HEIGHT = 420

function formatGenderLabel(gender: ContactGender): string | null {
  switch (gender) {
    case 'female':
      return 'Female'
    case 'male':
      return 'Male'
    case 'unspecified':
      return 'Prefer not to say'
    default:
      return null
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

function formatList(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
}

function clampPosition(anchor: { x: number; y: number } | null) {
  if (!anchor || typeof window === 'undefined') {
    return { left: 12, top: 12 }
  }

  const maxWidth = Math.min(CARD_WIDTH, window.innerWidth - 24)
  const left = Math.max(12, Math.min(anchor.x + 12, window.innerWidth - maxWidth - 12))
  const top = Math.max(12, Math.min(anchor.y + 12, window.innerHeight - CARD_HEIGHT - 12))
  return { left, top }
}

export function ParticipantQuickPreview({
  open,
  anchor,
  target,
  items = [],
  onClose,
}: Props) {
  const [contact, setContact] = useState<ContactPlayerResolved | null>(null)
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    const supabase = createSupabaseBrowserClient()
    setLoading(true)
    setError(null)
    setContact(null)
    setProfile(null)

    const load = async () => {
      try {
        if (target.userId) {
          const nextProfile = await getPublicPlayerProfile(supabase, target.userId)
          if (!cancelled) setProfile(nextProfile)
          return
        }

        if (target.guestId) {
          const contacts = await getContactPlayerResolution(supabase)
          const nextContact = contacts.find((item) => item.guest_id === target.guestId) ?? null
          if (!cancelled) setContact(nextContact)

          if (nextContact?.linked_user_id) {
            const nextProfile = await getPublicPlayerProfile(supabase, nextContact.linked_user_id)
            if (!cancelled) setProfile(nextProfile)
          }
        }
      } catch (loadError) {
        if (!cancelled) setError((loadError as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, target.guestId, target.userId])

  useEffect(() => {
    if (!open) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, open])

  const primarySportProfile = useMemo(
    () => pickPrimarySportProfile(profile),
    [profile],
  )

  const position = useMemo(
    () => clampPosition(anchor),
    [anchor],
  )

  const displayName = profile?.display_name
    ?? contact?.display_name
    ?? target.displayName

  const avatarUrl = profile?.avatar_url
    ?? target.avatarUrl
    ?? null

  const statusClassName = getAvailabilityStatusDotClass(contact?.availability_status ?? profile?.looking_to_play)

  const formatLabels = useMemo(() => {
    if (!primarySportProfile) return [] as string[]

    return primarySportProfile.preferred_formats
      .map((value) =>
        getSportFormatOptions(primarySportProfile.sport_code).find((option) => option.value === value)?.label ?? value,
      )
      .filter(Boolean)
      .slice(0, 2)
  }, [primarySportProfile])

  const preferredTimes = useMemo(() => (
    formatList(
      (profile?.preferred_play_times ?? [])
        .map((value) => getPreferredPlayTimeLabel(value) ?? value)
        .filter(Boolean),
    ).slice(0, 2)
  ), [profile])

  const playStyles = useMemo(
    () => splitPlayStyle(primarySportProfile?.play_style).slice(0, 2),
    [primarySportProfile],
  )

  const sharedMatchCount = useMemo(() => {
    if (profile?.shared_match_count) return profile.shared_match_count
    if (!target.guestId) return 0

    return items.filter((item) =>
      item.participants.some((participant) => participant.guest_id === target.guestId),
    ).length
  }, [items, profile?.shared_match_count, target.guestId])

  const connections = useMemo(() => {
    const next: string[] = []

    if (profile?.shared_venue_names?.length) {
      next.push(`Both play at ${profile.shared_venue_names.join(', ')}`)
    }

    if (profile?.shared_group_names?.length) {
      next.push(`Shared groups: ${profile.shared_group_names.join(', ')}`)
    } else if (target.sharesGroupWithViewer) {
      next.push('You share at least one group connection')
    }

    if (sharedMatchCount > 0) {
      next.push(sharedMatchCount === 1 ? 'Played 1 match together' : `Played ${sharedMatchCount} matches together`)
    }

    return next.slice(0, 3)
  }, [profile?.shared_group_names, profile?.shared_venue_names, sharedMatchCount, target.sharesGroupWithViewer])

  const detailItems = useMemo(() => {
    const next: Array<{ label: string; value: string }> = []
    const genderLabel = formatGenderLabel(contact?.gender ?? profile?.gender ?? target.gender)

    if (genderLabel) {
      next.push({ label: 'Gender', value: genderLabel })
    }
    if (contact?.phone?.trim()) {
      next.push({ label: 'Phone', value: contact.phone.trim() })
    }
    if (contact?.email?.trim()) {
      next.push({ label: 'Email', value: contact.email.trim() })
    }
    if (contact?.linked_user_id) {
      next.push({ label: 'Account', value: 'Linked PlayerHoods account' })
    }

    return next.slice(0, 4)
  }, [contact, profile?.gender, target.gender])

  const levelLabel = getLevelLabel(primarySportProfile?.level) ?? primarySportProfile?.level ?? null
  const isContact = Boolean(target.guestId && !target.userId)
  const isOwner = Boolean(contact)

  if (!open || !anchor) return null
  if (typeof document === 'undefined') return null

  return createPortal((
    <div
      className="fixed inset-0 z-[145]"
      onMouseDown={(event) => {
        if (event.button !== 0) return
        onClose()
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        role="dialog"
        aria-modal="false"
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
        className="fixed w-[344px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        style={{ left: position.left, top: position.top }}
      >
        <div className="max-h-[min(420px,calc(100vh-24px))] overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative">
                <Avatar
                  src={avatarUrl}
                  displayName={displayName}
                  size="md"
                  fallback={isContact ? 'contact' : 'initial'}
                  className="h-12 w-12 border border-white shadow-sm"
                />
                {statusClassName ? (
                  <span
                    className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${statusClassName}`}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-black tracking-tight text-slate-900">
                  {displayName}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {!isContact ? (
                    <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-600">
                      Player
                    </span>
                  ) : null}
                  {isOwner ? (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      My Contact
                    </span>
                  ) : null}
                  {target.savedByViewer ? (
                    <span className="rounded-full border border-yellow-100 bg-yellow-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-600">
                      Saved
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              Loading player details...
            </div>
          ) : error ? (
            <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : (
            <>
              {(levelLabel || formatLabels.length > 0) ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {levelLabel ? (
                    <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                      {levelLabel}
                    </span>
                  ) : null}
                  {formatLabels.map((format) => (
                    <span key={format} className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-600">
                      {format}
                    </span>
                  ))}
                </div>
              ) : null}

              {connections.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {connections.map((text) => (
                    <div key={text} className="flex items-start gap-2 text-sm font-medium text-slate-600">
                      <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {detailItems.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {detailItems.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                      <div className="mt-1 text-sm font-medium text-slate-700">{item.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {playStyles.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {playStyles.map((style) => (
                    <span key={style} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {style}
                    </span>
                  ))}
                </div>
              ) : null}

              {preferredTimes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {preferredTimes.map((time) => (
                    <span key={time} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      {time}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}
