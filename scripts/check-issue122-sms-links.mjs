import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label} must include ${JSON.stringify(needle)}`)
}

function assertExcludes(source, needle, label) {
  assert(!source.includes(needle), `${label} must not include ${JSON.stringify(needle)}`)
}

const smsRenderer = read('src/lib/notifications/channels/sms/render-notification-sms.ts')
const worker = read('src/lib/notifications/workers/process-queued-notification-deliveries.ts')
const joinHelper = read('src/lib/notifications/public-join-links.ts')
const emailTemplates = read('src/lib/email/templates.ts')
const inboundRoute = read('src/app/api/sms/inbound/route.ts')
const inboundHandler = read('src/lib/sms/inbound.ts')

assertIncludes(joinHelper, "export type PublicJoinIntent = 'respond' | 'view' | 'change-response' | 'withdraw' | 'review-changes'", 'public join helper')
assertIncludes(joinHelper, 'buildPublicJoinPath(publicToken: string, intent?: PublicJoinIntent)', 'public join helper')
assertIncludes(joinHelper, 'resolvePublicJoinPathForMatch', 'public join helper')

assertIncludes(smsRenderer, 'responseUrl?: string | null', 'SMS invitation renderer')
assertIncludes(smsRenderer, 'const invitationUrl = data.responseUrl ?? `${baseUrl}/i/${token}`', 'SMS invitation fallback')
assertIncludes(smsRenderer, '`Details: ${matchLink(match)}`', 'SMS details links')
assertIncludes(smsRenderer, "Reply YES ${data.replyCode} if you'd like to play, or NO ${data.replyCode} if not this time.", 'SMS invitation reply commands')
assertIncludes(smsRenderer, "Reply YES ${match.replyCode} if you'd like to play, or NO ${match.replyCode} if not this time.", 'SMS match invite reply commands')
assertIncludes(smsRenderer, 'Reply OUT ${match.replyCode}', 'SMS withdraw command')

assertIncludes(worker, 'async function withSmsJoinPath(', 'queued SMS worker')
assertIncludes(worker, 'function buildInvitationResponseUrl(', 'queued SMS worker')
assertIncludes(worker, "responseUrl: d.channel === 'sms' ? buildInvitationResponseUrl(invitationId, 'sms') : null", 'queued SMS invitation link')
assertIncludes(worker, "withSmsJoinPath(supabase, m, 'respond')", 'queued SMS respond links')
assertIncludes(worker, "withSmsJoinPath(supabase, m, 'view')", 'queued SMS view links')
assertIncludes(worker, "withSmsJoinPath(supabase, m, 'review-changes')", 'queued SMS review changes links')
assertIncludes(worker, "d.channel === 'sms'", 'queued SMS worker channel guard')
assertIncludes(worker, 'const baseUrl = channel === \'sms\' ? SMS_SITE_URL : SITE_URL', 'queued SMS absolute URL')

assertIncludes(worker, "d.channel === 'email' ? await withEmailJoinPath", 'queued email worker remains email-guarded')
assertIncludes(emailTemplates, "matchLink(m, 'respond')", 'email templates remain routed by #121')
assertIncludes(emailTemplates, "matchLink(m, 'view')", 'email templates remain routed by #121')
assertExcludes(worker, 'sendSms(d.destination, await', 'queued worker must render before provider send')

assertIncludes(inboundRoute, 'handleInboundSms', 'SMS inbound route still delegates to existing handler')
assertIncludes(inboundHandler, "rpc_sms_reply_handle", 'SMS inbound handler still uses existing RPC')

console.log('Issue #122 SMS link/static safety checks passed')
