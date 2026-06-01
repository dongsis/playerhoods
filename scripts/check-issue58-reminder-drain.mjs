import { existsSync, readFileSync } from 'node:fs'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function read(path) {
  return readFileSync(path, 'utf8')
}

const route = read('src/app/api/notifications/drain-reminders/route.ts')
const worker = read('src/lib/notifications/workers/process-queued-notification-deliveries.ts')
const migration = read('supabase/migrations/20260601150000_reminder_only_delivery_drain.sql')

assert(route.includes('NOTIFICATION_DRAIN_SECRET'), 'drain-reminders route must require NOTIFICATION_DRAIN_SECRET')
assert(route.includes('authorization !== `Bearer ${secret}`'), 'drain-reminders route must reject invalid bearer auth')
assert(route.includes('dryRun'), 'drain-reminders route must expose dry-run handling')
assert(route.includes('drainQueuedReminderDeliveries'), 'drain-reminders route must use reminder-only drain helper')
assert(!route.includes('drainQueuedNotificationDeliveries'), 'drain-reminders route must not use generic drain helper')

assert(worker.includes("rpc_get_queued_reminder_deliveries"), 'worker must call reminder-only claimant')
assert(worker.includes("notification_reminder_drain_preview"), 'worker must call reminder dry-run preview')

assert(migration.includes("nd.payload->>'template_type' = 'match_reminder'"), 'claimant must filter to match_reminder payloads')
assert(!migration.includes('DROP FUNCTION IF EXISTS public.rpc_get_queued_deliveries'), 'migration must not replace generic queued delivery claimant')

assert(!existsSync('vercel.json'), 'issue #58 must not add Vercel cron config')

console.log('Issue #58 reminder-only drain guard passed')
