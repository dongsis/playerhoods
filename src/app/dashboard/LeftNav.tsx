'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type DashTab = 'inbox' | 'matches' | 'hoods' | 'groups' | 'venues' | 'gear' | 'profile' | 'admin'

interface Props {
  active: DashTab
  onTab: (t: DashTab) => void
  isAdmin: boolean
  badges?: Partial<Record<DashTab, number>>
}

const tabs: { key: DashTab; label: string; icon: string }[] = [
  { key: 'inbox', label: 'Inbox', icon: 'In' },
  { key: 'matches', label: 'Matches', icon: 'Ma' },
  { key: 'hoods', label: 'Hoods', icon: 'Hd' },
  { key: 'groups', label: 'Groups', icon: 'Gr' },
  { key: 'venues', label: 'Venues', icon: 'Ve' },
  { key: 'gear', label: 'Gear', icon: 'Ge' },
  { key: 'profile', label: 'My Profile', icon: 'Me' },
  { key: 'admin', label: 'Venue Admin', icon: 'Ad' },
]

export function LeftNav({ active, onTab, isAdmin, badges }: Props) {
  const visible = tabs.filter((tab) => tab.key !== 'admin' || isAdmin)
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-2 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Playerhoods
        </span>
      </div>

      {visible.map((tab) => {
        const badge = badges?.[tab.key] ?? 0
        return (
          <button
            key={tab.key}
            onClick={() => onTab(tab.key)}
            className={[
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
              active === tab.key
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-[11px] font-semibold leading-none">
              {tab.icon}
            </span>
            <span className="flex-1">{tab.label}</span>
            {badge > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold leading-none text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        )
      })}

      <div className="mt-auto border-t border-gray-100 pt-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-[11px] font-semibold leading-none">
            Out
          </span>
          Log out
        </button>
      </div>
    </nav>
  )
}
