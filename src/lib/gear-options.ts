import type { GearCategory } from '@/lib/types/database'

export const GEAR_SECTION_OPTIONS = [
  { value: 'showcase', label: 'Showcase' },
  { value: 'owned', label: 'Owned Gear' },
  { value: 'wishlist', label: 'Wishlist' },
] as const

export const GEAR_CATEGORY_OPTIONS: { value: GearCategory; label: string }[] = [
  { value: 'rackets', label: 'Racquets' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'apparel', label: 'Apparel' },
  { value: 'strings', label: 'Strings' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'other', label: 'Other' },
]

export const RACKET_TYPE_OPTIONS = [
  'Tennis Racquet',
  'Pickleball Paddle',
  'Badminton Racquet',
  'Table Tennis Paddle',
] as const

export const OWNED_STATUS_OPTIONS = [
  'active',
  'backup',
  'retired',
  'sold',
  'broken',
] as const

export const WISHLIST_STATUS_OPTIONS = [
  'interested',
  'want_to_try',
  'want_to_buy',
  'bought',
  'archived',
] as const

export const WISHLIST_PRIORITY_OPTIONS = [
  'low',
  'medium',
  'high',
] as const

export const STRING_SHAPE_OPTIONS = [
  'Round',
  'Shaped',
  'Twisted',
  'Textured',
] as const

export function getGearCategoryLabel(category: GearCategory): string {
  return GEAR_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category
}
