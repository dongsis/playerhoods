const INTERNAL_VENUE_NOTES = new Set([
  'Imported from venue candidate spreadsheet: Halton/Peel row.',
])

export function getPublicVenueNote(note: string | null | undefined) {
  const normalized = note?.trim()
  if (!normalized || INTERNAL_VENUE_NOTES.has(normalized)) return null
  return normalized
}
