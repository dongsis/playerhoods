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

const templates = read('src/lib/email/templates.ts')
const invitationRenderer = read('src/lib/notifications/channels/email/render-invitation-email.ts')
const worker = read('src/lib/notifications/workers/process-queued-notification-deliveries.ts')
const directSender = read('src/lib/email/send-participant-notifications.ts')
const joinHelper = read('src/lib/notifications/public-join-links.ts')

assertIncludes(joinHelper, "export type PublicJoinIntent = 'respond' | 'view' | 'change-response' | 'withdraw' | 'review-changes'", 'public join helper')
assertIncludes(joinHelper, "return `${path}?${query.toString()}`", 'public join helper')
assertIncludes(joinHelper, "rpc_public_match_signup_link_get_or_create", 'public join helper')

assertIncludes(invitationRenderer, 'responseUrl?: string | null', 'invitation email renderer')
assertIncludes(invitationRenderer, 'const viewUrl = data.responseUrl ?? `${base}/invitations/${data.invitationId}`', 'invitation email renderer')
assertIncludes(invitationRenderer, "ctaLabel: 'Respond to Invitation'", 'invitation email renderer')
assertIncludes(invitationRenderer, 'Create a free account to join matches faster', 'invitation email renderer')

for (const [label, intent] of [
  ['invitation CTAs', "matchLink(m, 'respond')"],
  ['view CTAs', "matchLink(m, 'view')"],
  ['change response CTAs', "matchLink(m, 'change-response')"],
  ['review changes CTAs', "matchLink(m, 'review-changes')"],
]) {
  assertIncludes(templates, intent, label)
}

for (const copy of [
  'Respond to Invitation',
  'View Match Details',
  'Review Match Changes',
  'Change My Response',
  'Create Free Account',
  'No account is required to respond.',
]) {
  assertIncludes(templates, copy, 'email templates')
}

for (const banned of ['Request Access', 'Approve', 'Reject', 'Remove Request Access']) {
  assertExcludes(templates, `'${banned}'`, 'email templates')
  assertExcludes(templates, `"${banned}"`, 'email templates')
  assertExcludes(invitationRenderer, `'${banned}'`, 'invitation email renderer')
  assertExcludes(invitationRenderer, `"${banned}"`, 'invitation email renderer')
}

assertIncludes(worker, "resolveEmailJoinUrl(supabase, matchId, 'respond')", 'queued email worker')
assertIncludes(worker, "withEmailJoinPath(supabase, m, 'respond')", 'queued email worker')
assertIncludes(worker, "withEmailJoinPath(supabase, m, 'view')", 'queued email worker')
assertIncludes(worker, "withEmailJoinPath(supabase, m, 'review-changes')", 'queued email worker')
assertIncludes(worker, "d.channel === 'email'", 'queued email worker')

assertIncludes(directSender, "withEmailJoinPath(supabase, matchInfo, 'review-changes')", 'direct email sender')
assertIncludes(directSender, "withEmailJoinPath(supabase, matchInfo, 'view')", 'direct email sender')

console.log('Issue #121 email CTA/link static checks passed')
