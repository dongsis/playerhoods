import { readFileSync } from 'node:fs'

const rendererPath = 'src/lib/notifications/channels/sms/render-notification-sms.ts'
const workerPath = 'src/lib/notifications/workers/process-queued-notification-deliveries.ts'
const migrationPath = 'supabase/migrations/20260601233000_issue66_invite_sms_payload_code.sql'

const renderer = readFileSync(rendererPath, 'utf8')
const worker = readFileSync(workerPath, 'utf8')
const migration = readFileSync(migrationPath, 'utf8')

const failures = []

function assertIncludes(source, snippet, label) {
  if (!source.includes(snippet)) {
    failures.push(`${label} is missing ${JSON.stringify(snippet)}`)
  }
}

function assertExcludes(source, snippet, label) {
  if (source.includes(snippet)) {
    failures.push(`${label} contains ${JSON.stringify(snippet)}`)
  }
}

assertIncludes(renderer, 'recipientName?: string | null', 'InvitationSmsData')
assertIncludes(renderer, 'sport_name?: string | null', 'InvitationSmsData.matchSummary')
assertIncludes(renderer, 'formatActivityLabel(data.matchSummary?.sport_name, data.matchSummary?.game_type)', 'renderInvitationSms')
assertIncludes(renderer, 'Hi ${recipientName}, ${data.inviterDisplayName} invited you to ${activity}:', 'renderInvitationSms')
assertIncludes(renderer, 'Reply YES ${data.replyCode} or NO ${data.replyCode}.', 'renderInvitationSms')

assertIncludes(worker, ".select('inviter_user_id, target_name, related_type, related_id')", 'enrichInvitationContext invitation query')
assertIncludes(worker, ".select('game_type, sport_id, match_date, start_time, venue_id')", 'enrichInvitationContext match query')
assertIncludes(worker, ".from('sports')", 'enrichInvitationContext sport lookup')
assertIncludes(worker, 'recipientName,', 'renderInvitationSms worker call')
assertIncludes(worker, 'sport_name: sportName', 'enrichInvitationContext return')

assertIncludes(migration, "v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';", 'issue66 migration')
assertIncludes(migration, "where token ~ '^[A-Z2-9]{2,6}$'", 'rpc_sms_reply_handle parser')
assertIncludes(migration, "'NO', 'N', 'DECLINE', 'OUT'", 'rpc_sms_reply_handle command exclusion')
assertIncludes(migration, "'code_length', 2", 'notification_create_or_get_sms_reply_code metadata')
assertExcludes(migration, "substr(translate(encode(extensions.gen_random_bytes(5), 'base64'), '+/=', '234'), 1, 5)", 'issue66 migration')

if (failures.length > 0) {
  console.error('Issue #66 SMS invite/code regression failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Issue #66 SMS invite/code regression passed')
