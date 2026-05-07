'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { saveToInviteCircle, type InviteCircleSource } from '@/lib/api/play-network'

type SavedPlayerButtonProps = {
  targetUserId: string
  source: InviteCircleSource
  currentUserId?: string | null
  initialSaved?: boolean
  onChange?: (targetUserId: string, saved: boolean) => void
  saveLabel?: string
  savedLabel?: string
  removeLabel?: string
  compact?: boolean
}

export function SavedPlayerButton({
  targetUserId,
  source,
  currentUserId = null,
  initialSaved = false,
  onChange,
  saveLabel = 'Save player',
  compact = false,
}: SavedPlayerButtonProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<string | null>(currentUserId)

  useEffect(() => {
    setSaved(initialSaved)
  }, [initialSaved])

  useEffect(() => {
    if (currentUserId) {
      setResolvedCurrentUserId(currentUserId)
      return
    }

    let cancelled = false
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (cancelled || userError) return
      setResolvedCurrentUserId(data.user?.id ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const handleSave = async () => {
    if (pending || saved) return

    setPending(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      await saveToInviteCircle(supabase, targetUserId, source)
      setSaved(true)
      onChange?.(targetUserId, true)
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setPending(false)
    }
  }

  const className = compact
    ? 'text-body-sub shrink-0 rounded-xl border border-slate-100 px-4 py-2 font-semibold text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50'
    : 'text-body-main shrink-0 rounded-lg bg-blue-50 px-3 py-1.5 text-blue-600 hover:bg-blue-100 disabled:opacity-50'

  if (resolvedCurrentUserId && targetUserId === resolvedCurrentUserId) {
    return null
  }

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
        <span className="text-body-sub text-red-600">
          {error}
        </span>
      )}
    </div>
  )
}
