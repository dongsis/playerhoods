'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SharedGroupJoinPreference, UserPlayCity, VenueIdentity, Venue } from '@/lib/types/database'
import { getVenueDisplayName } from '@/lib/venues/display'
import { SHARED_GROUP_JOIN_PREFERENCE_OPTIONS } from '@/lib/profile-options'
import type { DashboardPreferenceSaveResult } from '@/app/dashboard/dashboard.actions'

const TRUSTED_INVITATION_REASONS = [
  "Players I've saved",
  'Members from my clubs / venues',
  'Invitations matching my sports and play locations',
] as const

function normalizeGroupJoinPreference(value: SharedGroupJoinPreference): SharedGroupJoinPreference {
  return value === 'auto_join_enabled_sports' ? 'auto_join_saved_players' : value
}

interface Props {
  showTitle?: boolean
  visibleInCityDiscovery: boolean
  searchableByEmailOrPhone: boolean
  sharedGroupJoinPreference: SharedGroupJoinPreference
  playCities: UserPlayCity[]
  identities: (VenueIdentity & { venue: Venue })[]
  onSaveGlobal: (params: {
    visible_in_city_discovery?: boolean
    searchable_by_email_or_phone?: boolean
    shared_group_join_preference?: SharedGroupJoinPreference
  }) => Promise<DashboardPreferenceSaveResult>
  onSetVenueMemberDiscovery: (venueId: string, visibleInVenueMemberDiscovery: boolean) => Promise<DashboardPreferenceSaveResult>
}

