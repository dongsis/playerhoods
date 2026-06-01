'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'
import { ParticipantQuickPreviewTrigger } from '@/app/components/ParticipantQuickPreviewTrigger'
import { SportSectionIcon } from '@/app/components/SportBallIcon'
import { ContactScreenshotImportSection } from '@/app/dashboard/ContactScreenshotImportSection'
import { processDeliveriesAction } from '@/app/matches/[matchId]/process-deliveries-action'
import { createRecurringMatchSeriesAction } from '@/app/matches/recurring-actions'
import type { CreateRecurringMatchSeriesInput, RecurringDirectInviteInput } from '@/lib/api/recurring-matches'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  admissionTargetsToScopeUsers,
  createMatch,
  getAdmissionTargets,
  getMatchListData,
  getVenues,
  getCourts,
  getMatchParticipants,
  inviteGroupToMatch,
  inviteUserToMatch,
  inviteContactGuestToMatch,
  type ScopeUser,
} from '@/lib/api/matches'
import { getGroups, getGroupMembers } from '@/lib/api/groups'
import { listSports, setGuestSports } from '@/lib/api/sports'
import { getInviteCircleList, getInviteCircleSourceLabel, saveContactPlayer } from '@/lib/api/play-network'
import { createRosterGuest, getContactPlayerResolution, type ContactPlayerResolved } from '@/lib/api/roster'
import { getContactInvitationDeliveryStatus } from '@/lib/contact-communication'
import { getAvailabilityStatusLabel } from '@/lib/profile-options'
import { getVenueDisplayName } from '@/lib/venues/display'
import type { AvailabilityStatus, Group, Venue, Court, Sport, MatchCourtPlanMode, MatchDoublesFormat, UserPlayCity, VenueSport } from '@/lib/types/database'

type TooltipState = { kind: 'group-members'; groupId: string } | null

type GroupMemberPreview = {
  count: number
  members: { id: string; name: string }[]
}

type InviteCandidateSource = 'contact_players' | 'saved_players'

type InviteCandidate = {
  key: string
  name: string
  kind: 'user' | 'contact'
  source: InviteCandidateSource
  sourceLabel: string
  sourceLabels: string[]
  gender: 'male' | 'female' | 'unspecified' | null
  availabilityStatus: AvailabilityStatus | null
  availabilityNote?: string | null
  availabilityUntil?: string | null
  userId?: string
  guestId?: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  emailOptedOut?: boolean
  smsOptedOut?: boolean
  hasReachableChannel?: boolean
}

type UserInviteCandidateSeed = {
  userId: string
  name: string
  source: InviteCandidateSource
  sourceLabel: string
  gender?: 'male' | 'female' | 'unspecified' | null
  availabilityStatus?: AvailabilityStatus | null
  availabilityNote?: string | null
  availabilityUntil?: string | null
}

type CandidatePreviewState = {
  candidate: InviteCandidate
}

type CourtSlotSelection = {
  enabled: boolean
  courtId: string
  manualLabel: string
}

type CourtOption = {
  id: string
  label: string
}

const DEFAULT_COURT_OPTIONS: CourtOption[] = Array.from({ length: 20 }, (_, index) => ({
  id: `fallback-crt-${index + 1}`,
  label: `crt ${index + 1}`,
}))

const INVITE_SOURCE_CONFIG: Array<{
  source: InviteCandidateSource
  label: string
}> = [
  { source: 'saved_players', label: 'Saved' },
  { source: 'contact_players', label: 'Contacts' },
]

const INVITE_SOURCE_PRIORITY = new Map<InviteCandidateSource, number>(
  INVITE_SOURCE_CONFIG.map((entry, index) => [entry.source, index]),
)

function buildTimeSlots(): { label: string; value: string }[] {
  const slots: { label: string; value: string }[] = []
  for (let h = 9; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 21 && m > 0) break
      const hh = h.toString().padStart(2, '0')
      const mm = m.toString().padStart(2, '0')
      const value = `${hh}:${mm}`
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h
      const ampm = h >= 12 ? 'PM' : 'AM'
      const label = `${hour12}:${mm} ${ampm}`
      slots.push({ label, value })
    }
  }
  return slots
}

const TIME_SLOTS = buildTimeSlots()

const DS_CARD = 'rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]'
const DS_SECTION_TITLE = 'text-h2 text-[#1E293B]'
const DS_LABEL = 'text-label mb-1 block'
const ADD_PLAYERS_SECTION_LABEL = 'text-[9px] font-extrabold leading-[1.2] tracking-normal normal-case'
const DS_FIELD =
  'text-body-main w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10'
const DS_OPTION_BUTTON =
  'text-body-main rounded-xl border px-4 py-2.5 font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/10'
const DS_OPTION_SELECTED = 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd] shadow-[0_10px_22px_-20px_rgba(13,110,253,0.8)]'
const DS_OPTION_UNSELECTED = 'border-[#E2E8F0] bg-white text-[#52647E] hover:border-[#BFD4EA] hover:bg-[#F8FBFF]'

const COURT_PLAN_OPTIONS: { value: MatchCourtPlanMode; label: string }[] = [
  { value: 'secured', label: 'Court already secured' },
  { value: 'walk_in', label: 'Walk-in / no advance booking' },
  { value: 'self_book_later', label: 'Host will book it later' },
  { value: 'needs_help_booking', label: 'Players can help secure a court' },
]

const PLAYER_REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1440, label: '1 day before' },
  { value: 120, label: '2 hours before' },
  { value: null, label: 'No reminder' },
]

function getDefaultCourtPlanModeForVenueKind(venueKind: Venue['venue_kind'] | null | undefined): MatchCourtPlanMode | null {
  if (!venueKind) return null
  if (venueKind === 'club') return 'secured'
  if (venueKind === 'park' || venueKind === 'community_centre' || venueKind === 'school' || venueKind === 'condo') {
    return 'walk_in'
  }
  return null
}

function ContactAddIcon({ kind }: { kind: 'card' | 'invite' | 'reply' | 'bell' | 'shield' | 'spark' | 'close' | 'people' }) {
  if (kind === 'card') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <rect x="4.2" y="3.2" width="11.6" height="13.6" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.9 13.4c.9-1.4 2-2 3.1-2s2.2.6 3.1 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'invite') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M7.7 12.3 12.3 7.7M8.2 6.1l.8-.8a3.4 3.4 0 0 1 4.8 4.8l-.8.8M11.8 13.9l-.8.8a3.4 3.4 0 0 1-4.8-4.8l.8-.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'reply') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M4.5 5.2h11a1.7 1.7 0 0 1 1.7 1.7v5.8a1.7 1.7 0 0 1-1.7 1.7H8.6L5 16.6v-2.2h-.5a1.7 1.7 0 0 1-1.7-1.7V6.9a1.7 1.7 0 0 1 1.7-1.7Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'bell') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M7.2 15.4h5.6M8.5 16.5a1.7 1.7 0 0 0 3 0M5.8 13.7c.8-.7 1.1-1.5 1.1-2.7V8.8a3.1 3.1 0 0 1 6.2 0V11c0 1.2.3 2 1.1 2.7H5.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'shield') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M10 2.8 15.2 5v4.1c0 3.3-1.8 5.8-5.2 7.9-3.4-2.1-5.2-4.6-5.2-7.9V5L10 2.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="m7.8 9.8 1.4 1.4 3.1-3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'spark') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M10 2.4 11.4 7l4.3 1.5-4.3 1.6L10 14.6l-1.4-4.5-4.3-1.6L8.6 7 10 2.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'people') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <circle cx="7.7" cy="7.2" r="2.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3.8 15c.7-2 2-3 3.9-3s3.2 1 3.9 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="13.6" cy="8.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12.7 12.3c1.5.2 2.6 1 3.2 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function NeedMorePlayersPrompt({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="w-full rounded-xl border border-dashed border-[#D7E3F4] bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-sub font-semibold text-[#64748B]">Need someone not listed?</span>
        <button
          type="button"
          onClick={onAdd}
          className="text-body-sub inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D7E3F4] bg-[#F8FBFF] px-3 py-1.5 font-bold text-[#0B1F44] transition hover:border-[#B8C8DF] hover:bg-white"
        >
          <ContactAddIcon kind="people" />
          <span className="text-base leading-none">+</span>
          Add My Contact
        </button>
      </div>
    </div>
  )
}


const DOUBLES_FORMAT_OPTIONS: { value: MatchDoublesFormat; label: string }[] = [
  { value: 'open', label: 'Open doubles' },
  { value: 'mens_doubles', label: "Men's doubles" },
  { value: 'womens_doubles', label: "Women's doubles" },
  { value: 'mixed_doubles', label: 'Mixed doubles' },
]

const SINGLES_FORMAT_OPTIONS: { value: MatchDoublesFormat; label: string }[] = [
  { value: 'open', label: 'Open singles' },
  { value: 'mens_doubles', label: "Men's singles" },
  { value: 'womens_doubles', label: "Women's singles" },
]

type ReviewInviteItem = {
  label: string
  members?: string[]
}

type OrganizerNotePresetItem = {
  id: string
  chip: string
  full: string
  exclusiveGroup?: 'access' | 'fees'
}

type OrganizerNotePresetGroup = {
  label: string
  items: OrganizerNotePresetItem[]
}

const ORGANIZER_NOTE_PRESETS: OrganizerNotePresetGroup[] = [
  {
    label: 'Access',
    items: [
      { id: 'members_only', chip: 'Members only', full: 'Members only.', exclusiveGroup: 'access' },
      { id: 'guests_welcome', chip: 'Guests welcome', full: 'Guests are welcome.', exclusiveGroup: 'access' },
    ],
  },
  {
    label: 'Fees',
    items: [
      { id: 'no_court_fee', chip: 'No court fee', full: 'No court fee to share.', exclusiveGroup: 'fees' },
      { id: 'guest_fee_applies', chip: 'Guest fee applies', full: 'Guest fee applies.' },
      { id: 'share_court_fee', chip: 'Share court fee', full: 'Please share the court fee.', exclusiveGroup: 'fees' },
    ],
  },
  {
    label: 'Time',
    items: [
      { id: 'early', chip: 'Early', full: 'Please arrive a little early.' },
      { id: 'ontime', chip: 'On time', full: 'Please be on court and ready at start time.' },
    ],
  },
  {
    label: 'Gear',
    items: [
      { id: 'balls', chip: 'Balls', full: 'One player please bring new balls.' },
      { id: 'water', chip: 'Water', full: 'Please bring water.' },
    ],
  },
  {
    label: 'After',
    items: [
      { id: 'drink', chip: 'Beer/Coffee', full: 'Let’s grab a beer or coffee after.' },
      { id: 'meal', chip: 'Meal', full: 'Anyone up for a meal after?' },
      { id: 'photo', chip: 'Photo', full: 'Let’s take a nice court photo.' },
    ],
  },
  {
    label: 'Chat',
    items: [
      { id: 'chat', chip: 'Check chat', full: 'Check chat for updates.' },
    ],
  },
]

const ORGANIZER_NOTE_PRESET_GROUP_SENTENCES = new Map(
  ORGANIZER_NOTE_PRESETS.flatMap((group) => {
    const grouped = group.items
      .filter((item) => item.exclusiveGroup)
      .reduce<Record<string, string[]>>((acc, item) => {
        const key = item.exclusiveGroup as string
        acc[key] ??= []
        acc[key].push(item.full)
        return acc
      }, {})

    return Object.entries(grouped).map(([key, values]) => [key, values] as const)
  }),
)

function parseOrganizerNoteSentences(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function applyOrganizerNotePreset(text: string, item: OrganizerNotePresetItem) {
  const sentences = parseOrganizerNoteSentences(text)
  const groupSentences = item.exclusiveGroup
    ? (ORGANIZER_NOTE_PRESET_GROUP_SENTENCES.get(item.exclusiveGroup) ?? [])
    : []

  const nextSentences = sentences.filter((sentence) => {
    if (sentence === item.full) return false
    if (groupSentences.includes(sentence)) return false
    return true
  })

  nextSentences.push(item.full)
  return nextSentences.join('\n')
}

function formatReviewDate(dateStr: string) {
  if (!dateStr) return 'Not selected'
  const value = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(value.getTime())) return dateStr
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value)
}

function formatReviewTime(timeValue: string) {
  if (!timeValue) return 'Not selected'
  return TIME_SLOTS.find((slot) => slot.value === timeValue)?.label ?? timeValue
}

function formatReviewTimeRange(timeValue: string, durationMinutes: number) {
  if (!timeValue) return 'Not selected'
  const [hoursPart, minutesPart] = timeValue.split(':')
  const hours = Number.parseInt(hoursPart ?? '', 10)
  const minutes = Number.parseInt(minutesPart ?? '', 10)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return formatReviewTime(timeValue)

  const start = new Date(2000, 0, 1, hours, minutes, 0, 0)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return `${formatter.format(start)} - ${formatter.format(end)}`
}

function capitalizeLabel(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value
}

function buildRecurringSeriesName({
  sportLabel,
  venueLabel,
  gameType,
}: {
  sportLabel: string
  venueLabel: string
  gameType: string
}) {
  const parts = [`Weekly ${sportLabel}`]
  if (gameType) {
    parts.push(capitalizeLabel(gameType))
  }
  if (venueLabel && venueLabel !== 'Venue TBD') {
    parts.push(`at ${venueLabel}`)
  }
  return parts.join(' ')
}

function getAvailabilityPriority(status: AvailabilityStatus | null | undefined) {
  switch (status) {
    case 'busy':
      return 1
    case 'away':
      return 2
    case 'inactive':
      return 3
    case 'available':
    default:
      return 0
  }
}

function getAvailabilityDotClass(status: AvailabilityStatus | null | undefined) {
  switch (status) {
    case 'busy':
      return 'bg-amber-400'
    case 'away':
      return 'bg-orange-400'
    case 'inactive':
      return 'bg-slate-300'
    case 'available':
    default:
      return 'bg-emerald-500'
  }
}

