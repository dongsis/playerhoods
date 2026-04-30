'use client'

import { useRouter } from 'next/navigation'
import type { PendingGroupInvite, GroupWithMembers } from '@/lib/api/players'
import type { Sport } from '@/lib/types/database'
import { LeftNav } from '@/app/dashboard/LeftNav'
import { GroupsPanel } from '@/app/dashboard/GroupsPanel'

type Props = {
  groups: GroupWithMembers[]
  pendingInvites: PendingGroupInvite[]
  sports: Sport[]
}

export function GroupsPageShell({ groups, pendingInvites, sports }: Props) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#F0F7FF]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-[#E2E8F0] bg-white/90 backdrop-blur">
          <LeftNav
            active="groups"
            onTab={(tab) => {
              router.push(tab === 'matches' ? '/dashboard' : `/dashboard?tab=${tab}`)
            }}
            isAdmin={false}
          />
        </aside>

        <main className="min-w-0 flex-1 px-8 py-8">
          <div className="max-w-6xl">
            <GroupsPanel
              groups={groups}
              pendingInvites={pendingInvites}
              sports={sports}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
