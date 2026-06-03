import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const sourcePath = resolve('supabase/migrations/20260509210000_seed_halton_peel_venues_from_xlsx.sql')
const reportPath = resolve('docs/data-cleanup/venue_cleanup_candidates_20260602.md')
const sourceDisplayPath = 'supabase/migrations/20260509210000_seed_halton_peel_venues_from_xlsx.sql'

const columns = [
  'name',
  'location_text',
  'city',
  'province',
  'postal_code',
  'country',
  'website_url',
  'venue_phone',
  'latitude',
  'longitude',
  'indoor_outdoor',
  'facility_type',
  'booking_required',
  'cost_type',
  'supports_tennis',
  'supports_pickleball',
  'google_rating',
  'working_hours',
  'google_maps_url',
  'google_place_id',
  'season',
  'has_lights',
  'has_washroom',
  'has_parking',
  'accessibility',
  'venue_kind',
  'access_type',
  'sport_codes',
  'court_count',
]

const updateColumns = [
  'match_name',
  'match_city',
  ...columns,
]

function extractValuesBlock(sql, sectionMarker, endMarker) {
  const sectionIndex = sql.indexOf(sectionMarker)
  if (sectionIndex < 0) throw new Error(`Could not find ${sectionMarker}.`)

  const marker = 'values'
  const markerIndex = sql.indexOf(marker, sectionIndex)
  if (markerIndex < 0) throw new Error('Could not find seed_rows values block.')

  const start = sql.indexOf('(', markerIndex)
  const end = sql.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error(`Could not isolate tuple block for ${sectionMarker}.`)

  return sql.slice(start, end + 1)
}

function parseSqlString(text, start) {
  let value = ''
  let i = start + 1

  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]

    if (char === "'" && next === "'") {
      value += "'"
      i += 2
      continue
    }

    if (char === "'") {
      return { value, nextIndex: i + 1 }
    }

    value += char
    i += 1
  }

  throw new Error('Unterminated SQL string literal.')
}

function parseTuple(text, start) {
  const values = []
  let token = ''
  let depth = 0
  let i = start + 1

  while (i < text.length) {
    const char = text[i]

    if (char === "'") {
      const parsed = parseSqlString(text, i)
      token += parsed.value
      i = parsed.nextIndex
      continue
    }

    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1

    if (char === '(' && depth === 0) depth += 1
    if (char === ')' && depth === 0) {
      values.push(cleanSqlToken(token))
      return { values, nextIndex: i + 1 }
    }
    if (char === ')' && depth > 0) depth -= 1

    if (char === ',' && depth === 0) {
      values.push(cleanSqlToken(token))
      token = ''
      i += 1
      continue
    }

    token += char
    i += 1
  }

  throw new Error('Unterminated SQL tuple.')
}

function cleanSqlToken(raw) {
  const value = raw.trim()
  if (!value || /^null(?:::.*)?$/i.test(value)) return ''
  if (/^true$/i.test(value)) return 'true'
  if (/^false$/i.test(value)) return 'false'
  if (value.endsWith('::jsonb')) return value.replace(/::jsonb$/i, '').trim()
  if (value.startsWith('array[')) return value
  return value
}

function parseRowsFromSection(sql, sectionMarker, endMarker, sectionColumns, sourceOperation) {
  const block = extractValuesBlock(sql, sectionMarker, endMarker)
  const rows = []
  let i = 0

  while (i < block.length) {
    if (block[i] === '(') {
      const parsed = parseTuple(block, i)
      if (parsed.values.length === sectionColumns.length) {
        const row = Object.fromEntries(sectionColumns.map((column, index) => [column, parsed.values[index] ?? '']))
        row.source_operation = sourceOperation
        rows.push(row)
      }
      i = parsed.nextIndex
      continue
    }

    i += 1
  }

  return rows
}

function parseRows(sql) {
  const seedRows = parseRowsFromSection(
    sql,
    'with seed_rows',
    '\n), inserted as (',
    columns,
    'insert_candidate',
  )
  const updateRows = parseRowsFromSection(
    sql,
    'with update_rows',
    '\n), updated as (',
    updateColumns,
    'update_candidate',
  )

  return [...seedRows, ...updateRows]
}

function isClub(value) {
  return String(value ?? '').trim().toLowerCase() === 'club'
}

function genericCourtKind(name) {
  const normalized = String(name ?? '').trim().toLowerCase()
  if (normalized === 'tennis court') return 'Tennis Court'
  if (normalized === 'tennis courts') return 'Tennis Courts'
  return null
}

function extractParkName(text) {
  const source = String(text ?? '').trim()
  if (!source) return null

  const beforeComma = source.split(',')[0]?.trim() ?? source
  const match = beforeComma.match(/\b([A-Z][A-Za-z0-9'&.-]*(?:\s+[A-Z][A-Za-z0-9'&.-]*){0,6}\s+Park)\b/)
  if (match) return match[1].trim()

  return null
}

function candidateId(row, index) {
  return row.google_place_id || `seed-row-${index + 1}`
}

