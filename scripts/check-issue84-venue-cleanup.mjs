import { readFileSync } from 'node:fs'

const migrationPath = 'supabase/migrations/20260603010000_issue84_approved_venue_cleanup.sql'
const reportPath = 'docs/data-cleanup/venue_cleanup_candidates_20260602.md'

const approvedClubIds = [
  '0x882b61b74195d303:0xb424dc62389eb74b',
  '0x882b41569772e547:0x6cdd0f48617f999c',
  '0x882b47ddfeafa115:0xf6ae35b14b9d1f72',
  '0x882b464e60bb8675:0xc15efc59871b4df5',
  '0x882b5d97519304cb:0xa994ef0d8549c7ac',
  '0x882b5c8b891c95eb:0x42f6c82d6414defd',
  '0x882b3d89fc72d3e3:0xd93b771974942fc1',
  '0x882b44607d5f4763:0xedb00fc61dfa595',
  '0x882b12c84df59ceb:0xb1ae937f1459b3eb',
  '0x882b5c939cd78bc1:0x4f09dec620624cf0',
]

const approvedRenameIds = [
  '0x882b411da0cae48b:0x9575b42f6a729932',
  '0x882b470019175c95:0xe5670d2cef867f39',
]

const expectedNewNames = [
  'Century City Park Tennis Court',
  'Stonebrook Park Tennis Courts',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function unique(values) {
  return [...new Set(values)]
}

const migration = readFileSync(migrationPath, 'utf8')
const report = readFileSync(reportPath, 'utf8')
const approvedIds = [...approvedClubIds, ...approvedRenameIds]
const migrationIds = unique(migration.match(/0x[0-9a-f]+:0x[0-9a-f]+/gi) ?? [])
const extraIds = migrationIds.filter((id) => !approvedIds.includes(id))
const missingIds = approvedIds.filter((id) => !migrationIds.includes(id))

assert(!/\bilike\b/i.test(migration), 'Migration must not use ILIKE.')
assert(!/\blike\b/i.test(migration), 'Migration must not use LIKE.')
assert(!/%club%/i.test(migration), 'Migration must not use a broad %club% pattern.')
assert(migration.includes('v.google_place_id = f.google_place_id'), 'Club update must join on google_place_id.')
assert(migration.includes('v.google_place_id = r.google_place_id'), 'Rename update must join on google_place_id.')
assert(migrationIds.length === 12, `Migration should contain 12 unique approved source ids, found ${migrationIds.length}.`)
assert(extraIds.length === 0, `Migration contains unapproved source ids: ${extraIds.join(', ')}`)
assert(missingIds.length === 0, `Migration is missing approved source ids: ${missingIds.join(', ')}`)

for (const id of approvedIds) {
  assert(report.includes(id), `Report is missing approved source id ${id}.`)
}

for (const newName of expectedNewNames) {
  assert(migration.includes(newName), `Migration is missing rename target ${newName}.`)
  assert(report.includes(newName), `Report is missing rename target ${newName}.`)
}

assert(report.includes('- club_name_type_fix: 10'), 'Report must show 10 club_name_type_fix candidates.')
assert(report.includes('- generic_tennis_court_park_rename: 2'), 'Report must show 2 generic rename candidates.')
assert(report.includes('- high: 12'), 'Report must show 12 high confidence candidates.')

console.log(JSON.stringify({
  ok: true,
  migrationPath,
  reportPath,
  approvedClubIds: approvedClubIds.length,
  approvedRenameIds: approvedRenameIds.length,
  totalApprovedIds: approvedIds.length,
  validation: [
    'no ILIKE/LIKE/%club% broad update pattern',
    'club update joins exact google_place_id whitelist',
    'rename update joins exact google_place_id whitelist',
    'migration source ids match approved report source ids exactly',
    'report counts match approved candidate counts',
  ],
}, null, 2))
