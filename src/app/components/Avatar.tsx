'use client'

import { ContactPlayerMark } from './ContactPlayerMark'

interface Props {
  src: string | null | undefined
  displayName: string
  size?: 'sm' | 'md'
  className?: string
  fallback?: 'initial' | 'contact'
}

const sizes = { sm: 'w-6 h-6 text-xs', md: 'w-8 h-8 text-sm' }

export function Avatar({
  src,
  displayName,
  size = 'sm',
  className = '',
  fallback = 'initial',
}: Props) {
  const s = sizes[size]
  const initial = displayName?.charAt(0)?.toUpperCase() || '?'
  const showContactMark = fallback === 'contact'
  const baseClassName = fallback === 'contact' && !src
    ? 'bg-transparent'
    : 'bg-[#1E3A5F]'

  return (
    <div
      className={`shrink-0 rounded-full overflow-hidden flex items-center justify-center ${baseClassName} ${s} ${className}`}
      title={displayName}
    >
      {showContactMark ? (
        <ContactPlayerMark className="h-full w-full" variant="avatar" />
      ) : src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-medium text-white">{initial}</span>
      )}
    </div>
  )
}