export function DiscoveryAndInvitesSection({
  showTitle = true,
  visibleInCityDiscovery,
  searchableByEmailOrPhone,
  sharedGroupJoinPreference,
  playCities,
  identities,
  onSaveGlobal,
  onSetVenueMemberDiscovery,
}: Props) {
  const router = useRouter()
  const [cityDiscovery, setCityDiscovery] = useState(visibleInCityDiscovery)
  const [emailOrPhoneLookup, setEmailOrPhoneLookup] = useState(searchableByEmailOrPhone)
  const [groupJoinPreference, setGroupJoinPreference] = useState<SharedGroupJoinPreference>(
    normalizeGroupJoinPreference(sharedGroupJoinPreference),
  )
  const [venueVisibility, setVenueVisibility] = useState<Record<string, boolean>>({})
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [venuePending, setVenuePending] = useState<string | null>(null)
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
    const normalizedGroupJoinPreference = normalizeGroupJoinPreference(sharedGroupJoinPreference)

    setCityDiscovery(visibleInCityDiscovery)
    setEmailOrPhoneLookup(searchableByEmailOrPhone)
    setGroupJoinPreference(normalizedGroupJoinPreference)

    const nextVisibility = Object.fromEntries(
      identities.map((identity) => [
        identity.venue_id,
        identity.visible_in_venue_member_discovery ?? true,
      ]),
    )
    setVenueVisibility(nextVisibility)

    lastSavedSnapshotRef.current = JSON.stringify({
      visible_in_city_discovery: visibleInCityDiscovery,
      searchable_by_email_or_phone: searchableByEmailOrPhone,
      shared_group_join_preference: normalizedGroupJoinPreference,
    })
    setSaveState('idle')
  }, [identities, searchableByEmailOrPhone, sharedGroupJoinPreference, visibleInCityDiscovery])

  const sortedIdentities = useMemo(
    () =>
      [...identities].sort((left, right) =>
        getVenueDisplayName(left.venue).localeCompare(getVenueDisplayName(right.venue)),
      ),
    [identities],
  )

  const currentSnapshot = JSON.stringify({
    visible_in_city_discovery: cityDiscovery,
    searchable_by_email_or_phone: emailOrPhoneLookup,
    shared_group_join_preference: groupJoinPreference,
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
            visible_in_city_discovery: cityDiscovery,
            searchable_by_email_or_phone: emailOrPhoneLookup,
            shared_group_join_preference: groupJoinPreference,
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
  }, [cityDiscovery, currentSnapshot, emailOrPhoneLookup, groupJoinPreference, onSaveGlobal, router, startTransition])

  const clubDiscoveryEnabled =
    sortedIdentities.length > 0
      ? sortedIdentities.every((identity) => venueVisibility[identity.venue_id] ?? true)
      : false

  const handleSetVisible = (venueId: string, value: boolean) => {
    setVenueVisibility((current) => ({ ...current, [venueId]: value }))
    setVenuePending(venueId)
    setError(null)
    onSetVenueMemberDiscovery(venueId, value)
      .then((result) => {
        if (!result.ok) {
          setVenueVisibility((current) => ({
            ...current,
            [venueId]: !value,
          }))
          setError(result.error)
          return
        }
        router.refresh()
      })
      .catch((venueError) => {
        setVenueVisibility((current) => ({
          ...current,
          [venueId]: !value,
        }))
        setError(getErrorMessage(venueError))
      })
      .finally(() => setVenuePending(null))
  }

  const handleSetAllClubVisibility = (nextValue: boolean) => {
    if (sortedIdentities.length === 0) return
    setError(null)
    setVenueVisibility((current) => {
      const next = { ...current }
      for (const identity of sortedIdentities) {
        next[identity.venue_id] = nextValue
      }
      return next
    })

    startTransition(async () => {
      try {
        const results = await Promise.all(
          sortedIdentities.map((identity) =>
            onSetVenueMemberDiscovery(identity.venue_id, nextValue),
          ),
        )
        const firstError = results.find((result) => !result.ok)
        if (firstError && !firstError.ok) {
          setError(firstError.error)
          router.refresh()
          return
        }
        router.refresh()
      } catch (venueError) {
        setError(getErrorMessage(venueError))
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      {showTitle ? <h2 className="text-h2 text-[#1E293B]">Discovery Settings</h2> : null}

      <section className="space-y-4 px-1">
        <div className="space-y-1">
          <h3 className="text-h2 text-[#1E293B]">Who can find me?</h3>
          <p className="text-body-sub text-[#64748B]">Control who can discover your player profile.</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-4">
          <div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={clubDiscoveryEnabled}
                onChange={(event) => handleSetAllClubVisibility(event.target.checked)}
                disabled={sortedIdentities.length === 0 || isPending}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body-main font-semibold text-[#1E293B]">
                  Let members of my clubs find me
                </span>
                {sortedIdentities.length === 0 ? (
                  <span className="mt-2 inline-block rounded-xl bg-amber-50 px-3 py-2 text-body-sub text-amber-700">
                    Add clubs or venues to control where club discovery is active.
                  </span>
                ) : null}
              </span>
            </label>

            {sortedIdentities.length > 0 ? (
              <div className="mt-3 space-y-2 pl-7">
                {sortedIdentities.map((identity) => (
                  <label
                    key={identity.id}
                    className="flex items-center gap-3 px-3 py-1 transition"
                  >
                    <input
                      type="checkbox"
                      checked={venueVisibility[identity.venue_id] ?? true}
                      onChange={(event) => handleSetVisible(identity.venue_id, event.target.checked)}
                      disabled={venuePending === identity.venue_id || isPending}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm font-medium text-[#334155]">
                      Visible to members of {getVenueDisplayName(identity.venue)}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={cityDiscovery}
              onChange={(event) => setCityDiscovery(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span className="text-body-main font-semibold text-[#1E293B]">
              Let players in my play cities find me
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={emailOrPhoneLookup}
              onChange={(event) => setEmailOrPhoneLookup(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span className="text-body-main font-semibold text-[#1E293B]">
              Let people who know my email or phone find me
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-4 px-1">
        <div className="space-y-1">
          <h3 className="text-h2 text-[#1E293B]">Group Invite Settings</h3>
          <p className="text-body-sub text-[#64748B]">Control which invitations are automatically accepted.</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-4">
          {SHARED_GROUP_JOIN_PREFERENCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-start gap-3"
            >
              <input
                type="radio"
                name="shared_group_join_preference"
                value={option.value}
                checked={groupJoinPreference === option.value}
                onChange={() => setGroupJoinPreference(option.value)}
                className="mt-1 h-4 w-4 border-slate-300"
              />
              <span>
                <span className="block text-body-main font-semibold text-[#1E293B]">{option.label}</span>
                {option.value === 'auto_join_saved_players' ? (
                  <span className="mt-3 block space-y-2 text-body-sub text-[#475569]">
                    <span className="block font-semibold text-[#334155]">Trusted invitations include:</span>
                    {TRUSTED_INVITATION_REASONS.map((reason) => (
                      <span key={reason} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked
                          readOnly
                          aria-label={reason}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>{reason}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </section>

      {error ? (
        <p className="rounded-[20px] border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
