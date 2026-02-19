'use client'

export type DashTab = 'matches' | 'players' | 'profile' | 'admin'

interface Props {
  active: DashTab
  onTab: (t: DashTab) => void
  isAdmin: boolean
}

const tabs: { key: DashTab; label: string; icon: string }[] = [
  { key: 'matches', label: 'Matches', icon: '🎾' },
  { key: 'players', label: 'Players', icon: '👥' },
  { key: 'profile', label: 'My Profile', icon: '👤' },
  { key: 'admin', label: 'Club Management', icon: '⚙️' },
]

export function LeftNav({ active, onTab, isAdmin }: Props) {
  const visible = tabs.filter(t => t.key !== 'admin' || isAdmin)

  return (
    <nav className="flex flex-col gap-1 p-3">
      <div className="px-3 py-2 mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Playerhoods
        </span>
      </div>
      {visible.map(t => (
        <button
          key={t.key}
          onClick={() => onTab(t.key)}
          className={[
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left w-full transition-colors',
            active === t.key
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
          ].join(' ')}
        >
          <span className="text-base leading-none">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
