'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  admissionTargetsToScopeUsers,
  createMatch,
  getAdmissionTargets,
  getVenues,
  getCourts,
  getMatchParticipants,
  inviteUserToMatch,
  nominateGuest,
  type ScopeUser,
} from '@/lib/api/matches'
import { getGroups, getGroupMembers } from '@/lib/api/groups'
import { listSports } from '@/lib/api/sports'
import { getInviteCircleList, getVenueInvitableMembers } from '@/lib/api/play-network'
import { getContactPlayerResolution } from '@/lib/api/roster'
import type { Group, Venue, Court, Sport, MatchCourtPlanMode, MatchDoublesFormat } from '@/lib/types/database'

type TooltipState =
  | { kind: 'recruit-help' }
  | { kind: 'invite-help' }
  | { kind: 'group-members'; groupId: string }
  | null

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
}

type CandidatePreviewState = {
  candidate: InviteCandidate
}

const INVITE_SOURCE_CONFIG: Array<{
  source: InviteCandidateSource
  label: string
}> = [
  { source: 'frequent_players', label: 'Frequent Players' },
  { source: 'contact_players', label: 'Contact Players' },
  { source: 'saved_players', label: 'Saved Players' },
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
  { value: 'needs_help_booking', label: 'Participants can help secure a court' },
]

const DOUBLES_FORMAT_OPTIONS: { value: MatchDoublesFormat; label: string }[] = [
  { value: 'open', label: 'Open doubles' },
  { value: 'mens_doubles', label: "Men's doubles" },
  { value: 'womens_doubles', label: "Women's doubles" },
  { value: 'mixed_doubles', label: 'Mixed doubles' },
]

function TooltipCard({
  title,
  lines,
}: {
  title?: string
  lines: string[]
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 0.45rem)',
        left: 0,
        minWidth: '220px',
        maxWidth: '280px',
        padding: '0.7rem 0.8rem',
        borderRadius: '12px',
        border: '1px solid #d1d5db',
        background: '#fff',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.14)',
        zIndex: 30,
      }}
    >
      {title && (
        <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#111827' }}>
          {title}
        </p>
      )}
      {lines.map((line, index) => (
        <p key={`${line}-${index}`} style={{ margin: index === lines.length - 1 ? 0 : '0 0 0.25rem', fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.45 }}>
          {line}
        </p>
      ))}
    </div>
  )
}

function getCandidateGenderBadge(gender: InviteCandidate['gender']) {
  if (gender === 'male') return 'M'
  if (gender === 'female') return 'F'
  return 'U'
}

function getCandidateButtonColors(gender: InviteCandidate['gender'], selected: boolean) {
  if (selected) {
    if (gender === 'male') {
      return { border: '#93c5fd', background: '#dbeafe', color: '#1d4ed8' }
    }
    if (gender === 'female') {
      return { border: '#f9a8d4', background: '#fce7f3', color: '#be185d' }
    }
    return { border: '#cbd5e1', background: '#e2e8f0', color: '#334155' }
  }

  if (gender === 'male') {
    return { border: '#bfdbfe', background: '#f8fbff', color: '#1e3a8a' }
  }
  if (gender === 'female') {
    return { border: '#fbcfe8', background: '#fff8fb', color: '#9d174d' }
  }
  return { border: '#d1d5db', background: '#fff', color: '#374151' }
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
              gap: '0.35rem',
              padding: '0.3rem 0.55rem',
              borderRadius: '999px',
              border: '1px solid #d1d5db',
              background: '#f8fafc',
              color: '#475569',
              fontSize: '0.76rem',
            }}
          >
            <strong style={{ fontSize: '0.72rem' }}>{getCandidateGenderBadge(candidate.gender)}</strong>
            {candidate.gender === 'male'
              ? 'Male'
              : candidate.gender === 'female'
                ? 'Female'
                : 'Gender unspecified'}
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

