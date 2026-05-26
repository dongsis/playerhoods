'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import { MatchInbox } from './MatchInbox'
import { MatchHistory } from './MatchHistory'

interface Props {
  items: MatchListItem[]
  userId: string | null
}

type CalendarEntry = {
  id: string
  dateKey: string
  timeLabel: string
  sortStamp: string
  sportLabel: string
  sportKey: string
  organizerName: string
  startMinutes: number
  endMinutes: number
  tone: 'green' | 'amber' | 'blue' | 'slate'
  hasConflict?: boolean
}

function isInboxItem(item: MatchListItem, nowIso: string): boolean {
  const { match, confirmedCount, isFormed } = item
  if (match.status !== 'active') return false
  if (!match.start_at_utc) return true
  if (match.start_at_utc >= nowIso) return true
  if (confirmedCount > 0 && !isFormed) return true
  return false
}

function isPast(item: MatchListItem, nowIso: string): boolean {
  const { match } = item
  if (match.start_at_utc) return match.start_at_utc < nowIso
  if (match.match_date) return match.match_date < nowIso.slice(0, 10)
  return false
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function startOfWeek(date: Date): Date {
  const next = new Date(date)
  const day = next.getDay()
  next.setHours(12, 0, 0, 0)
  next.setDate(next.getDate() - day)
  return next
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCalendarHeading(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatCalendarDayLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
  }).format(date)
}

function formatCalendarDayNumber(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
  }).format(date)
}

function getCalendarSportKey(label: string | null | undefined): string {
  return (label ?? '').trim().toLowerCase()
}

