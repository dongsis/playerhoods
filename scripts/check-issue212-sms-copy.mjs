import { readFileSync } from 'node:fs'

const rendererPath = 'src/lib/notifications/channels/sms/render-notification-sms.ts'
const workerPath = 'src/lib/notifications/workers/process-queued-notification-deliveries.ts'
const inboundPath = 'src/lib/sms/inbound.ts'
const publicJoinActionPath = 'src/app/join/[token]/actions.ts'
const migrationPath = 'supabase/migrations/20260617120000_issue212_normalize_sms_copy_and_payload.sql'

const renderer = readFileSync(rendererPath, 'utf8')
const worker = readFileSync(workerPath, 'utf8')
const inbound = readFileSync(inboundPath, 'utf8')
const publicJoinAction = readFileSync(publicJoinActionPath, 'utf8')
const migration = readFileSync(migrationPath, 'utf8')

const failures = []

function extractFunction(name) {
  const start = renderer.indexOf(`export function ${name}`)
  if (start === -1) {
    throw new Error(`${name} not found`)
  }

  const nextExport = renderer.indexOf('\nexport function ', start + 1)
  return renderer.slice(start, nextExport === -1 ? renderer.length : nextExport)
}

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

const invitation = extractFunction('renderInvitationSms')
const matchInvite = extractFunction('renderMatchInviteSms')
const publicJoinRequest = extractFunction('renderPublicJoinRequestSms')
const publicJoinNotThisTime = extractFunction('renderPublicJoinNotThisTimeSms')
const confirmedLineup = extractFunction('renderConfirmedLineupSms')
const hostManaged = extractFunction('renderHostOfflineConfirmationSms')

for (const [name, fn] of [
  ['renderInvitationSms', invitation],
  ['renderMatchInviteSms', matchInvite],
  ['renderConfirmedLineupSms', confirmedLineup],
  ['renderHostOfflineConfirmationSms', hostManaged],
]) {
  assertExcludes(fn, 'Reply JOIN', name)
}

assertIncludes(invitation, "Reply YES ${data.replyCode} if you'd like to play, or NO ${data.replyCode} if not this time.", 'private invitation reply copy')
assertIncludes(matchInvite, "Reply YES ${match.replyCode} if you'd like to play, or NO ${match.replyCode} if not this time.", 'match invite reply copy')
assertIncludes(publicJoinRequest, 'Reply JOIN to request a spot, or NO if not this time.', 'public join keeps JOIN command')
assertIncludes(publicJoinRequest, 'openingLine(data.recipientName, data.hostDisplayName, matchKind, venue, dateTime)', 'public join personalized opening')
assertIncludes(publicJoinRequest, 'pushOptionalSummary(lines, data.matchSummarySms)', 'public join optional summary')
assertIncludes(publicJoinNotThisTime, "not this time - ${hostName} couldn't add you to this match.", 'public join Not This Time copy')
assertIncludes(hostManaged, 'confirmed you for a ${matchKind}', 'host-confirmed copy')
assertIncludes(hostManaged, "This is not the final lineup yet. We'll send Game On if the match is formed.", 'host-confirmed pre-formed note')
assertIncludes(confirmedLineup, 'PlayerHoods: Game on', 'Game On confirmed lineup copy')

for (const snippet of [
  'added you as confirmed:',
  "couldn't add you to this match this time",
  'Reply YES ${data.replyCode} or NO ${data.replyCode}.',
  'Reply YES ${match.replyCode} or NO ${match.replyCode}.',
]) {
  assertExcludes(renderer, snippet, 'renderer legacy SMS copy')
}

assertIncludes(worker, 'levelLabel: ((payload.level_label as string)', 'queued delivery levelLabel mapping')
assertIncludes(worker, 'matchSummarySms: ((payload.match_summary_sms as string)', 'queued delivery matchSummarySms mapping')
assertIncludes(worker, 'playersNeededSummary', 'invitation fallback short summary')
assertIncludes(publicJoinAction, 'recipientName: signup.recipient_name', 'public join action recipient mapping')
assertIncludes(publicJoinAction, 'levelLabel: signup.level_label', 'public join action level mapping')
assertIncludes(publicJoinAction, 'matchSummarySms: signup.match_summary_sms', 'public join action summary mapping')
assertIncludes(inbound, 'Private invites use YES or NO, public join texts use JOIN or NO, confirmed matches use OUT', 'TS inbound context-aware fallback')

assertIncludes(migration, 'Issue #212: normalize SMS copy', 'issue212 migration identity')
assertIncludes(migration, 'level_label text', 'public join start level return')
assertIncludes(migration, 'match_summary_sms text', 'public join start summary return')
assertIncludes(migration, "'level_label', v_level_label", 'notification payload level field')
assertIncludes(migration, "'match_summary_sms', v_match_summary_sms", 'notification payload summary field')
assertIncludes(migration, "Request sent. The host can now review your request. We''ll let you know if you''re confirmed.", 'public join request sent copy')
assertIncludes(migration, 'Private invite: reply YES code or NO code. Public join: reply JOIN or NO.', 'inbound context fallback')
assertIncludes(migration, 'Public join keeps JOIN/NO semantics', 'public join command preservation comment')

if (failures.length > 0) {
  console.error('Issue #212 SMS copy regression failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Issue #212 SMS copy regression passed')