function MiniCalendar({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
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

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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
    <div style={{ userSelect: 'none', maxWidth: '220px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <button type="button" onClick={prevMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0' }}>&lt;</button>
        <strong style={{ fontSize: '0.8rem' }}>{monthNames[month]} {year}</strong>
        <button type="button" onClick={nextMonth} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0' }}>&gt;</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', textAlign: 'center', fontSize: '0.7rem' }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ fontWeight: 'bold', padding: '0.15rem', color: '#666' }}>{d}</div>
        ))}
        {days.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} />
          const dateStr = toDateStr(d)
          const isSelected = dateStr === selected
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => !isPast && onSelect(dateStr)}
              disabled={isPast}
              style={{
                padding: '0.2rem',
                border: isToday ? '1px solid #333' : '1px solid transparent',
                background: isSelected ? '#333' : 'transparent',
                color: isSelected ? 'white' : isPast ? '#ccc' : '#333',
                cursor: isPast ? 'default' : 'pointer',
                borderRadius: '2px',
                fontSize: '0.7rem',
                lineHeight: '1.2',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CreateMatchInline({ defaultVenueId }: { defaultVenueId?: string }) {
  const searchParams = useSearchParams()
  const [requiredCount, setRequiredCount] = useState(4)
  const [matchDate, setMatchDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [gameType, setGameType] = useState('doubles')
  const [doublesFormat, setDoublesFormat] = useState<MatchDoublesFormat>('open')
  const [venueId, setVenueId] = useState(defaultVenueId || '')
  const [scopeGroupIds, setScopeGroupIds] = useState<string[]>([])
  const [courtPlanMode, setCourtPlanMode] = useState<MatchCourtPlanMode>('self_book_later')
  const [courtPlanNote, setCourtPlanNote] = useState('')
  const [finalCourtLabel, setFinalCourtLabel] = useState('')

  const [sportId, setSportId] = useState(1)  // default tennis
  const [sports, setSports] = useState<Sport[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [groupMembersById, setGroupMembersById] = useState<Record<string, GroupMemberPreview>>({})
  const [venues, setVenues] = useState<Venue[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [showMorePlayers, setShowMorePlayers] = useState(false)
  const [candidatePreview, setCandidatePreview] = useState<CandidatePreviewState | null>(null)
  const [prefillConsumed, setPrefillConsumed] = useState(false)
  const router = useRouter()

  const prefillSportId = searchParams.get('createSport')
  const prefillInviteUserId = searchParams.get('inviteUserId')
  const prefillInviteGuestId = searchParams.get('inviteGuestId')

  const selectedGroupPreview = useMemo(() => {
    const members: { id: string; name: string }[] = []
    const seen = new Set<string>()

    scopeGroupIds.forEach((groupId) => {
      const preview = groupMembersById[groupId]
      preview?.members.forEach((member) => {
        if (!member.id || seen.has(member.id)) return
        seen.add(member.id)
        members.push(member)
      })
    })

    return {
      count: members.length,
      members,
      visibleNames: members.slice(0, 6).map((member) => member.name),
      hiddenCount: Math.max(members.length - 6, 0),
    }
  }, [groupMembersById, scopeGroupIds])

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
      userId: member.userId,
    }))

    userCandidates.forEach(upsert)
    contactPlayers.forEach(upsert)

    return Array.from(combined.values()).sort((left, right) => {
      const leftPriority = INVITE_SOURCE_PRIORITY.get(left.source) ?? Number.MAX_SAFE_INTEGER
      const rightPriority = INVITE_SOURCE_PRIORITY.get(right.source) ?? Number.MAX_SAFE_INTEGER
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return left.name.localeCompare(right.name)
    })
  }, [clubMembers, contactPlayers, currentUserId, frequentPlayers, savedPlayers])

  const visibleInviteCandidates = useMemo(
    () => availableInviteOptions.slice(0, 8),
    [availableInviteOptions],
  )

  const hiddenInviteCandidates = useMemo(
    () => availableInviteOptions.slice(8),
    [availableInviteOptions],
  )

  const selectedInvitePlayers = useMemo(() => {
    const selected = new Set(selectedDirectInviteKeys)
    return availableInviteOptions.filter((member) => selected.has(member.key))
  }, [availableInviteOptions, selectedDirectInviteKeys])

  const inviteCandidatesBySource = useMemo(
    () =>
      INVITE_SOURCE_CONFIG.map((section) => ({
        ...section,
        candidates: availableInviteOptions.filter((candidate) => candidate.source === section.source),
      })).filter((section) => section.candidates.length > 0),
    [availableInviteOptions],
  )

  const selectedGroupNames = useMemo(
    () => groups.filter((group) => scopeGroupIds.includes(group.id)).map((group) => group.name),
    [groups, scopeGroupIds],
  )

  const inviteSourceSummary = useMemo(() => {
    return {
      frequentPlayers: frequentPlayers.filter((member) => member.userId !== currentUserId).length,
      contactPlayers: contactPlayers.length,
      savedPlayers: savedPlayers.filter((member) => member.userId !== currentUserId).length,
      clubMembers: clubMembers.filter((member) => member.userId !== currentUserId).length,
    }
  }, [clubMembers, contactPlayers, currentUserId, frequentPlayers, savedPlayers])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null)).catch(console.error)
    getInviteCircleList(supabase)
      .then(async (rows) => {
        const targetUserIds = Array.from(new Set(rows.map((row) => row.target_user_id).filter(Boolean)))
        const profileMap = new Map<string, { display_name: string | null; gender: 'male' | 'female' | 'unspecified' | null }>()

        if (targetUserIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, gender')
            .in('id', targetUserIds)
          if (profilesError) throw profilesError
          ;((profiles ?? []) as Array<{ id: string; display_name: string | null; gender: 'male' | 'female' | 'unspecified' | null }>)
            .forEach((profile) => {
              profileMap.set(profile.id, {
                display_name: profile.display_name,
                gender: profile.gender,
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
            sourceLabel: row.source === 'played_with_auto' ? 'Frequent Players' : 'Saved Players',
            gender: profile?.gender ?? null,
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
              sourceLabel: 'Contact Players',
              sourceLabels: ['Contact Players'],
              gender: null,
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
    if (courtPlanMode !== 'secured') return
    if (finalCourtLabel.trim()) return
    if (courts.length === 0) return
    setFinalCourtLabel(courts[0].court_code)
  }, [courtPlanMode, courts, finalCourtLabel])

  useEffect(() => {
    if (!venueId) {
      setClubMembers([])
      return
    }

    const supabase = createSupabaseBrowserClient()
    getVenueInvitableMembers(supabase, venueId, currentUserId)
      .then(async (rows) => {
        const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
        const profileMap = new Map<string, { display_name: string | null; gender: 'male' | 'female' | 'unspecified' | null }>()

        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, gender')
            .in('id', userIds)
          if (profilesError) throw profilesError
          ;((profiles ?? []) as Array<{ id: string; display_name: string | null; gender: 'male' | 'female' | 'unspecified' | null }>)
            .forEach((profile) => {
              profileMap.set(profile.id, {
                display_name: profile.display_name,
                gender: profile.gender,
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

    try {
      const match = await createMatch(supabase, {
        required_count: requiredCount,
        match_date: matchDate || undefined,
        start_time: startTime ? `${startTime}:00` : undefined,
        duration_minutes: durationMinutes || undefined,
        game_type: gameType || undefined,
        doubles_format: gameType === 'doubles' ? doublesFormat : null,
        venue_id: venueId || undefined,
        sport_id: sportId,
        invitation_scope_group_ids: scopeGroupIds.length > 0 ? scopeGroupIds : undefined,
        can_participants_invite_users: true,
        can_participants_manage_participants: false,
        court_plan_mode: courtPlanMode,
        court_note: courtPlanNote.trim() || null,
        final_court_label: courtPlanMode === 'secured' ? (finalCourtLabel.trim() || null) : null,
      })
      const selectedCandidates = availableInviteOptions.filter((candidate) => selectedDirectInviteKeys.has(candidate.key))
      for (const candidate of selectedCandidates) {
        try {
          if (candidate.kind === 'user' && candidate.userId) {
            await inviteUserToMatch(supabase, match.id, candidate.userId)
          } else if (candidate.kind === 'contact' && candidate.guestId) {
            await nominateGuest(supabase, match.id, candidate.guestId)
          }
        } catch (inviteError) {
          console.error(`[CreateMatchInline] direct invite ${candidate.key}:`, inviteError)
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
      setError((err as { message?: string })?.message || 'Failed to create match')
    } finally {
      setLoading(false)
      setSubmitMode(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMatchFlow('create')
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
    const colors = getCandidateButtonColors(candidate.gender, isSelected)

    return (
      <div
        key={candidate.key}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '0.35rem',
        }}
      >
        <button
          type="button"
          onClick={() => toggleDirectInviteCandidate(candidate)}
          onContextMenu={(event) => {
            event.preventDefault()
            setCandidatePreview({ candidate })
          }}
          aria-pressed={isSelected}
          title={`${candidate.name}: ${candidate.sourceLabels.join(', ')}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: compact ? '0.42rem' : '0.55rem',
            minWidth: compact ? 'auto' : '160px',
            maxWidth: '100%',
            padding: compact ? '0.42rem 0.68rem' : '0.52rem 0.75rem',
            borderRadius: '999px',
            border: `1px solid ${colors.border}`,
            background: colors.background,
            color: colors.color,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '1.25rem',
              height: '1.25rem',
              borderRadius: '999px',
              border: `1px solid ${colors.border}`,
              background: '#fff',
              fontSize: '0.68rem',
              fontWeight: 700,
              color: colors.color,
              flexShrink: 0,
            }}
          >
            {getCandidateGenderBadge(candidate.gender)}
          </span>
          <span style={{ fontSize: compact ? '0.78rem' : '0.84rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {candidate.name}
          </span>
          {isSelected && (
            <span aria-hidden="true" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              Selected
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setCandidatePreview({ candidate })}
          aria-label={`View ${candidate.name} details`}
          title={`View ${candidate.name} details`}
          style={{
            borderRadius: '999px',
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#6b7280',
            padding: compact ? '0.42rem 0.58rem' : '0.5rem 0.66rem',
            fontSize: compact ? '0.72rem' : '0.76rem',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Info
        </button>
      </div>
    )
  }

  if (createdMatchId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1rem' }}>Invite Player</h4>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: '#666' }}>
            Match created. Pick players to invite, then open the match once they are recorded as pending.
          </p>
        </div>

        {inviteTargets.length === 0 ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '16px', padding: '0.9rem 1rem', color: '#666', fontSize: '0.9rem' }}>
            No eligible players are available to invite right now.
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '16px', padding: '0.9rem 1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem 1rem' }}>
              {inviteTargets.map(user => (
                <label
                  key={user.id}
                  title={`${user.display_name}: ${user.sourceLabel}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', cursor: 'pointer' }}
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

        {inviteNotice && <p style={{ color: '#166534', margin: 0, fontSize: '0.9rem' }}>{inviteNotice}</p>}
        {invitedNames.length > 0 && (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563' }}>
            Pending on this match: {invitedNames.join(', ')}
          </p>
        )}
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleInviteSelected}
            disabled={selectedPostCreateInviteIds.size === 0 || inviteLoading}
            style={{ padding: '0.6rem 1.2rem' }}
          >
            {inviteLoading ? 'Inviting...' : `Invite selected (${selectedPostCreateInviteIds.size})`}
          </button>
          <button
            type="button"
            onClick={() => { void handleOpenMatch() }}
            disabled={inviteLoading || openMatchLoading}
            style={{ padding: '0.6rem 1.2rem', border: '1px solid #d1d5db', borderRadius: '10px', background: '#fff' }}
          >
            {openMatchLoading ? 'Opening...' : 'Open match'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
    <form onSubmit={handleSubmit}>
      {/* Row 1: Sport + Game type + Required count */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Sport</label>
          <select value={sportId} onChange={e => setSportId(parseInt(e.target.value))} style={{ width: '100%', padding: '0.4rem' }}>
            {sports.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Game Type</label>
          <select value={gameType} onChange={e => setGameType(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
        </div>
        <div style={{ width: '100px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Players</label>
          <input type="number" min={1} max={20} value={requiredCount} onChange={e => setRequiredCount(parseInt(e.target.value) || 4)} style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }} />
        </div>
      </div>

      {gameType === 'doubles' && (
        <div style={{ marginBottom: '1rem', maxWidth: '260px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Doubles Format</label>
          <select value={doublesFormat} onChange={e => setDoublesFormat(e.target.value as MatchDoublesFormat)} style={{ width: '100%', padding: '0.4rem' }}>
            {DOUBLES_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.76rem', color: '#667085' }}>
            This guides ideal roster balance and waiting-list autofill, but the host can still override it later.
          </p>
        </div>
      )}

      {/* Row 2: Calendar + Time */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Date</label>
          <MiniCalendar selected={matchDate} onSelect={setMatchDate} />
          {matchDate && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
              Selected: <strong>{matchDate}</strong>
              <button type="button" onClick={() => setMatchDate('')} style={{ marginLeft: '0.5rem', border: 'none', background: 'none', color: '#999', cursor: 'pointer', fontSize: '0.8rem' }}>clear</button>
            </div>
          )}
        </div>
        <div style={{ width: '140px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Start Time</label>
          <select value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
            <option value="">-- Select --</option>
            {TIME_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Duration</label>
            <select value={durationMinutes} onChange={e => setDurationMinutes(parseInt(e.target.value))} style={{ width: '100%', padding: '0.4rem' }}>
              {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Row 3: Venue + Court plan */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Venue</label>
          <select value={venueId} onChange={e => setVenueId(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
            <option value="">-- Select Venue --</option>
            {venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
            Court Plan
          </label>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <select
              value={courtPlanMode}
              onChange={e => setCourtPlanMode(e.target.value as MatchCourtPlanMode)}
              style={{ width: '100%', padding: '0.4rem' }}
            >
              {COURT_PLAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {courtPlanMode === 'secured' && (
              courts.length > 0 ? (
                <select
                  value={finalCourtLabel}
                  onChange={e => setFinalCourtLabel(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem' }}
                >
                  <option value="">Court secured (no label yet)</option>
                  {courts.map((court) => (
                    <option key={court.id} value={court.court_code}>
                      {court.court_code}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={finalCourtLabel}
                  onChange={e => setFinalCourtLabel(e.target.value)}
                  placeholder="Court 2"
                  style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                />
              )
            )}

            <input
              type="text"
              value={courtPlanNote}
              onChange={e => setCourtPlanNote(e.target.value)}
              placeholder={
                courtPlanMode === 'walk_in'
                  ? 'Walk-in only, meet early'
                  : courtPlanMode === 'self_book_later'
                    ? 'Host will confirm the court later'
                  : courtPlanMode === 'needs_help_booking'
                    ? 'Use the match message area to coordinate court booking'
                    : 'Optional court note'
              }
              style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      {/* Row 4: Add players */}
      <div
        style={{
          marginBottom: '1rem',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.3fr) minmax(220px, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div>
          <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.95rem', fontWeight: 500, color: '#111827' }}>Add Players</h4>
          <div style={{ marginBottom: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.3rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem' }}>Add player(s)</label>
                <div
                  style={{ position: 'relative', display: 'inline-flex' }}
                  onMouseEnter={() => setTooltip({ kind: 'invite-help' })}
                  onMouseLeave={() => setTooltip((current) => (current?.kind === 'invite-help' ? null : current))}
                >
                  <button
                    type="button"
                    aria-label="How invite player works"
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '999px',
                      border: '1px solid #d1d5db',
                      background: '#fff',
                      color: '#6b7280',
                      fontSize: '0.72rem',
                      lineHeight: 1,
                      cursor: 'default',
                      padding: 0,
                    }}
                  >
                    ?
                  </button>
                  {tooltip?.kind === 'invite-help' && (
                    <TooltipCard lines={['Choose from Frequent Players, Contact Players, Saved Players, and Club Members to build direct invites before the match is created. Use Info for a quick preview.']} />
                  )}
                </div>
              </div>
              <p style={{ margin: '0 0 0.45rem', fontSize: '0.75rem', color: '#667085' }}>
                Frequent Players ({inviteSourceSummary.frequentPlayers}), Contact Players ({inviteSourceSummary.contactPlayers}), Saved Players ({inviteSourceSummary.savedPlayers}), Club Members ({inviteSourceSummary.clubMembers})
              </p>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.45 }}>
                Click a name to add or remove a direct invite. Use the secondary Info action to open a quick profile or contact preview.
              </p>
              {availableInviteOptions.length === 0 ? (
                <div
                  style={{
                    border: '1px dashed #d1d5db',
                    borderRadius: '12px',
                    padding: '0.8rem',
                    color: '#6b7280',
                    fontSize: '0.82rem',
                    background: '#fcfcfd',
                  }}
                >
                  No players available for direct invites yet.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                    {visibleInviteCandidates.map((candidate) => renderInviteCandidateButton(candidate))}
                  </div>
                  {hiddenInviteCandidates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMorePlayers(true)}
                      style={{
                        marginTop: '0.75rem',
                        border: '2px solid #c9cdd4',
                        background: '#f8fafc',
                        color: '#6b7280',
                        borderRadius: '0',
                        padding: '0.45rem 0.8rem',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                      }}
                    >
                      More Players
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1.35rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.45rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem' }}>Player recruit group</label>
                <div
                  style={{ position: 'relative', display: 'inline-flex' }}
                  onMouseEnter={() => setTooltip({ kind: 'recruit-help' })}
                  onMouseLeave={() => setTooltip((current) => (current?.kind === 'recruit-help' ? null : current))}
                >
                  <button
                    type="button"
                    aria-label="What is a player recruit group?"
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '999px',
                      border: '1px solid #d1d5db',
                      background: '#fff',
                      color: '#6b7280',
                      fontSize: '0.72rem',
                      lineHeight: 1,
                      cursor: 'default',
                      padding: 0,
                    }}
                  >
                    ?
                  </button>
                  {tooltip?.kind === 'recruit-help' && (
                    <TooltipCard lines={['Players in selected groups can see this match and request to join.']} />
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {groups.map(g => (
                  <div
                    key={g.id}
                    style={{ position: 'relative', display: 'inline-flex' }}
                    onMouseEnter={() => setTooltip({ kind: 'group-members', groupId: g.id })}
                    onMouseLeave={() =>
                      setTooltip((current) =>
                        current?.kind === 'group-members' && current.groupId === g.id ? null : current,
                      )
                    }
                  >
                    <label
                      style={{
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '999px',
                        background: scopeGroupIds.includes(g.id) ? '#f8fafc' : '#fff',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={scopeGroupIds.includes(g.id)}
                        onChange={e => {
                          if (e.target.checked) setScopeGroupIds(prev => [...prev, g.id])
                          else setScopeGroupIds(prev => prev.filter(id => id !== g.id))
                        }}
                      />
                      {g.name}
                    </label>
                    {tooltip?.kind === 'group-members' && tooltip.groupId === g.id && (
                      <TooltipCard
                        title={`${groupMembersById[g.id]?.count ?? 0} member${(groupMembersById[g.id]?.count ?? 0) === 1 ? '' : 's'}`}
                        lines={
                          groupMembersById[g.id]?.members.length
                            ? groupMembersById[g.id].members.map((member) => member.name)
                            : ['No active members yet.']
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div
            style={{
              minHeight: '108px',
              border: '1px solid #d1d5db',
              borderRadius: '16px',
              padding: '0.85rem 1rem',
              background: '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                  Direct invites
                </p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>
                  Invites will be sent to these players after the match is created.
                </p>
              </div>
              {selectedInvitePlayers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDirectInviteKeys(new Set())}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#6b7280',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            {selectedInvitePlayers.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.6rem' }}>
                {selectedInvitePlayers.map((member) => (
                  <button
                    key={member.key}
                    type="button"
                    onClick={() => {
                      setSelectedDirectInviteKeys((prev) => {
                        const next = new Set(prev)
                        next.delete(member.key)
                        return next
                      })
                    }}
                    aria-label={`Remove ${member.name} from direct invites`}
                    title={`${member.name}: ${member.sourceLabels.join(', ')}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.38rem 0.65rem',
                      borderRadius: '999px',
                      border: '1px solid #bfdbfe',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{member.name}</span>
                    <span aria-hidden="true" style={{ fontSize: '0.9rem', lineHeight: 1 }}>x</span>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
                No direct invites selected yet.
              </p>
            )}
          </div>

          <div
            style={{
              minHeight: '108px',
              border: '1px solid #d1d5db',
              borderRadius: '16px',
              padding: '0.85rem 1rem',
              background: '#fff',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
              Visible to
            </p>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>
              These players can see the match and request to join.
            </p>
            {selectedGroupNames.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                {selectedGroupNames.map((groupName) => (
                  <span
                    key={groupName}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.34rem 0.6rem',
                      borderRadius: '999px',
                      border: '1px solid #d1d5db',
                      background: '#f9fafb',
                      color: '#4b5563',
                      fontSize: '0.78rem',
                    }}
                  >
                    {groupName}
                  </span>
                ))}
              </div>
            )}
            {selectedGroupPreview.visibleNames.length > 0 ? (
              <p style={{ margin: '0.55rem 0 0', fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.5 }}>
                {selectedGroupPreview.visibleNames.join(', ')}
                {selectedGroupPreview.hiddenCount > 0 ? ` +${selectedGroupPreview.hiddenCount} more` : ''}
              </p>
            ) : (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
                No visibility groups selected yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {showMorePlayers && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowMorePlayers(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 60,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              maxHeight: 'min(80vh, 720px)',
              overflowY: 'auto',
              borderRadius: '20px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
              padding: '1.1rem 1.15rem',
              display: 'grid',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>More Players</h4>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
                  Select or deselect direct invites from each source. Use Info for a quick preview.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMorePlayers(false)}
                aria-label="Close more players"
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

            <div style={{ display: 'grid', gap: '0.95rem' }}>
              {inviteCandidatesBySource.map((section) => (
                <section key={section.source} style={{ display: 'grid', gap: '0.55rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <h5 style={{ margin: 0, fontSize: '0.86rem', color: '#374151' }}>{section.label}</h5>
                    <span style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{section.candidates.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {section.candidates.map((candidate) => renderInviteCandidateButton(candidate, true))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'red', marginBottom: '0.5rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="submit" disabled={loading} style={{ padding: '0.5rem 1.5rem' }}>
          {loading && submitMode === 'create' ? 'Creating...' : 'Create Match'}
        </button>
      </div>
    </form>
    <CandidatePreviewModal preview={candidatePreview} onClose={() => setCandidatePreview(null)} />
    </>
  )
}
