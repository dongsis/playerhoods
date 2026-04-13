'use client'

import { useEffect, useRef, useState } from 'react'
import type { Sport } from '@/lib/types/database'

interface Props {
  sports: Sport[]
  initialSportIds: number[]
  onSave: (codes: string[]) => Promise<void>
}

export function SportsPreferenceForm({ sports, initialSportIds, onSave }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(initialSportIds))
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)
  const lastSavedKeyRef = useRef([...initialSportIds].sort((a, b) => a - b).join(','))

  useEffect(() => {
    const sortedInitial = [...initialSportIds].sort((a, b) => a - b)
    setSelectedIds(new Set(sortedInitial))
    lastSavedKeyRef.current = sortedInitial.join(',')
    setSaveState('idle')
  }, [initialSportIds])

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    const sortedIds = [...selectedIds].sort((a, b) => a - b)
    const nextKey = sortedIds.join(',')
    if (nextKey === lastSavedKeyRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saving')

    saveTimerRef.current = setTimeout(async () => {
      const codes = sports
        .filter(s => selectedIds.has(s.id))
        .map(s => s.code)
      try {
        await onSave(codes)
        lastSavedKeyRef.current = nextKey
        setSaveState('saved')
        setTimeout(() => {
          setSaveState(prev => (prev === 'saved' ? 'idle' : prev))
        }, 1200)
      } catch {
        setSaveState('error')
      }
    }, 400)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [onSave, selectedIds, sports])

  const saveLabel =
    saveState === 'saving'
      ? 'Saving...'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Could not save'
          : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {sports.map(sport => {
          const selected = selectedIds.has(sport.id)
          return (
            <button
              key={sport.id}
              type="button"
              onClick={() => toggle(sport.id)}
              className={`inline-flex items-center rounded-full border px-3.5 py-2 text-sm transition ${
                selected
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
              }`}
              aria-pressed={selected}
            >
              {sport.display_name}
            </button>
          )
        })}
      </div>
      <div className={`text-xs ${saveState === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>
        {saveLabel ?? 'Saved automatically'}
      </div>
    </div>
  )
}
