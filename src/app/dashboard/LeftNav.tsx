'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type DashTab = 'matches' | 'players' | 'contacts' | 'venues' | 'profile' | 'admin'

interface Props {
  active: DashTab
  onTab: (t: DashTab) => void
  isAdmin: boolean
  badges?: Partial<Record<DashTab, number>>
}

const tabs: { key: DashTab; label: string; icon: string }[] = [
  { key: 'matches', label: 'Matches', icon: '🎾' },
  { key: 'players', label: 'Players', icon: '👥' },
  { key: 'contacts', label: 'Contacts', icon: '📇' },
  { key: 'venues', label: 'Venues', icon: '🏟️' },
  { key: 'profile', label: 'My Profile', icon: '👤' },
  { key: 'admin', label: 'Venue Admin', icon: '⚙️' },
]

export function LeftNav({ active, onTab, isAdmin, badges }: Props) {
  const visible = tabs.filter(t => t.key !== 'admin' || isAdmin)
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="flex flex-col gap-1 p-3 h-full">
      <div className="px-3 py-2 mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Playerhoods
        </span>
      </div>
      {visible.map(t => {
        const badge = badges?.[t.key] ?? 0
        return (
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
            <span className="flex-1">{t.label}</span>
            {badge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold bg-blue-500 text-white leading-none">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        )
      })}
      <div className="mt-auto pt-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left w-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <span className="text-base leading-none">→</span>
          Log out
        </button>
      </div>
    </nav>
  )
}
