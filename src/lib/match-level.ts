export const MATCH_LEVEL_OPTIONS = [
  { value: 'Beginner', label: 'Beginner (1.0–2.5)' },
  { value: 'Recreational', label: 'Recreational (2.5–3.0)' },
  { value: 'Club Level', label: 'Club Level (3.0–4.0)' },
  { value: 'Advanced', label: 'Advanced (4.0–4.5)' },
  { value: 'Competitive', label: 'Competitive (4.5+)' },
] as const

const LEGACY_MATCH_LEVEL_LABELS: Record<string, string> = {
  'Can Rally': 'Can Rally (2.5–3.0)',
  'Match Ready': 'Match Ready (3.0–3.5)',
  'Strong Club Level': 'Strong Club Level (4.0–4.5)',
  'Club Elite': 'Club Elite (4.5–5.0+)',
}

const MATCH_LEVEL_LABELS: Record<string, string> = {
  ...Object.fromEntries(MATCH_LEVEL_OPTIONS.map((option) => [option.value, option.label])),
  ...LEGACY_MATCH_LEVEL_LABELS,
}

export function formatMatchLevelLabel(level: string | null | undefined): string | null {
  const normalizedLevel = level?.trim()
  if (!normalizedLevel) return null
  if (/\d/.test(normalizedLevel)) return normalizedLevel

  return MATCH_LEVEL_LABELS[normalizedLevel] ?? normalizedLevel
}
