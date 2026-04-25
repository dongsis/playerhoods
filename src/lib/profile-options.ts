export const LOOKING_TO_PLAY_OPTIONS = [
  { value: 'very_open', label: 'Very open to new games' },
  { value: 'open', label: 'Open to more games' },
  { value: 'occasional', label: 'Occasionally' },
  { value: 'quite_full', label: 'Already quite full' },
  { value: 'not_looking', label: 'Mostly not looking right now' },
] as const

export const PREFERRED_PLAY_TIME_OPTIONS = [
  { value: 'weekday_mornings', label: 'Weekday mornings' },
  { value: 'weekday_afternoons', label: 'Weekday afternoons' },
  { value: 'weekday_evenings', label: 'Weekday evenings' },
  { value: 'saturday_mornings', label: 'Saturday mornings' },
  { value: 'saturday_afternoons', label: 'Saturday afternoons' },
  { value: 'sunday_mornings', label: 'Sunday mornings' },
  { value: 'sunday_afternoons', label: 'Sunday afternoons' },
  { value: 'flexible', label: 'Flexible' },
] as const

export const CURRENT_FREQUENCY_OPTIONS = [
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'few_times_a_month', label: 'A few times a month' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'multiple_times_a_week', label: 'Multiple times a week' },
] as const

export const PLAY_STYLE_OPTIONS = [
  { value: 'Patient baseline', label: 'Patient baseline' },
  { value: 'Aggressive baseline', label: 'Aggressive baseline' },
  { value: 'All-court', label: 'All-court' },
  { value: 'Net player', label: 'Net player' },
  { value: 'Big server', label: 'Big server' },
  { value: 'Consistent rallyer', label: 'Consistent rallyer' },
  { value: 'Placement over power', label: 'Placement over power' },
  { value: 'Power player', label: 'Power player' },
  { value: 'Defensive', label: 'Defensive' },
  { value: 'Attacking', label: 'Attacking' },
  { value: 'Fast hands', label: 'Fast hands' },
  { value: 'Likes long rallies', label: 'Likes long rallies' },
] as const

export const LEVEL_OPTIONS = [
  { value: 'Beginner', label: 'Beginner (2.0-2.5)' },
  { value: 'Can Rally', label: 'Can Rally (2.5-3.0)' },
  { value: 'Match Ready', label: 'Match Ready (3.0-3.5)' },
  { value: 'Club Level', label: 'Club Level (3.5-4.0)' },
  { value: 'Strong Club Level', label: 'Strong Club Level (4.0-4.5)' },
  { value: 'Club Elite', label: 'Club Elite (4.5-5.0+)' },
] as const

export const SHARED_GROUP_JOIN_PREFERENCE_OPTIONS = [
  {
    value: 'approval_required_all',
    label: 'Approval required',
  },
  {
    value: 'auto_join_enabled_sports',
    label: 'Auto-join my sports',
  },
  {
    value: 'auto_join_all',
    label: 'Auto-join all sports',
  },
] as const

export const AVAILABILITY_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'away', label: 'Away' },
  { value: 'inactive', label: 'Inactive' },
] as const

export function getLookingToPlayLabel(value: string | null | undefined): string | null {
  return LOOKING_TO_PLAY_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getPreferredPlayTimeLabel(value: string | null | undefined): string | null {
  return PREFERRED_PLAY_TIME_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getCurrentFrequencyLabel(value: string | null | undefined): string | null {
  return CURRENT_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getLevelLabel(value: string | null | undefined): string | null {
  return LEVEL_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getAvailabilityStatusDotClass(value: string | null | undefined): string | null {
  switch (value?.trim().toLowerCase()) {
    case 'very_open':
    case 'very open':
      return 'bg-[#22C55E]'
    case 'open':
    case 'available':
      return 'bg-[#4CAF72]'
    case 'occasional':
    case 'occasionally':
      return 'bg-[#6E8B6D]'
    case 'quite_full':
    case 'busy':
      return 'bg-[#5B6472]'
    case 'away':
      return 'bg-[#475569]'
    case 'not_looking':
    case 'not looking right now':
    case 'inactive':
      return 'bg-[#1E293B]'
    default:
      return null
  }
}

export function getSharedGroupJoinPreferenceLabel(value: string | null | undefined): string | null {
  return SHARED_GROUP_JOIN_PREFERENCE_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getAvailabilityStatusLabel(value: string | null | undefined): string | null {
  return AVAILABILITY_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getSportFormatOptions(sportCode: string): { value: string; label: string }[] {
  switch (sportCode) {
    case 'tennis':
      return [
        { value: 'singles', label: 'Singles' },
        { value: 'doubles', label: 'Doubles' },
      ]
    case 'pickleball':
      return [
        { value: 'singles', label: 'Singles' },
        { value: 'doubles', label: 'Doubles' },
        { value: 'open_play', label: 'Open play' },
      ]
    default:
      return [
        { value: 'singles', label: 'Singles' },
        { value: 'doubles', label: 'Doubles' },
      ]
  }
}

export function getSportGearLabels(sportCode: string): {
  primary: string
  secondary: string | null
  shoes: string | null
} {
  switch (sportCode) {
    case 'tennis':
      return {
        primary: 'Racquet',
        secondary: 'Strings',
        shoes: 'Shoes',
      }
    case 'pickleball':
      return {
        primary: 'Paddle',
        secondary: null,
        shoes: 'Shoes',
      }
    default:
      return {
        primary: 'Gear',
        secondary: 'Setup',
        shoes: 'Shoes',
      }
  }
}
