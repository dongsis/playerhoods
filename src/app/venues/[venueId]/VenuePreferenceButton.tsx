'use client'

import { useTransition } from 'react'

interface Props {
  isSaved: boolean
  onToggle: () => Promise<void>
}

export function VenuePreferenceButton({ isSaved, onToggle }: Props) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => onToggle())}
      disabled={isPending}
      className={[
        'px-3 py-1.5 text-sm font-medium rounded-xl border transition-colors',
        isSaved
          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
        isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer',
      ].join(' ')}
    >
      {isPending ? '…' : isSaved ? '★ Saved' : '☆ Save'}
    </button>
  )
}
