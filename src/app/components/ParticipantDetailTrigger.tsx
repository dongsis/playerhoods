'use client'

import { useState } from 'react'
import type { MatchListItem, MatchParticipantEnriched } from '@/lib/api/matches'
import { ContactParticipantDrawer } from './ContactParticipantDrawer'
import { PlayerProfileDrawer } from './PlayerProfileDrawer'

type ParticipantTarget = Pick<
  MatchParticipantEnriched,
  'user_id' | 'guest_id' | 'display_name' | 'avatar_url' | 'gender' | 'saved_by_viewer' | 'shares_group_with_viewer'
>

interface Props {
  participant: ParticipantTarget
  items?: MatchListItem[]
  children?: React.ReactNode
  className?: string
  label?: string
}

export function ParticipantDetailTrigger({
  participant,
  items,
  children,
  className = '',
  label,
}: Props) {
  const [open, setOpen] = useState(false)
  const buttonClassName = children
    ? `bg-transparent border-0 p-0 cursor-pointer ${className}`.trim()
    : className || 'text-body-sub inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700'
  const buttonLabel = label ?? `View details for ${participant.display_name}`
  const hasDrawerTarget = Boolean(participant.user_id || participant.guest_id)

  if (!hasDrawerTarget) {
    return children ? <>{children}</> : null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        {children ?? 'i'}
      </button>
      {participant.user_id ? (
        <PlayerProfileDrawer
          open={open}
          targetUserId={participant.user_id}
          onClose={() => setOpen(false)}
        />
      ) : participant.guest_id ? (
        <ContactParticipantDrawer
          open={open}
          target={{
            guestId: participant.guest_id,
            displayName: participant.display_name,
            avatarUrl: participant.avatar_url ?? null,
            gender: participant.gender,
            savedByViewer: participant.saved_by_viewer,
            sharesGroupWithViewer: participant.shares_group_with_viewer,
          }}
          items={items}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
