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
    invited:       'invited',
    nominated:     'nominated',
    requested:     'requested to join',
    accepted:      'accepted invite for',
    approved:      'approved',
    withdrawn:     'withdrew',
    removed:       'removed',
    reactivated:   'reactivated',
    guest_added:   'added guest',
    declined:      'declined invite for',
  }
  return MAP[type] ?? type
}
