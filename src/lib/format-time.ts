/**
 * src/lib/format-time.ts
 * Re-exports all time-formatting helpers from the canonical location.
 * Import from '@/lib/utils/format-time' for new code; this barrel exists for backward compat.
 */
export {
  formatMatchTime,
  formatTimeWindow,
  clubDateKey,
  formatDateHeading,
  formatRelativeTime,
  formatActionType,
} from '@/lib/utils/format-time'
