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

export function getLookingToPlayLabel(value: string | null | undefined): string | null {
  return LOOKING_TO_PLAY_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getPreferredPlayTimeLabel(value: string | null | undefined): string | null {
  return PREFERRED_PLAY_TIME_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getCurrentFrequencyLabel(value: string | null | undefined): string | null {
  return CURRENT_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? null
}

export function getSportFormatOptions(sportCode: string): { value: string; label: string }[] {
  switch (sportCode) {
    case 'tennis':
      return [
        { value: 'singles', label: 'Singles' },
        { value: 'doubles', label: 'Doubles' },
        { value: 'mixed', label: 'Mixed' },
      ]
    case 'pickleball':
      return [
        { value: 'singles', label: 'Singles' },
        { value: 'doubles', label: 'Doubles' },
        { value: 'mixed', label: 'Mixed' },
        { value: 'open_play', label: 'Open play' },
      ]
    default:
      return [
        { value: 'singles', label: 'Singles' },
        { value: 'doubles', label: 'Doubles' },
        { value: 'mixed', label: 'Mixed' },
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
