import { readFileSync } from 'node:fs'

const importSectionPath = 'src/app/dashboard/ContactScreenshotImportSection.tsx'
const actionsPath = 'src/app/dashboard/dashboard.actions.ts'
const hoodsPath = 'src/app/dashboard/HoodsPanel.tsx'
const createMatchPath = 'src/app/matches/CreateMatchInline.tsx'

function readSource(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

const importSection = readSource(importSectionPath)
const actions = readSource(actionsPath)
const hoods = readSource(hoodsPath)
const createMatch = readSource(createMatchPath)

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

function sliceFrom(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle)
  if (start === -1) {
    failures.push(`${label} start not found: ${JSON.stringify(startNeedle)}`)
    return ''
  }

  const end = source.indexOf(endNeedle, start + startNeedle.length)
  if (end === -1) {
    failures.push(`${label} end not found: ${JSON.stringify(endNeedle)}`)
    return source.slice(start)
  }

  return source.slice(start, end)
}

const handleImport = sliceFrom(
  importSection,
  '  const handleImport = async () => {',
  '\n\n  return (',
  'ContactScreenshotImportSection handleImport',
)

const createMatchImportCallback = sliceFrom(
  createMatch,
  '            onImported={async (result) => {',
  '            }}\n            onDone',
  'CreateMatchInline Smart Import onImported callback',
)

assertIncludes(actions, 'const createdContacts: ContactScreenshotImportCreatedContact[] = []', 'dashboard import action created contact payload')
assertIncludes(actions, 'createdContacts.push({', 'dashboard import action created contact payload')
assertIncludes(actions, 'return { created, skipped, createdContacts }', 'dashboard import action result')

assertIncludes(importSection, 'ContactScreenshotImportResult', 'Smart Import result typing')
assertIncludes(importSection, 'const importingRef = useRef(false)', 'duplicate click guard')
assertIncludes(handleImport, 'if (importingRef.current) return', 'duplicate click guard')
assertIncludes(handleImport, 'importingRef.current = true', 'duplicate click guard')
assertIncludes(handleImport, 'importingRef.current = false', 'duplicate click guard cleanup')
assertIncludes(handleImport, 'setImportResult(result)', 'post-save success state')
assertIncludes(handleImport, 'await onImported(result)', 'parent post-save callback')
assertIncludes(handleImport, "setRetryMessage(getFriendlyImportError(err, 'We could not save those contacts yet.", 'failed save inline error')
assertExcludes(handleImport, 'resetFlow()', 'post-save handler')

assertIncludes(importSection, "const step = importResult ? 'success'", 'explicit post-save success step')
assertIncludes(importSection, 'formatContactsAdded(importResult.created)', 'success count copy')
assertIncludes(importSection, 'Done', 'success Done action')
assertIncludes(importSection, 'Add another screenshot', 'success add-another action')
assertIncludes(importSection, 'Nothing was sent or invited automatically.', 'no automatic invite copy')

assertIncludes(hoods, 'onImported={async (result) => {', 'Hoods Smart Import callback')
assertIncludes(hoods, 'await handleScreenshotImported(result)', 'Hoods refresh callback')
assertIncludes(hoods, 'setRecentImportedContactGuestIds(newGuestIds)', 'Hoods pin imported contacts')
assertIncludes(hoods, 'return pinRecentImportedContacts(sortedPeople)', 'Hoods top insertion')
assertIncludes(hoods, 'setContactComposerMode(null)', 'Hoods modal close')
assertIncludes(hoods, 'if (result.created === 1 && result.skipped === 0)', 'Hoods single-contact auto-close gate')
assertIncludes(hoods, 'await loadSupportData()', 'Hoods list refresh')

assertIncludes(createMatch, 'onImported={async (result) => {', 'Match Invite Smart Import callback')
assertIncludes(createMatch, 'setRecentImportedContactGuestIds(createdGuestIds)', 'Match Invite top insertion')
assertIncludes(createMatch, 'setSelectedDirectInviteKeys((current) => {', 'Match Invite auto-select')
assertIncludes(createMatch, 'next.add(`contact:${guestId}`)', 'Match Invite contact key selection')
assertIncludes(createMatch, 'await loadContactInviteCandidates()', 'Match Invite candidate refresh')
assertIncludes(createMatch, 'setContactComposerMode(null)', 'Match Invite modal close')
assertIncludes(createMatch, 'if (result.created === 1 && result.skipped === 0)', 'Match Invite single-contact auto-close gate')
assertExcludes(createMatchImportCallback, 'inviteContactGuestToMatch', 'Match Invite Smart Import callback')
assertExcludes(createMatchImportCallback, 'inviteUserToMatch', 'Match Invite Smart Import callback')
assertExcludes(createMatchImportCallback, 'processDeliveriesAction', 'Match Invite Smart Import callback')

if (failures.length > 0) {
  console.error('Smart Import post-save regression failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Smart Import post-save regression passed')
