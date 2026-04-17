'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'
import { processDeliveriesAction } from '@/app/matches/[matchId]/process-deliveries-action'
import { createRecurringMatchSeriesAction } from '@/app/matches/recurring-actions'
import type { CreateRecurringMatchSeriesInput, RecurringDirectInviteInput } from '@/lib/api/recurring-matches'
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
  nominateGuest,
  type ScopeUser,
} from '@/lib/api/matches'
import { getGroups, getGroupMembers } from '@/lib/api/groups'
import { listSports } from '@/lib/api/sports'
import { getInviteCircleList, getVenueInvitableMembers } from '@/lib/api/play-network'
import { getContactPlayerResolution } from '@/lib/api/roster'
import { getAvailabilityStatusLabel } from '@/lib/profile-options'
import type { AvailabilityStatus, Group, Venue, Court, Sport, MatchCourtPlanMode, MatchDoublesFormat } from '@/lib/types/database'

type TooltipState = { kind: 'group-members'; groupId: string } | null

type GroupMemberPreview = {
  count: number
  members: { id: string; name: string }[]
}

type InviteCandidateSource = 'frequent_players' | 'contact_players' | 'saved_players' | 'club_members'

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

const INVITE_SOURCE_CONFIG: Array<{
  source: InviteCandidateSource
  label: string
}> = [
  { source: 'frequent_players', label: 'Played With' },
  { source: 'contact_players', label: 'Contacts' },
  { source: 'saved_players', label: 'Saved' },
  { source: 'club_members', label: 'Club Members' },
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

const COURT_PLAN_OPTIONS: { value: MatchCourtPlanMode; label: string }[] = [
  { value: 'secured', label: 'Court already secured' },
  { value: 'walk_in', label: 'Walk-in / no advance booking' },
  { value: 'self_book_later', label: 'Host will book it later' },
  { value: 'needs_help_booking', label: 'Players can help secure a court' },
]

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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/30 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)]"
      >
        <div className="border-b border-slate-50 px-6 pb-4 pt-6">
          <h3 className="text-xl font-bold text-slate-800">{recurring ? 'Review Recurring Match' : 'Review Match'}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {recurring
              ? `Everything looks good? Create ${recurringCount} weekly match instances now.`
              : 'Everything looks good? Post it now.'}
          </p>
        </div>

        <div className="space-y-6 px-6 pb-6 pt-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Sport</p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">{sportLabel}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Venue</p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">{venueLabel}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Game Type</p>
              <p className="mt-0.5 text-base font-semibold capitalize text-slate-800">{gameTypeLabel}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Format</p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">{formatLabel}</p>
            </div>
          </div>

          <div className="border-t border-slate-100" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Date &amp; Time</p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">
                {dateLabel} <span className="mx-1 text-slate-300">|</span> {timeRangeLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Duration</p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">{durationLabel}</p>
            </div>
          </div>

          <div className="border-t border-slate-100" />

          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Court</p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">
                {courtLabel}
                {courtSecured ? <span className="ml-1 text-xs font-bold text-green-500">● SECURED</span> : null}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Needed</p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">{neededLabel}</p>
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {recurring ? (
            <>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.05em] text-indigo-400">Recurring Setup</p>
                <p className="mt-1 text-sm font-medium text-indigo-700">
                  Creates {recurringCount} weekly match instances. Players sign up for each week separately.
                </p>
              </div>
              <div className="border-t border-slate-100" />
            </>
          ) : null}

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Invitations Summary</p>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Directly Invited</span>
              </div>
              <div className="flex flex-wrap gap-2 pl-3">
                {directInviteItems.length > 0 ? directInviteItems.map((item) => (
                  <span
                    key={`review-direct-${item.label}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[13px] font-medium text-orange-600"
                  >
                    <span className="font-semibold">{item.label}</span>
                    {item.members && item.members.length > 0 ? (
                      <span className="truncate text-[11px] font-medium text-orange-400">
                        · {item.members.join(', ')}
                      </span>
                    ) : null}
                  </span>
                )) : (
                  <span className="pl-0 text-sm text-slate-300">None</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Open to Request</span>
              </div>
              <div className="flex flex-wrap gap-2 pl-3">
                {requestItems.length > 0 ? requestItems.map((item) => (
                  <span
                    key={`review-request-${item.label}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-green-100 bg-green-50 px-2.5 py-1 text-[13px] font-medium text-green-600"
                  >
                    <span className="font-semibold">{item.label}</span>
                    {item.members && item.members.length > 0 ? (
                      <span className="truncate text-[11px] font-medium text-green-400">
                        · {item.members.join(', ')}
                      </span>
                    ) : null}
                  </span>
                )) : (
                  <span className="pl-0 text-sm text-slate-300">None</span>
                )}
              </div>
            </div>
          </div>

          {organizerNote.trim() ? (
            <>
              <div className="border-t border-slate-100" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-400">Organizer Note</p>
                <p className="mt-2 whitespace-pre-line rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                  {organizerNote.trim()}
                </p>
              </div>
            </>
          ) : null}

          <div className="space-y-3 pt-2">
            {error ? (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onConfirm}
              disabled={posting}
              className="w-full rounded-2xl bg-orange-500 py-4 text-lg font-bold text-white transition hover:-translate-y-[1px] hover:bg-orange-600 hover:shadow-[0_10px_15px_-3px_rgba(249,115,22,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {posting ? (recurring ? 'Creating...' : 'Posting...') : (recurring ? 'Create Recurring Match' : 'Post Match Now')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={posting}
              className="w-full py-2 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
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
                <p style={{ margin: '0.12rem 0 0', fontSize: '0.9rem', color: '#111827' }}>{candidate.phone || 'Not provided'}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.74rem', color: '#6b7280' }}>Email</p>
                <p style={{ margin: '0.12rem 0 0', fontSize: '0.9rem', color: '#111827' }}>{candidate.email || 'Not provided'}</p>
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
              This registered player can be added to direct invites here. Open the full profile for more details.
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
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const days = useMemo(() => {
    const first = new Date(year, month, 1)
    const startDay = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [year, month])

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const toDateStr = (d: number) => {
    const mm = (month + 1).toString().padStart(2, '0')
    const dd = d.toString().padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="max-w-[220px] select-none">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[13px] font-bold text-gray-700">
          {monthNames[month]} {year}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-gray-500 transition hover:bg-orange-50 hover:text-orange-500"
            aria-label="Previous month"
          >
            &lt;
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-gray-500 transition hover:bg-orange-50 hover:text-orange-500"
            aria-label="Next month"
          >
            &gt;
          </button>
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-7 text-center text-[9px] font-semibold uppercase tracking-wide text-gray-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} className="aspect-square" />
          const dateStr = toDateStr(d)
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
                'relative aspect-square rounded-full text-[11px] transition',
                isSelected
                  ? 'bg-orange-500 font-semibold text-white shadow-[0_8px_20px_rgba(249,115,22,0.28)]'
                  : isPast
                    ? 'cursor-not-allowed text-gray-300'
                    : isToday
                      ? 'border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100'
                      : 'text-gray-600 hover:bg-orange-100',
              ].join(' ')}
            >
              <span className="flex h-full w-full flex-col items-center justify-center">
                <span>{d}</span>
                {indicators.length > 0 && indicators.length <= 3 ? (
                  <span className="mt-0.5 flex items-center gap-0.5">
                    {indicators.map((indicator, index) => (
                      <span
                        key={`${dateStr}-indicator-${index}`}
                        className={[
                          'inline-block h-1.5 w-1.5 rounded-full',
                          indicator === 'confirmed' ? 'bg-green-500' : 'bg-slate-300',
                        ].join(' ')}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 opacity-0" />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CreateMatchInline({ defaultVenueId }: { defaultVenueId?: string }) {
  const searchParams = useSearchParams()
  const [createExpanded, setCreateExpanded] = useState(false)
  const [matchMode, setMatchMode] = useState<'one-time' | 'recurring'>('one-time')
  const [requiredCount, setRequiredCount] = useState(4)
  const [matchDate, setMatchDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [gameType, setGameType] = useState('doubles')
  const [doublesFormat, setDoublesFormat] = useState<MatchDoublesFormat>('open')
  const [venueId, setVenueId] = useState(defaultVenueId || '')
  const [scopeGroupIds, setScopeGroupIds] = useState<string[]>([])
  const [scopeUserIds, setScopeUserIds] = useState<string[]>([])
  const [invitedGroupIds, setInvitedGroupIds] = useState<string[]>([])
  const [courtPlanMode, setCourtPlanMode] = useState<MatchCourtPlanMode>('secured')
  const [courtPlanNote, setCourtPlanNote] = useState('')
  const [courtCount, setCourtCount] = useState(1)
  const [courtPlanMenuOpen, setCourtPlanMenuOpen] = useState(false)
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
  const [frequentPlayers, setFrequentPlayers] = useState<UserInviteCandidateSeed[]>([])
  const [savedPlayers, setSavedPlayers] = useState<UserInviteCandidateSeed[]>([])
  const [clubMembers, setClubMembers] = useState<UserInviteCandidateSeed[]>([])
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
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [prefillConsumed, setPrefillConsumed] = useState(false)
  const courtPlanMenuRef = useRef<HTMLDivElement | null>(null)
  const organizerNoteRef = useRef<HTMLTextAreaElement | null>(null)
  const router = useRouter()

  const prefillSportId = searchParams.get('createSport')
  const prefillInviteUserId = searchParams.get('inviteUserId')
  const prefillInviteGuestId = searchParams.get('inviteGuestId')

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

    const userCandidates = [...frequentPlayers, ...savedPlayers, ...clubMembers].map((member) => ({
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
  }, [clubMembers, contactPlayers, currentUserId, frequentPlayers, savedPlayers])

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
    return availableInviteOptions.filter((member) => selected.has(member.key))
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

  const selectedCourtIds = useMemo(
    () =>
      visibleCourtSlots
        .filter((slot) => slot.enabled && slot.courtId)
        .map((slot) => slot.courtId),
    [visibleCourtSlots],
  )

  const selectedCourtLabels = useMemo(
    () =>
      selectedCourtIds
        .map((courtId) => courts.find((court) => court.id === courtId)?.court_code ?? '')
        .filter((label) => label.length > 0),
    [courts, selectedCourtIds],
  )

  const selectedSport = useMemo(
    () => sports.find((sport) => sport.id === sportId),
    [sportId, sports],
  )

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === venueId),
    [venueId, venues],
  )
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

  const inviteSourceSummary = useMemo(() => {
    return {
      frequentPlayers: frequentPlayers.filter((member) => member.userId !== currentUserId).length,
      contactPlayers: contactPlayers.length,
      savedPlayers: savedPlayers.filter((member) => member.userId !== currentUserId).length,
      clubMembers: clubMembers.filter((member) => member.userId !== currentUserId).length,
    }
  }, [clubMembers, contactPlayers, currentUserId, frequentPlayers, savedPlayers])

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

    const availableCourtIds = new Set(courts.map((court) => court.id))
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
  }, [courtCount, courts])

  useEffect(() => {
    if (courtPlanMode !== 'secured') {
      setCourtPlanMenuOpen(false)
    }
  }, [courtPlanMode])

  useEffect(() => {
    if (!courtPlanMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!courtPlanMenuRef.current?.contains(event.target as Node)) {
        setCourtPlanMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [courtPlanMenuOpen])

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

        const frequent: UserInviteCandidateSeed[] = []
        const saved: UserInviteCandidateSeed[] = []

        rows.forEach((row) => {
          const profile = profileMap.get(row.target_user_id)
          const entry: UserInviteCandidateSeed = {
            userId: row.target_user_id,
            name: profile?.display_name?.trim() || row.target_display_name?.trim() || 'Unknown',
            source: row.source === 'played_with_auto' ? 'frequent_players' : 'saved_players',
            sourceLabel: row.source === 'played_with_auto' ? 'Played With' : 'Saved',
            gender: profile?.gender ?? null,
            availabilityStatus: profile?.availability_status ?? 'available',
            availabilityNote: profile?.availability_note ?? null,
            availabilityUntil: profile?.availability_until ?? null,
          }

          if (row.source === 'played_with_auto') {
            frequent.push(entry)
          } else {
            saved.push(entry)
          }
        })

        setFrequentPlayers(frequent)
        setSavedPlayers(saved)
      })
      .catch(console.error)
    getContactPlayerResolution(supabase)
      .then((rows) => {
        setContactPlayers(
          rows
            .filter((row) => row.resolution_state === 'contact_only' && !row.linked_user_id)
            .map((row) => ({
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
            })),
        )
      })
      .catch((contactError) => {
        console.error('[CreateMatchInline] contact players:', contactError)
        setContactPlayers([])
      })
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
    getVenues(supabase).then(setVenues).catch(console.error)
    listSports(supabase).then(setSports).catch(console.error)
  }, [])

  useEffect(() => {
    if (!venueId) { setCourts([]); return }
    const supabase = createSupabaseBrowserClient()
    getCourts(supabase, venueId, sportId).then(setCourts).catch(console.error)
  }, [venueId, sportId])

  useEffect(() => {
    if (!venueId) {
      setClubMembers([])
      return
    }

    const supabase = createSupabaseBrowserClient()
    getVenueInvitableMembers(supabase, venueId, currentUserId)
      .then(async (rows) => {
        const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
        const profileMap = new Map<string, {
          display_name: string | null
          gender: 'male' | 'female' | 'unspecified' | null
          availability_status: AvailabilityStatus | null
          availability_note: string | null
          availability_until: string | null
        }>()

        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, gender, availability_status, availability_note, availability_until')
            .in('id', userIds)
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

        setClubMembers(
          rows.map((row) => {
            const profile = profileMap.get(row.user_id)
            return {
              userId: row.user_id,
              name: profile?.display_name?.trim() || row.display_name?.trim() || row.venue_handle?.trim() || 'Unknown',
              source: 'club_members',
              sourceLabel: 'Club Members',
              gender: profile?.gender ?? null,
              availabilityStatus: profile?.availability_status ?? 'available',
              availabilityNote: profile?.availability_note ?? null,
              availabilityUntil: profile?.availability_until ?? null,
            }
          }),
        )
      })
      .catch((inviteSourceError) => {
        console.error('[CreateMatchInline] venue invitable members:', inviteSourceError)
        setClubMembers([])
      })
  }, [currentUserId, venueId])

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
    prefillSportId,
    sportId,
  ])

  const createMatchFlow = async (mode: 'create' | 'invite') => {
    setError(null)
    setLoading(true)
    setSubmitMode(mode)

    const supabase = createSupabaseBrowserClient()
    const selectedCourtLabels = visibleCourtSlots
      .filter((slot) => slot.enabled)
      .map((slot) => {
        if (courts.length > 0) {
          return courts.find((court) => court.id === slot.courtId)?.court_code ?? ''
        }
        return slot.manualLabel.trim()
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

      const selectedCandidates = availableInviteOptions.filter((candidate) => selectedDirectInviteKeys.has(candidate.key))
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
          } else if (candidate.kind === 'contact' && candidate.guestId) {
            await nominateGuest(supabase, match.id, candidate.guestId)
            shouldProcessQueuedDeliveries = true
          }
        } catch (inviteError) {
          console.error(`[CreateMatchInline] direct invite ${candidate.key}:`, inviteError)
        }
      }
      for (const groupId of invitedGroupIds) {
        try {
          await inviteGroupToMatch(supabase, match.id, groupId)
        } catch (groupInviteError) {
          console.error(`[CreateMatchInline] group invite ${groupId}:`, groupInviteError)
        }
      }
      if (shouldProcessQueuedDeliveries) {
        try {
          await processDeliveriesAction()
        } catch (deliveryError) {
          console.error('[CreateMatchInline] process queued deliveries:', deliveryError)
        }
      }
      if (mode === 'invite') {
        const targets = await getAdmissionTargets(supabase, match.id)
        setCreatedMatchId(match.id)
        setInviteTargets(admissionTargetsToScopeUsers(targets, { requireCanAdmit: true }))
        setSelectedDirectInviteKeys(new Set())
        setSelectedPostCreateInviteIds(new Set())
        return
      }

      router.push(`/matches/${match.id}`)
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
    setError(null)

    const selectedCourtLabels = visibleCourtSlots
      .filter((slot) => slot.enabled)
      .map((slot) => {
        if (courts.length > 0) {
          return courts.find((court) => court.id === slot.courtId)?.court_code ?? ''
        }
        return slot.manualLabel.trim()
      })
      .filter((label) => label.length > 0)

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
        currentError?.startsWith('You can select up to ') ? null : currentError,
      )

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
      setError((err as { message?: string })?.message || 'Failed to invite players')
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
      router.push(`/matches/${createdMatchId}`)
      router.refresh()
    } finally {
      setOpenMatchLoading(false)
    }
  }

  const toggleDirectInviteCandidate = (candidate: InviteCandidate) => {
    setSelectedDirectInviteKeys((prev) => {
      const next = new Set(prev)
      if (next.has(candidate.key)) next.delete(candidate.key)
      else next.add(candidate.key)
      return next
    })
  }

  const renderInviteCandidateButton = (candidate: InviteCandidate, compact = false) => {
    const isSelected = selectedDirectInviteKeys.has(candidate.key)
    const availabilityWarning = getAvailabilityWarning(candidate)
    const availabilityClasses =
      availabilityWarning?.level === 'busy'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : availabilityWarning?.level === 'away'
          ? 'border-orange-200 bg-orange-50 text-orange-700'
          : availabilityWarning?.level === 'inactive'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-gray-200 bg-white text-gray-600'
    const stateClasses = isSelected
      ? availabilityWarning
        ? `${availabilityClasses} ring-2 ring-orange-200`
        : 'border-orange-200 bg-orange-50 text-orange-600 ring-2 ring-orange-100'
      : availabilityClasses

    return (
      <button
        key={candidate.key}
        type="button"
        onClick={() => toggleDirectInviteCandidate(candidate)}
        aria-pressed={isSelected}
        title={
          availabilityWarning
            ? `${candidate.name}: ${candidate.sourceLabels.join(', ')} • ${availabilityWarning.label}. ${availabilityWarning.message}`
            : `${candidate.name}: ${candidate.sourceLabels.join(', ')}`
        }
        className={[
          'inline-flex items-center gap-1.5 rounded-full border shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600',
          compact ? 'px-3 py-2 text-[11px]' : 'px-3 py-2 text-[11px]',
          stateClasses,
        ].join(' ')}
      >
        <span className="truncate">{candidate.name}</span>
        {availabilityWarning ? (
          <span
            className={[
              'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]',
              availabilityWarning.level === 'busy'
                ? 'bg-amber-100 text-amber-700'
                : availabilityWarning.level === 'away'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-rose-100 text-rose-700',
            ].join(' ')}
          >
            {availabilityWarning.label}
          </span>
        ) : null}
      </button>
    )
  }

  const renderGroupSelector = (
    group: Group,
    selected: boolean,
    onToggle: () => void,
    tone: 'indigo' | 'green',
  ) => {
    const toneClasses =
      tone === 'green'
        ? selected
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-gray-200 bg-white text-gray-600 hover:border-green-200 hover:bg-green-50 hover:text-green-700'
        : selected
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'

    const memberPreview = groupMembersById[group.id]

    return (
      <div
        key={group.id}
        className="relative inline-flex"
        onMouseEnter={() => setTooltip({ kind: 'group-members', groupId: group.id })}
        onMouseLeave={() =>
          setTooltip((current) =>
            current?.kind === 'group-members' && current.groupId === group.id ? null : current,
          )
        }
      >
        <button
          type="button"
          onClick={onToggle}
          className={[
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-medium shadow-sm transition',
            toneClasses,
          ].join(' ')}
          aria-pressed={selected}
        >
          <span>{group.name}</span>
          <span className="rounded bg-green-100 px-1 py-0.5 text-[9px] font-bold text-green-800">
            Group
          </span>
        </button>

        {tooltip?.kind === 'group-members' && tooltip.groupId === group.id && (
          <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 min-w-[220px] max-w-[280px] rounded-xl border border-gray-200 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.14)]">
            <p className="mb-1 text-xs font-semibold text-gray-900">
              {(memberPreview?.count ?? 0)} member{(memberPreview?.count ?? 0) === 1 ? '' : 's'}
            </p>
            {(memberPreview?.members.length
              ? memberPreview.members.map((member) => member.name)
              : ['No active members yet.']
            ).map((line, index, lines) => (
              <p
                key={`${line}-${index}`}
                className={index === lines.length - 1 ? 'text-xs leading-5 text-gray-600' : 'mb-1 text-xs leading-5 text-gray-600'}
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderRequestScopeCandidateButton = (candidate: InviteCandidate) => {
    if (candidate.kind !== 'user' || !candidate.userId) return null

    const isSelected = scopeUserIds.includes(candidate.userId)

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
          'inline-flex items-center rounded-full border bg-white px-3 py-2 text-[11px] text-gray-600 shadow-sm transition hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50 hover:text-green-600',
          isSelected ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200',
        ].join(' ')}
      >
        <span className="truncate">{candidate.name}</span>
      </button>
    )
  }

  if (createdMatchId) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h4 className="m-0 text-base font-semibold text-gray-900">Invite Player</h4>
          <p className="mt-1 text-sm text-gray-500">
            Match created. Pick players to invite, then open the match once they are recorded as pending.
          </p>
        </div>

        {inviteTargets.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
            No eligible players are available to invite right now.
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              {inviteTargets.map((user) => (
                <label
                  key={user.id}
                  title={`${user.display_name}: ${user.sourceLabel}`}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
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

        {inviteNotice && <p className="m-0 text-sm text-green-700">{inviteNotice}</p>}
        {invitedNames.length > 0 && (
          <p className="m-0 text-sm text-gray-600">
            Pending on this match: {invitedNames.join(', ')}
          </p>
        )}
        {error && <p className="m-0 text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleInviteSelected}
            disabled={selectedPostCreateInviteIds.size === 0 || inviteLoading}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviteLoading ? 'Inviting...' : `Invite selected (${selectedPostCreateInviteIds.size})`}
          </button>
          <button
            type="button"
            onClick={() => { void handleOpenMatch() }}
            disabled={inviteLoading || openMatchLoading}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {openMatchLoading ? 'Opening...' : 'Open match'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          onClick={() => setCreateExpanded((expanded) => !expanded)}
          className="flex w-full items-center justify-between px-6 py-5 text-left transition hover:bg-slate-50/60"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Create a Match</p>
          </div>
          <span
            className={`text-sm text-slate-400 transition-transform ${createExpanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            v
          </span>
        </button>

        {createExpanded ? (
          <div className="space-y-6 border-t border-slate-100 px-6 pb-6 pt-6">
      <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Match Type</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMatchMode('one-time')}
            className={[
              'rounded-2xl border px-4 py-3 text-sm font-semibold transition',
              matchMode === 'one-time'
                ? 'border-orange-200 bg-white text-orange-600 shadow-sm'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            One-time Match
          </button>
          <button
            type="button"
            onClick={() => setMatchMode('recurring')}
            className={[
              'rounded-2xl border px-4 py-3 text-sm font-semibold transition',
              matchMode === 'recurring'
                ? 'border-orange-200 bg-white text-orange-600 shadow-sm'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            Recurring Match
          </button>
        </div>
        {matchMode === 'recurring' ? (
          <p className="mt-2 text-xs text-slate-500">
            This creates the next {recurringWeeksAheadCount} weekly match instances with shared defaults.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white">
        <div className="mb-3 flex items-center">
          <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-600">
            1
          </div>
          <h3 className="text-lg font-semibold text-gray-700">General Information</h3>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Sport</label>
            <select
              value={sportId}
              onChange={(e) => setSportId(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Venue</label>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              <option value="">Select venue</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Game Type</label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              <option value="doubles">Doubles</option>
              <option value="singles">Singles</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Format</label>
            <select
              value={doublesFormat}
              onChange={(e) => setDoublesFormat(e.target.value as MatchDoublesFormat)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              {(gameType === 'singles' ? SINGLES_FORMAT_OPTIONS : DOUBLES_FORMAT_OPTIONS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Players</label>
                <input
                  type="number"
                  min={gameType === 'singles' ? 2 : 4}
                  step={1}
                  value={requiredCount}
                  onChange={(e) => {
                    const fallbackValue = gameType === 'singles' ? 2 : 4
                    const nextValue = Number.parseInt(e.target.value, 10)
                    if (Number.isNaN(nextValue)) {
                      setRequiredCount(fallbackValue)
                      return
                    }
                    setRequiredCount(Math.max(1, nextValue))
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Court Qty</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  step={1}
                  value={courtCount}
                  onChange={(e) => {
                    const nextValue = Number.parseInt(e.target.value, 10)
                    if (Number.isNaN(nextValue)) {
                      setCourtCount(1)
                      return
                    }
                    setCourtCount(Math.min(6, Math.max(1, nextValue)))
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Booking Status</label>
            <select
              value={courtPlanMode}
              onChange={(e) => setCourtPlanMode(e.target.value as MatchCourtPlanMode)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
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
              <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Court Booked</label>
              {courts.length > 0 ? (
                <div ref={courtPlanMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setCourtPlanMenuOpen((open) => !open)}
                    className={[
                      'flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-[13px] outline-none transition',
                      courtPlanMenuOpen
                        ? 'border-orange-400 ring-4 ring-orange-100'
                        : 'border-gray-200 hover:border-orange-200',
                    ].join(' ')}
                  >
                    <span className={selectedCourtLabels.length > 0 ? 'text-gray-700' : 'text-gray-400'}>
                      {selectedCourtLabels.length > 0 ? selectedCourtLabels.join(', ') : 'Select your booked court'}
                    </span>
                    <svg
                      className={`h-4 w-4 text-gray-400 transition ${courtPlanMenuOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {courtPlanMenuOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg">
                      {courts.slice(0, 6).map((court) => {
                        const checked = selectedCourtIds.includes(court.id)
                        return (
                          <label
                            key={court.id}
                            className="flex cursor-pointer items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm text-gray-700 transition last:border-b-0 hover:bg-blue-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCourtSelection(court.id)}
                              className="h-4 w-4 rounded border-gray-400 text-orange-500 focus:ring-orange-400"
                            />
                            <span>{court.court_code}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                  <p className="mt-1 text-[11px] text-gray-400">
                    Choose up to {courtCount} booked court{courtCount === 1 ? '' : 's'}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-[11px] text-gray-400">Choose the court(s) you&apos;ve already booked.</p>
                  {visibleCourtSlots.map((slot, index) => (
                    <div key={`court-slot-${index}`} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={(e) => updateCourtSlot(index, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                      />
                      <input
                        type="text"
                        value={slot.manualLabel}
                        onChange={(e) => updateCourtSlot(index, { manualLabel: e.target.value })}
                        disabled={!slot.enabled}
                        placeholder={`CRT${index + 1}`}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[13px] text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="mb-6 flex items-center">
          <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-600">
            2
          </div>
          <h3 className="text-lg font-semibold text-gray-700">Schedule</h3>
        </div>

        <div className="flex flex-col gap-8 md:flex-row">
          <div className="w-full md:w-[38%]">
            <MiniCalendar selected={matchDate} onSelect={setMatchDate} dateIndicators={calendarIndicators} />
          </div>

          <div className="flex w-full flex-col justify-center gap-6 md:w-[62%]">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Start Time</label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
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
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Duration</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
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

      <section className="rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center">
            <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-600">3</div>
            <h3 className="text-lg font-semibold text-gray-700">Players &amp; Requests</h3>
          </div>
          <div className="rounded-full bg-gray-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Players Needed: <span className="text-orange-500">{requiredCount}</span>
          </div>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          <div className="w-full space-y-3 md:w-1/4">
            <div className="mb-1 flex items-center text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
              Add By
            </div>
            <button
              type="button"
              onClick={() => setSelectionMode('invite')}
              className={[
                'flex h-[60px] w-full items-center gap-3 rounded-xl border-2 px-4 text-left transition active:scale-[0.98]',
                selectionMode === 'invite'
                  ? 'border-orange-200 bg-orange-50 ring-2 ring-orange-500/80'
                  : 'border-orange-100 text-orange-600 hover:border-orange-200 hover:bg-orange-50',
              ].join(' ')}
            >
              <span className="text-lg">+</span>
              <span className="text-xs font-bold">Direct Invite</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionMode('request')}
              className={[
                'flex h-[60px] w-full items-center gap-3 rounded-xl border-2 px-4 text-left transition active:scale-[0.98]',
                selectionMode === 'request'
                  ? 'border-green-200 bg-green-50 ring-2 ring-green-500/80'
                  : 'border-green-50 text-green-600 hover:border-green-100 hover:bg-green-50',
              ].join(' ')}
            >
              <span className="text-lg">+</span>
              <span className="whitespace-nowrap text-xs font-bold">Open for Request</span>
            </button>
          </div>

          <div className="w-full md:w-2/5">
            <div className="mb-4 flex items-center text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
              Select Target
            </div>
            <div className="flex min-h-[200px] flex-col rounded-2xl border border-gray-100 bg-gray-50 p-4">
              {!selectionMode ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                  <p className="text-xs italic leading-relaxed text-gray-300">
                    Choose an action on the left to add people or groups.
                  </p>
                </div>
              ) : (
                <div className="flex flex-1 flex-col">
                  <div className="mb-4 flex flex-wrap gap-2">
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
                      </>
                    )}

                    {selectionMode === 'invite' && filteredInviteOptions.length === 0 && filteredInviteGroups.length === 0 && (
                      <div className="w-full rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-300">No candidates found.</div>
                    )}
                    {selectionMode === 'request' && filteredRequestUsers.length === 0 && filteredRequestGroups.length === 0 && (
                      <div className="w-full rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-300">No candidates found.</div>
                    )}
                  </div>

                  {shouldShowHoodPanelButton ? (
                    <div className="mt-auto">
                      <button type="button" className="w-full rounded-lg border border-gray-200 bg-white py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 transition hover:text-orange-500">
                        Hood Panel
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-1/3">
            <div className="mb-4 flex items-center text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
              Summary
            </div>
            <div className="min-h-[200px] rounded-xl bg-[#fafafa] p-4">
              {summaryIsEmpty ? (
                <div className="py-10 text-center opacity-20">
                  <div className="mb-2 text-3xl">[]</div>
                  <p className="text-[10px]">Empty</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {(selectedInvitePlayers.length > 0 || selectedInvitedGroups.length > 0) && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                        <span className="text-[9px] font-black uppercase tracking-tight text-gray-400">Direct Invited</span>
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
                            className="flex items-center rounded-lg border border-orange-100 bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-700"
                          >
                            <span>{member.name}</span>
                            <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
                          </button>
                        ))}
                        {selectedInvitedGroups.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => setInvitedGroupIds((prev) => prev.filter((id) => id !== group.id))}
                            className="flex items-center rounded-lg border border-orange-100 bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-700"
                          >
                            <span>{group.name}</span>
                            <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
                          </button>
                        ))}
                      </div>

                      {selectedInviteWarnings.length > 0 ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-amber-100 bg-white px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            <span className="text-[9px] font-black uppercase tracking-tight text-gray-400">Availability heads-up</span>
                          </div>
                          <div className="space-y-2">
                            {selectedInviteWarnings.map(({ candidate, warning }) => (
                              <div
                                key={`summary-warning-${candidate.key}`}
                                className={[
                                  'rounded-lg border px-2.5 py-2 text-[10px]',
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
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                        <span className="text-[9px] font-black uppercase tracking-tight text-gray-400">Open to Request</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedScopeUsers.map((candidate) => (
                          <button
                            key={`summary-request-${candidate.key}`}
                            type="button"
                            onClick={() => setScopeUserIds((prev) => prev.filter((id) => id !== candidate.userId))}
                            className="flex items-center rounded-lg border border-green-100 bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700"
                          >
                            <span>{candidate.name}</span>
                            <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
                          </button>
                        ))}
                        {selectedScopeGroups.map((group) => (
                          <button
                            key={`summary-request-group-${group.id}`}
                            type="button"
                            onClick={() => setScopeGroupIds((prev) => prev.filter((id) => id !== group.id))}
                            className="flex items-center rounded-lg border border-green-100 bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700"
                          >
                            <span>{group.name}</span>
                            <span className="ml-2 cursor-pointer opacity-30 transition hover:opacity-100">x</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white">
        <button
          type="button"
          onClick={() => setOrganizerNoteExpanded((expanded) => !expanded)}
          className="flex w-full items-center justify-between rounded-xl p-1 text-left transition hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
              4
            </div>
            <h3 className="text-lg font-semibold text-gray-700">Organizer Note</h3>
            {organizerNote.trim() && !organizerNoteExpanded ? (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                Saved
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!organizerNoteExpanded && !organizerNote.trim() ? (
              <span className="text-xs font-bold text-orange-500">+ Add Note</span>
            ) : null}
            <span
              className={`text-sm text-slate-400 transition-transform ${organizerNoteExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              v
            </span>
          </div>
        </button>

        {organizerNoteExpanded ? (
          <div className="mt-4 space-y-4 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {ORGANIZER_NOTE_PRESETS.map((group) => (
                <div key={group.label} className="flex items-center gap-2 border-r border-gray-200 pr-4 last:border-r-0 last:pr-0">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{group.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => appendOrganizerNote(item)}
                        className={[
                          'rounded-md border px-2 py-1 text-[11px] font-bold shadow-sm transition active:scale-95',
                          organizerNoteSentences.has(item.full)
                            ? 'border-orange-300 bg-orange-50 text-orange-600'
                            : 'border-gray-200 bg-white text-slate-500 hover:border-orange-400 hover:text-orange-500',
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
                className="h-[100px] w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm leading-relaxed text-slate-700 shadow-inner outline-none transition placeholder:text-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/5"
              />
              {organizerNote.trim() ? (
                <button
                  type="button"
                  onClick={() => setOrganizerNote('')}
                  className="absolute right-2 top-2 rounded-md border border-gray-100 bg-white/90 p-1 text-xs text-slate-400 shadow-sm transition hover:text-slate-600"
                >
                  x
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setOrganizerNoteExpanded(false)}
              className="flex w-full items-center justify-center border-t border-gray-100 pt-2 text-[11px] font-bold text-slate-400 transition hover:text-orange-500"
            >
              Confirm
            </button>
          </div>
        ) : null}
      </section>

            {!reviewOpen && error && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mb-20 flex flex-col gap-4 md:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-orange-500 px-6 py-4 text-lg font-bold text-white shadow-[0_18px_40px_-24px_rgba(249,115,22,0.65)] transition hover:bg-orange-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && submitMode === 'create'
                  ? (matchMode === 'recurring' ? 'Creating...' : 'Posting...')
                  : (matchMode === 'recurring' ? 'Review & Create Recurring Match' : 'Review & Post Match')}
              </button>
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
