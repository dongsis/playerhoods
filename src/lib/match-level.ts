import { getLevelLabel, LEVEL_OPTIONS } from '@/lib/profile-options'

export const MATCH_LEVEL_OPTIONS = LEVEL_OPTIONS

export function formatMatchLevelLabel(level: string | null | undefined): string | null {
  const normalizedLevel = level?.trim()
  if (!normalizedLevel) return null
  if (/\d/.test(normalizedLevel)) return normalizedLevel

  return getLevelLabel(normalizedLevel) ?? normalizedLevel
}
