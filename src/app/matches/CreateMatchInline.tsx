'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'
import { ParticipantQuickPreviewTrigger } from '@/app/components/ParticipantQuickPreviewTrigger'
import { AddMyContactPanel } from '@/app/dashboard/AddMyContactPanel'
import { AddPlayersPickerPanel, type AddPlayersCandidate, type AddPlayersMode } from '@/app/matches/AddPlayersPickerPanel'
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

type PlayerPickerFilter = 'all' | 'saved' | 'contacts' | 'groups'
type PlayerPickerMode = 'invite' | 'request' | 'share'
type PlayerPickerItem =
  | {
      key: string
      kind: 'candidate'
      name: string
      candidate: InviteCandidate
    }
  | {
      key: string
      kind: 'group'
      name: string
      group: Group
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

type CreateFlowStep = 'details' | 'players' | 'review'

const CREATE_FLOW_STEPS: { key: CreateFlowStep; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'players', label: 'Players' },
  { key: 'review', label: 'Review' },
]

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

function getPickerFilterOptions(mode: PlayerPickerMode): Array<{ value: PlayerPickerFilter; label: string }> {
  if (mode === 'request') {
    return [
      { value: 'all', label: 'All' },
      { value: 'saved', label: 'Saved' },
      { value: 'groups', label: 'Groups' },
    ]
  }

  return [
    { value: 'all', label: 'All' },
    { value: 'saved', label: 'Saved' },
    { value: 'contacts', label: 'Contacts' },
    { value: 'groups', label: 'Groups' },
  ]
}

function pickerItemMatches(item: PlayerPickerItem, query: string, filter: PlayerPickerFilter) {
  const normalizedQuery = query.trim().toLowerCase()

  if (filter === 'groups' && item.kind !== 'group') return false
  if (filter === 'contacts' && !(item.kind === 'candidate' && item.candidate.kind === 'contact')) return false
  if (filter === 'saved' && !(item.kind === 'candidate' && item.candidate.source === 'saved_players')) return false

  if (!normalizedQuery) return true
  return item.name.toLowerCase().includes(normalizedQuery)
}

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
// Product decision: Match Create no longer exposes reminder choices.
// New matches keep the existing day-before player reminder behavior.
const DEFAULT_PLAYER_REMINDER_MINUTES = 1440

const DS_CARD = 'rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]'
const DS_SECTION_TITLE = 'text-h2 text-[#1E293B]'
const DS_LABEL = 'text-label mb-1 block'
const ADD_PLAYERS_SECTION_LABEL = 'text-[9px] font-extrabold leading-[1.2] tracking-normal normal-case'
const DS_FIELD =
  'text-body-main w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10'
const DS_COMPACT_FIELD =
  'h-9 w-full rounded-xl border border-[#D7E2F0] bg-white px-3 text-[13px] font-bold text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10 md:h-12 md:px-4 md:text-[15px]'
const DS_COMPACT_CHIP =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-xl border px-2.5 text-[13px] font-black transition'
const DS_OPTION_BUTTON =
  'text-body-main inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-center font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/10'
const DS_OPTION_SELECTED = 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd] shadow-[0_10px_22px_-20px_rgba(13,110,253,0.8)]'
const DS_OPTION_UNSELECTED = 'border-[#E2E8F0] bg-white text-[#52647E] hover:border-[#BFD4EA] hover:bg-[#F8FBFF]'

const COURT_PLAN_OPTIONS: { value: MatchCourtPlanMode; label: string }[] = [
  { value: 'secured', label: 'Court secured' },
  { value: 'self_book_later', label: 'Host books later' },
  { value: 'needs_help_booking', label: 'Players help book' },
  { value: 'walk_in', label: 'Walk-in / no booking' },
]

function getDefaultCourtPlanModeForVenueKind(venueKind: Venue['venue_kind'] | null | undefined): MatchCourtPlanMode | null {
  if (!venueKind) return null
  if (venueKind === 'club') return 'secured'
  if (venueKind === 'park' || venueKind === 'community_centre' || venueKind === 'school' || venueKind === 'condo') {
    return 'walk_in'
  }
  return null
}

function ContactAddIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="7.7" cy="7.2" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.8 15c.7-2 2-3 3.9-3s3.2 1 3.9 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="13.6" cy="8.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.7 12.3c1.5.2 2.6 1 3.2 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AddContactSecondaryAction({ onAdd, className = '' }: { onAdd: () => void; className?: string }) {
  return (
    <div className={`flex ${className}`}>
      <button
        type="button"
        onClick={onAdd}
        className="text-body-sub inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D7E3F4] bg-white px-3 py-1.5 font-bold text-[#0B1F44] transition hover:border-[#B8C8DF] hover:bg-[#F8FBFF]"
      >
        <ContactAddIcon />
        <span className="text-base leading-none">+</span>
        Add My Contact
      </button>
    </div>
  )
}

function ReviewLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] py-2.5 last:border-b-0">
      <span className="text-body-sub font-semibold text-[#64748B]">{label}</span>
      <span className="max-w-[62%] text-right text-body-main font-bold text-[#1E293B]">{value}</span>
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

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInputValue(dateStr: string) {
  const [yearPart, monthPart, dayPart] = dateStr.split('-')
  const year = Number.parseInt(yearPart ?? '', 10)
  const month = Number.parseInt(monthPart ?? '', 10)
  const day = Number.parseInt(dayPart ?? '', 10)
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null
  const value = new Date(year, month - 1, day)
  return Number.isNaN(value.getTime()) ? null : value
}

function formatDateChipDay(dateStr: string) {
  const value = parseDateInputValue(dateStr)
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', { weekday: 'short' }).format(value)
}

function formatDateChipDate(dateStr: string) {
  const value = parseDateInputValue(dateStr)
  if (!value) return dateStr
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(value)
}

function formatCompactDateChip(dateStr: string) {
  const value = parseDateInputValue(dateStr)
  if (!value) return dateStr
  return `${new Intl.DateTimeFormat('en-CA', { weekday: 'short' }).format(value)} ${value.getDate()}`
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
                <span className="text-label text-[#64748B]">Post to Board</span>
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
              Saved registered players can be added through Invite here. Open the full profile for more details.
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
  const [createStep, setCreateStep] = useState<CreateFlowStep>('details')
  const createFormRef = useRef<HTMLFormElement | null>(null)
  const createFlowContentRef = useRef<HTMLDivElement | null>(null)
  const [matchMode] = useState<'one-time' | 'recurring'>('one-time')
  const [requiredCount, setRequiredCount] = useState(4)
  const [matchDate, setMatchDate] = useState('')
  const [customDateOpen, setCustomDateOpen] = useState(false)
  const [startTime, setStartTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const playerReminderMinutes = DEFAULT_PLAYER_REMINDER_MINUTES
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
  const [courtPlanMenuOpen, setCourtPlanMenuOpen] = useState(false)
  const [courtLabelEditorOpen, setCourtLabelEditorOpen] = useState(false)
  const [organizerNote, setOrganizerNote] = useState('')
  const [organizerNoteExpanded, setOrganizerNoteExpanded] = useState(false)
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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectionMode, setSelectionMode] = useState<PlayerPickerMode>('invite')
  const [playerPickerSearch, setPlayerPickerSearch] = useState('')
  const [playerPickerFilter, setPlayerPickerFilter] = useState<PlayerPickerFilter>('all')
  const [contactAddPanelOpen, setContactAddPanelOpen] = useState(false)
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

  const selectedInvitePlayers = useMemo(() => {
    const selected = new Set(selectedDirectInviteKeys)
    return availableInviteOptions.filter((member) => selected.has(member.key) && !(member.kind === 'contact' && member.hasReachableChannel === false))
  }, [availableInviteOptions, selectedDirectInviteKeys])

  const filteredRequestGroups = useMemo(() => {
    return groups.filter((group) => !invitedGroupIds.includes(group.id))
  }, [groups, invitedGroupIds])

  const filteredRequestUsers = useMemo(() => {
    return requestScopeUserCandidates
  }, [requestScopeUserCandidates])

  const invitePickerItems = useMemo<PlayerPickerItem[]>(
    () =>
      [
        ...filteredInviteOptions.map((candidate) => ({
          key: `candidate:${candidate.key}`,
          kind: 'candidate' as const,
          name: candidate.name,
          candidate,
        })),
        ...filteredInviteGroups.map((group) => ({
          key: `group:${group.id}`,
          kind: 'group' as const,
          name: group.name,
          group,
        })),
      ].sort((left, right) => left.name.localeCompare(right.name)),
    [filteredInviteGroups, filteredInviteOptions],
  )

  const requestPickerItems = useMemo<PlayerPickerItem[]>(
    () =>
      [
        ...filteredRequestUsers.map((candidate) => ({
          key: `candidate:${candidate.key}`,
          kind: 'candidate' as const,
          name: candidate.name,
          candidate,
        })),
        ...filteredRequestGroups.map((group) => ({
          key: `group:${group.id}`,
          kind: 'group' as const,
          name: group.name,
          group,
        })),
      ].sort((left, right) => left.name.localeCompare(right.name)),
    [filteredRequestGroups, filteredRequestUsers],
  )

  const pickerFilterOptions = useMemo(
    () => getPickerFilterOptions(selectionMode),
    [selectionMode],
  )

  const pickerItems = selectionMode === 'request' ? requestPickerItems : invitePickerItems
  const addPlayersMode: AddPlayersMode =
    selectionMode === 'request'
      ? 'playerCall'
      : selectionMode === 'share'
        ? 'shareLink'
        : 'invite'
  const sharedPickerCandidates = useMemo<AddPlayersCandidate[]>(() => (
    pickerItems.map((item) => {
      if (item.kind === 'group') {
        const selected = selectionMode === 'invite'
          ? invitedGroupIds.includes(item.group.id)
          : scopeGroupIds.includes(item.group.id)

        return {
          key: item.key,
          name: item.group.name,
          kind: 'group',
          filterTags: ['groups'],
          selected,
          title: item.group.name,
          previewTitle: item.group.name,
          previewSubtitle: 'Group',
          previewDetails: (
            <p className="m-0">
              Group target for this match.
            </p>
          ),
          payload: item,
        }
      }

      const candidate = item.candidate
      const isContact = candidate.kind === 'contact'
      const isSelected = selectionMode === 'invite'
        ? selectedDirectInviteKeys.has(candidate.key)
        : Boolean(candidate.userId && scopeUserIds.includes(candidate.userId))
      const contactUnavailable = selectionMode === 'invite'
        && isContact
        && candidate.hasReachableChannel === false
      const contactStatusLabel = contactUnavailable
        ? candidate.emailOptedOut || candidate.smsOptedOut
          ? 'Unsubscribed'
          : 'No email or phone'
        : null
      const availabilityWarning = !isContact ? getAvailabilityWarning(candidate) : null
      const availabilityLabel = !isContact ? getAvailabilityStatusLabel(candidate.availabilityStatus) : null
      const filterTags = isContact
        ? ['contacts']
        : [candidate.source === 'saved_players' ? 'saved' : null].filter((tag): tag is string => Boolean(tag))

      return {
        key: item.key,
        name: candidate.name,
        kind: isContact ? 'contact' : 'person',
        filterTags,
        selected: isSelected,
        disabled: contactUnavailable,
        searchText: `${candidate.name} ${candidate.sourceLabels.join(' ')}`,
        title: contactStatusLabel
          ? `${candidate.name}: ${contactStatusLabel}`
          : availabilityWarning
            ? `${candidate.name}: ${candidate.sourceLabels.join(', ')}. ${availabilityWarning.label}. ${availabilityWarning.message}`
            : `${candidate.name}: ${candidate.sourceLabels.join(', ')}`,
        previewTitle: candidate.name,
        previewSubtitle: isContact ? 'Contact player' : candidate.sourceLabels.join(', '),
        previewDetails: (
          <div className="space-y-1">
            {availabilityLabel ? <p className="m-0">{availabilityLabel}</p> : null}
            {contactStatusLabel ? <p className="m-0">{contactStatusLabel}</p> : null}
            {availabilityWarning ? <p className="m-0">{availabilityWarning.message}</p> : null}
          </div>
        ),
        leadingNode: !isContact ? (
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${getAvailabilityDotClass(candidate.availabilityStatus)}`}
            aria-label={availabilityLabel ?? 'Available'}
            title={availabilityLabel ?? 'Available'}
          />
        ) : null,
        labelNode: (
          <span>{candidate.name}</span>
        ),
        trailingNode: contactStatusLabel ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
            {contactStatusLabel}
          </span>
        ) : null,
        payload: item,
      }
    })
  ), [
    invitedGroupIds,
    pickerItems,
    scopeGroupIds,
    scopeUserIds,
    selectedDirectInviteKeys,
    selectionMode,
  ])

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

  useEffect(() => {
    if (!createExpanded) return
    createFormRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [createExpanded, createStep])

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

  const todayDateValue = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return toDateInputValue(today)
  }, [])

  const dateChoices = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 14 }, (_, index) => {
      const value = new Date(today)
      value.setDate(today.getDate() + index)
      return toDateInputValue(value)
    })
  }, [])

  const activeStepIndex = CREATE_FLOW_STEPS.findIndex((step) => step.key === createStep)
  const selectedVenueLabel = selectedVenue?.name?.trim() || 'Not selected'
  const selectedCourtPlanLabel = COURT_PLAN_OPTIONS.find((option) => option.value === courtPlanMode)?.label ?? 'Not selected'
  const selectedDateIsOutsideStrip = Boolean(matchDate && !dateChoices.includes(matchDate))

  const summaryIsEmpty = selectedInvitePlayers.length === 0
    && selectedInvitedGroups.length === 0
    && selectedScopeUsers.length === 0
    && selectedScopeGroups.length === 0
  const inviteSelectionCount = selectedInvitePlayers.length + selectedInvitedGroups.length
  const playerCallTargetCount = selectedScopeUsers.length + selectedScopeGroups.length
  const reviewPlayersCopy = summaryIsEmpty
    ? 'No players selected yet'
    : [
        reviewDirectInviteLabels.length > 0 ? `${reviewDirectInviteLabels.length} invited` : null,
        reviewRequestItems.length > 0 ? `${reviewRequestItems.length} Player Call` : null,
      ].filter(Boolean).join(' / ')
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

  const createMatchFlow = async (mode: 'create' | 'invite' = 'create') => {
    setError(null)
    setCourtPlanMenuOpen(false)
    setCourtLabelEditorOpen(false)
    setLoading(true)

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
    }
  }

  const validateDetailsStep = () => {
    setCourtPlanMenuOpen(false)
    setCourtLabelEditorOpen(false)
    setError(null)

    if (!venueId) {
      setError('Please choose a venue.')
      return false
    }

    if (!matchDate) {
      setError(matchMode === 'recurring'
        ? 'Please choose the first match date for the recurring series.'
        : 'Please choose a match date.')
      return false
    }

    if (matchDate < todayDateValue) {
      setError('Please choose today or a future date.')
      return false
    }

    if (!startTime) {
      setError('Please choose a start time.')
      return false
    }

    if (courtPlanMode === 'secured' && selectedCourtLabels.length === 0) {
      setError('Please choose at least one court.')
      return false
    }

    if (new Set(selectedCourtLabels).size !== selectedCourtLabels.length) {
      setError('Please choose different courts for each selected slot.')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (createStep === 'details') {
      if (!validateDetailsStep()) return
      setCreateStep('players')
      return
    }

    if (createStep === 'players') {
      setError(null)
      setCreateStep('review')
      return
    }

    if (!validateDetailsStep()) {
      setCreateStep('details')
      return
    }

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

  const switchPlayerPickerMode = (mode: PlayerPickerMode) => {
    setSelectionMode(mode)
    setPlayerPickerSearch('')
    setPlayerPickerFilter('all')
  }

  const switchSharedPlayerPickerMode = (mode: AddPlayersMode) => {
    switchPlayerPickerMode(mode === 'playerCall' ? 'request' : mode === 'shareLink' ? 'share' : 'invite')
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

  const toggleRequestScopeCandidate = (candidate: InviteCandidate) => {
    if (candidate.kind !== 'user' || !candidate.userId) return

    setScopeUserIds((prev) =>
      prev.includes(candidate.userId as string)
        ? prev.filter((id) => id !== candidate.userId)
        : [...prev, candidate.userId as string],
    )
  }

  const toggleInviteGroup = (group: Group) => {
    setInvitedGroupIds((prev) =>
      prev.includes(group.id)
        ? prev.filter((id) => id !== group.id)
        : [...prev, group.id],
    )
  }

  const toggleRequestScopeGroup = (group: Group) => {
    setScopeGroupIds((prev) =>
      prev.includes(group.id)
        ? prev.filter((id) => id !== group.id)
        : [...prev, group.id],
    )
  }

  const toggleSharedPlayerCandidate = (candidate: AddPlayersCandidate) => {
    const item = candidate.payload as PlayerPickerItem | undefined
    if (!item) return

    if (item.kind === 'candidate') {
      if (selectionMode === 'request') {
        toggleRequestScopeCandidate(item.candidate)
      } else if (selectionMode === 'invite') {
        toggleDirectInviteCandidate(item.candidate)
      }
      return
    }

    if (selectionMode === 'request') {
      toggleRequestScopeGroup(item.group)
    } else if (selectionMode === 'invite') {
      toggleInviteGroup(item.group)
    }
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
            Match created. Pick Invite from your saved registered players, then open the match once they are recorded as pending.
          </p>
        </div>

        {inviteTargets.length === 0 ? (
          <div className="text-body-main rounded-2xl border border-gray-200 bg-white px-4 py-4 text-gray-500">
            No saved registered players are available for Invite right now.
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

  const stepCtaLabel = createStep === 'details'
    ? 'Next: Players'
    : createStep === 'players'
      ? 'Next: Review'
      : loading
        ? 'Creating...'
        : 'Create Match'

  const selectedPlayersFooter = selectionMode === 'share' ? null : (
    <div className="space-y-2 px-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-extrabold leading-[1.2] tracking-normal text-[#64748B]">
          {selectionMode === 'request' ? 'Selected audience' : 'Selected invitees'}
        </p>
        {selectionMode === 'invite' ? (
          <AddContactSecondaryAction
            onAdd={() => {
              setError(null)
              setContactAddPanelOpen(true)
            }}
          />
        ) : null}
      </div>

      {selectionMode === 'request' ? (
        playerCallTargetCount === 0 ? (
          <p className="text-body-sub font-semibold text-[#94A3B8]">No one yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedScopeUsers.map((candidate) => (
              <button
                key={`call-target-${candidate.key}`}
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
                `call-target-group-${group.id}`,
              ),
            )}
          </div>
        )
      ) : inviteSelectionCount === 0 ? (
        <p className="text-body-sub font-semibold text-[#94A3B8]">No people or groups selected yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-body-sub mr-1 font-semibold text-[#64748B]">
            {inviteSelectionCount} selected
          </span>
          {selectedInvitePlayers.map((member) => (
            <button
              key={`invite-selected-${member.key}`}
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
      )}
    </div>
  )

  return (
    <>
    {contactAddPanelOpen ? (
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Close add contact"
          className="absolute inset-0 bg-[#0B1F44]/35 backdrop-blur-sm"
          onClick={() => {
            setContactAddPanelOpen(false)
            setError(null)
          }}
        />
        <div className="relative max-h-[100dvh] w-full overflow-y-auto p-4 sm:max-h-[90vh] sm:max-w-5xl sm:p-0">
          <AddMyContactPanel
            userId={currentUserId}
            existingContacts={existingImportContacts}
            onParseScreenshots={onParseScreenshots}
            onImportScreenshotContacts={onImportScreenshotContacts}
            onImported={async () => {
              await loadContactInviteCandidates()
              setSelectionMode('invite')
              setContactAddPanelOpen(false)
              setInviteNotice('Imported contacts were saved. You can invite them from your saved contact players.')
            }}
            displayName={contactDisplayName}
            email={contactEmail}
            phone={contactPhone}
            notes={contactNotes}
            creatingContact={creatingContact}
            error={error}
            onDisplayNameChange={setContactDisplayName}
            onEmailChange={setContactEmail}
            onPhoneChange={setContactPhone}
            onNotesChange={setContactNotes}
            onManualSubmit={handleCreateContactPlayer}
            onClose={() => {
              setContactAddPanelOpen(false)
              setError(null)
            }}
            onCancel={() => {
              setContactAddPanelOpen(false)
              setError(null)
            }}
            onClearError={() => setError(null)}
          />
        </div>
      </div>
    ) : null}
    <form
      ref={createFormRef}
      id="create-match-inline"
      onSubmit={handleSubmit}
      className="transition duration-200 md:mx-auto md:w-full md:max-w-[900px]"
    >
      <section className={`${createExpanded ? 'overflow-visible' : 'overflow-hidden'} ${DS_CARD}`}>
        <button
          type="button"
          onClick={() => {
            setCreateExpanded((expanded) => !expanded)
            setError(null)
          }}
          className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition hover:bg-[#F8FBFF] sm:px-5 md:gap-4 md:px-7 md:py-5"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-black leading-5 text-[#0B1F47] sm:text-[16px] md:text-[22px] md:leading-7">Create Match</p>
            <p className="truncate text-[12px] font-semibold leading-4 text-[#64748B] md:mt-1 md:text-[15px] md:leading-5">
              {createExpanded ? `${CREATE_FLOW_STEPS[activeStepIndex]?.label} - Step ${activeStepIndex + 1} of 3` : 'Choose venue and time'}
            </p>
          </div>
          <span
            className={[
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[18px] font-bold text-[#0d6efd] transition-transform md:h-10 md:w-10 md:text-[20px]',
              createExpanded ? 'rotate-45' : '',
            ].join(' ')}
            aria-hidden="true"
          >
            +
          </span>
        </button>

        {createExpanded ? (
          <div ref={createFlowContentRef} className="border-t border-[#F1F5F9] px-4 pb-0 pt-3 sm:px-5 md:space-y-6 md:px-6 md:pb-6 md:pt-6">
      {starterHint ? (
        <div className="mb-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-body-sub font-semibold text-[#0b5ed7] md:mb-0 md:rounded-2xl md:px-4 md:py-3 md:text-body-main">
          Start now and add more players later.
        </div>
      ) : null}
      {createStep !== 'details' ? (
      <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-full bg-[#F8FAFC] p-0.5 md:mb-0 md:gap-2 md:p-1">
        {CREATE_FLOW_STEPS.map((step, index) => {
          const isActive = createStep === step.key
          const isComplete = index < activeStepIndex
          const canOpen = index <= activeStepIndex
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => {
                if (!canOpen) return
                setCreateStep(step.key)
                setError(null)
              }}
              disabled={!canOpen}
              className={[
                'h-7 rounded-full px-2 text-center text-[11px] font-black transition md:h-10 md:text-[13px]',
                isActive
                  ? 'bg-white text-[#0d6efd] shadow-sm ring-1 ring-[#0d6efd]/25'
                  : isComplete
                    ? 'text-[#1E293B]'
                    : 'text-[#94A3B8]',
                !canOpen ? 'cursor-not-allowed opacity-70' : 'hover:bg-white hover:text-[#0d6efd]',
              ].join(' ')}
            >
              {index + 1} {step.label}
            </button>
          )
        })}
      </div>
      ) : null}
      {createStep === 'details' ? (
      <>
      <section className="bg-white md:rounded-2xl md:px-1">
        <div className="mb-5 hidden md:block">
          <h3 className={DS_SECTION_TITLE}>Details</h3>
        </div>
        <div className="space-y-2.5 md:space-y-6">
          <div className="grid grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)] md:gap-5">
            <div className="min-w-0">
              <label className={DS_LABEL}>Sport</label>
              <div className="grid grid-cols-2 gap-1 md:flex md:flex-wrap md:gap-2">
                {sports.map((sport) => {
                  const selected = sport.id === sportId
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => setSportId(sport.id)}
                      className={[
                        'inline-flex h-8 min-w-0 items-center justify-center rounded-xl border px-1 text-[11px] font-black transition md:h-10 md:px-4 md:text-body-main',
                        selected ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                      ].join(' ')}
                    >
                      <span className="truncate">{sport.display_name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="min-w-0">
              <label className={DS_LABEL}>Players needed</label>
              <div className="grid grid-cols-4 gap-1 md:flex md:flex-wrap md:items-center md:gap-3">
                {[2, 4, 8].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      setCustomPlayersOpen(false)
                      setRequiredCount(count)
                    }}
                    className={[
                      'inline-flex h-8 min-w-0 items-center justify-center rounded-xl border px-1 text-[13px] font-black transition md:h-10 md:min-w-10 md:px-3 md:text-title-main',
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
                    'inline-flex h-8 min-w-0 items-center justify-center rounded-xl border px-1 text-[13px] font-black transition md:h-10 md:min-w-10 md:px-3 md:text-title-main',
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
                    className="h-9 w-20 rounded-xl border border-[#E2E8F0] bg-white px-3 text-center text-sm font-bold text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10 md:h-10"
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <label className={DS_LABEL}>Game Type</label>
            <div className="grid grid-cols-[0.86fr_1.14fr] gap-2 md:grid-cols-2 md:gap-3">
              <select
                value={gameType}
                onChange={(event) => {
                  const nextType = event.target.value
                  setGameType(nextType)
                  if (nextType === 'singles' && doublesFormat === 'mixed_doubles') setDoublesFormat('open')
                }}
                className={DS_COMPACT_FIELD}
              >
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>
              <select
                value={doublesFormat}
                onChange={(event) => setDoublesFormat(event.target.value as MatchDoublesFormat)}
                className={DS_COMPACT_FIELD}
              >
                {(gameType === 'singles' ? SINGLES_FORMAT_OPTIONS : DOUBLES_FORMAT_OPTIONS).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={DS_LABEL}>Venue</label>
            {visibleVenueOptions.length > 0 ? (
              <select
                value={venueId}
                onChange={(event) => setVenueId(event.target.value)}
                className={DS_COMPACT_FIELD}
              >
                {visibleVenueOptions.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name?.trim() || venue.abbreviation || 'Unnamed venue'}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-body-sub rounded-xl border border-dashed border-[#D7E2F0] bg-[#F8FBFF] px-3 py-2 text-[#64748B]">
                {venues.length > 0
                  ? `No ${selectedSport?.display_name ?? 'selected sport'} venues match your profile city range.`
                  : 'Add a venue to your profile before creating a match.'}
              </p>
            )}
          </div>

          <div>
            <label className={DS_LABEL}>Court Plan</label>
            <select
              value={courtPlanMode}
              onChange={(event) => setCourtPlanMode(event.target.value as MatchCourtPlanMode)}
              className={DS_COMPACT_FIELD}
            >
              {COURT_PLAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {courtPlanMode === 'secured' ? (
            <div>
              <label className={DS_LABEL}>Court Booked</label>
              <div ref={courtPlanMenuRef} className="space-y-2 md:space-y-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCourtPlanMenuOpen((open) => !open)
                      if (selectedCourtLabels.length > 0) setCourtLabelEditorOpen(true)
                    }}
                    className={[
                      'flex w-full items-center justify-between rounded-md border bg-white px-3 py-1.5 text-xs outline-none transition md:rounded-xl md:px-4 md:py-3 md:text-sm',
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

          <details className="rounded-xl border border-[#E2E8F0] bg-[#F8FBFF] px-3 py-2 md:px-4 md:py-3">
            <summary className="cursor-pointer text-[12px] font-black text-[#52647E] md:text-[13px]">
              More options
            </summary>
            <label className="mt-2 grid grid-cols-[1fr_9.5rem] items-center gap-2 md:grid-cols-[minmax(0,1fr)_12rem] md:gap-3">
              <span className={DS_LABEL}>Courts needed</span>
              <select
                value={courtCount}
                onChange={(event) => setCourtCount(Number.parseInt(event.target.value, 10))}
                className={DS_COMPACT_FIELD}
              >
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>
                    {count} court{count === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
          </details>

        </div>

      </section>

      <section className="space-y-2 md:space-y-4 md:px-1 md:py-1">
        <div className="hidden md:block">
          <h3 className={DS_SECTION_TITLE}>Schedule</h3>
        </div>

        <div className="md:hidden">
          <span className={DS_LABEL}>Date</span>
          <div className="grid grid-cols-4 gap-1">
            {dateChoices.slice(1, 4).map((dateStr) => {
              const selected = matchDate === dateStr && !customDateOpen
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    setCustomDateOpen(false)
                    setMatchDate(dateStr)
                  }}
                  className={[
                    'inline-flex h-8 min-w-0 items-center justify-center rounded-xl border px-1 text-[12px] font-black transition',
                    selected ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
                  ].join(' ')}
                >
                  {formatCompactDateChip(dateStr)}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setCustomDateOpen((open) => !open)}
              className={[
                'inline-flex h-8 min-w-0 items-center justify-center rounded-xl border px-1 text-[12px] font-black transition',
                customDateOpen || selectedDateIsOutsideStrip ? DS_OPTION_SELECTED : DS_OPTION_UNSELECTED,
              ].join(' ')}
            >
              More
            </button>
          </div>
          {customDateOpen || selectedDateIsOutsideStrip ? (
            <input
              type="date"
              value={matchDate}
              min={todayDateValue}
              onChange={(event) => {
                const nextDate = event.target.value
                setMatchDate(nextDate)
                if (nextDate && nextDate < todayDateValue) {
                  setError('Please choose today or a future date.')
                  return
                }
                setError((currentError) => currentError === 'Please choose today or a future date.' ? null : currentError)
              }}
              className={`${DS_COMPACT_FIELD} mt-1.5`}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-1.5 md:hidden">
          <label>
            <span className={DS_LABEL}>Time</span>
            <select
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={DS_COMPACT_FIELD}
            >
              <option value="">Select time</option>
              {TIME_SLOTS.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={DS_LABEL}>Duration</span>
            <select
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(parseInt(event.target.value, 10))}
              className={DS_COMPACT_FIELD}
            >
              {[30, 45, 60, 90, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="hidden grid-cols-12 items-start gap-5 md:grid">
          <div className="col-span-5">
            <MiniCalendar selected={matchDate} onSelect={setMatchDate} dateIndicators={calendarIndicators} />
          </div>

          <div className="col-span-7 flex flex-col gap-4">
            <div>
              <label className="text-label mb-1 block">Start Time</label>
              <select
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={DS_COMPACT_FIELD}
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
                onChange={(event) => setDurationMinutes(parseInt(event.target.value, 10))}
                className={DS_COMPACT_FIELD}
              >
                {[30, 45, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </div>

          </div>
        </div>
      </section>
      </>
      ) : null}

      {createStep === 'players' ? (
      <section className="px-1 py-2 pb-36 md:py-1 md:pb-1">
        <AddPlayersPickerPanel
          mode={addPlayersMode}
          onModeChange={switchSharedPlayerPickerMode}
          searchValue={playerPickerSearch}
          onSearchChange={setPlayerPickerSearch}
          filterValue={playerPickerFilter}
          onFilterChange={(value) => setPlayerPickerFilter(value as PlayerPickerFilter)}
          filterOptions={pickerFilterOptions}
          candidates={sharedPickerCandidates}
          onToggleCandidate={toggleSharedPlayerCandidate}
          shareLinkRow={(
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-main font-black text-[#1E293B]">Share link</span>
              <span className="text-body-sub font-semibold text-[#94A3B8]">Available after creation</span>
            </div>
          )}
          footerSlot={selectedPlayersFooter}
          playerCallSummaryLabel=""
          playerCallHelperText={null}
          playerCallEmptyLabel={(
            'Choose who can see this on their Match Board.'
          )}
        />
      </section>
      ) : null}

      {createStep === 'review' ? (
      <>
      <section className="rounded-xl border border-[#E2E8F0] bg-[#F8FBFF] p-3 md:rounded-2xl md:p-5">
        <h3 className="text-[16px] font-black text-[#1E293B] md:text-h2">Summary</h3>
        <div className="mt-2 rounded-xl border border-[#E2E8F0] bg-white px-3 md:mt-4 md:px-4">
          <ReviewLine label="Sport" value={selectedSport?.display_name ?? 'Not selected'} />
          <ReviewLine label="Players needed" value={`${requiredCount} players`} />
          <ReviewLine label="Game type" value={`${capitalizeLabel(gameType)} / ${selectedFormatLabel}`} />
          <ReviewLine label="Venue" value={selectedVenueLabel} />
          <ReviewLine label="Schedule" value={`${formatReviewDate(matchDate)} / ${formatReviewTimeRange(startTime, durationMinutes)}`} />
          <ReviewLine
            label="Court plan"
            value={courtPlanMode === 'secured' ? `${selectedCourtPlanLabel}: ${reviewCourtSummary}` : selectedCourtPlanLabel}
          />
          <ReviewLine label="Players" value={reviewPlayersCopy} />
        </div>
        {!summaryIsEmpty ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {reviewDirectInviteLabels.length > 0 ? (
              <div className="rounded-xl border border-[#D7E3F4] bg-white p-3 md:p-4">
                <p className="text-label text-[#0d6efd]">Invited</p>
                <p className="mt-1 text-body-main font-semibold text-[#1E293B]">
                  {reviewDirectInviteLabels.map((item) => item.label).join(', ')}
                </p>
              </div>
            ) : null}
            {reviewRequestItems.length > 0 ? (
              <div className="rounded-xl border border-green-100 bg-white p-3 md:p-4">
                <p className="text-label text-green-700">Post to Board</p>
                <p className="mt-1 text-body-main font-semibold text-[#1E293B]">
                  {reviewRequestItems.map((item) => item.label).join(', ')}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-3 md:rounded-2xl md:p-5">
        <button
          type="button"
          onClick={() => setOrganizerNoteExpanded((expanded) => !expanded)}
          className="flex w-full items-center justify-between rounded-xl text-left transition hover:bg-[#F8FAFC] md:p-1"
        >
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-[15px] font-black text-[#1E293B] md:text-h2">Host Note</h3>
              <p className="text-body-sub font-semibold text-[#94A3B8]">{organizerNote.trim() ? 'Added' : 'Optional'}</p>
            </div>
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
          <div className="mt-3 space-y-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 md:mt-4 md:space-y-4 md:rounded-2xl md:p-4">
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
      </>
      ) : null}

            {error && (
              <p className="text-body-main rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-600">
                {error}
              </p>
            )}

            <div className="h-32 md:hidden" aria-hidden="true" />
            <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+7rem)] z-40 rounded-xl border border-[#E2E8F0] bg-white/95 p-1.5 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.45)] backdrop-blur md:static md:inset-auto md:mt-2 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <div className="flex flex-col gap-4 md:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#0d6efd] px-5 py-3 text-[15px] font-black text-white shadow-[0_18px_40px_-24px_rgba(13,110,253,0.7)] transition hover:bg-[#0b5ed7] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 md:rounded-2xl md:px-6 md:py-4 md:text-h2"
              >
                {stepCtaLabel}
              </button>
            </div>
            </div>
          </div>
        ) : null}
      </section>
    </form>
    </>
  )
}
