'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { LeftNav } from '@/app/dashboard/LeftNav'

export function GroupDetailPageShell({ children }: { children: ReactNode }) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#F0F7FF]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-[#E2E8F0] bg-white/90 backdrop-blur max-[768px]:hidden">
          <LeftNav
            active="groups"
            onTab={(tab) => {
              router.push(tab === 'matches' ? '/dashboard' : `/dashboard?tab=${tab}`)
            }}
            isAdmin={false}
          />
        </aside>

        <main className="min-w-0 flex-1 px-8 py-8 max-[768px]:px-0 max-[768px]:py-0">
          <div className="max-w-7xl max-[768px]:max-w-none">{children}</div>
        </main>
      </div>
    </div>
  )
}
