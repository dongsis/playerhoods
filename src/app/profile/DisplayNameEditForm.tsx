'use client'

import { useEffect, useState, useTransition } from 'react'

interface Props {
  displayName: string
  onSave: (newName: string) => Promise<void>
}

export function DisplayNameEditForm({ displayName, onSave }: Props) {
  const [value, setValue] = useState(displayName)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setValue(displayName)
  }, [displayName])

  const trimmedValue = value.trim()
  const isDirty = trimmedValue !== displayName.trim()

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!trimmedValue) {
      setError('Display name cannot be empty.')
      return
    }
    if (trimmedValue.length > 50) {
      setError('Display name must be 50 characters or fewer.')
      return
    }

    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await onSave(trimmedValue)
        setSaved(true)
        setTimeout(() => setSaved(false), 1800)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Failed to save display name.')
      }
    })
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <input
            value={value}
            onChange={e => {
              setValue(e.target.value)
              setError(null)
              setSaved(false)
            }}
            maxLength={50}
            placeholder="Your display name"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !isDirty || !trimmedValue}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className={error ? 'text-rose-500' : saved ? 'text-emerald-600' : 'text-slate-400'}>
          {error ?? (saved ? 'Saved' : 'Shown to other players.')}
        </span>
        <span className="text-slate-400">{trimmedValue.length}/50</span>
      </div>
    </form>
  )
}
