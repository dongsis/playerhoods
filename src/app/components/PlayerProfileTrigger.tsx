'use client'

import { useState } from 'react'
import { PlayerProfileDrawer } from './PlayerProfileDrawer'

interface Props {
  targetUserId: string
  children?: React.ReactNode
  className?: string
  label?: string
}

export function PlayerProfileTrigger({
  targetUserId,
  children,
  className = '',
  label = 'View profile',
}: Props) {
  const [open, setOpen] = useState(false)
  const buttonClassName = children
    ? `inline-flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer ${className}`.trim()
    : className || 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName}
        aria-label={label}
        title={label}
      >
        {children ?? 'i'}
      </button>
      <PlayerProfileDrawer
        open={open}
        targetUserId={targetUserId}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
