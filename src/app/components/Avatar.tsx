'use client'

interface Props {
  src: string | null | undefined
  displayName: string
  size?: 'sm' | 'md'
  className?: string
}

const sizes = { sm: 'w-6 h-6 text-xs', md: 'w-8 h-8 text-sm' }

export function Avatar({ src, displayName, size = 'sm', className = '' }: Props) {
  const s = sizes[size]
  const initial = displayName?.charAt(0)?.toUpperCase() || '?'

  return (
    <div
      className={`shrink-0 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center ${s} ${className}`}
      title={displayName}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-gray-500 font-medium">{initial}</span>
      )}
    </div>
  )
}
