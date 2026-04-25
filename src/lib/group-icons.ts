export type GroupIconKey =
  | 'tennis'
  | 'home'
  | 'community'
  | 'moon'
  | 'trophy'
  | 'spark'

export const GROUP_ICON_OPTIONS: { key: GroupIconKey; label: string; emoji: string }[] = [
  { key: 'tennis', label: 'Tennis', emoji: '🎾' },
  { key: 'home', label: 'Neighbourhood', emoji: '🏠' },
  { key: 'community', label: 'Community', emoji: '👥' },
  { key: 'moon', label: 'Evening', emoji: '🌙' },
  { key: 'trophy', label: 'Competitive', emoji: '🏆' },
  { key: 'spark', label: 'General', emoji: '✨' },
]

export function getGroupIconMeta(iconKey: string | null | undefined) {
  return GROUP_ICON_OPTIONS.find((option) => option.key === iconKey) ?? GROUP_ICON_OPTIONS[5]
}