function buildCandidates(rows) {
  const candidates = []
  const alreadyCorrectClubRows = []

  rows.forEach((row, index) => {
    const name = row.name.trim()
    const classification = row.venue_kind.trim()

    if (/club/i.test(name)) {
      if (isClub(classification)) {
        alreadyCorrectClubRows.push(row)
      } else {
        candidates.push({
          id: candidateId(row, index),
          currentName: name,
          currentClassification: classification || '(blank)',
          city: row.city,
          address: row.location_text,
          detectedRule: 'club_name_type_fix',
          proposedClassification: 'club',
          proposedName: '',
          confidence: 'high',
          notes: `Venue name contains "club" but venue_kind is not club. Source operation: ${row.source_operation}.`,
        })
      }
    }

    const courtKind = genericCourtKind(name)
    if (courtKind) {
      const parkName = extractParkName(row.location_text)
      if (parkName) {
        candidates.push({
          id: candidateId(row, index),
          currentName: name,
          currentClassification: classification || '(blank)',
          city: row.city,
          address: row.location_text,
          detectedRule: 'generic_tennis_court_park_rename',
          proposedClassification: '',
          proposedName: `${parkName} ${courtKind}`,
          confidence: 'high',
          notes: `Generic tennis court name and location_text contains a recognizable park name. Source operation: ${row.source_operation}.`,
        })
      }
    }
  })

  return { candidates, alreadyCorrectClubRows }
}

function countByRuleAndConfidence(candidates) {
  const counts = new Map()
  for (const candidate of candidates) {
    const key = `${candidate.detectedRule}:${candidate.confidence}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function escapeTable(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ')
}

function renderReport(rows, candidates, alreadyCorrectClubRows) {
  const counts = countByRuleAndConfidence(candidates)
  const totalClubFixes = candidates.filter((candidate) => candidate.detectedRule === 'club_name_type_fix').length
  const totalRenameFixes = candidates.filter((candidate) => candidate.detectedRule === 'generic_tennis_court_park_rename').length
  const confidenceCounts = ['high', 'medium', 'low']
    .map((confidence) => {
      const count = candidates.filter((candidate) => candidate.confidence === confidence).length
      return `- ${confidence}: ${count}`
    })
    .join('\n')

  const ruleCounts = [
    `- club_name_type_fix: ${totalClubFixes}`,
    `- generic_tennis_court_park_rename: ${totalRenameFixes}`,
  ].join('\n')

  const detailedCounts = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `- ${key}: ${count}`)
    .join('\n') || '- none: 0'

  const rowsTable = candidates.map((candidate) => `| ${[
    candidate.id,
    candidate.currentName,
    candidate.currentClassification,
    candidate.city,
    candidate.address,
    candidate.detectedRule,
    candidate.proposedClassification,
    candidate.proposedName,
    candidate.confidence,
    candidate.notes,
  ].map(escapeTable).join(' | ')} |`)

  return `# Venue Cleanup Candidate Audit

Date: 2026-06-02

Status: candidate audit report. The 12 listed rows were later approved for the exact whitelist migration in PR #84; do not use this document as approval for any broader venue data mutation.

## Source

- Canonical runtime table used by the app: \`public.venues\`.
- Local static audit source: \`${sourceDisplayPath}\`.
- Source note: this migration seeds/reconciles Halton and Peel venues from \`playerhoods_venue_cleaned_with_courts_v4 (3).xlsx\` and declares 329 source candidates.
- Audit rows parsed: ${rows.length}.
- Stable source id used in this report: \`google_place_id\` when present, otherwise synthetic seed row number.

No production credentials, Supabase Remote connection, database mutation, or provider traffic was used to generate this report.

## Summary Counts

By rule:

${ruleCounts}

By confidence:

${confidenceCounts}

By rule and confidence:

${detailedCounts}

Already-correct club-name rows not counted as fixes: ${alreadyCorrectClubRows.length}.

## Candidate Rows

| stable source id | current name | current classification | city | address | detected rule | proposed classification | proposed name | confidence | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rowsTable.join('\n') || '| none | none | none | none | none | none | none | none | none | No candidates found. |'}

## Notes

- Rule A flags venue names containing \`club\` case-insensitively when \`venue_kind\` is not already \`club\`.
- Rule B only flags exactly generic \`Tennis Court\` / \`Tennis Courts\` names when \`location_text\` contains a recognizable park name.
- Generic tennis court rows without a recognizable park name in \`location_text\` are not auto-proposed here.
- This report intentionally proposes no updates. Any row-level changes need a separate owner-approved data update issue.
`
}

const sql = readFileSync(sourcePath, 'utf8')
const rows = parseRows(sql)
const { candidates, alreadyCorrectClubRows } = buildCandidates(rows)
const report = renderReport(rows, candidates, alreadyCorrectClubRows)

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, report)

console.log(JSON.stringify({
  sourcePath,
  reportPath,
  rowsParsed: rows.length,
  totalCandidates: candidates.length,
  counts: {
    club_name_type_fix: candidates.filter((candidate) => candidate.detectedRule === 'club_name_type_fix').length,
    generic_tennis_court_park_rename: candidates.filter((candidate) => candidate.detectedRule === 'generic_tennis_court_park_rename').length,
    confidence: {
      high: candidates.filter((candidate) => candidate.confidence === 'high').length,
      medium: candidates.filter((candidate) => candidate.confidence === 'medium').length,
      low: candidates.filter((candidate) => candidate.confidence === 'low').length,
    },
    already_correct_club_name_rows: alreadyCorrectClubRows.length,
  },
}, null, 2))