function SportGlyph({ sportKey }: { sportKey: string }) {
  if (sportKey.includes('tennis')) {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true">
        <circle cx="10" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.2 5.2l5.6 5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12.8 10.8l5.3 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17.1 15.1l1.7 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  if (sportKey.includes('pickleball')) {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true">
        <path
          d="M8 4.5c0-1.1.9-2 2-2h2.3a3.2 3.2 0 0 1 3.2 3.2v7.5a4.5 4.5 0 1 1-9 0V6.8A2.3 2.3 0 0 1 8.8 4.5H8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="7.5" r="0.8" fill="currentColor" />
        <circle cx="13.8" cy="7.5" r="0.8" fill="currentColor" />
        <circle cx="11" cy="10.4" r="0.8" fill="currentColor" />
        <circle cx="13.8" cy="10.4" r="0.8" fill="currentColor" />
        <path d="M12 17.8v3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return <span className="inline-block h-2 w-2 rounded-full bg-[#94A3B8]" aria-hidden="true" />
}

function formatEventTimeLabel(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  if (minutes === 0) return `${hours12} ${suffix}`
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function formatCalendarRangeLabel(startMinutes: number, endMinutes: number): string {
  const startFull = formatEventTimeLabel(startMinutes)
  const endFull = formatEventTimeLabel(endMinutes)
  const startSuffix = startFull.endsWith('PM') ? 'PM' : 'AM'
  const endSuffix = endFull.endsWith('PM') ? 'PM' : 'AM'

  if (startSuffix === endSuffix) {
    return `${startFull.replace(/ (AM|PM)$/, '')}-${endFull}`
  }

  return `${startFull}-${endFull}`
}

function getCalendarTiming(item: MatchListItem): { startMinutes: number; endMinutes: number; timeLabel: string } {
  const durationMinutes = Math.max(item.match.duration_minutes ?? 60, 30)

  if (item.match.start_time) {
    const [hour, minute] = item.match.start_time.slice(0, 5).split(':').map(Number)
    const startMinutes = Math.max(0, hour * 60 + minute)
    const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60)
    return {
      startMinutes,
      endMinutes,
      timeLabel: formatCalendarRangeLabel(startMinutes, endMinutes),
    }
  }

  if (item.match.start_at_utc) {
    const startDate = new Date(item.match.start_at_utc)
    const startMinutes = Math.max(0, startDate.getHours() * 60 + startDate.getMinutes())
    const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60)
    return {
      startMinutes,
      endMinutes,
      timeLabel: formatCalendarRangeLabel(startMinutes, endMinutes),
    }
  }

  return {
    startMinutes: 0,
    endMinutes: durationMinutes,
    timeLabel: 'Time TBD',
  }
}

function markCalendarConflicts(entries: CalendarEntry[]): CalendarEntry[] {
  const conflictIds = new Set<string>()
  const byDate = new Map<string, CalendarEntry[]>()

  for (const entry of entries) {
    const bucket = byDate.get(entry.dateKey) ?? []
    bucket.push(entry)
    byDate.set(entry.dateKey, bucket)
  }

  for (const dayEntries of byDate.values()) {
    for (let leftIndex = 0; leftIndex < dayEntries.length; leftIndex += 1) {
      const left = dayEntries[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < dayEntries.length; rightIndex += 1) {
        const right = dayEntries[rightIndex]
        if (left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes) {
          conflictIds.add(left.id)
          conflictIds.add(right.id)
        }
      }
    }
  }

  return entries.map((entry) => ({
    ...entry,
    hasConflict: conflictIds.has(entry.id),
  }))
}

function WeeklyCalendar({ items, userId }: { items: MatchListItem[]; userId: string | null }) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()))
  const nowIso = useMemo(() => new Date().toISOString(), [])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekAnchor, index)),
    [weekAnchor],
  )

  const entries = useMemo(() => {
    const relevant = items
      .filter((item) => {
        if (item.match.status === 'cancelled') return false
        if (item.myParticipant?.status === 'removed') return false

        const past = isPast(item, nowIso)
        if (past && !item.isFormed) return false

        if (item.myParticipant) return true
        return item.match.organizer_id === userId
      })
      .map((item): CalendarEntry | null => {
        const matchDate = item.match.match_date
          ? parseDateOnly(item.match.match_date)
          : item.match.start_at_utc
            ? new Date(item.match.start_at_utc)
            : null
        if (!matchDate) return null

        const timing = getCalendarTiming(item)
        const organizerParticipant =
          item.participants.find((participant) => participant.user_id === item.match.organizer_id)
          ?? item.participants[0]
        const tone: CalendarEntry['tone'] = isPast(item, nowIso)
          ? 'slate'
          : item.myParticipant?.status === 'pending'
            ? 'amber'
            : item.isFormed
              ? 'green'
              : 'blue'

        return {
          id: item.match.id,
          dateKey: item.match.match_date ?? toDateKey(matchDate),
          timeLabel: timing.timeLabel,
          sortStamp: item.match.start_at_utc ?? `${item.match.match_date ?? toDateKey(matchDate)}T${item.match.start_time ?? '23:59:59'}`,
          sportLabel: item.sportName ?? 'Match',
          sportKey: getCalendarSportKey(item.sportName),
          organizerName: organizerParticipant?.display_name ?? 'Host',
          startMinutes: timing.startMinutes,
          endMinutes: timing.endMinutes,
          tone,
        }
      })
      .filter((entry): entry is CalendarEntry => Boolean(entry))

    relevant.sort((left, right) => left.sortStamp.localeCompare(right.sortStamp))
    return markCalendarConflicts(relevant)
  }, [items, nowIso, userId])

  const entryMap = useMemo(() => {
    const next = new Map<string, CalendarEntry[]>()
    for (const entry of entries) {
      const bucket = next.get(entry.dateKey) ?? []
      bucket.push(entry)
      next.set(entry.dateKey, bucket)
    }
    return next
  }, [entries])

  const heading = formatCalendarHeading(weekAnchor)
  const todayKey = toDateKey(new Date())
  const visibleStartMinutes = 7 * 60
  const visibleEndMinutes = 22 * 60
  const visibleHourCount = (visibleEndMinutes - visibleStartMinutes) / 60
  const hourTicks = Array.from({ length: visibleHourCount + 1 }, (_, index) => visibleStartMinutes + index * 60)
  const hourHeight = 34
  const calendarHeight = hourHeight * visibleHourCount

  return (
    <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-label text-[#94A3B8]">My Calendar</p>
          <h3 className="text-h2 mt-2 text-[#1E293B]">{heading}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekAnchor(startOfWeek(new Date()))}
            className="text-body-main rounded-full border border-[#D7DEE7] bg-white px-4 py-2 font-medium text-[#1E293B] transition hover:border-[#0d6efd] hover:text-[#0d6efd]"
          >
            Today
          </button>
          <button
            onClick={() => setWeekAnchor((current) => addDays(current, -7))}
            className="text-body-main rounded-full border border-[#D7DEE7] bg-white px-3 py-2 font-medium text-[#64748B] transition hover:border-[#0d6efd] hover:text-[#0d6efd]"
            aria-label="Previous week"
          >
            {'<'}
          </button>
          <button
            onClick={() => setWeekAnchor((current) => addDays(current, 7))}
            className="text-body-main rounded-full border border-[#D7DEE7] bg-white px-3 py-2 font-medium text-[#64748B] transition hover:border-[#0d6efd] hover:text-[#0d6efd]"
            aria-label="Next week"
          >
            {'>'}
          </button>
        </div>
      </div>

      <div className="mt-5 w-full overflow-hidden">
        <div className="w-full min-w-0">
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-[#E2E8F0]">
            <div className="border-r border-[#E2E8F0]" />
            {weekDays.map((day) => {
              const dayKey = toDateKey(day)
              const isToday = dayKey === todayKey

              return (
                <div key={dayKey} className="border-r border-[#E2E8F0] px-2 pb-3">
                  <p className="text-label text-[#94A3B8]">
                    {formatCalendarDayLabel(day)}
                  </p>
                  <div className="mt-1">
                    <span
                      className={[
                        'inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xl font-extrabold',
                        isToday ? 'bg-[#0d6efd] text-white' : 'text-[#1E293B]',
                      ].join(' ')}
                    >
                      {formatCalendarDayNumber(day)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
            <div className="relative border-r border-[#E2E8F0]" style={{ height: calendarHeight }}>
              {hourTicks.map((minutes, index) => (
                <div
                  key={minutes}
                  className="text-body-sub absolute inset-x-0 flex -translate-y-1/2 justify-end pr-2 text-[#94A3B8]"
                  style={{ top: index * hourHeight }}
                >
                  {formatEventTimeLabel(minutes)}
                </div>
              ))}
            </div>

            {weekDays.map((day) => {
              const dayKey = toDateKey(day)
              const dayEntries = entryMap.get(dayKey) ?? []

              return (
                <div key={dayKey} className="relative border-r border-[#E2E8F0]" style={{ height: calendarHeight }}>
                  {hourTicks.map((minutes) => (
                    <div
                      key={`${dayKey}-${minutes}`}
                      className="absolute inset-x-0 border-t border-[#EEF2F7]"
                      style={{ top: ((minutes - visibleStartMinutes) / 60) * hourHeight }}
                    />
                  ))}

                  {dayEntries.map((entry) => {
                    const clampedStart = Math.max(entry.startMinutes, visibleStartMinutes)
                    const clampedEnd = Math.min(entry.endMinutes, visibleEndMinutes)

                    if (clampedEnd <= clampedStart) {
                      return null
                    }

                    const top = ((clampedStart - visibleStartMinutes) / 60) * hourHeight
                    const height = Math.max(((clampedEnd - clampedStart) / 60) * hourHeight, 20)

                    return (
                      <Link
                        key={entry.id}
                        href={`/matches/${entry.id}`}
                        title={entry.hasConflict ? 'Time conflict with another match' : undefined}
                        className={[
                          'absolute left-1 right-1 overflow-hidden rounded-[11px] border px-1.5 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:z-10 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]',
                          entry.hasConflict
                            ? 'border-[#FCA5A5] bg-[#FFF1F2]'
                            : entry.tone === 'green'
                              ? 'border-[#BBF7D0] bg-[#F0FDF4]'
                              : entry.tone === 'amber'
                                ? 'border-[#FED7AA] bg-[#eff6ff]'
                                : entry.tone === 'slate'
                                  ? 'border-[#CBD5E1] bg-[#F8FAFC]'
                                  : 'border-[#bfdbfe] bg-[#eff6ff]',
                        ].join(' ')}
                        style={{ top, height }}
                      >
                        {entry.hasConflict ? (
                          <>
                            <span className="absolute inset-y-0 left-0 w-1 bg-[#DC2626]" aria-hidden="true" />
                            <span
                              className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#DC2626] text-[10px] font-black leading-none text-white"
                              aria-label="Time conflict"
                            >
                              !
                            </span>
                          </>
                        ) : null}
                        <div className="flex items-center gap-1">
                          <SportGlyph sportKey={entry.sportKey} />
                          <p className={['truncate text-[10px] font-semibold leading-tight text-[#1E293B]', entry.hasConflict ? 'pr-4' : ''].join(' ')}>
                            {entry.organizerName}
                          </p>
                        </div>
                        <p className={['mt-0.5 text-[10px] leading-tight', entry.hasConflict ? 'font-semibold text-[#B91C1C]' : 'text-[#475569]'].join(' ')}>
                          {entry.timeLabel}
                        </p>
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

export function MatchesShell({ items, userId }: Props) {
  const [tab, setTab] = useState<'inbox' | 'calendar' | 'history'>('inbox')
  const nowIso = useMemo(() => new Date().toISOString(), [])

  const { inbox, history } = useMemo(() => {
    const inbox: MatchListItem[] = []
    const history: MatchListItem[] = []

    for (const item of items) {
      if (isInboxItem(item, nowIso)) {
        inbox.push(item)
      } else {
        history.push(item)
      }
    }

    const timeKey = (item: MatchListItem) =>
      item.match.start_at_utc
      ?? `${item.match.match_date ?? ''}T${item.match.start_time ?? '00:00'}`

    inbox.sort((a, b) => timeKey(a).localeCompare(timeKey(b)))
    history.sort((a, b) => timeKey(b).localeCompare(timeKey(a)))

    return { inbox, history }
  }, [items, nowIso])

  const tabBtn = (key: 'inbox' | 'calendar' | 'history', label: string, count?: number) => (
    <button
      onClick={() => setTab(key)}
      className={[
        'text-body-main rounded-full px-4 py-2 font-medium transition',
        tab === key
          ? 'bg-[#0d6efd] text-white shadow-[0_8px_18px_rgba(13, 110, 253, 0.24)]'
          : 'text-[#64748B] hover:text-[#1E293B]',
      ].join(' ')}
    >
      {label}
      {typeof count === 'number' ? (
        <span className={tab === key ? 'ml-1.5 text-white/70' : 'ml-1.5 text-[#94A3B8]'}>
          {count}
        </span>
      ) : null}
    </button>
  )

  return (
    <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <p className="text-label text-[#94A3B8]">
            Match Board
          </p>
          <h2 className="text-h2 mt-2 text-[#1E293B]">
            Upcoming, calendar and history
          </h2>
        </div>

        <div className="inline-flex rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1">
          {tabBtn('inbox', 'Upcoming', inbox.length)}
          {tabBtn('calendar', 'Calendar')}
          {tabBtn('history', 'History', history.length)}
        </div>
      </div>

      <div className="mt-5">
        {tab === 'inbox'
          ? <MatchInbox items={inbox} userId={userId} />
          : tab === 'calendar'
            ? <WeeklyCalendar items={items} userId={userId} />
            : <MatchHistory items={history} userId={userId} />}
      </div>
    </section>
  )
}
