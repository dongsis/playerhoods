'use client'

import { useState } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import { CreateMatchInline } from './CreateMatchInline'
import { MatchesShell } from './MatchesShell'

interface Props {
  items: MatchListItem[]
  userId: string
  defaultVenueId: string
}

export function MatchesPageClient({ items, userId, defaultVenueId }: Props) {
  const [createMatchOpen, setCreateMatchOpen] = useState(false)

  return (
    <div className="space-y-8">
      <MatchesShell items={items} userId={userId} hideStatusTabs={createMatchOpen} />
      <div id="create-match">
        <CreateMatchInline
          defaultVenueId={defaultVenueId}
          onExpandedChange={setCreateMatchOpen}
        />
      </div>
    </div>
  )
}
