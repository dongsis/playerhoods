/** Format a match's start time, preferring timezone-aware UTC offset. */
export function formatMatchTime(
  startAtUtc: string | null,
  matchDate: string | null,
  startTime: string | null,
  timezone: string | null,
): string {
  if (startAtUtc && timezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(startAtUtc))
    } catch {
      // fall through to manual format
    }
  }

  if (matchDate) {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const parts = matchDate.split('-')
    const m = parseInt(parts[1], 10)
    const d = parseInt(parts[2], 10)
    const label = `${MONTHS[m - 1]} ${d}`
    if (startTime) return `${label} ${startTime.slice(0, 5)}`
    return label
  }

  return 'TBD'
}

/** Format start–end time window: "Mon, Jan 5, 14:00–15:30". Falls back to formatMatchTime. */
export function formatTimeWindow(
  startAtUtc: string | null,
  matchDate: string | null,
  startTime: string | null,
  durationMinutes: number | null,
  timezone: string | null,
): string {
  const start = formatMatchTime(startAtUtc, matchDate, startTime, timezone)
  if (!durationMinutes) return start

  if (startAtUtc && timezone) {
    try {
      const endDate = new Date(new Date(startAtUtc).getTime() + durationMinutes * 60_000)
      const endHHMM = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(endDate)
      return `${start}–${endHHMM}`
    } catch {
      // fall through
    }
  }

  if (startTime) {
    const [h, m] = startTime.split(':').map(Number)
    const totalMins = h * 60 + m + durationMinutes
    const endH = Math.floor(totalMins / 60) % 24
    const endM = totalMins % 60
    const endHHMM = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
    return `${start}–${endHHMM}`
  }

  return start
}

/** Returns YYYY-MM-DD in club-local timezone for date-grouping in history. */
export function clubDateKey(
  startAtUtc: string | null,
  matchDate: string | null,
  timezone: string | null,
): string {
  if (startAtUtc && timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(startAtUtc))
      const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
      return `${get('year')}-${get('month')}-${get('day')}`
    } catch {
      // fall through
    }
  }
  if (matchDate) return matchDate.slice(0, 10)
  return 'undated'
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

/** Human-readable date heading from a YYYY-MM-DD dateKey. E.g. "January 5". */
export function formatDateHeading(dateKey: string): string {
  if (dateKey === 'undated') return 'Date TBD'
  const [, mm, dd] = dateKey.split('-')
  const m = parseInt(mm, 10)
  const d = parseInt(dd, 10)
  if (isNaN(m) || isNaN(d)) return dateKey
  return `${MONTH_NAMES[m - 1]} ${d}`
}

/** Human-readable relative time: "3m ago", "2h ago", "4d ago". */
export function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Human-readable action_type string for activity feed. */
export function formatActionType(type: string): string {
  const MAP: Record<string, string> = {
    // v1.3 verb-form values (actual DB values)
    invite:                'invited',
    nominate:              'nominated',
    request_join:          'requested to join',
    accept:                'accepted invite for',
    approve:               'approved',
    withdraw:              'withdrew',
    decline:               'declined invite for',
    remove:                'removed',
    add_guest_org:         'added guest',
    add_guest_participant: 'added guest',
    // v1.3 past-tense aliases (legacy)
    invited:               'invited',
    nominated:             'nominated',
    requested:             'requested to join',
    accepted:              'accepted invite for',
    approved:              'approved',
    withdrawn:             'withdrew',
    removed:               'removed',
    guest_added:           'added guest',
    declined:              'declined invite for',
    // v1.5 new values
    reenter:               're-entered match for',
    manual_confirm:        'manually confirmed',
    delegate_manual_confirm: 'confirmed for',
    nominate_guest:       'nominated Contact Player',
  }
  return MAP[type] ?? type
}
