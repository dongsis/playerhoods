export type OrganizerNotePresetItem = {
  id: string
  chip: string
  full: string
  exclusiveGroup?: 'access' | 'fees'
}

export type OrganizerNotePresetGroup = {
  label: string
  items: OrganizerNotePresetItem[]
}

export const ORGANIZER_NOTE_PRESETS: OrganizerNotePresetGroup[] = [
  {
    label: 'Access',
    items: [
      { id: 'members_only', chip: 'Members only', full: 'Members only.', exclusiveGroup: 'access' },
      { id: 'guests_welcome', chip: 'Guests welcome', full: 'Guests are welcome.', exclusiveGroup: 'access' },
    ],
  },
  {
    label: 'Fees',
    items: [
      { id: 'no_court_fee', chip: 'No court fee', full: 'No court fee to share.', exclusiveGroup: 'fees' },
      { id: 'guest_fee_applies', chip: 'Guest fee applies', full: 'Guest fee applies.' },
      { id: 'share_court_fee', chip: 'Share court fee', full: 'Please share the court fee.', exclusiveGroup: 'fees' },
    ],
  },
  {
    label: 'Time',
    items: [
      { id: 'early', chip: 'Early', full: 'Please arrive a little early.' },
      { id: 'ontime', chip: 'On time', full: 'Please be on court and ready at start time.' },
    ],
  },
  {
    label: 'Gear',
    items: [
      { id: 'balls', chip: 'Balls', full: 'One player please bring new balls.' },
      { id: 'water', chip: 'Water', full: 'Please bring water.' },
    ],
  },
  {
    label: 'After',
    items: [
      { id: 'drink', chip: 'Beer/Coffee', full: "Let's grab a beer or coffee after." },
      { id: 'meal', chip: 'Meal', full: 'Anyone up for a meal after?' },
      { id: 'photo', chip: 'Photo', full: "Let's take a nice court photo." },
    ],
  },
  {
    label: 'Chat',
    items: [
      { id: 'chat', chip: 'Check chat', full: 'Check chat for updates.' },
    ],
  },
]

const ORGANIZER_NOTE_PRESET_GROUP_SENTENCES = new Map(
  ORGANIZER_NOTE_PRESETS.flatMap((group) => {
    const grouped = group.items
      .filter((item) => item.exclusiveGroup)
      .reduce<Record<string, string[]>>((acc, item) => {
        const key = item.exclusiveGroup as string
        acc[key] ??= []
        acc[key].push(item.full)
        return acc
      }, {})

    return Object.entries(grouped).map(([key, values]) => [key, values] as const)
  }),
)

export function parseOrganizerNoteSentences(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function applyOrganizerNotePreset(text: string, item: OrganizerNotePresetItem) {
  const sentences = parseOrganizerNoteSentences(text)
  const groupSentences = item.exclusiveGroup
    ? (ORGANIZER_NOTE_PRESET_GROUP_SENTENCES.get(item.exclusiveGroup) ?? [])
    : []

  const nextSentences = sentences.filter((sentence) => {
    if (sentence === item.full) return false
    if (groupSentences.includes(sentence)) return false
    return true
  })

  nextSentences.push(item.full)
  return nextSentences.join('\n')
}
