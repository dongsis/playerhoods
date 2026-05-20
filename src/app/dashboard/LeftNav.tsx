'use client'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type DashTab = 'inbox' | 'matches' | 'hoods' | 'groups' | 'venues' | 'gear' | 'profile' | 'admin'

interface Props {
  active: DashTab
  onTab: (t: DashTab) => void
  isAdmin: boolean
  badges?: Partial<Record<DashTab, number>>
  badgeTooltips?: Partial<Record<DashTab, string>>
}

function TennisCourtIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M12 5v14" />
      <path d="M4 12h16" />
      <path d="M8 8.5v7" />
      <path d="M16 8.5v7" />
    </svg>
  )
}

function MailIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m5.5 8 6.5 5 6.5-5" />
    </svg>
  )
}

function PeopleIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="9" r="2.5" />
      <circle cx="16.5" cy="10" r="2" />
      <path d="M4.5 17c.8-2.4 2.7-3.5 4.5-3.5s3.7 1.1 4.5 3.5" />
      <path d="M14 16.5c.5-1.7 1.8-2.5 3.3-2.5 1.2 0 2.3.5 3.2 1.6" />
    </svg>
  )
}

function TrophyIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 5h8v2a4 4 0 0 1-8 0V5Z" />
      <path d="M10.5 15h3" />
      <path d="M12 11v4" />
      <path d="M8 6H5.5A2.5 2.5 0 0 0 8 9" />
      <path d="M16 6h2.5A2.5 2.5 0 0 1 16 9" />
      <path d="M9 19h6" />
    </svg>
  )
}

function MapPinIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  )
}

function TennisRacketIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="10" cy="9" rx="5" ry="6.5" />
      <path d="M7 6.5h6" />
      <path d="M7 9h6" />
      <path d="M7 11.5h6" />
      <path d="M10 3.5v11" />
      <path d="M13.7 13.8 18.5 19" />
      <path d="M17.4 20.1 20 17.5" />
    </svg>
  )
}

function UserIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8.5" r="2.8" />
      <path d="M6.5 18c.9-2.7 3-4 5.5-4s4.6 1.3 5.5 4" />
    </svg>
  )
}

function ShieldIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3.5 18 6v5c0 4.4-2.4 7-6 9-3.6-2-6-4.6-6-9V6l6-2.5Z" />
      <path d="M12 8v6" />
      <path d="M9.5 11H14.5" />
    </svg>
  )
}

function LogOutIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v9A1.5 1.5 0 0 0 6.5 18H10" />
      <path d="M13 8l4 4-4 4" />
      <path d="M9 12h8" />
    </svg>
  )
}

export function NavIcon({ tab, className = 'h-[18px] w-[18px]' }: { tab: DashTab; className?: string }) {
  switch (tab) {
    case 'inbox':
      return <MailIcon className={className} />
    case 'matches':
      return <TennisCourtIcon className={className} />
    case 'hoods':
      return <PeopleIcon className={className} />
    case 'groups':
      return <TrophyIcon className={className} />
    case 'venues':
      return <MapPinIcon className={className} />
    case 'gear':
      return <TennisRacketIcon className={className} />
    case 'profile':
      return <UserIcon className={className} />
    case 'admin':
      return <ShieldIcon className={className} />
    default:
      return <UserIcon className={className} />
  }
}

const tabs: { key: DashTab; label: string }[] = [
  { key: 'matches', label: 'Matches' },
  { key: 'hoods', label: 'Hoods' },
  { key: 'groups', label: 'Groups' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'venues', label: 'Venues' },
  { key: 'gear', label: 'Gear' },
  { key: 'profile', label: 'My Profile' },
  { key: 'admin', label: 'Venue Admin' },
]

export function LeftNav({ active, onTab, isAdmin, badges, badgeTooltips }: Props) {
  const visible = tabs.filter((tab) => {
    if (tab.key === 'venues' || tab.key === 'admin' || tab.key === 'gear') return isAdmin
    return true
  })
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="flex h-full flex-col gap-1 bg-[#F1F1F3] p-4">
      <div className="mb-4 py-2">
        <button
          type="button"
          onClick={() => onTab('matches')}
          className="group flex w-full items-center justify-start rounded-3xl px-0 py-1 transition-colors hover:bg-transparent"
          aria-label="PlayerHoods home"
        >
          <span className="flex w-full flex-col items-center gap-2 transition-transform duration-200 group-hover:scale-[1.01]">
            <img
              src="/playerhoods-brand-stacked-cropped.png"
              alt="PlayerHoods"
              className="h-[72px] w-[172px] object-contain"
            />
          </span>
        </button>
      </div>

      {visible.map((tab) => {
        const badge = badges?.[tab.key] ?? 0
        const showDotBadge = badge < 0
        return (
          <button
            key={tab.key}
            onClick={() => onTab(tab.key)}
            className={[
              'text-[0.95rem] flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold transition-colors',
              active === tab.key
                ? 'bg-[#1E293B] text-white shadow-[0_12px_28px_rgba(30,41,59,0.18)]'
                : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]',
            ].join(' ')}
          >
            <span
              className={[
                'inline-flex h-8 w-8 items-center justify-center rounded-full',
                active === tab.key
                  ? 'bg-white/10 text-white'
                  : 'bg-[#F8FAFC] text-[#94A3B8]',
              ].join(' ')}
            >
              <NavIcon tab={tab.key} />
            </span>
            <span className="flex-1">{tab.label}</span>
            {showDotBadge ? (
              <span
                className="h-2 w-2 rounded-full bg-[#2563EB]"
                title={badgeTooltips?.[tab.key]}
                aria-label={badgeTooltips?.[tab.key] ?? 'Next step available'}
              />
            ) : badge > 0 && (
              <span className="text-body-sub flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#3B82F6] px-1 font-bold leading-none text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        )
      })}

      <div className="mt-auto border-t border-[#E2E8F0] pt-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[0.95rem] font-semibold text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#64748B]"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F8FAFC] text-[#94A3B8]">
            <LogOutIcon className="h-[18px] w-[18px]" />
          </span>
          Log out
        </button>
      </div>
    </nav>
  )
}
