'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DiscoveryVolume } from '@/lib/types/database'
import type { DashboardPreferenceSaveResult } from '@/app/dashboard/dashboard.actions'

const DISCOVERY_VOLUME_OPTIONS: Array<{
  value: DiscoveryVolume
  label: string
  description: string
}> = [
  {
    value: 'quiet',
    label: 'Quiet',
    description:
      'Do not actively recommend me. Only players who already share a clear playing context with me can see my basic profile.',
  },
  {
    value: 'playerhood',
    label: 'My PlayerHood',
    description:
      'Help me grow my playing circle through real playing connections. PlayerHoods will not show who suggested whom or reveal mutual players.',
  },
  {
    value: 'recommended',
    label: 'Recommended',
    description:
      'PlayerHoods can recommend me to suitable players based on sport, level, area, and playing preferences. Recommended does not mean public.',
  },
]

interface Props {
  showTitle?: boolean
  discoveryVolume: DiscoveryVolume
  acceptingNewInvites: boolean
  onSaveGlobal: (params: {
    discovery_volume?: DiscoveryVolume
    accepting_new_invites?: boolean
  }) => Promise<DashboardPreferenceSaveResult>
}

export function DiscoveryAndInvitesSection({
  showTitle = true,
  discoveryVolume,
  acceptingNewInvites,
  onSaveGlobal,
}: Props) {
  const router = useRouter()
  const [volume, setVolume] = useState<DiscoveryVolume>(discoveryVolume)
  const [acceptInvites, setAcceptInvites] = useState(acceptingNewInvites)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const mountedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSnapshotRef = useRef('')

  const getErrorMessage = (err: unknown): string => {
    const message =
      err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : err instanceof Error
          ? err.message
          : null
    return message && !message.startsWith('{') ? message : 'Failed to update discovery settings.'
  }

  useEffect(() => {
    setVolume(discoveryVolume)
    setAcceptInvites(acceptingNewInvites)
    lastSavedSnapshotRef.current = JSON.stringify({
      discovery_volume: discoveryVolume,
      accepting_new_invites: acceptingNewInvites,
    })
    setSaveState('idle')
  }, [acceptingNewInvites, discoveryVolume])

  const currentSnapshot = JSON.stringify({
    discovery_volume: volume,
    accepting_new_invites: acceptInvites,
  })

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    if (currentSnapshot === lastSavedSnapshotRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    setError(null)
    setSaveState('saving')

    saveTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const result = await onSaveGlobal({
            discovery_volume: volume,
            accepting_new_invites: acceptInvites,
          })
          if (!result.ok) {
            setError(result.error)
            setSaveState('error')
            return
          }
          lastSavedSnapshotRef.current = currentSnapshot
          router.refresh()
          setSaveState('saved')
          window.setTimeout(() => {
            setSaveState((previous) => (previous === 'saved' ? 'idle' : previous))
          }, 1200)
        } catch (saveError) {
          setError(getErrorMessage(saveError))
          setSaveState('error')
        }
      })
    }, 350)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [acceptInvites, currentSnapshot, onSaveGlobal, router, startTransition, volume])

  return (
    <div className="space-y-5">
      {showTitle ? <h2 className="text-h2 text-[#1E293B]">Privacy &amp; Discovery</h2> : null}

      <section className="space-y-4 px-1">
        <div className="space-y-1">
          <h3 className="text-h2 text-[#1E293B]">Player Discovery Volume</h3>
          <p className="text-body-sub text-[#64748B]">
            Control how widely suitable players can discover your basic player profile and invite you to play.
          </p>
        </div>

        <div className="space-y-3">
          {DISCOVERY_VOLUME_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-4 transition hover:border-[#CBD5E1]"
            >
              <input
                type="radio"
                name="discovery_volume"
                value={option.value}
                checked={volume === option.value}
                onChange={() => setVolume(option.value)}
                disabled={isPending}
                className="mt-1 h-4 w-4 border-slate-300"
              />
              <span>
                <span className="block text-body-main font-semibold text-[#1E293B]">{option.label}</span>
                <span className="mt-1 block text-body-sub text-[#64748B]">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 px-1">
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-4">
          <span className="min-w-0 flex-1">
            <span className="block text-body-main font-semibold text-[#1E293B]">Accept New Invites</span>
            <span className="mt-1 block text-body-sub text-[#64748B]">
              {acceptInvites
                ? 'Players within your discovery volume can invite you to play. You always choose whether to join.'
                : 'You will not receive new play invites or be recommended to new players. Your existing matches, groups, and activities are not affected.'}
            </span>
          </span>
          <input
            type="checkbox"
            checked={acceptInvites}
            onChange={(event) => setAcceptInvites(event.target.checked)}
            disabled={isPending}
            className="mt-1 h-5 w-5 rounded border-slate-300"
          />
        </label>
      </section>

      <p className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-body-sub text-[#64748B]">
        Your phone, email, and private contact details are never shown to other players. People who know your exact
        email or phone, or search your name in a shared club or venue, may be able to request to add you to their
        PlayerHood.
      </p>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
