'use client'

import { useState } from 'react'
import type { MatchListItem } from '@/lib/api/matches'
import { ParticipantQuickPreview, type ParticipantQuickPreviewTarget } from './ParticipantQuickPreview'

interface Props {
  target: ParticipantQuickPreviewTarget
  items?: MatchListItem[]
  children: React.ReactNode
  className?: string
  title?: string
}

export function ParticipantQuickPreviewTrigger({
  target,
  items,
  children,
  className = '',
  title,
}: Props) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)

  if (!target.userId && !target.guestId) {
    return <>{children}</>
  }

  return (
    <>
      <span
        className={`inline-flex max-w-full ${className}`.trim()}
        onContextMenuCapture={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setAnchor({ x: event.clientX, y: event.clientY })
        }}
        onMouseDownCapture={(event) => {
          if (event.button !== 2) return
          event.preventDefault()
          event.stopPropagation()
        }}
        onMouseUpCapture={(event) => {
          if (event.button !== 2) return
          event.preventDefault()
          event.stopPropagation()
        }}
        onAuxClickCapture={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        title={title ?? `Right-click to preview ${target.displayName}`}
      >
        {children}
      </span>
      <ParticipantQuickPreview
        open={Boolean(anchor)}
        anchor={anchor}
        target={target}
        items={items}
        onClose={() => setAnchor(null)}
      />
    </>
  )
}
