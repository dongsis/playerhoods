import { existsSync, readFileSync } from 'node:fs'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function read(path) {
  return readFileSync(path, 'utf8')
}

assert(existsSync('vercel.json'), 'issue #55 must add vercel.json cron config')

const vercelConfig = JSON.parse(read('vercel.json'))
const crons = vercelConfig.crons ?? []

assert(Array.isArray(crons), 'vercel.json crons must be an array')
assert(crons.length === 1, 'issue #55 should add exactly one cron job')
assert(
  crons[0]?.path === '/api/notifications/drain-reminders',
  'cron must target reminder-only drain endpoint'
)
assert(crons[0]?.path !== '/api/notifications/drain', 'cron must not target generic drain')
assert(crons[0]?.schedule === '0 21 * * *', 'cron must run daily at 21:00 UTC')

const reminderRoute = read('src/app/api/notifications/drain-reminders/route.ts')
const genericRoute = read('src/app/api/notifications/drain/route.ts')

assert(reminderRoute.includes('export async function GET'), 'reminder route must support GET for Vercel Cron')
assert(reminderRoute.includes('process.env.CRON_SECRET'), 'cron GET must require CRON_SECRET')
assert(
  reminderRoute.includes('process.env.NOTIFICATION_DRAIN_SECRET'),
  'manual POST behavior must preserve NOTIFICATION_DRAIN_SECRET auth'
)
assert(
  reminderRoute.includes('drainQueuedReminderDeliveries'),
  'reminder route must use reminder-only drain helper'
)
assert(
  !reminderRoute.includes('drainQueuedNotificationDeliveries'),
  'reminder route must not use generic drain helper'
)
assert(
  !genericRoute.includes('CRON_SECRET'),
  'generic drain route must not be wired to Vercel Cron auth'
)

const createMatch = read('src/app/matches/CreateMatchInline.tsx')
assert(
  createMatch.includes('Send a reminder the day before at 5:00 PM.'),
  'Create Match reminder copy must say day before at 5:00 PM'
)
assert(
  createMatch.includes('Same-day matches skipped'),
  'Create Match reminder copy must say same-day matches are skipped'
)

const migration = read('supabase/migrations/20260602003000_issue55_daily_reminder_cron.sql')
assert(
  migration.includes("coalesce(v.timezone, 'America/Toronto')"),
  'daily reminder migration must use venue/match local timezone'
)
assert(
  migration.includes("= ((now() at time zone coalesce(v.timezone, 'America/Toronto'))::date + 1)"),
  'daily reminder migration must restrict eligibility to tomorrow'
)
assert(
  migration.includes("'match_reminder:' || p_match_id::text || ':'"),
  'daily reminder migration must dedupe reminders by participant, match, and date'
)
assert(
  migration.includes("nd.payload->>'template_type' = 'match_reminder'"),
  'daily reminder claimant must still process only match_reminder payloads'
)

console.log('Issue #55 reminder cron guard passed')
