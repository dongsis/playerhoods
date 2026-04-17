'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { saveContactPlayer, type ContactPlayerSaveSource } from '@/lib/api/play-network'

type SaveContactPlayerButtonProps = {
  guestId: string
  source: ContactPlayerSaveSource
  groupId?: string | null
  matchId?: string | null
  compact?: boolean
  saveLabel?: string
}

export function SaveContactPlayerButton({
  guestId,
  source,
  groupId = null,
  matchId = null,
  compact = false,
  saveLabel = 'Save',
}: SaveContactPlayerButtonProps) {
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (pending || saved) return

    setPending(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      await saveContactPlayer(supabase, guestId, {
        source,
        groupId,
        matchId,
      })
      setSaved(true)
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setPending(false)
    }
  }

  const className = compact
    ? 'shrink-0 rounded-xl border border-[#5ca0a0]/20 px-4 py-2 text-[11px] font-bold text-[#5ca0a0] transition-all hover:bg-[#5ca0a0]/5 disabled:opacity-50'
    : 'shrink-0 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50'

  if (saved && !error) {
    return null
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSave}
        disabled={pending || saved}
        className={className}
      >
        {pending ? 'Saving...' : saveLabel}
      </button>
      {error && (
        <span className="text-[11px] text-red-600">
          {error}
        </span>
      )}
    </div>
  )
}
