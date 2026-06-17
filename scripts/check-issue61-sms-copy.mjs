import { readFileSync } from 'node:fs'

const sourcePath = 'src/lib/notifications/channels/sms/render-notification-sms.ts'
const source = readFileSync(sourcePath, 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`export function ${name}`)
  if (start === -1) {
    throw new Error(`${name} not found`)
  }

  const nextExport = source.indexOf('\nexport function ', start + 1)
  return source.slice(start, nextExport === -1 ? source.length : nextExport)
}

function assertIncludes(haystack, snippet, label) {
  if (!haystack.includes(snippet)) {
    failures.push(`${label} is missing ${JSON.stringify(snippet)}`)
  }
}

function assertExcludes(haystack, snippet, label) {
  if (haystack.includes(snippet)) {
    failures.push(`${label} contains ${JSON.stringify(snippet)}`)
  }
}

const invitation = extractFunction('renderInvitationSms')
const guestInvite = extractFunction('renderGuestParticipantInviteSms')
const guestOrgApproved = extractFunction('renderGuestOrgApprovedSms')
const guestDelegateConfirmed = extractFunction('renderGuestDelegateConfirmedSms')
const gameFormed = extractFunction('renderGameFormedSms')
const timeChange = extractFunction('renderMatchTimeChangeSms')
const removed = extractFunction('renderMatchRemovedSms')
const matchInvite = extractFunction('renderMatchInviteSms')
const confirmedLineup = extractFunction('renderConfirmedLineupSms')
const reminder = extractFunction('renderMatchReminderSms')
const hostManaged = extractFunction('renderHostOfflineConfirmationSms')
const criticalUpdate = extractFunction('renderCriticalUpdateSms')
const cancellation = extractFunction('renderCancellationSms')

const failures = []
const oldInviteCopy = [
  'This is not the final lineup yet',
  'We will send Game On if the host forms the match',
  'confirm availability',
  'PlayerHoods match',
]
const inviteLikeFunctions = [
  ['renderInvitationSms', invitation],
  ['renderGuestParticipantInviteSms', guestInvite],
  ['renderGuestOrgApprovedSms', guestOrgApproved],
  ['renderMatchInviteSms', matchInvite],
]
const postFormationFunctions = [
  ['renderGuestDelegateConfirmedSms', guestDelegateConfirmed],
  ['renderGameFormedSms', gameFormed],
  ['renderMatchTimeChangeSms', timeChange],
  ['renderMatchRemovedSms', removed],
  ['renderConfirmedLineupSms', confirmedLineup],
  ['renderMatchReminderSms', reminder],
  ['renderHostOfflineConfirmationSms', hostManaged],
  ['renderCriticalUpdateSms', criticalUpdate],
  ['renderCancellationSms', cancellation],
]

for (const snippet of oldInviteCopy) {
  for (const [name, fn] of inviteLikeFunctions) {
    assertExcludes(fn, snippet, name)
  }
}

assertIncludes(invitation, "Reply YES ${data.replyCode} if you'd like to play, or NO ${data.replyCode} if not this time.", 'renderInvitationSms')
assertIncludes(invitation, 'Reply STOP to opt out.', 'renderInvitationSms')
assertIncludes(matchInvite, "Reply YES ${match.replyCode} if you'd like to play, or NO ${match.replyCode} if not this time.", 'renderMatchInviteSms')
assertIncludes(matchInvite, 'Reply STOP to opt out.', 'renderMatchInviteSms')
assertIncludes(guestDelegateConfirmed, "You're confirmed:", 'renderGuestDelegateConfirmedSms')
assertIncludes(gameFormed, 'Game on.', 'renderGameFormedSms')
assertIncludes(timeChange, 'Update: match time changed to', 'renderMatchTimeChangeSms')
assertIncludes(removed, 'You were removed from this match:', 'renderMatchRemovedSms')
assertIncludes(confirmedLineup, 'Reply OUT ${match.replyCode}', 'renderConfirmedLineupSms')
assertIncludes(reminder, 'Reply OUT ${match.replyCode}', 'renderMatchReminderSms')
assertIncludes(hostManaged, 'Reply OUT ${match.replyCode}', 'renderHostOfflineConfirmationSms')
assertIncludes(hostManaged, 'confirmed you for a ${matchKind}', 'renderHostOfflineConfirmationSms')
assertIncludes(criticalUpdate, 'Reply OUT ${match.replyCode}', 'renderCriticalUpdateSms')

assertIncludes(confirmedLineup, 'PlayerHoods: Game on', 'renderConfirmedLineupSms')
assertIncludes(confirmedLineup, "We'll only text if plans change.", 'renderConfirmedLineupSms')
assertIncludes(reminder, 'Match reminder.', 'renderMatchReminderSms')
assertIncludes(cancellation, 'This match was cancelled:', 'renderCancellationSms')
assertExcludes(cancellation, 'Reply OUT', 'renderCancellationSms')

for (const [name, fn] of postFormationFunctions) {
  assertExcludes(fn, 'Reply YES', name)
  assertExcludes(fn, 'Reply NO', name)
  assertExcludes(fn, 'to join', name)
  assertExcludes(fn, 'to decline', name)
}

if (failures.length > 0) {
  console.error('Issue #61 SMS copy regression failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Issue #61 SMS copy regression passed')