function formatAvailabilityUntil(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function getAvailabilityWarning(candidate: {
  availabilityStatus: AvailabilityStatus | null
  availabilityNote?: string | null
  availabilityUntil?: string | null
}) {
  const label = getAvailabilityStatusLabel(candidate.availabilityStatus)
  const untilLabel = formatAvailabilityUntil(candidate.availabilityUntil)

  switch (candidate.availabilityStatus) {
    case 'busy':
      return {
        level: 'busy' as const,
        label: label ?? 'Busy',
        message: candidate.availabilityNote?.trim()
          || (untilLabel ? `Busy lately, maybe back to normal around ${untilLabel}.` : 'Busy lately, may be harder to join.'),
      }
    case 'away':
      return {
        level: 'away' as const,
        label: label ?? 'Away',
        message: candidate.availabilityNote?.trim()
          || (untilLabel ? `Away until around ${untilLabel}.` : 'Temporarily unavailable.'),
      }
    case 'inactive':
      return {
        level: 'inactive' as const,
        label: label ?? 'Inactive',
        message: candidate.availabilityNote?.trim()
          || 'Not actively participating right now.',
      }
    default:
      return null
  }
}

function normalizeCreateError(error: unknown) {
  const message = (error as { message?: string })?.message?.trim()
  if (!message) return 'Failed to create match'
  if (message.includes('new row violates row-level security policy for table "recurring_match_series"')) {
    return 'Recurring match creation was blocked. Please try again once, and if it still fails we should refresh the page.'
  }
  return message
}

function ReviewMatchModal({
  open,
  recurring,
  recurringCount,
  sportLabel,
  venueLabel,
  gameTypeLabel,
  formatLabel,
  dateLabel,
  timeRangeLabel,
  durationLabel,
  courtLabel,
  courtSecured,
  neededLabel,
  directInviteItems,
  requestItems,
  organizerNote,
  error,
  posting,
  onClose,
  onConfirm,
}: {
  open: boolean
  recurring: boolean
  recurringCount: number
  sportLabel: string
  venueLabel: string
  gameTypeLabel: string
  formatLabel: string
  dateLabel: string
  timeRangeLabel: string
  durationLabel: string
  courtLabel: string
  courtSecured: boolean
  neededLabel: string
  directInviteItems: ReviewInviteItem[]
  requestItems: ReviewInviteItem[]
  organizerNote: string
  error: string | null
  posting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1E293B]/38 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[calc(100vh-2rem)] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_18px_44px_-18px_rgba(15,23,42,0.18)]"
      >
        <div className="border-b border-[#F1F5F9] px-6 pb-4 pt-6">
          <h3 className="text-h2 text-[#1E293B]">{recurring ? 'Review Recurring Match' : 'Review Match'}</h3>
          <p className="text-body-sub mt-1 text-[#64748B]">
            {recurring
              ? `Everything looks good? Create ${recurringCount} weekly match instances now.`
              : 'Everything looks good? Post it now.'}
          </p>
        </div>

        <div className="space-y-6 px-6 pb-6 pt-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <p className="text-label">Sport</p>
              <p className="text-title-main mt-0.5 text-[#1E293B]">{sportLabel}</p>
            </div>
            <div>
              <p className="text-label">Venue</p>
              <p className="text-title-main mt-0.5 text-[#1E293B]">{venueLabel}</p>
            </div>
            <div>
              <p className="text-label">Game Type</p>
              <p className="text-title-main mt-0.5 capitalize text-[#1E293B]">{gameTypeLabel}</p>
            </div>
            <div>
              <p className="text-label">Format</p>
              <p className="text-title-main mt-0.5 text-[#1E293B]">{formatLabel}</p>
            </div>
          </div>

          <div className="border-t border-[#F1F5F9]" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-label">Date &amp; Time</p>
              <p className="text-title-main mt-0.5 text-[#1E293B]">
                {dateLabel} <span className="mx-1 text-[#CBD5E1]">|</span> {timeRangeLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-label">Duration</p>
              <p className="text-title-main mt-0.5 text-[#1E293B]">{durationLabel}</p>
            </div>
          </div>

          <div className="border-t border-[#F1F5F9]" />

          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <p className="text-label text-[#94A3B8]">Court</p>
              <p className="text-title-main mt-0.5 text-[#1E293B]">
                {courtLabel}
                {courtSecured ? <span className="text-body-sub ml-1 font-bold text-[#1E293B]">• SECURED</span> : null}
              </p>
            </div>
            <div>
              <p className="text-label text-[#94A3B8]">Needed</p>
              <p className="text-title-main mt-0.5 text-[#1E293B]">{neededLabel}</p>
            </div>
          </div>

          <div className="border-t border-[#F1F5F9]" />

          {recurring ? (
            <>
              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                <p className="text-label">Recurring Setup</p>
                <p className="text-body-main mt-1 text-[#1E293B]">
                  Creates {recurringCount} weekly match instances. Players sign up for each week separately.
                </p>
              </div>
              <div className="border-t border-[#F1F5F9]" />
            </>
          ) : null}

          <div className="space-y-4">
            <p className="text-label">Player Plan</p>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
                <span className="text-label text-[#64748B]">Invited</span>
              </div>
              <div className="flex flex-wrap gap-2 pl-3">
                {directInviteItems.length > 0 ? directInviteItems.map((item) => (
                  <span
                    key={`review-direct-${item.label}`}
                    className="text-body-main inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 font-medium text-[#1E293B]"
                  >
                    <span className="font-semibold">{item.label}</span>
                    {item.members && item.members.length > 0 ? (
                      <span className="text-body-sub truncate font-medium text-[#475569]">
                        · {item.members.join(', ')}
                      </span>
                    ) : null}
                  </span>
                )) : (
                  <span className="text-body-main pl-0 text-slate-300">None</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
                <span className="text-label text-[#64748B]">Open to Join</span>
              </div>
              <div className="flex flex-wrap gap-2 pl-3">
                {requestItems.length > 0 ? requestItems.map((item) => (
                  <span
                    key={`review-request-${item.label}`}
                    className="text-body-main inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 font-medium text-[#1E293B]"
                  >
                    <span className="font-semibold">{item.label}</span>
                    {item.members && item.members.length > 0 ? (
                      <span className="text-body-sub truncate font-medium text-[#475569]">
                        · {item.members.join(', ')}
                      </span>
                    ) : null}
                  </span>
                )) : (
                  <span className="text-body-main pl-0 text-slate-300">None</span>
                )}
              </div>
            </div>
          </div>

          {organizerNote.trim() ? (
            <>
              <div className="border-t border-slate-100" />
              <div>
                <p className="text-label text-slate-400">Host Note</p>
                <p className="text-body-main mt-2 whitespace-pre-line rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 leading-relaxed text-[#1E293B]">
                  {organizerNote.trim()}
                </p>
              </div>
            </>
          ) : null}

          <div className="space-y-3 pt-2">
            {error ? (
              <p className="text-body-main rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-600">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onConfirm}
              disabled={posting}
              className="text-h2 w-full rounded-2xl bg-[#0d6efd] py-4 text-white transition hover:-translate-y-[1px] hover:bg-[#0b5ed7] hover:shadow-[0_10px_15px_-3px_rgba(13, 110, 253, 0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {posting ? (recurring ? 'Creating...' : 'Posting...') : (recurring ? 'Create Recurring Match' : 'Post Match Now')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={posting}
              className="text-body-main w-full py-2 font-medium text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Wait, I need to edit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'P'
}

function CandidatePreviewModal({
  preview,
  onClose,
}: {
  preview: CandidatePreviewState | null
  onClose: () => void
}) {
  if (!preview) return null

  const { candidate } = preview

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 70,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          borderRadius: '20px',
          background: '#fff',
          border: '1px solid #e5e7eb',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
          padding: '1.1rem 1.15rem',
          display: 'grid',
          gap: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.76rem', color: '#6b7280' }}>{candidate.sourceLabel}</p>
            <h4 style={{ margin: '0.2rem 0 0', fontSize: '1.05rem', color: '#111827' }}>{candidate.name}</h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player preview"
            style={{
              border: 'none',
              background: 'transparent',
              color: '#6b7280',
              fontSize: '1rem',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            x
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.3rem 0.55rem',
              borderRadius: '999px',
              border: '1px solid #d1d5db',
              background: '#f8fafc',
              color: '#475569',
              fontSize: '0.76rem',
            }}
          >
            {candidate.kind === 'contact' ? 'Contact' : 'Registered player'}
          </span>
          {candidate.sourceLabels.length > 1 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.3rem 0.55rem',
                borderRadius: '999px',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#6b7280',
                fontSize: '0.76rem',
              }}
            >
              Also from {candidate.sourceLabels.slice(1).join(', ')}
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {candidate.kind === 'contact' ? (
            <>
              <div>
                <p style={{ margin: 0, fontSize: '0.74rem', color: '#6b7280' }}>Phone</p>
                <p style={{ margin: '0.12rem 0 0', fontSize: '0.9rem', color: '#111827' }}>
                  {candidate.phone ? `${candidate.phone}${candidate.smsOptedOut ? ' - unsubscribed' : ''}` : 'Not provided'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.74rem', color: '#6b7280' }}>Email</p>
                <p style={{ margin: '0.12rem 0 0', fontSize: '0.9rem', color: '#111827' }}>
                  {candidate.email ? `${candidate.email}${candidate.emailOptedOut ? ' - unsubscribed' : ''}` : 'Not provided'}
                </p>
              </div>
              {candidate.notes && (
                <div>
                  <p style={{ margin: 0, fontSize: '0.74rem', color: '#6b7280' }}>Note</p>
                  <p style={{ margin: '0.12rem 0 0', fontSize: '0.9rem', color: '#111827', lineHeight: 1.5 }}>{candidate.notes}</p>
                </div>
              )}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#4b5563', lineHeight: 1.5 }}>
              Saved registered players can be added through Invite People here. Open the full profile for more details.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
          {candidate.kind === 'user' && candidate.userId && (
            <PlayerProfileTrigger
              targetUserId={candidate.userId}
              label={`Open ${candidate.name}'s profile`}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              <span>Open profile</span>
            </PlayerProfileTrigger>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              borderRadius: '999px',
              padding: '0.55rem 0.95rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function MiniCalendar({
  selected,
  onSelect,
  dateIndicators,
}: {
  selected: string
  onSelect: (d: string) => void
  dateIndicators: Record<string, Array<'confirmed' | 'waiting'>>
}) {
  const today = new Date()
  const [anchorDate, setAnchorDate] = useState(() => {
    if (selected) {
      const parsed = new Date(`${selected}T00:00:00`)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return today
  })

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const weekLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`

  const toDateStr = (date: Date) => {
    const yyyy = date.getFullYear().toString()
    const mm = (date.getMonth() + 1).toString().padStart(2, '0')
    const dd = date.getDate().toString().padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const startOfVisibleRange = useMemo(() => {
    const normalized = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())
    normalized.setDate(normalized.getDate() - normalized.getDay())
    return normalized
  }, [anchorDate])

  const visibleDates = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => {
        const value = new Date(startOfVisibleRange)
        value.setDate(startOfVisibleRange.getDate() + index)
        return value
      }),
    [startOfVisibleRange],
  )

  useEffect(() => {
    if (!selected) return
    const parsed = new Date(`${selected}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return

    const rangeStart = startOfVisibleRange.getTime()
    const rangeEnd = new Date(startOfVisibleRange)
    rangeEnd.setDate(startOfVisibleRange.getDate() + 13)
    if (parsed.getTime() < rangeStart || parsed.getTime() > rangeEnd.getTime()) {
      setAnchorDate(parsed)
    }
  }, [selected, startOfVisibleRange])

  const moveWindow = (days: number) => {
    setAnchorDate((current) => {
      const next = new Date(current)
      next.setDate(current.getDate() + days)
      return next
    })
  }

  return (
    <div className="max-w-[300px] select-none">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-title-main text-[#0B2136]">
          {monthNames[startOfVisibleRange.getMonth()]} {startOfVisibleRange.getFullYear()}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => moveWindow(-14)}
            className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-[#94A3B8] transition hover:bg-[#F8FAFC] hover:text-[#1E293B]"
            aria-label="Previous dates"
          >
            &lt;
          </button>
          <button
            type="button"
            onClick={() => moveWindow(14)}
            className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-[#94A3B8] transition hover:bg-[#F8FAFC] hover:text-[#1E293B]"
            aria-label="Next dates"
          >
            &gt;
          </button>
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-7">
        {weekLabels.map((label) => (
          <div key={label} className="text-label text-center tracking-tight text-[#94A3B8]">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-2">
        {visibleDates.map((date) => {
          const dateStr = toDateStr(date)
          const isSelected = dateStr === selected
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr
          const indicators = dateIndicators[dateStr] ?? []
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => !isPast && onSelect(dateStr)}
              disabled={isPast}
              className={[
                'flex h-8 flex-col items-center justify-start',
                isPast ? 'cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-medium transition-all',
                  isSelected
                    ? 'border border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]'
                    : isPast
                      ? 'text-[#CBD5E1]'
                      : isToday
                        ? 'border border-[#FED7AA] bg-[#eff6ff] text-[#EA580C]'
                        : 'text-[#0B2136] hover:bg-[#F8FAFC]',
                ].join(' ')}
              >
                {date.getDate()}
              </span>
              <span className="mt-0.5 flex items-center gap-0.5">
                {indicators.length > 0 && indicators.length <= 3 ? (
                  indicators.map((indicator, index) => (
                    <span
                      key={`${dateStr}-indicator-${index}`}
                      className={[
                        'inline-block h-[3px] w-[3px] rounded-full',
                        indicator === 'confirmed' ? 'bg-[#22C55E]' : 'bg-[#CBD5E1]',
                      ].join(' ')}
                    />
                  ))
                ) : (
                  <span className="inline-block h-[3px] w-[3px] opacity-0" />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CreateMatchInline({
  defaultVenueId,
  expandSignal,
  onExpandedChange,
  myPlayCities = [],
  venueSports = [],
  onParseScreenshots,
  onImportScreenshotContacts,
}: {
  defaultVenueId?: string
  expandSignal?: number
  onExpandedChange?: (expanded: boolean) => void
  myPlayCities?: UserPlayCity[]
  venueSports?: VenueSport[]
  onParseScreenshots?: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts?: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
}) {
  const searchParams = useSearchParams()
  const [createExpanded, setCreateExpanded] = useState(false)
  const [matchMode] = useState<'one-time' | 'recurring'>('one-time')
  const [requiredCount, setRequiredCount] = useState(4)
  const [matchDate, setMatchDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [playerReminderMinutes, setPlayerReminderMinutes] = useState<number | null>(1440)
  const [gameType, setGameType] = useState('doubles')
  const [doublesFormat, setDoublesFormat] = useState<MatchDoublesFormat>('open')
  const [venueId, setVenueId] = useState(defaultVenueId || '')
  const [scopeGroupIds, setScopeGroupIds] = useState<string[]>([])
  const [scopeUserIds, setScopeUserIds] = useState<string[]>([])
  const [invitedGroupIds, setInvitedGroupIds] = useState<string[]>([])
  const [courtPlanMode, setCourtPlanMode] = useState<MatchCourtPlanMode>('secured')
  const [courtPlanNote, setCourtPlanNote] = useState('')
  const [courtCount, setCourtCount] = useState(1)
  const [customPlayersOpen, setCustomPlayersOpen] = useState(false)
  const [customCourtsOpen, setCustomCourtsOpen] = useState(false)
  const [courtPlanMenuOpen, setCourtPlanMenuOpen] = useState(false)
  const [courtLabelEditorOpen, setCourtLabelEditorOpen] = useState(false)
  const [organizerNote, setOrganizerNote] = useState('')
  const [organizerNoteExpanded, setOrganizerNoteExpanded] = useState(false)
  const [venueOptionsExpanded, setVenueOptionsExpanded] = useState(false)
  const [courtSlots, setCourtSlots] = useState<CourtSlotSelection[]>([
    { enabled: true, courtId: '', manualLabel: '' },
  ])

  const [sportId, setSportId] = useState(1)  // default tennis
  const [sports, setSports] = useState<Sport[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [groupMembersById, setGroupMembersById] = useState<Record<string, GroupMemberPreview>>({})
  const [venues, setVenues] = useState<Venue[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [calendarIndicators, setCalendarIndicators] = useState<Record<string, Array<'confirmed' | 'waiting'>>>({})
  const [savedPlayers, setSavedPlayers] = useState<UserInviteCandidateSeed[]>([])
  const [linkedContactUsers, setLinkedContactUsers] = useState<UserInviteCandidateSeed[]>([])
  const [contactPlayers, setContactPlayers] = useState<InviteCandidate[]>([])
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null)
  const [inviteTargets, setInviteTargets] = useState<ScopeUser[]>([])
  const [selectedDirectInviteKeys, setSelectedDirectInviteKeys] = useState<Set<string>>(new Set())
  const [selectedPostCreateInviteIds, setSelectedPostCreateInviteIds] = useState<Set<string>>(new Set())
  const [invitedNames, setInvitedNames] = useState<string[]>([])
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [openMatchLoading, setOpenMatchLoading] = useState(false)
  const [submitMode, setSubmitMode] = useState<'create' | 'invite' | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectionMode, setSelectionMode] = useState<'invite' | 'request' | null>(null)
  const [contactAddPanelOpen, setContactAddPanelOpen] = useState(false)
  const [contactComposerMode, setContactComposerMode] = useState<'screenshot' | null>(null)
  const [contactDisplayName, setContactDisplayName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [prefillConsumed, setPrefillConsumed] = useState(false)
  const courtPlanMenuRef = useRef<HTMLDivElement | null>(null)
  const organizerNoteRef = useRef<HTMLTextAreaElement | null>(null)
  const router = useRouter()

  const prefillSportId = searchParams.get('createSport')
  const prefillInviteUserId = searchParams.get('inviteUserId')
  const prefillInviteGuestId = searchParams.get('inviteGuestId')
  const prefillCreateFormat = searchParams.get('createFormat')
  const starterHint = searchParams.get('starterHint') === '1'

  const availableInviteOptions = useMemo(() => {
    const combined = new Map<string, InviteCandidate>()

    const upsert = (candidate: InviteCandidate) => {
      if (candidate.kind === 'user' && candidate.userId === currentUserId) return

      const existing = combined.get(candidate.key)
      if (!existing) {
        combined.set(candidate.key, { ...candidate, sourceLabels: [...candidate.sourceLabels] })
        return
      }

      const existingPriority = INVITE_SOURCE_PRIORITY.get(existing.source) ?? Number.MAX_SAFE_INTEGER
      const nextPriority = INVITE_SOURCE_PRIORITY.get(candidate.source) ?? Number.MAX_SAFE_INTEGER
      const mergedLabels = Array.from(new Set([...existing.sourceLabels, ...candidate.sourceLabels]))

      if (nextPriority < existingPriority) {
        combined.set(candidate.key, {
          ...candidate,
          sourceLabels: mergedLabels,
        })
        return
      }

      existing.sourceLabels = mergedLabels
    }

    const userCandidates = [...savedPlayers, ...linkedContactUsers].map((member) => ({
      key: `user:${member.userId}`,
      kind: 'user' as const,
      name: member.name,
      source: member.source,
      sourceLabel: member.sourceLabel,
      sourceLabels: [member.sourceLabel],
      gender: member.gender ?? null,
      availabilityStatus: member.availabilityStatus ?? 'available',
      availabilityNote: member.availabilityNote ?? null,
      availabilityUntil: member.availabilityUntil ?? null,
      userId: member.userId,
    }))

    userCandidates.forEach(upsert)
    contactPlayers.forEach(upsert)

    return Array.from(combined.values()).sort((left, right) => {
      const leftAvailabilityPriority = getAvailabilityPriority(left.availabilityStatus)
      const rightAvailabilityPriority = getAvailabilityPriority(right.availabilityStatus)
      if (leftAvailabilityPriority !== rightAvailabilityPriority) {
        return leftAvailabilityPriority - rightAvailabilityPriority
      }

      const leftPriority = INVITE_SOURCE_PRIORITY.get(left.source) ?? Number.MAX_SAFE_INTEGER
      const rightPriority = INVITE_SOURCE_PRIORITY.get(right.source) ?? Number.MAX_SAFE_INTEGER
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return left.name.localeCompare(right.name)
    })
  }, [contactPlayers, currentUserId, linkedContactUsers, savedPlayers])

  const requestScopeUserCandidates = useMemo(
    () =>
      availableInviteOptions.filter(
        (candidate) => candidate.kind === 'user' && candidate.userId && !selectedDirectInviteKeys.has(candidate.key),
      ),
    [availableInviteOptions, selectedDirectInviteKeys],
  )

  const filteredInviteOptions = useMemo(() => {
    const baseCandidates = availableInviteOptions.filter((candidate) => !scopeUserIds.includes(candidate.userId ?? ''))
    return baseCandidates
  }, [availableInviteOptions, scopeUserIds])

  const filteredInviteGroups = useMemo(() => {
    return groups.filter((group) => !scopeGroupIds.includes(group.id) && !invitedGroupIds.includes(group.id))
  }, [groups, invitedGroupIds, scopeGroupIds])

  const visibleInviteCandidates = useMemo(
    () => filteredInviteOptions.slice(0, 8),
    [filteredInviteOptions],
  )

  const hiddenInviteCandidates = useMemo(
    () => filteredInviteOptions.slice(8),
    [filteredInviteOptions],
  )

  const selectedInvitePlayers = useMemo(() => {
    const selected = new Set(selectedDirectInviteKeys)
    return availableInviteOptions.filter((member) => selected.has(member.key) && !(member.kind === 'contact' && member.hasReachableChannel === false))
  }, [availableInviteOptions, selectedDirectInviteKeys])

  const selectedInviteWarnings = useMemo(
    () =>
      selectedInvitePlayers
        .map((candidate) => ({
          candidate,
          warning: getAvailabilityWarning(candidate),
        }))
        .filter((item): item is { candidate: InviteCandidate; warning: NonNullable<ReturnType<typeof getAvailabilityWarning>> } => Boolean(item.warning)),
    [selectedInvitePlayers],
  )

  const inviteCandidatesBySource = useMemo(
    () =>
      INVITE_SOURCE_CONFIG.map((section) => ({
        ...section,
        candidates: filteredInviteOptions.filter((candidate) => candidate.source === section.source),
      })).filter((section) => section.candidates.length > 0),
    [filteredInviteOptions],
  )

  const filteredRequestGroups = useMemo(() => {
    return groups.filter((group) => !invitedGroupIds.includes(group.id))
  }, [groups, invitedGroupIds])

  const filteredRequestUsers = useMemo(() => {
    return requestScopeUserCandidates
  }, [requestScopeUserCandidates])

  const shouldShowHoodPanelButton = useMemo(() => {
    if (selectionMode === 'invite') {
      return filteredInviteOptions.length > 20
    }
    if (selectionMode === 'request') {
      return filteredRequestUsers.length > 20
    }
    return false
  }, [filteredInviteOptions.length, filteredRequestUsers.length, selectionMode])

  const selectedInvitedGroups = useMemo(
    () => groups.filter((group) => invitedGroupIds.includes(group.id)),
    [groups, invitedGroupIds],
  )

  const selectedScopeGroups = useMemo(
    () => groups.filter((group) => scopeGroupIds.includes(group.id)),
    [groups, scopeGroupIds],
  )

  const selectedScopeUsers = useMemo(
    () =>
      availableInviteOptions.filter(
        (candidate) => candidate.kind === 'user' && candidate.userId && scopeUserIds.includes(candidate.userId),
      ),
    [availableInviteOptions, scopeUserIds],
  )

  const visibleCourtSlots = useMemo(
    () => courtSlots.slice(0, courtCount),
    [courtCount, courtSlots],
  )

  const courtOptions = useMemo<CourtOption[]>(
    () => (
      courts.length > 0
        ? [...courts]
            .sort((left, right) => left.court_code.localeCompare(right.court_code))
            .map((court) => ({ id: court.id, label: court.court_code }))
        : DEFAULT_COURT_OPTIONS
    ),
    [courts],
  )

  const selectedCourtIds = useMemo(
    () =>
      visibleCourtSlots
        .filter((slot) => slot.enabled && slot.courtId)
        .map((slot) => slot.courtId),
    [visibleCourtSlots],
  )

  const selectedCourtLabels = useMemo(
    () =>
      visibleCourtSlots
        .filter((slot) => slot.enabled)
        .map((slot) => slot.manualLabel.trim() || (courtOptions.find((option) => option.id === slot.courtId)?.label ?? ''))
        .filter((label) => label.length > 0),
    [courtOptions, visibleCourtSlots],
  )

  const selectedSport = useMemo(
    () => sports.find((sport) => sport.id === sportId),
    [sportId, sports],
  )

  const existingImportContacts = useMemo<ContactPlayerResolved[]>(
    () =>
      contactPlayers.map((contact) => ({
        guest_id: contact.guestId ?? contact.key.replace(/^contact:/, ''),
        display_name: contact.name,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        notes: contact.notes ?? null,
        gender: contact.gender,
        availability_status: contact.availabilityStatus,
        availability_note: contact.availabilityNote ?? null,
        availability_until: contact.availabilityUntil ?? null,
        linked_user_id: null,
        resolution_state: 'contact_only',
      })),
    [contactPlayers],
  )

  const loadContactInviteCandidates = useCallback(async () => {
    const supabase = createSupabaseBrowserClient()
    try {
      const rows = await getContactPlayerResolution(supabase)
      const linkedUserIds = Array.from(
        new Set(
          rows
            .map((row) => row.linked_user_id)
            .filter((linkedUserId): linkedUserId is string => Boolean(linkedUserId)),
        ),
      )
      const linkedProfileMap = new Map<
        string,
        {
          display_name: string
          gender: 'male' | 'female' | 'unspecified' | null
          availability_status: AvailabilityStatus | null
          availability_note: string | null
          availability_until: string | null
        }
      >()

      if (linkedUserIds.length > 0) {
        const { data: linkedProfiles, error: linkedProfilesError } = await supabase
          .from('profiles')
          .select('id, display_name, gender, availability_status, availability_note, availability_until')
          .in('id', linkedUserIds)

        if (linkedProfilesError) {
          console.error('[CreateMatchInline] linked contact profiles:', linkedProfilesError)
        } else {
          ;((linkedProfiles ?? []) as Array<{
            id: string
            display_name: string
            gender: 'male' | 'female' | 'unspecified' | null
            availability_status: AvailabilityStatus | null
            availability_note: string | null
            availability_until: string | null
          }>).forEach((profile) => {
            linkedProfileMap.set(profile.id, profile)
          })
        }
      }

      setLinkedContactUsers(
        rows
          .filter((row) => row.linked_user_id)
          .map((row) => {
            const linkedProfile = row.linked_user_id ? linkedProfileMap.get(row.linked_user_id) : null
            return {
              userId: row.linked_user_id as string,
              name: linkedProfile?.display_name?.trim() || row.display_name.trim() || 'Unknown',
              source: 'contact_players' as const,
              sourceLabel: 'Contacts',
              gender: linkedProfile?.gender ?? row.gender ?? null,
              availabilityStatus: linkedProfile?.availability_status ?? row.availability_status ?? 'available',
              availabilityNote: linkedProfile?.availability_note ?? row.availability_note ?? null,
              availabilityUntil: linkedProfile?.availability_until ?? row.availability_until ?? null,
            }
          }),
      )

      const contactOnlyRows = rows.filter((row) => row.resolution_state === 'contact_only' && !row.linked_user_id)
      const deliveryStatus = await getContactInvitationDeliveryStatus(
        supabase,
        contactOnlyRows.map((row) => row.guest_id),
      ).catch((statusError) => {
        console.error('[CreateMatchInline] contact delivery status:', statusError)
        return new Map()
      })

      setContactPlayers(
        contactOnlyRows.map((row) => {
          const status = deliveryStatus.get(row.guest_id)
          return {
            key: `contact:${row.guest_id}`,
            kind: 'contact',
            name: row.display_name.trim() || 'Contact Player',
            source: 'contact_players',
            sourceLabel: 'Contacts',
            sourceLabels: ['Contacts'],
            gender: row.gender ?? null,
            availabilityStatus: row.availability_status ?? 'available',
            availabilityNote: row.availability_note ?? null,
            availabilityUntil: row.availability_until ?? null,
            guestId: row.guest_id,
            email: row.email,
            phone: row.phone,
            notes: row.notes,
            emailOptedOut: status?.email_opted_out ?? false,
            smsOptedOut: status?.sms_opted_out ?? false,
            hasReachableChannel: status?.has_reachable_channel ?? Boolean(row.email || row.phone),
          }
        }),
      )
    } catch (contactError) {
      console.error('[CreateMatchInline] contact players:', contactError)
      setLinkedContactUsers([])
      setContactPlayers([])
    }
  }, [])

  const playCityNames = useMemo(
    () =>
      new Set(
        myPlayCities
          .map((city) => city.city_name?.trim().toLowerCase() ?? '')
          .filter((cityName) => cityName.length > 0),
      ),
    [myPlayCities],
  )

  const venueSportIdsByVenueId = useMemo(() => {
    const map = new Map<string, Set<number>>()
    venueSports.forEach((entry) => {
      const current = map.get(entry.venue_id) ?? new Set<number>()
      current.add(entry.sport_id)
      map.set(entry.venue_id, current)
    })
    return map
  }, [venueSports])

  const venuesForSelectedSport = useMemo(() => {
    const selectedSportCode = selectedSport?.code?.toLowerCase() ?? ''
    const hasExplicitVenueSportRows = venueSports.length > 0

    return venues.filter((venue) => {
      const venueCityName = venue.city?.trim().toLowerCase() ?? ''
      const matchesProfileCityScope = playCityNames.size === 0 || (venueCityName.length > 0 && playCityNames.has(venueCityName))

      const venueSportIds = venueSportIdsByVenueId.get(venue.id)
      const matchesSport =
        venueSportIds
          ? venueSportIds.has(sportId)
          : hasExplicitVenueSportRows
            ? false
            : selectedSportCode === 'pickleball'
              ? venue.supports_pickleball
              : selectedSportCode === 'tennis'
                ? venue.supports_tennis
                : true

      return matchesProfileCityScope && matchesSport
    })
  }, [playCityNames, selectedSport?.code, sportId, venueSportIdsByVenueId, venueSports.length, venues])

  const selectedVenue = useMemo(
    () => venuesForSelectedSport.find((venue) => venue.id === venueId),
    [venueId, venuesForSelectedSport],
  )

  useEffect(() => {
    setVenueOptionsExpanded(false)
    setVenueId((currentVenueId) => {
      if (currentVenueId && venuesForSelectedSport.some((venue) => venue.id === currentVenueId)) {
        return currentVenueId
      }

      const defaultVenueForSport = defaultVenueId && venuesForSelectedSport.some((venue) => venue.id === defaultVenueId)
        ? defaultVenueId
        : ''

      return defaultVenueForSport || venuesForSelectedSport[0]?.id || ''
    })
  }, [defaultVenueId, sportId, venuesForSelectedSport])

  const visibleVenueOptions = useMemo(() => {
    const selected = selectedVenue ? [selectedVenue] : []
    const rest = venuesForSelectedSport.filter((venue) => venue.id !== selectedVenue?.id)
    return [...selected, ...rest]
  }, [selectedVenue, venuesForSelectedSport])

  const primaryVenueOptions = useMemo(
    () => visibleVenueOptions.slice(0, 3),
    [visibleVenueOptions],
  )

  const additionalVenueOptions = useMemo(
    () => visibleVenueOptions.slice(3),
    [visibleVenueOptions],
  )

  const handleCreateContactPlayer = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const displayName = contactDisplayName.trim()
    const email = contactEmail.trim().toLowerCase() || null
    const phone = contactPhone.trim() || null
    const notes = contactNotes.trim() || null

    if (!displayName) {
      setError('Enter a player name.')
      return
    }
    if (!email && !phone) {
      setError('Add an email or phone so this player can be invited.')
      return
    }
    if (!selectedSport) {
      setError('Choose a sport before adding players.')
      return
    }

    const supabase = createSupabaseBrowserClient()
    setCreatingContact(true)
    setError(null)
    setInviteNotice(null)

    try {
      const newGuest = await createRosterGuest(supabase, {
        display_name: displayName,
        email,
        phone,
        notes,
      })
      await saveContactPlayer(supabase, newGuest.id, { source: 'manual' })
      await setGuestSports(supabase, newGuest.id, [selectedSport.code])
      setContactDisplayName('')
      setContactEmail('')
      setContactPhone('')
      setContactNotes('')
      setContactAddPanelOpen(false)
      setSelectionMode('invite')
      setSelectedDirectInviteKeys((current) => {
        const next = new Set(current)
        next.add(`contact:${newGuest.id}`)
        return next
      })
      setInviteNotice(`${displayName} was saved and added to this match invite.`)
      await loadContactInviteCandidates()
    } catch (createError) {
      setError((createError as Error).message)
    } finally {
      setCreatingContact(false)
    }
  }, [contactDisplayName, contactEmail, contactNotes, contactPhone, loadContactInviteCandidates, selectedSport])

  useEffect(() => {
    const nextDefaultCourtPlanMode = getDefaultCourtPlanModeForVenueKind(selectedVenue?.venue_kind)
    if (!nextDefaultCourtPlanMode) return
    setCourtPlanMode((currentMode) => (currentMode === nextDefaultCourtPlanMode ? currentMode : nextDefaultCourtPlanMode))
  }, [selectedVenue?.id, selectedVenue?.venue_kind])

  const recurringWeeksAheadCount = 4
  const recurringSeriesName = useMemo(
    () =>
      buildRecurringSeriesName({
        sportLabel: selectedSport?.display_name ?? 'Tennis',
        venueLabel: selectedVenue?.name ?? 'Venue TBD',
        gameType,
      }),
    [gameType, selectedSport?.display_name, selectedVenue?.name],
  )

  useEffect(() => {
    if (typeof expandSignal !== 'number' || expandSignal <= 0) return
    setCreateExpanded(true)
  }, [expandSignal])

  useEffect(() => {
    onExpandedChange?.(createExpanded)
  }, [createExpanded, onExpandedChange])

  const selectedFormatLabel = useMemo(() => {
    const source = gameType === 'singles' ? SINGLES_FORMAT_OPTIONS : DOUBLES_FORMAT_OPTIONS
    return source.find((option) => option.value === doublesFormat)?.label ?? 'Not selected'
  }, [doublesFormat, gameType])

  const reviewCourtSummary = useMemo(() => {
    if (courtPlanMode !== 'secured') {
      return COURT_PLAN_OPTIONS.find((option) => option.value === courtPlanMode)?.label ?? 'Not selected'
    }
    if (selectedCourtLabels.length > 0) return selectedCourtLabels.join(', ')
    return 'Not selected'
  }, [courtPlanMode, selectedCourtLabels])

  const reviewDirectInviteLabels = useMemo(
    () => [
      ...selectedInvitePlayers.map((member) => ({ label: member.name })),
      ...selectedInvitedGroups.map((group) => ({
        label: group.name,
        members: groupMembersById[group.id]?.members.map((member) => member.name) ?? [],
      })),
    ],
    [groupMembersById, selectedInvitePlayers, selectedInvitedGroups],
  )

  const reviewRequestItems = useMemo(
    () => [
      ...selectedScopeUsers.map((candidate) => ({ label: candidate.name })),
      ...selectedScopeGroups.map((group) => ({
        label: group.name,
        members: groupMembersById[group.id]?.members.map((member) => member.name) ?? [],
      })),
    ],
    [groupMembersById, selectedScopeGroups, selectedScopeUsers],
  )

  const summaryIsEmpty = selectedInvitePlayers.length === 0
    && selectedInvitedGroups.length === 0
    && selectedScopeUsers.length === 0
    && selectedScopeGroups.length === 0
  const invitedTargetCount = useMemo(
    () =>
      selectedInvitePlayers.length
      + selectedInvitedGroups.reduce((total, group) => {
        const memberCount = groupMembersById[group.id]?.count ?? 0
        return total + Math.max(memberCount, 1)
      }, 0),
    [groupMembersById, selectedInvitePlayers.length, selectedInvitedGroups],
  )
  const hasOpenJoinScope = selectedScopeUsers.length > 0 || selectedScopeGroups.length > 0
  const openSpotCount = hasOpenJoinScope ? Math.max(requiredCount - invitedTargetCount, 0) : 0
  const hasPlayerSelectionPlan = invitedTargetCount > 0 || hasOpenJoinScope
  const playersNeededCopy = !hasPlayerSelectionPlan
    ? `Players needed: ${requiredCount}`
    : invitedTargetCount > 0
      ? `${invitedTargetCount} ${invitedTargetCount === 1 ? 'invitee' : 'invitees'} selected`
      : 'Open to Join selected'
  const playersProgressCopy = !hasPlayerSelectionPlan
    ? null
    : 'Ready to review'
  const inviteSummaryCopy = `${invitedTargetCount} ${invitedTargetCount === 1 ? 'player' : 'players'} will be invited when this match is posted.`
  const openJoinSummaryCopy = openSpotCount > 0
    ? `${openSpotCount} open ${openSpotCount === 1 ? 'spot' : 'spots'} for eligible players to request`
    : 'No open spots will remain after these invitations.'
  const hasSavedOrContactInvitePlayers = availableInviteOptions.length > 0

  const organizerNoteSentences = useMemo(
    () => new Set(parseOrganizerNoteSentences(organizerNote)),
    [organizerNote],
  )

  useEffect(() => {
    setRequiredCount(gameType === 'singles' ? 2 : 4)
  }, [gameType])

  useEffect(() => {
    if (gameType === 'singles' && doublesFormat === 'mixed_doubles') {
      setDoublesFormat('open')
    }
  }, [doublesFormat, gameType])

  useEffect(() => {
    if (courtPlanMode === 'secured' && courtPlanNote) {
      setCourtPlanNote('')
    }
  }, [courtPlanMode, courtPlanNote])

  useEffect(() => {
    const normalizedCount = Math.min(Math.max(courtCount, 1), 6)
    if (normalizedCount !== courtCount) {
      setCourtCount(normalizedCount)
      return
    }

    const availableCourtIds = new Set(courtOptions.map((court) => court.id))
    setCourtSlots((prev) =>
      Array.from({ length: normalizedCount }, (_, index) => {
        const existing = prev[index]
        if (!existing) {
          return { enabled: true, courtId: '', manualLabel: '' }
        }
        return {
          enabled: existing.enabled,
          courtId: existing.courtId && availableCourtIds.has(existing.courtId) ? existing.courtId : '',
          manualLabel: existing.manualLabel,
        }
      }),
    )
  }, [courtCount, courtOptions])

  useEffect(() => {
    if (courtPlanMode !== 'secured') {
      setCourtPlanMenuOpen(false)
      setCourtLabelEditorOpen(false)
    }
  }, [courtPlanMode])

  useEffect(() => {
    if (!courtPlanMenuOpen && !courtLabelEditorOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!courtPlanMenuRef.current?.contains(event.target as Node)) {
        setCourtPlanMenuOpen(false)
        setCourtLabelEditorOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [courtLabelEditorOpen, courtPlanMenuOpen])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const nextUserId = data.user?.id ?? null
        setCurrentUserId(nextUserId)
      })
      .catch(console.error)
    getInviteCircleList(supabase)
      .then(async (rows) => {
        const targetUserIds = Array.from(new Set(rows.map((row) => row.target_user_id).filter(Boolean)))
        const profileMap = new Map<string, {
          display_name: string | null
          gender: 'male' | 'female' | 'unspecified' | null
          availability_status: AvailabilityStatus | null
          availability_note: string | null
          availability_until: string | null
        }>()

        if (targetUserIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, gender, availability_status, availability_note, availability_until')
            .in('id', targetUserIds)
          if (profilesError) throw profilesError
          ;((profiles ?? []) as Array<{
            id: string
            display_name: string | null
            gender: 'male' | 'female' | 'unspecified' | null
            availability_status: AvailabilityStatus | null
            availability_note: string | null
            availability_until: string | null
          }>)
            .forEach((profile) => {
              profileMap.set(profile.id, {
                display_name: profile.display_name,
                gender: profile.gender,
                availability_status: profile.availability_status,
                availability_note: profile.availability_note,
                availability_until: profile.availability_until,
              })
            })
        }

        const saved: UserInviteCandidateSeed[] = []

        rows.forEach((row) => {
          const profile = profileMap.get(row.target_user_id)
          const provenanceLabel = getInviteCircleSourceLabel(row.source)
          const entry: UserInviteCandidateSeed = {
            userId: row.target_user_id,
            name: profile?.display_name?.trim() || row.target_display_name?.trim() || 'Unknown',
            source: 'saved_players',
            sourceLabel: provenanceLabel,
            gender: profile?.gender ?? null,
            availabilityStatus: profile?.availability_status ?? 'available',
            availabilityNote: profile?.availability_note ?? null,
            availabilityUntil: profile?.availability_until ?? null,
          }

          saved.push(entry)
        })

        setSavedPlayers(saved)
      })
      .catch(console.error)
    void loadContactInviteCandidates()
    getGroups(supabase)
      .then(async (loadedGroups) => {
        setGroups(loadedGroups)
        const memberEntries = await Promise.all(
          loadedGroups.map(async (group) => {
            try {
              const members = await getGroupMembers(supabase, group.id)
              const normalizedMembers = members.map((member) => ({
                id: member.user_id,
                name: member.profile?.display_name || 'Unknown',
              }))
              return [group.id, { count: normalizedMembers.length, members: normalizedMembers }] as const
            } catch (groupError) {
              console.error(`[CreateMatchInline] group members ${group.id}:`, groupError)
              return [group.id, { count: 0, members: [] }] as const
            }
          }),
        )
        setGroupMembersById(Object.fromEntries(memberEntries))
      })
      .catch(console.error)
    getVenues(supabase, { relatedOnly: true }).then(setVenues).catch(console.error)
    listSports(supabase).then(setSports).catch(console.error)
  }, [loadContactInviteCandidates])

  useEffect(() => {
    if (!venueId) { setCourts([]); return }
    const supabase = createSupabaseBrowserClient()
    getCourts(supabase, venueId, sportId).then(setCourts).catch(console.error)
  }, [venueId, sportId])

  useEffect(() => {
    if (!currentUserId) {
      setCalendarIndicators({})
      return
    }

    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    getMatchListData(supabase, currentUserId)
      .then((items) => {
        if (cancelled) return

        const nextIndicators: Record<string, Array<'confirmed' | 'waiting'>> = {}

        items.forEach((item) => {
          const matchDate = item.match.match_date
          const myStatus = item.myParticipant?.status
          if (!matchDate || item.match.status !== 'active' || !myStatus) return

          const currentIndicators = nextIndicators[matchDate] ?? []
          if (currentIndicators.length >= 4) {
            nextIndicators[matchDate] = currentIndicators
            return
          }

          if (myStatus === 'confirmed') {
            nextIndicators[matchDate] = [...currentIndicators, 'confirmed']
            return
          }

          if (myStatus === 'pending' || myStatus === 'waiting_list') {
            nextIndicators[matchDate] = [...currentIndicators, 'waiting']
          }
        })

        setCalendarIndicators(nextIndicators)
      })
      .catch((calendarError) => {
        console.error('[CreateMatchInline] calendar indicators:', calendarError)
        if (!cancelled) setCalendarIndicators({})
      })

    return () => {
      cancelled = true
    }
  }, [currentUserId])

  useEffect(() => {
    if (!defaultVenueId) return
    setVenueId(prev => (prev ? prev : defaultVenueId))
  }, [defaultVenueId])

  useEffect(() => {
    const allowedIds = new Set(availableInviteOptions.map((member) => member.key))
    setSelectedDirectInviteKeys((prev) => {
      const next = new Set(Array.from(prev).filter((id) => allowedIds.has(id)))
      if (next.size === prev.size) return prev
      return next
    })
  }, [availableInviteOptions])

  useEffect(() => {
    setPrefillConsumed(false)
  }, [prefillInviteGuestId, prefillInviteUserId, prefillSportId])

  useEffect(() => {
    if (prefillConsumed) return

    const nextSportId = prefillSportId ? parseInt(prefillSportId, 10) : NaN
    if (!Number.isNaN(nextSportId) && nextSportId > 0 && sportId !== nextSportId) {
      setSportId(nextSportId)
    }

    if (prefillCreateFormat === 'singles' || prefillCreateFormat === 'doubles') {
      setGameType(prefillCreateFormat)
      if (prefillCreateFormat === 'singles' && doublesFormat === 'mixed_doubles') {
        setDoublesFormat('open')
      }
    }

    if (prefillSportId || prefillCreateFormat || starterHint) {
      setCreateExpanded(true)
    }

    const nextInviteKey = prefillInviteUserId
      ? `user:${prefillInviteUserId}`
      : prefillInviteGuestId
        ? `contact:${prefillInviteGuestId}`
        : null

    if (!nextInviteKey) {
      setPrefillConsumed(true)
      return
    }

    if (availableInviteOptions.length === 0) return

    const matchingCandidate = availableInviteOptions.find((candidate) => candidate.key === nextInviteKey)
    if (!matchingCandidate) {
      setPrefillConsumed(true)
      return
    }

    setSelectedDirectInviteKeys((prev) => {
      if (prev.has(nextInviteKey)) return prev
      return new Set([...prev, nextInviteKey])
    })
    setPrefillConsumed(true)
  }, [
    availableInviteOptions,
    prefillConsumed,
    prefillInviteGuestId,
    prefillInviteUserId,
    prefillCreateFormat,
    prefillSportId,
    starterHint,
    sportId,
    doublesFormat,
  ])

  const createMatchFlow = async (mode: 'create' | 'invite') => {
    setError(null)
    setCourtPlanMenuOpen(false)
    setCourtLabelEditorOpen(false)
    setLoading(true)
    setSubmitMode(mode)

    const supabase = createSupabaseBrowserClient()
    const selectedCourtLabels = visibleCourtSlots
      .filter((slot) => slot.enabled)
      .map((slot) => {
        return slot.manualLabel.trim() || (courtOptions.find((court) => court.id === slot.courtId)?.label ?? '')
      })
      .filter((label) => label.length > 0)
    const securedCourtLabels = courtPlanMode === 'secured'
      ? selectedCourtLabels
      : []

    try {
      if (matchMode === 'recurring' && !matchDate) {
        setError('Please choose the first match date for the recurring series.')
        return
      }

      if (courtPlanMode === 'secured' && securedCourtLabels.length === 0) {
        setError('Please choose at least one court.')
        return
      }

      if (new Set(securedCourtLabels).size !== securedCourtLabels.length) {
        setError('Please choose different courts for each selected slot.')
        return
      }

      const selectedCandidates = availableInviteOptions.filter(
        (candidate) => selectedDirectInviteKeys.has(candidate.key) && !(candidate.kind === 'contact' && candidate.hasReachableChannel === false),
      )
      const recurringInvites: RecurringDirectInviteInput[] = []
      selectedCandidates.forEach((candidate) => {
        if (candidate.kind === 'user' && candidate.userId) {
          recurringInvites.push({ kind: 'user', userId: candidate.userId })
        } else if (candidate.kind === 'contact' && candidate.guestId) {
          recurringInvites.push({ kind: 'contact', guestId: candidate.guestId })
        }
      })

      if (matchMode === 'recurring') {
        const recurringInput: CreateRecurringMatchSeriesInput = {
          name: recurringSeriesName,
          sport_id: sportId,
          venue_id: venueId || undefined,
          game_type: gameType || undefined,
          doubles_format: doublesFormat,
          required_count: requiredCount,
          required_court_count: courtCount,
          start_date: matchDate,
          start_time: startTime ? `${startTime}:00` : undefined,
          duration_minutes: durationMinutes || undefined,
          court_plan_mode: courtPlanMode,
          court_note: courtPlanMode === 'secured' ? null : (courtPlanNote.trim() || null),
          final_court_label: courtPlanMode === 'secured' ? (securedCourtLabels[0] ?? null) : null,
          court_labels: courtPlanMode === 'secured' ? securedCourtLabels : [],
          organizer_note: organizerNote.trim() || null,
          invitation_scope_group_ids: scopeGroupIds.length > 0 ? scopeGroupIds : undefined,
          invitation_scope_user_ids: scopeUserIds,
          invited_group_ids: invitedGroupIds,
          direct_invites: recurringInvites,
          weeks_ahead_count: recurringWeeksAheadCount,
        }

        const result = await createRecurringMatchSeriesAction(recurringInput)
        router.push(`/recurring-matches/${result.seriesId}`)
        return
      }

      const match = await createMatch(supabase, {
        required_count: requiredCount,
        required_court_count: courtCount,
        match_date: matchDate || undefined,
        start_time: startTime ? `${startTime}:00` : undefined,
        duration_minutes: durationMinutes || undefined,
        player_reminder_minutes: playerReminderMinutes,
        game_type: gameType || undefined,
        doubles_format: doublesFormat,
        venue_id: venueId || undefined,
        sport_id: sportId,
        invitation_scope_group_ids: scopeGroupIds.length > 0 ? scopeGroupIds : undefined,
        invitation_scope_user_ids: scopeUserIds,
        can_participants_invite_users: true,
        can_participants_manage_participants: false,
        court_plan_mode: courtPlanMode,
        court_note: courtPlanMode === 'secured' ? null : (courtPlanNote.trim() || null),
        final_court_label: courtPlanMode === 'secured' ? (securedCourtLabels[0] ?? null) : null,
        court_labels: courtPlanMode === 'secured' ? securedCourtLabels : [],
        organizer_note: organizerNote.trim() || null,
      })
      let shouldProcessQueuedDeliveries = false
      for (const candidate of selectedCandidates) {
        try {
          if (candidate.kind === 'user' && candidate.userId) {
            await inviteUserToMatch(supabase, match.id, candidate.userId)
            shouldProcessQueuedDeliveries = true
          } else if (candidate.kind === 'contact' && candidate.guestId) {
            await inviteContactGuestToMatch(supabase, match.id, candidate.guestId)
            shouldProcessQueuedDeliveries = true
          }
        } catch (inviteError) {
          console.error(`[CreateMatchInline] direct invite ${candidate.key}:`, inviteError)
        }
      }
      for (const groupId of invitedGroupIds) {
        try {
          await inviteGroupToMatch(supabase, match.id, groupId)
          shouldProcessQueuedDeliveries = true
        } catch (groupInviteError) {
          console.error(`[CreateMatchInline] group invite ${groupId}:`, groupInviteError)
        }
      }
      if (shouldProcessQueuedDeliveries) {
        processDeliveriesAction().catch((deliveryError) => {
          console.error('[CreateMatchInline] process queued deliveries:', deliveryError)
        })
      }
      if (mode === 'invite') {
        const targets = await getAdmissionTargets(supabase, match.id)
        setCreatedMatchId(match.id)
        setInviteTargets(
          admissionTargetsToScopeUsers(
            targets.filter((target) => target.source === 'invite_circle'),
            { requireCanAdmit: true },
          ),
        )
        setSelectedDirectInviteKeys(new Set())
        setSelectedPostCreateInviteIds(new Set())
        return
      }

      router.push(`/dashboard?matchId=${match.id}`)
    } catch (err: unknown) {
      setError(normalizeCreateError(err))
    } finally {
      setLoading(false)
      setSubmitMode(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCourtPlanMenuOpen(false)
    setCourtLabelEditorOpen(false)
    setError(null)

    if (!venueId) {
      setError('Please choose a venue.')
      return
    }

    if (!matchDate) {
      setError(matchMode === 'recurring'
        ? 'Please choose the first match date for the recurring series.'
        : 'Please choose a match date.')
      return
    }

    if (!startTime) {
      setError('Please choose a start time.')
      return
    }

    if (courtPlanMode === 'secured' && selectedCourtLabels.length === 0) {
      setError('Please choose at least one court.')
      return
    }

    if (new Set(selectedCourtLabels).size !== selectedCourtLabels.length) {
      setError('Please choose different courts for each selected slot.')
      return
    }

    setReviewOpen(true)
  }

  const handleConfirmCreate = async () => {
    await createMatchFlow('create')
  }

  const updateCourtSlot = (slotIndex: number, updates: Partial<CourtSlotSelection>) => {
    setCourtSlots((prev) =>
      prev.map((slot, index) => (
        index === slotIndex
          ? { ...slot, ...updates }
          : slot
      )),
    )
  }

  const toggleCourtSelection = (courtId: string) => {
    const normalizedCount = Math.min(Math.max(courtCount, 1), 6)
    setCourtSlots((prev) => {
      const currentSelected = prev
        .slice(0, normalizedCount)
        .filter((slot) => slot.enabled && slot.courtId)
        .map((slot) => slot.courtId)
      const alreadySelected = currentSelected.includes(courtId)

      if (!alreadySelected && currentSelected.length >= normalizedCount) {
        setError(`You can select up to ${normalizedCount} court${normalizedCount === 1 ? '' : 's'}.`)
        return prev
      }

      const nextSelected = alreadySelected
        ? currentSelected.filter((id) => id !== courtId)
        : [...currentSelected, courtId]

      setError((currentError) =>
        currentError?.startsWith('You can select up to ') || currentError === 'Please choose at least one court.'
          ? null
          : currentError,
      )
      setCourtLabelEditorOpen(true)

      return Array.from({ length: normalizedCount }, (_, index) => ({
        enabled: index < nextSelected.length,
        courtId: nextSelected[index] ?? '',
        manualLabel: prev[index]?.manualLabel ?? '',
      }))
    })
  }

  const appendOrganizerNote = (item: OrganizerNotePresetItem) => {
    setOrganizerNote((prev) => applyOrganizerNotePreset(prev, item))
    setOrganizerNoteExpanded(true)
    queueMicrotask(() => organizerNoteRef.current?.focus())
  }

  const handleInviteSelected = async () => {
    await applySelectedInvites()
  }

  const applySelectedInvites = async () => {
    if (!createdMatchId || selectedPostCreateInviteIds.size === 0) {
      return true
    }

    const selectedIds = Array.from(selectedPostCreateInviteIds)
    const selectedNames = new Map(
      inviteTargets
        .filter(user => selectedPostCreateInviteIds.has(user.id))
        .map(user => [user.id, user.display_name]),
    )

    setInviteLoading(true)
    setError(null)
    setInviteNotice(null)
    const supabase = createSupabaseBrowserClient()
    try {
      for (const uid of selectedIds) {
        await inviteUserToMatch(supabase, createdMatchId, uid)
      }
      processDeliveriesAction().catch((deliveryError) => {
        console.error('[CreateMatchInline] process queued deliveries:', deliveryError)
      })

      const participants = await getMatchParticipants(supabase, createdMatchId)
      const pendingUserIds = new Set(
        participants
          .filter(participant =>
            participant.status === 'pending'
            && participant.removed_at === null
            && participant.user_id !== null,
          )
          .map(participant => participant.user_id as string),
      )

      const appliedIds = selectedIds.filter(id => pendingUserIds.has(id))
      const missingIds = selectedIds.filter(id => !pendingUserIds.has(id))

      if (appliedIds.length > 0) {
        const appliedNames = appliedIds.map(id => selectedNames.get(id) ?? 'Player')
        setInvitedNames(prev => Array.from(new Set([...prev, ...appliedNames])))
        setInviteTargets(prev => prev.filter(user => !appliedIds.includes(user.id)))
        setInviteNotice(
          appliedNames.length === 1
            ? `${appliedNames[0]} is now pending on the match.`
            : `${appliedNames.length} players are now pending on the match.`,
        )
      }

      if (missingIds.length > 0) {
        setSelectedPostCreateInviteIds(new Set(missingIds))
        setError('Some invitations did not save. Please try again.')
        return false
      }

      setSelectedPostCreateInviteIds(new Set())
      return true
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? ''
      setError(message.includes('contact_communication_opted_out') ? 'This contact has unsubscribed or has no reachable invitation channel.' : message || 'Failed to invite players')
      return false
    } finally {
      setInviteLoading(false)
    }
  }

  const handleOpenMatch = async () => {
    if (!createdMatchId || inviteLoading) return

    setOpenMatchLoading(true)
    try {
      const inviteOk = await applySelectedInvites()
      if (!inviteOk) return
      router.push(`/dashboard?matchId=${createdMatchId}`)
      router.refresh()
    } finally {
      setOpenMatchLoading(false)
    }
  }

  const toggleDirectInviteCandidate = (candidate: InviteCandidate) => {
    if (candidate.kind === 'contact' && candidate.hasReachableChannel === false) return

    setSelectedDirectInviteKeys((prev) => {
      const next = new Set(prev)
      if (next.has(candidate.key)) next.delete(candidate.key)
      else next.add(candidate.key)
      return next
    })
  }

  const renderInviteCandidateButton = (candidate: InviteCandidate, compact = false) => {
    const isSelected = selectedDirectInviteKeys.has(candidate.key)
    const showAvailability = candidate.kind !== 'contact'
    const contactUnavailable = candidate.kind === 'contact' && candidate.hasReachableChannel === false
    const contactStatusLabel = contactUnavailable
      ? candidate.emailOptedOut || candidate.smsOptedOut
        ? 'Unsubscribed'
        : 'No email or phone'
      : null
    const availabilityWarning = showAvailability ? getAvailabilityWarning(candidate) : null
    const availabilityLabel = showAvailability ? getAvailabilityStatusLabel(candidate.availabilityStatus) : null
    const availabilityClasses =
      availabilityWarning?.level === 'busy'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : availabilityWarning?.level === 'away'
          ? 'border-orange-200 bg-orange-50 text-orange-700'
          : availabilityWarning?.level === 'inactive'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-[#E2E8F0] bg-white text-[#334155]'
    const stateClasses = isSelected
      ? availabilityWarning
        ? `${availabilityClasses} border-[#0d6efd] bg-[#eff6ff]`
        : 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]'
      : contactUnavailable
        ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-75'
        : availabilityClasses

    return (
      <button
        key={candidate.key}
        type="button"
        onClick={() => toggleDirectInviteCandidate(candidate)}
        aria-pressed={isSelected}
        disabled={contactUnavailable}
        title={
          contactStatusLabel
            ? `${candidate.name}: ${contactStatusLabel}`
            : availabilityWarning
            ? `${candidate.name}: ${candidate.sourceLabels.join(', ')} • ${availabilityWarning.label}. ${availabilityWarning.message}`
            : `${candidate.name}: ${candidate.sourceLabels.join(', ')}`
        }
        className={[
          'text-body-main flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-[#0d6efd]/35 hover:bg-[#eff6ff] hover:text-[#0d6efd]',
          contactUnavailable ? 'cursor-not-allowed hover:translate-y-0 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-400' : '',
          compact ? 'text-[12px]' : '',
          stateClasses,
        ].join(' ')}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {showAvailability ? (
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${getAvailabilityDotClass(candidate.availabilityStatus)}`}
              aria-label={availabilityLabel ?? 'Available'}
              title={availabilityLabel ?? 'Available'}
            />
          ) : null}
          <ParticipantQuickPreviewTrigger
            target={{
              userId: candidate.userId ?? null,
              guestId: candidate.guestId ?? null,
              displayName: candidate.name,
              gender: candidate.gender,
            }}
          >
            <span className="truncate font-semibold">{candidate.name}</span>
          </ParticipantQuickPreviewTrigger>
          {candidate.kind === 'contact' ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              Contact
            </span>
          ) : null}
        </span>
        {availabilityWarning ? (
          <span
            className="sr-only"
          >
            {availabilityWarning.label}
          </span>
        ) : null}
        {contactStatusLabel ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
            {contactStatusLabel}
          </span>
        ) : null}
        <span
          className={[
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition',
            isSelected ? 'border-[#0d6efd] bg-[#0d6efd] text-white' : 'border-[#E2E8F0] bg-white text-transparent',
          ].join(' ')}
          aria-hidden="true"
        >
          ✓
        </span>
      </button>
    )
  }

  const hideGroupTooltip = (groupId: string) => {
    setTooltip((current) =>
      current?.kind === 'group-members' && current.groupId === groupId ? null : current,
    )
  }

  const renderGroupMemberTooltip = (group: Group, align: 'left' | 'right' = 'left') => {
    const memberPreview = groupMembersById[group.id]

    if (!(tooltip?.kind === 'group-members' && tooltip.groupId === group.id)) return null

    return (
      <div
        className={[
          'absolute top-[calc(100%+0.45rem)] z-30 min-w-[220px] max-w-[280px] rounded-xl border border-gray-200 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.14)]',
          align === 'right' ? 'right-0' : 'left-0',
        ].join(' ')}
      >
        <p className="text-title-main mb-1 text-gray-900">
          {(memberPreview?.count ?? 0)} member{(memberPreview?.count ?? 0) === 1 ? '' : 's'}
        </p>
        {(memberPreview?.members.length
          ? memberPreview.members.map((member) => member.name)
          : ['No active members yet.']
        ).map((line, index, lines) => (
          <p
            key={`${line}-${index}`}
            className={index === lines.length - 1 ? 'text-body-sub leading-5 text-gray-600' : 'text-body-sub mb-1 leading-5 text-gray-600'}
          >
            {line}
          </p>
        ))}
      </div>
    )
  }

  const renderGroupHoverShell = (group: Group, children: ReactNode, align: 'left' | 'right' = 'left') => (
    <div
      key={group.id}
      className="relative inline-flex"
      onMouseEnter={() => setTooltip({ kind: 'group-members', groupId: group.id })}
      onMouseLeave={() => hideGroupTooltip(group.id)}
    >
      {children}
      {renderGroupMemberTooltip(group, align)}
    </div>
  )

  const renderGroupSelector = (
    group: Group,
    selected: boolean,
    onToggle: () => void,
    tone: 'indigo' | 'green',
  ) => {
    const toneClasses =
      tone === 'green'
        ? selected
          ? 'border-green-300 bg-green-50 text-green-700'
          : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-green-200 hover:bg-green-50 hover:text-green-700'
        : selected
          ? 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]'
          : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#0d6efd]/35 hover:bg-[#eff6ff] hover:text-[#0d6efd]'

    return (
      renderGroupHoverShell(group, (
        <button
          type="button"
          onClick={onToggle}
          className={[
            'text-body-main flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left font-semibold transition',
            toneClasses,
          ].join(' ')}
          aria-pressed={selected}
        >
          <span className="min-w-0 flex-1 truncate">{group.name}</span>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
            Group
          </span>
          <span
            className={[
              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition',
              selected
                ? tone === 'green'
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-[#0d6efd] bg-[#0d6efd] text-white'
                : 'border-[#E2E8F0] bg-white text-transparent',
            ].join(' ')}
            aria-hidden="true"
          >
            ✓
          </span>
        </button>
      ))
    )
  }

  const renderSelectedGroupChip = (
    group: Group,
    tone: 'orange' | 'green',
    onRemove: () => void,
    key = group.id,
  ) => {
    const toneClasses =
      tone === 'green'
        ? 'border-green-100 bg-green-50 text-green-700'
        : 'border-[#0d6efd]/15 bg-[#eff6ff] text-[#0d6efd]'

    return (
      <div key={key}>
        {renderGroupHoverShell(group, (
          <button
            type="button"
            onClick={onRemove}
            className={[
              'text-body-sub flex items-center rounded-lg border px-2 py-1 font-semibold',
              toneClasses,
            ].join(' ')}
          >
            <span>{group.name}</span>
            <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
          </button>
        ), 'right')}
      </div>
    )
  }

  const renderRequestScopeCandidateButton = (candidate: InviteCandidate) => {
    if (candidate.kind !== 'user' || !candidate.userId) return null

    const isSelected = scopeUserIds.includes(candidate.userId)
    const availabilityLabel = getAvailabilityStatusLabel(candidate.availabilityStatus)

    return (
      <button
        key={`request-${candidate.key}`}
        type="button"
        onClick={() =>
          setScopeUserIds((prev) =>
            prev.includes(candidate.userId as string)
              ? prev.filter((id) => id !== candidate.userId)
              : [...prev, candidate.userId as string],
          )
        }
        aria-pressed={isSelected}
        title={`${candidate.name}: ${candidate.sourceLabels.join(', ')}`}
        className={[
          'text-body-main flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-green-300 hover:bg-green-50 hover:text-green-600',
          isSelected ? 'border-green-300 bg-green-50 text-green-700' : 'border-[#E2E8F0] bg-white text-[#334155]',
        ].join(' ')}
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${getAvailabilityDotClass(candidate.availabilityStatus)}`}
          aria-label={availabilityLabel ?? 'Available'}
          title={availabilityLabel ?? 'Available'}
        />
        <ParticipantQuickPreviewTrigger
          target={{
            userId: candidate.userId ?? null,
            guestId: candidate.guestId ?? null,
            displayName: candidate.name,
            gender: candidate.gender,
          }}
        >
          <span className="min-w-0 flex-1 truncate font-semibold">{candidate.name}</span>
        </ParticipantQuickPreviewTrigger>
        <span
          className={[
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition',
            isSelected ? 'border-green-600 bg-green-600 text-white' : 'border-[#E2E8F0] bg-white text-transparent',
          ].join(' ')}
          aria-hidden="true"
        >
          ✓
        </span>
      </button>
    )
  }

  if (createdMatchId) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h4 className="text-h2 m-0 text-gray-900">Invite Player</h4>
          <p className="text-body-main mt-1 text-gray-500">
            Match created. Pick Invite People from your saved registered players, then open the match once they are recorded as pending.
          </p>
        </div>

        {inviteTargets.length === 0 ? (
          <div className="text-body-main rounded-2xl border border-gray-200 bg-white px-4 py-4 text-gray-500">
            No saved registered players are available for Invite People right now.
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              {inviteTargets.map((user) => (
                <label
                  key={user.id}
                  title={`${user.display_name}: ${user.sourceLabel}`}
                  className="text-body-main flex cursor-pointer items-center gap-2 text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedPostCreateInviteIds.has(user.id)}
                    onChange={e => {
                      setSelectedPostCreateInviteIds(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(user.id)
                        else next.delete(user.id)
                        return next
                      })
                    }}
                  />
                  {user.display_name}
                </label>
              ))}
            </div>
          </div>
        )}

        {inviteNotice && <p className="text-body-main m-0 text-green-700">{inviteNotice}</p>}
        {invitedNames.length > 0 && (
          <p className="text-body-main m-0 text-gray-600">
            Pending on this match: {invitedNames.join(', ')}
          </p>
        )}
        {error && <p className="text-body-main m-0 text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleInviteSelected}
            disabled={selectedPostCreateInviteIds.size === 0 || inviteLoading}
            className="text-body-main rounded-xl bg-[#0d6efd] px-5 py-2.5 font-medium text-white transition hover:bg-[#0b5ed7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviteLoading ? 'Inviting...' : `Invite selected (${selectedPostCreateInviteIds.size})`}
          </button>
          <button
            type="button"
            onClick={() => { void handleOpenMatch() }}
            disabled={inviteLoading || openMatchLoading}
            className="text-body-main rounded-xl border border-gray-200 bg-white px-5 py-2.5 font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {openMatchLoading ? 'Opening...' : 'Open match'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
    {contactAddPanelOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button
          type="button"
          aria-label="Close add contact"
          className="absolute inset-0 bg-[#0B1F44]/35 backdrop-blur-sm"
          onClick={() => {
            setContactAddPanelOpen(false)
            setError(null)
          }}
        />
        <div className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[36px] border border-[#D7E2F0] bg-white px-5 py-7 shadow-[0_32px_80px_-32px_rgba(11,31,68,0.5)] sm:px-8 lg:px-10">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-[28px] font-black tracking-[-0.02em] text-[#0B1F44]">Add My Contact</h3>
            <button
              type="button"
              onClick={() => {
                setContactAddPanelOpen(false)
                setError(null)
              }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0B1F44]"
              aria-label="Close add contact panel"
            >
              <ContactAddIcon kind="close" />
            </button>
          </div>

          <div className="mt-8 grid gap-5 border-b border-[#E2E8F0] pb-9 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                key: 'card' as const,
                title: 'Save as player card',
                body: 'Add someone not on PlayerHoods yet.',
                tone: 'bg-[#eff6ff] text-[#0d6efd]',
              },
              {
                key: 'invite' as const,
                title: 'Invite by link',
                body: 'Send a private invite link anytime.',
                tone: 'bg-[#F1ECFF] text-[#6D5DF7]',
              },
              {
                key: 'reply' as const,
                title: 'Email or SMS reply',
                body: 'They can accept without an account.',
                tone: 'bg-[#EAFBF0] text-[#07823F]',
              },
              {
                key: 'bell' as const,
                title: 'Register notification',
                body: 'Get notified when they join PlayerHoods.',
                tone: 'bg-[#FFF7E6] text-[#C46B00]',
              },
              {
                key: 'shield' as const,
                title: 'Private by default',
                body: 'Contact details stay hidden.',
                tone: 'bg-[#EAF7FF] text-[#0877B8]',
              },
            ].map((item, index) => (
              <div
                key={item.title}
                className={[
                  'flex items-start gap-3 lg:flex-col lg:items-center lg:justify-start lg:text-center',
                  index > 0 ? 'lg:border-l-2 lg:border-[#CBD5E1]' : '',
                ].join(' ')}
              >
                <span className={['flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 shadow-sm', item.tone].join(' ')}>
                  <ContactAddIcon kind={item.key} />
                </span>
                <span className="grid gap-1">
                  <span className="text-[11px] font-black leading-tight text-[#0B1F44]">{item.title}</span>
                  <span className="text-[10px] leading-tight text-[#94A3B8]">{item.body}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)] lg:gap-14">
            <form onSubmit={handleCreateContactPlayer} className="grid gap-5 lg:border-r-2 lg:border-[#CBD5E1] lg:pr-10">
              <label className="text-label text-[#536179]">
                <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Name</span>
                <input
                  type="text"
                  value={contactDisplayName}
                  onChange={(event) => setContactDisplayName(event.target.value)}
                  placeholder="Player's full name"
                  className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-label text-[#536179]">
                  <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Email</span>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="email@example.com"
                    className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                  />
                </label>
                <label className="text-label text-[#536179]">
                  <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Phone</span>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    placeholder="+1 234 567 890"
                    className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                  />
                </label>
              </div>

              <label className="text-label text-[#536179]">
                <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">Notes</span>
                <textarea
                  value={contactNotes}
                  onChange={(event) => setContactNotes(event.target.value)}
                  placeholder="Add details like skill level or preferred times..."
                  rows={3}
                  className="text-body-main w-full resize-none rounded-2xl border border-[#A8B7CC] bg-white px-4 py-3 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                />
              </label>

              {error ? (
                <p className="text-body-main rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creatingContact}
                  className="text-body-main inline-flex min-w-[190px] items-center justify-center gap-2 rounded-2xl bg-[#0d6efd] px-5 py-4 font-bold text-white shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition hover:bg-[#0b5ed7] disabled:cursor-wait disabled:bg-[#94A3B8]"
                >
                  <span className="text-lg leading-none">+</span>
                  {creatingContact ? 'Saving...' : 'Save Contact'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContactAddPanelOpen(false)
                    setError(null)
                  }}
                  className="text-body-main rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 font-medium text-[#475569] transition hover:bg-[#F8FBFF]"
                >
                  Cancel
                </button>
              </div>
            </form>

            <div className="flex flex-col items-center justify-center gap-5 px-2 py-6 text-center lg:pl-2">
              <button
                type="button"
                onClick={() => {
                  if (!onParseScreenshots || !onImportScreenshotContacts || !currentUserId) {
                    setError('Smart Import is not available right now. Please refresh and try again.')
                    return
                  }
                  setContactComposerMode('screenshot')
                  setError(null)
                }}
                className="text-body-main inline-flex items-center gap-2 rounded-2xl bg-[#0d6efd] px-10 py-4 font-bold text-white shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition hover:bg-[#0b5ed7]"
              >
                <ContactAddIcon kind="spark" />
                Smart Import
              </button>
              <p className="text-body-main max-w-sm text-[#94A3B8]">
                We'll extract names, emails, and phones for you.
              </p>
              <div className="grid w-full max-w-md grid-cols-3 gap-4 pt-4">
                {[
                  ['Chat group', 'Tennis Group', 'Roger Federer'],
                  ['Email header', 'From', 'email@example.com'],
                  ['Sheet/list', 'Name', 'Sara Novak'],
                ].map(([label, heading, body]) => (
                  <div key={label} className="flex aspect-[3/4] flex-col rounded-2xl border border-[#D7E2F0] bg-[#F8FBFF] p-3 opacity-70 shadow-sm">
                    <div className="h-2 w-10 rounded-full bg-[#DCE8F8]" />
                    <div className="mt-3 rounded-lg bg-[#F1F5F9] px-2 py-1 text-[10px] font-semibold text-[#64748B]">
                      {heading}
                    </div>
                    <div className="mt-2 truncate rounded-md bg-[#eff6ff] px-2 py-1 text-[10px] font-semibold text-[#0d6efd]">
                      {body}
                    </div>
                    <p className="mt-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#64748B]">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {contactComposerMode === 'screenshot' && onParseScreenshots && onImportScreenshotContacts && currentUserId ? (
      <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Close screenshot import"
          className="absolute inset-0 bg-[#0B1F44]/40 backdrop-blur-sm"
          onClick={() => setContactComposerMode(null)}
        />
        <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white p-4 shadow-[0_32px_80px_-32px_rgba(11,31,68,0.5)] sm:max-h-[88vh] sm:rounded-[32px]">
          <div className="mb-4 flex items-start justify-between gap-4 px-1 pt-1 sm:px-2 sm:pt-2">
            <div>
              <h3 className="text-xl font-black text-[#1E293B] sm:text-h2">Smart Import</h3>
              <p className="text-body-sub mt-1 max-w-xl text-[#64748B]">
                Upload or paste a screenshot from a chat group, email header, or contact list. We&apos;ll extract possible names, emails, and phone numbers for you to review before saving them as Contact Players.
              </p>
              <p className="text-body-sub mt-2 max-w-xl font-semibold text-[#475569]">
                Nothing is sent or invited automatically. You choose which contacts to save.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContactComposerMode(null)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0B1F44]"
              aria-label="Close import modal"
            >
              <ContactAddIcon kind="close" />
            </button>
          </div>
          <ContactScreenshotImportSection
            userId={currentUserId}
            existingContacts={existingImportContacts}
            onParseScreenshots={onParseScreenshots}
            onImportScreenshotContacts={onImportScreenshotContacts}
            onImported={async () => {
              await loadContactInviteCandidates()
              setSelectionMode('invite')
              setContactComposerMode(null)
              setContactAddPanelOpen(false)
              setInviteNotice('Imported contacts were saved. You can invite them from your saved contact players.')
            }}
          />
        </div>
      </div>
    ) : null}
    <form
      id="create-match-inline"
      onSubmit={handleSubmit}
      className={[
        'space-y-6 transition duration-200',
        reviewOpen ? 'pointer-events-none select-none opacity-60 grayscale-[0.55] saturate-[0.45]' : '',
      ].join(' ')}
    >
      <section className={`overflow-hidden ${DS_CARD}`}>
        <button
          type="button"
          onClick={() => setCreateExpanded((expanded) => !expanded)}
          className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-[#eff6ff] md:px-7 md:py-6"
        >
          <div className="flex min-w-0 items-center gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0d6efd] text-[30px] font-medium leading-none text-white shadow-[0_14px_28px_rgba(13,110,253,0.24)] md:h-14 md:w-14 md:text-[34px]">
              +
            </span>
            <div className="min-w-0">
              <p className="text-[18px] font-black uppercase tracking-[0.04em] text-[#0B1F47] md:text-[22px]">
                {createExpanded ? 'Hide Create Match' : 'Create a Match'}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[#536783] md:text-[15px]">
                More Games for Players. Less Work for Hosts.
              </p>
            </div>
          </div>
          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F8FAFC] text-[20px] font-bold text-[#94A3B8] transition-transform ${createExpanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            ›
          </span>
        </button>

        {createExpanded ? (
          <div className="space-y-6 border-t border-[#F1F5F9] px-5 pb-6 pt-6 md:px-6">
      {starterHint ? (
        <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-body-main font-semibold text-[#0b5ed7]">
          You can start now and add more players later.
        </div>
      ) : null}
      <div className="md:hidden">
        <div className="mb-5">
          <h2 className="text-h1 text-[#1E293B]">Create a Match</h2>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { step: 1, label: 'General' },
              { step: 2, label: 'Schedule' },
              { step: 3, label: 'Players' },
              { step: 4, label: 'Host Note' },
            ].map((item, index) => (
              <div key={item.label} className="flex flex-col items-center gap-2 text-center">
                <div className="flex w-full items-center">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[15px] font-black ${index === 0 ? 'border-[#0d6efd] bg-[#0d6efd] text-white' : 'border-[#D7E1EE] bg-white text-[#94A3B8]'}`}>
                    {item.step}
                  </span>
                  {index < 3 ? <span className={`ml-2 h-px flex-1 ${index === 0 ? 'bg-[#0d6efd]' : 'bg-[#D7E1EE]'}`} /> : null}
                </div>
                <span className={`text-[12px] font-semibold ${index === 0 ? 'text-[#0d6efd]' : 'text-[#64748B]'}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <section className="rounded-2xl bg-white">
        <div className="mb-5 flex items-center">
          <SportSectionIcon sport={selectedSport} className="mr-3" />
          <h3 className={DS_SECTION_TITLE}>General Information</h3>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)]">
            <div>
              <label className={DS_LABEL}>Sport</label>
              <div className="flex flex-wrap gap-2">
                {sports.map((sport) => {
                  const selected = sport.id === sportId
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => setSportId(sport.id)}
                      className={[DS_OPTION_BUTTON, selected ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED].join(' ')}
                    >
                      {sport.display_name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className={DS_LABEL}>Players</label>
              <div className="flex flex-wrap items-center gap-3">
                {[2, 4, 8].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      setCustomPlayersOpen(false)
                      setRequiredCount(count)
                    }}
                    className={[
                      'text-title-main inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 font-black transition',
                      !customPlayersOpen && requiredCount === count ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                    ].join(' ')}
                  >
                    {count}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomPlayersOpen((open) => !open)}
                  className={[
                    'text-title-main inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 font-black transition',
                    customPlayersOpen || ![2, 4, 8].includes(requiredCount) ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                  ].join(' ')}
                  aria-label="Set custom player count"
                >
                  +
                </button>
                {customPlayersOpen || ![2, 4, 8].includes(requiredCount) ? (
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={requiredCount}
                    onChange={(e) => {
                      const fallbackValue = gameType === 'singles' ? 2 : 4
                      const nextValue = Number.parseInt(e.target.value, 10)
                      setRequiredCount(Number.isNaN(nextValue) ? fallbackValue : Math.max(1, nextValue))
                    }}
                    className="h-10 w-20 rounded-xl border border-[#E2E8F0] bg-white px-3 text-center text-sm font-bold text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <label className={DS_LABEL}>Game Type</label>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['singles', 'doubles'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setGameType(type)
                      if (type === 'singles' && doublesFormat === 'mixed_doubles') setDoublesFormat('open')
                    }}
                    className={[DS_OPTION_BUTTON, gameType === type ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED].join(' ')}
                  >
                    {type === 'singles' ? 'Single' : 'Double'}
                  </button>
                ))}
                <span className="mx-1 hidden h-8 w-px bg-[#E2E8F0] sm:inline-block" />
                {(gameType === 'singles' ? SINGLES_FORMAT_OPTIONS : DOUBLES_FORMAT_OPTIONS).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDoublesFormat(option.value)}
                    className={[
                      DS_OPTION_BUTTON,
                      doublesFormat === option.value ? DS_OPTION_SELECTED : 'border-transparent bg-white text-[#7A8AA6] hover:bg-[#F8FBFF]',
                    ].join(' ')}
                  >
                    {option.value === 'open'
                      ? 'Open'
                      : option.value === 'mens_doubles'
                        ? 'Man'
                        : option.value === 'womens_doubles'
                          ? 'Woman'
                          : 'Mixed'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={DS_LABEL}>Venue</label>
            {visibleVenueOptions.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {primaryVenueOptions.map((venue) => {
                    const selected = venue.id === venueId
                    return (
                      <button
                        key={venue.id}
                        type="button"
                        onClick={() => setVenueId(venue.id)}
                        className={[
                          DS_OPTION_BUTTON,
                          'min-h-12 justify-center text-center',
                          selected ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                        ].join(' ')}
                      >
                        {getVenueDisplayName(venue)}
                      </button>
                    )
                  })}
                  {additionalVenueOptions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setVenueOptionsExpanded((open) => !open)}
                      className={[
                        DS_OPTION_BUTTON,
                        'min-h-12 justify-center text-center',
                        venueOptionsExpanded ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                      ].join(' ')}
                      aria-label="Show more venues"
                    >
                      +
                    </button>
                  ) : null}
                </div>
                {venueOptionsExpanded && additionalVenueOptions.length > 0 ? (
                  <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {additionalVenueOptions.map((venue) => {
                      const selected = venue.id === venueId
                      return (
                        <button
                          key={venue.id}
                          type="button"
                          onClick={() => setVenueId(venue.id)}
                          className={[
                            DS_OPTION_BUTTON,
                            'min-h-12 justify-center text-center',
                            selected ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                          ].join(' ')}
                        >
                          {getVenueDisplayName(venue)}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-body-sub rounded-xl border border-dashed border-[#D7E2F0] bg-[#F8FBFF] px-4 py-3 text-[#64748B]">
                {venues.length > 0
                  ? `No ${selectedSport?.display_name ?? 'selected sport'} venues match your profile city range. Add one to your profile before creating this match.`
                  : 'Add a venue to your profile before creating a match.'}
              </p>
            )}
          </div>

          <div>
            <label className={DS_LABEL}>Court Plan</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {COURT_PLAN_OPTIONS.map((option) => {
                const selected = courtPlanMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCourtPlanMode(option.value)}
                    className={[
                      DS_OPTION_BUTTON,
                      'min-h-12 text-center',
                      selected ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(180px,0.6fr)_minmax(0,1fr)]">
            <div>
              <label className={DS_LABEL}>Courts Needed</label>
              <div className="flex flex-wrap items-center gap-3">
                {[1, 2].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      setCustomCourtsOpen(false)
                      setCourtCount(count)
                    }}
                    className={[
                      'text-title-main inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 font-black transition',
                      !customCourtsOpen && courtCount === count ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                    ].join(' ')}
                  >
                    {count}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomCourtsOpen((open) => !open)}
                  className={[
                    'text-title-main inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 font-black transition',
                    customCourtsOpen && [1, 2].includes(courtCount) ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                  ].join(' ')}
                  aria-label="Set custom court count"
                >
                  +
                </button>
                {customCourtsOpen || ![1, 2].includes(courtCount) ? (
                  <input
                    type="number"
                    min={1}
                    max={6}
                    step={1}
                    value={courtCount}
                    onChange={(e) => {
                      const nextValue = Number.parseInt(e.target.value, 10)
                      setCourtCount(Number.isNaN(nextValue) ? 1 : Math.min(6, Math.max(1, nextValue)))
                    }}
                    className="h-10 w-20 rounded-xl border border-[#0d6efd] bg-[#eff6ff] px-3 text-center text-sm font-black text-[#0d6efd] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
                  />
                ) : null}
              </div>
            </div>

          {courtPlanMode === 'secured' ? (
            <div>
              <label className={DS_LABEL}>Court Booked</label>
              <div ref={courtPlanMenuRef} className="space-y-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCourtPlanMenuOpen((open) => !open)
                      if (selectedCourtLabels.length > 0) setCourtLabelEditorOpen(true)
                    }}
                    className={[
                      'flex w-full items-center justify-between rounded-md border bg-white px-3 py-1.5 text-xs outline-none transition',
                      courtPlanMenuOpen
                        ? 'border-[#0d6efd] ring-2 ring-[#0d6efd]/10'
                        : 'border-[#E2E8F0] hover:border-[#F4C7B8]',
                    ].join(' ')}
                  >
                    <span className={selectedCourtLabels.length > 0 ? 'truncate text-[#1E293B]' : 'text-[#94A3B8]'}>
                      {selectedCourtLabels.length > 0 ? selectedCourtLabels.join(', ') : 'Select your booked court'}
                    </span>
                    <svg
                      className={`h-3.5 w-3.5 text-[#94A3B8] transition ${courtPlanMenuOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {courtPlanMenuOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-md border border-[#E2E8F0] bg-white shadow-lg">
                      <div className="grid max-h-52 grid-cols-2 gap-x-1 gap-y-0 overflow-y-auto p-1.5">
                        {courtOptions.map((court) => {
                          const checked = selectedCourtIds.includes(court.id)
                          return (
                            <label
                              key={court.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCourtSelection(court.id)}
                                className="h-3.5 w-3.5 rounded border-[#94A3B8] text-[#0d6efd] focus:ring-[#0d6efd]"
                              />
                              <span className="whitespace-nowrap">{court.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                {courtLabelEditorOpen && visibleCourtSlots.some((slot) => slot.enabled && slot.courtId) ? (
                  <div className="space-y-2 rounded-md border border-[#E2E8F0] bg-white p-2.5">
                    {visibleCourtSlots.map((slot, index) => {
                      if (!slot.enabled || !slot.courtId) return null
                      const optionLabel = courtOptions.find((option) => option.id === slot.courtId)?.label ?? ''
                      return (
                        <input
                          key={`court-slot-${index}`}
                          type="text"
                          value={slot.manualLabel || optionLabel}
                          onFocus={() => setCourtLabelEditorOpen(true)}
                          onChange={(e) => {
                            updateCourtSlot(index, { manualLabel: e.target.value })
                            setError((currentError) =>
                              currentError === 'Please choose at least one court.' ? null : currentError,
                            )
                          }}
                          placeholder={`crt ${index + 1}`}
                          className="w-full rounded-md border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-2 focus:ring-[#0d6efd]/10"
                        />
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        </div>

      </section>

      <section className="px-1 py-1">
        <div className="mb-3 flex items-center">
          <SportSectionIcon sport={selectedSport} className="mr-3" />
          <h3 className={DS_SECTION_TITLE}>Schedule</h3>
        </div>

        <div className="grid grid-cols-12 items-start gap-4">
          <div className="col-span-12 md:col-span-5">
            <MiniCalendar selected={matchDate} onSelect={setMatchDate} dateIndicators={calendarIndicators} />
          </div>

          <div className="col-span-12 flex flex-col gap-3 md:col-span-7">
            <div>
              <label className="text-label mb-1 block">Start Time</label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="text-body-main w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-[#475569] outline-none transition focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]"
              >
                <option value="">Select start time</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-label mb-1 block">Duration</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
                className="text-body-main w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-[#475569] outline-none transition focus:border-[#0d6efd] focus:ring-1 focus:ring-[#0d6efd]"
              >
                {[30, 45, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-label mb-1 block">Player reminders</label>
              <div className="flex flex-wrap gap-2">
                {PLAYER_REMINDER_OPTIONS.map((option) => {
                  const active = playerReminderMinutes === option.value
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setPlayerReminderMinutes(option.value)}
                      className={[
                        'rounded-full border px-3 py-1.5 text-xs font-bold transition',
                        active
                          ? 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]'
                          : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#BFD4EA]',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-[11px] font-medium leading-snug text-[#64748B]">
                Contacts receive only useful match updates, not chat.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-1 py-2">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center">
            <SportSectionIcon sport={selectedSport} className="mr-3" />
            <div>
              <h3 className={DS_SECTION_TITLE}>Players</h3>
              <p className="text-body-sub mt-1 text-[#64748B]">
                Choose players to invite, or open spots for others to join.
              </p>
            </div>
          </div>
          <div className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 text-right">
            <span className="text-body-sub block font-bold text-[#1E293B]">{playersNeededCopy}</span>
            {playersProgressCopy ? (
              <span className="text-[11px] font-semibold leading-tight text-[#64748B]">{playersProgressCopy}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          <div className="w-full space-y-3 md:w-1/4">
            <div className={`${ADD_PLAYERS_SECTION_LABEL} mb-1 flex items-center text-[#94A3B8]`}>
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#0d6efd]" />
              Add by
            </div>
            <button
              type="button"
              onClick={() => setSelectionMode('invite')}
              className={[
                'flex h-[48px] w-full items-center gap-2.5 rounded-xl border-2 px-3 text-left transition active:scale-[0.98]',
                selectionMode === 'invite'
                  ? 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd] ring-2 ring-[#0d6efd]/15'
                  : 'border-[#E2E8F0] bg-white text-[#0d6efd] hover:border-[#0d6efd]/35 hover:bg-[#eff6ff]',
              ].join(' ')}
            >
              <span className="text-base">+</span>
              <span className="text-body-main font-medium">Invite</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionMode('request')}
              className={[
                'flex h-[48px] w-full items-center gap-2.5 rounded-xl border-2 px-3 text-left transition active:scale-[0.98]',
                selectionMode === 'request'
                  ? 'border-[#22C55E] bg-[#F0FDF4] text-[#15803D] ring-2 ring-[#22C55E]/15'
                  : 'border-[#E2E8F0] bg-white text-[#15803D] hover:border-[#22C55E]/35 hover:bg-[#F0FDF4]',
              ].join(' ')}
            >
              <span className="text-base">+</span>
              <span className="text-body-main whitespace-nowrap font-medium">Open to Join</span>
            </button>
          </div>

          <div className="w-full md:flex-1">
            <div className={`${ADD_PLAYERS_SECTION_LABEL} mb-4 flex items-center text-[#94A3B8]`}>
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#0d6efd]" />
              Choose players
            </div>
            <div className="flex min-h-[200px] flex-col rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              {!selectionMode ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                  <p className="text-body-main italic leading-relaxed text-[#CBD5E1]">
                    Choose an action on the left to add people or groups.
                  </p>
                </div>
              ) : (
                <div className="flex flex-1 flex-col">
                  <div className="mb-3 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5">
                    <p className="text-body-main font-bold text-[#1E293B]">
                      {selectionMode === 'invite' ? 'Invite specific players' : 'Open spots to join'}
                    </p>
                    <p className="text-body-sub mt-0.5 font-semibold text-[#64748B]">
                      {selectionMode === 'invite'
                        ? 'Choose saved players or contacts to invite directly.'
                        : 'Let eligible players request or join open spots.'}
                    </p>
                  </div>
                  <div className="mb-4 grid gap-2">
                    {selectionMode === 'invite' && (
                      <>
                        {filteredInviteOptions.map((candidate) => renderInviteCandidateButton(candidate))}
                        {filteredInviteGroups.map((group) =>
                          renderGroupSelector(
                            group,
                            invitedGroupIds.includes(group.id),
                            () =>
                              setInvitedGroupIds((prev) =>
                                prev.includes(group.id)
                                  ? prev.filter((id) => id !== group.id)
                                  : [...prev, group.id],
                              ),
                            'indigo',
                          ),
                        )}
                        <NeedMorePlayersPrompt
                          onAdd={() => {
                            setError(null)
                            setContactAddPanelOpen(true)
                          }}
                        />
                      </>
                    )}

                    {selectionMode === 'request' && (
                      <>
                        {filteredRequestUsers.map((candidate) => renderRequestScopeCandidateButton(candidate))}
                        {filteredRequestGroups.map((group) =>
                          renderGroupSelector(
                            group,
                            scopeGroupIds.includes(group.id),
                            () =>
                              setScopeGroupIds((prev) =>
                                prev.includes(group.id)
                                  ? prev.filter((id) => id !== group.id)
                                  : [...prev, group.id],
                              ),
                            'green',
                          ),
                        )}
                        <NeedMorePlayersPrompt
                          onAdd={() => {
                            setError(null)
                            setContactAddPanelOpen(true)
                          }}
                        />
                      </>
                    )}

                    {selectionMode === 'invite' && hasSavedOrContactInvitePlayers && filteredInviteOptions.length === 0 && filteredInviteGroups.length === 0 && (
                      <div className="text-body-main w-full rounded-lg border border-dashed border-[#E2E8F0] bg-white px-4 py-6 text-center text-[#CBD5E1]">
                        Everyone available here is already selected.
                      </div>
                    )}
                    {selectionMode === 'request' && filteredRequestUsers.length === 0 && filteredRequestGroups.length === 0 && (
                      <div className="text-body-main w-full rounded-lg border border-dashed border-[#E2E8F0] bg-white px-4 py-6 text-center text-[#CBD5E1]">
                        Save registered players to your Hood first, or add a group to Visible to Groups.
                      </div>
                    )}
                  </div>

                  {shouldShowHoodPanelButton ? (
                    <div className="mt-auto">
                      <button type="button" className="text-label w-full rounded-xl border border-[#E2E8F0] bg-white py-2 text-[#64748B] transition hover:border-[#0d6efd]/30 hover:text-[#0d6efd]">
                        Hood Panel
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-1/3">
            <div className={`${ADD_PLAYERS_SECTION_LABEL} mb-4 flex items-center text-[#94A3B8]`}>
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#0d6efd]" />
              Summary
            </div>
            <div className="min-h-[200px] rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              {summaryIsEmpty ? (
                <div className="py-10 text-center">
                  <p className="text-body-main font-semibold text-[#94A3B8]">No players selected yet</p>
                  <p className="text-body-sub mx-auto mt-2 max-w-[240px] leading-relaxed text-[#CBD5E1]">
                    Invite players directly, or open spots for eligible players to request.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5">
                    <p className="text-body-main font-bold text-[#1E293B]">{playersNeededCopy}</p>
                    {playersProgressCopy ? (
                      <p className="text-body-sub mt-0.5 font-semibold text-[#64748B]">{playersProgressCopy}</p>
                    ) : null}
                  </div>

                  {(selectedInvitePlayers.length > 0 || selectedInvitedGroups.length > 0) && (
                    <div>
                      <div className="mb-2 flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0d6efd]" />
                        <div>
                          <span className="text-label">Invited</span>
                          <p className="text-body-sub mt-0.5 font-semibold leading-snug text-[#64748B]">
                            {inviteSummaryCopy}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedInvitePlayers.map((member) => (
                          <button
                            key={member.key}
                            type="button"
                            onClick={() => setSelectedDirectInviteKeys((prev) => {
                              const next = new Set(prev)
                              next.delete(member.key)
                              return next
                            })}
                            className="text-body-sub flex items-center rounded-lg border border-[#0d6efd]/15 bg-[#eff6ff] px-2 py-1 font-semibold text-[#0d6efd]"
                          >
                            <ParticipantQuickPreviewTrigger
                              target={{
                                userId: member.userId ?? null,
                                guestId: member.guestId ?? null,
                                displayName: member.name,
                                gender: member.gender,
                              }}
                            >
                              <span>{member.name}</span>
                            </ParticipantQuickPreviewTrigger>
                            <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
                          </button>
                        ))}
                        {selectedInvitedGroups.map((group) =>
                          renderSelectedGroupChip(
                            group,
                            'orange',
                            () => setInvitedGroupIds((prev) => prev.filter((id) => id !== group.id)),
                          ),
                        )}
                      </div>

                      {selectedInviteWarnings.length > 0 ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-amber-100 bg-white px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            <span className="text-label">Availability heads-up</span>
                          </div>
                          <div className="space-y-2">
                            {selectedInviteWarnings.map(({ candidate, warning }) => (
                              <div
                                key={`summary-warning-${candidate.key}`}
                                className={[
                                  'text-body-sub rounded-lg border px-2.5 py-2',
                                  warning.level === 'busy'
                                    ? 'border-amber-100 bg-amber-50 text-amber-700'
                                    : warning.level === 'away'
                                      ? 'border-orange-100 bg-orange-50 text-orange-700'
                                      : 'border-rose-100 bg-rose-50 text-rose-700',
                                ].join(' ')}
                              >
                                <p className="font-bold">
                                  {candidate.name} · {warning.label}
                                </p>
                                <p className="mt-0.5 leading-4 opacity-90">{warning.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {(selectedScopeUsers.length > 0 || selectedScopeGroups.length > 0) && (
                    <div>
                      <div className="mb-2 flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-400" />
                        <div>
                          <span className="text-label">Open to Join</span>
                          <p className="text-body-sub mt-0.5 font-semibold leading-snug text-[#64748B]">
                            {openJoinSummaryCopy}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedScopeUsers.map((candidate) => (
                          <button
                            key={`summary-request-${candidate.key}`}
                            type="button"
                            onClick={() => setScopeUserIds((prev) => prev.filter((id) => id !== candidate.userId))}
                            className="text-body-sub flex items-center rounded-lg border border-green-100 bg-green-50 px-2 py-1 font-semibold text-green-700"
                          >
                            <ParticipantQuickPreviewTrigger
                              target={{
                                userId: candidate.userId ?? null,
                                guestId: candidate.guestId ?? null,
                                displayName: candidate.name,
                                gender: candidate.gender,
                              }}
                            >
                              <span>{candidate.name}</span>
                            </ParticipantQuickPreviewTrigger>
                            <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
                          </button>
                        ))}
                        {selectedScopeGroups.map((group) =>
                          renderSelectedGroupChip(
                            group,
                            'green',
                            () => setScopeGroupIds((prev) => prev.filter((id) => id !== group.id)),
                            `summary-request-group-${group.id}`,
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={`${DS_CARD} p-5`}>
        <button
          type="button"
          onClick={() => setOrganizerNoteExpanded((expanded) => !expanded)}
          className="flex w-full items-center justify-between rounded-xl p-1 text-left transition hover:bg-[#F8FAFC]"
        >
          <div className="flex items-center gap-3">
            <SportSectionIcon sport={selectedSport} />
            <h3 className={DS_SECTION_TITLE}>Host Note</h3>
            {organizerNote.trim() && !organizerNoteExpanded ? (
              <span className="text-body-sub rounded-full border border-[#0d6efd]/15 bg-[#eff6ff] px-2 py-0.5 font-bold text-[#0d6efd]">
                Saved
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!organizerNoteExpanded && !organizerNote.trim() ? (
              <span className="text-body-main font-medium text-[#0d6efd]">+ Add Note</span>
            ) : null}
            <span
              className={`text-sm text-[#94A3B8] transition-transform ${organizerNoteExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              v
            </span>
          </div>
        </button>

        {organizerNoteExpanded ? (
          <div className="mt-4 space-y-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {ORGANIZER_NOTE_PRESETS.map((group) => (
                <div key={group.label} className="flex items-center gap-2 border-r border-[#E2E8F0] pr-4 last:border-r-0 last:pr-0">
                  <span className="text-label text-[#94A3B8]">{group.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => appendOrganizerNote(item)}
                        className={[
                          'text-body-main rounded-md border px-2 py-1 font-medium shadow-sm transition active:scale-95',
                          organizerNoteSentences.has(item.full)
                            ? 'border-[#0d6efd]/35 bg-[#eff6ff] text-[#0d6efd]'
                            : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0d6efd]/45 hover:text-[#0d6efd]',
                        ].join(' ')}
                      >
                        {item.chip}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative">
              <textarea
                ref={organizerNoteRef}
                value={organizerNote}
                onChange={(e) => setOrganizerNote(e.target.value)}
                placeholder="Anything else for the group?"
                className="text-body-main h-[100px] w-full resize-none rounded-xl border border-[#E2E8F0] bg-white p-3 leading-relaxed text-[#1E293B] shadow-inner outline-none transition placeholder:text-[#CBD5E1] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
              />
              {organizerNote.trim() ? (
                <button
                  type="button"
                  onClick={() => setOrganizerNote('')}
                  className="text-body-sub absolute right-2 top-2 rounded-md border border-[#E2E8F0] bg-white/90 p-1 text-[#94A3B8] shadow-sm transition hover:text-[#64748B]"
                >
                  x
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setOrganizerNoteExpanded(false)}
              className="text-body-main flex w-full items-center justify-center border-t border-[#E2E8F0] pt-2 font-medium text-[#94A3B8] transition hover:text-[#0d6efd]"
            >
              Confirm
            </button>
          </div>
        ) : null}
      </section>

            {!reviewOpen && error && (
              <p className="text-body-main rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-600">
                {error}
              </p>
            )}

            <div className="sticky bottom-[5.3rem] z-20 -mx-5 border-t border-[#E2E8F0] bg-white/95 px-5 pb-1 pt-4 backdrop-blur md:static md:mx-0 md:border-t-0 md:bg-transparent md:px-0 md:pb-0">
            <div className="mb-20 flex flex-col gap-4 md:mb-0 md:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="text-h2 w-full rounded-2xl bg-[#0d6efd] px-6 py-4 text-white shadow-[0_18px_40px_-24px_rgba(13, 110, 253, 0.7)] transition hover:bg-[#0b5ed7] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && submitMode === 'create'
                  ? (matchMode === 'recurring' ? 'Creating...' : 'Posting...')
                  : (matchMode === 'recurring' ? 'Review & Create Recurring Match' : 'Review & Post Match')}
              </button>
            </div>
            </div>
          </div>
        ) : null}
      </section>
    </form>
    <ReviewMatchModal
      open={reviewOpen}
      recurring={matchMode === 'recurring'}
      recurringCount={recurringWeeksAheadCount}
      sportLabel={selectedSport?.display_name ?? 'Not selected'}
      venueLabel={selectedVenue?.name ?? 'Not selected'}
      gameTypeLabel={gameType}
      formatLabel={selectedFormatLabel}
      dateLabel={formatReviewDate(matchDate)}
      timeRangeLabel={formatReviewTimeRange(startTime, durationMinutes)}
      durationLabel={`${durationMinutes} Min`}
      courtLabel={reviewCourtSummary}
      courtSecured={courtPlanMode === 'secured'}
      neededLabel={`${requiredCount} Players`}
      directInviteItems={reviewDirectInviteLabels}
      requestItems={reviewRequestItems}
      organizerNote={organizerNote}
      error={reviewOpen ? error : null}
      posting={loading && submitMode === 'create'}
      onClose={() => {
        setReviewOpen(false)
        setError(null)
      }}
      onConfirm={handleConfirmCreate}
    />
    </>
  )
}
