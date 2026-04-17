'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { VenueIdentity, Venue } from '@/lib/types/database'
import { SHARED_GROUP_JOIN_PREFERENCE_OPTIONS } from '@/lib/profile-options'

interface Props {
  showTitle?: boolean
  showInVenueMemberDiscovery: boolean
  allowNonGroupInvites: boolean
  sharedGroupJoinPreference: 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
  identities: (VenueIdentity & { venue: Venue })[]
  onSaveGlobal: (params: {
    show_in_venue_member_discovery?: boolean
    allow_non_group_invites?: boolean
    shared_group_join_preference?: 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
  }) => Promise<void>
  onSetVenuePreferences: (venueId: string, params: {
    visible_in_venue_member_discovery?: 'true' | 'false' | 'inherit'
    accept_non_group_invites_in_venue?: 'true' | 'false' | 'inherit'
  }) => Promise<void>
}

export function DiscoveryAndInvitesSection({
  showTitle = true,
  showInVenueMemberDiscovery,
  allowNonGroupInvites,
  sharedGroupJoinPreference,
  identities,
  onSaveGlobal,
  onSetVenuePreferences,
}: Props) {
  const router = useRouter()
  const [showInDiscovery, setShowInDiscovery] = useState(showInVenueMemberDiscovery)
  const [allowDirectInvites, setAllowDirectInvites] = useState(allowNonGroupInvites)
  const [groupJoinPreference, setGroupJoinPreference] = useState(sharedGroupJoinPreference)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [venuePending, setVenuePending] = useState<string | null>(null)
  const [globalSaveState, setGlobalSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const mountedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSnapshotRef = useRef('')

  const getErrorMessage = (err: unknown): string => {
    let msg: string | undefined
    if (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
      msg = (err as { message: string }).message
    } else if (err instanceof Error) {
      msg = err.message
    }
    if (msg && typeof msg === 'string' && !msg.startsWith('{')) return msg
    return 'Failed to update preference'
  }

  useEffect(() => {
    setShowInDiscovery(showInVenueMemberDiscovery)
    setAllowDirectInvites(allowNonGroupInvites)
    setGroupJoinPreference(sharedGroupJoinPreference)
    lastSavedSnapshotRef.current = JSON.stringify({
      show_in_venue_member_discovery: showInVenueMemberDiscovery,
      allow_non_group_invites: allowNonGroupInvites,
      shared_group_join_preference: sharedGroupJoinPreference,
    })
    setGlobalSaveState('idle')
  }, [allowNonGroupInvites, sharedGroupJoinPreference, showInVenueMemberDiscovery])

  const effectiveAllowDirectInvites = showInDiscovery ? allowDirectInvites : false

  const currentSnapshot = JSON.stringify({
    show_in_venue_member_discovery: showInDiscovery,
    allow_non_group_invites: effectiveAllowDirectInvites,
    shared_group_join_preference: groupJoinPreference,
  })

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setError(null)
    setGlobalSaveState('saving')

    saveTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          await onSaveGlobal({
            show_in_venue_member_discovery: showInDiscovery,
            allow_non_group_invites: effectiveAllowDirectInvites,
            shared_group_join_preference: groupJoinPreference,
          })
          lastSavedSnapshotRef.current = currentSnapshot
          router.refresh()
          setGlobalSaveState('saved')
          setTimeout(() => {
            setGlobalSaveState(prev => (prev === 'saved' ? 'idle' : prev))
          }, 1200)
        } catch (err: unknown) {
          setError(getErrorMessage(err))
          setGlobalSaveState('error')
        }
      })
    }, 400)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [currentSnapshot, effectiveAllowDirectInvites, groupJoinPreference, onSaveGlobal, router, showInDiscovery, startTransition])

  const handleSetVisible = (venueId: string, value: 'true' | 'false') => {
    setVenuePending(venueId)
    setError(null)
    onSetVenuePreferences(venueId, { visible_in_venue_member_discovery: value })
      .then(() => router.refresh())
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setVenuePending(null))
  }

  const handleSetAccept = (venueId: string, value: 'true' | 'false') => {
    setVenuePending(venueId)
    setError(null)
    onSetVenuePreferences(venueId, { accept_non_group_invites_in_venue: value })
      .then(() => router.refresh())
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setVenuePending(null))
  }

  const getVisibleValue = (identity: VenueIdentity) => {
    const v = identity.visible_in_venue_member_discovery
    if (v === true) return true
    if (v === false) return false
    return showInDiscovery
  }

  const getAcceptValue = (identity: VenueIdentity) => {
    const a = identity.accept_non_group_invites_in_venue
    if (!effectiveAllowDirectInvites) return false
    if (a === true) return true
    if (a === false) return false
    return allowDirectInvites
  }

  const statusLabel =
    globalSaveState === 'saving' || isPending
      ? 'Saving changes...'
      : globalSaveState === 'saved'
        ? 'Saved'
        : globalSaveState === 'error'
          ? 'Could not save'
          : 'Auto-save on'

  return (
    <div>
      {showTitle && <h2 style={{ marginTop: 0 }}>Discovery & Invites</h2>}

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInDiscovery}
            onChange={e => setShowInDiscovery(e.target.checked)}
            style={{ marginTop: '0.2rem' }}
          />
          <div>
            <strong>Show me in Venue Members</strong>
          </div>
        </label>
        {!showInDiscovery && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn this on to set venues.
          </p>
        )}
        {identities.length > 0 && (
          <div style={{ marginTop: '0.75rem', marginLeft: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {identities.map(identity => (
              <label
                key={identity.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: showInDiscovery ? 'pointer' : 'default',
                  opacity: showInDiscovery ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={getVisibleValue(identity)}
                  onChange={e => handleSetVisible(identity.venue_id, e.target.checked ? 'true' : 'false')}
                  disabled={!showInDiscovery || venuePending === identity.venue_id}
                  style={{ margin: 0 }}
                />
                <span style={{ fontSize: '0.9rem' }}>{identity.venue.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            cursor: showInDiscovery ? 'pointer' : 'default',
            opacity: showInDiscovery ? 1 : 0.6,
          }}
        >
          <input
            type="checkbox"
            checked={effectiveAllowDirectInvites}
            onChange={e => setAllowDirectInvites(e.target.checked)}
            disabled={!showInDiscovery}
            style={{ marginTop: '0.2rem' }}
          />
          <div>
            <strong>Allow direct invites from venue members</strong>
          </div>
        </label>
        {!showInDiscovery && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn on Venue Members first.
          </p>
        )}
        {showInDiscovery && !allowDirectInvites && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn this on to set venues.
          </p>
        )}
        {identities.length > 0 && (
          <div style={{ marginTop: '0.75rem', marginLeft: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {identities.map(identity => (
              <label
                key={identity.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: effectiveAllowDirectInvites ? 'pointer' : 'default',
                  opacity: effectiveAllowDirectInvites ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={getAcceptValue(identity)}
                  onChange={e => handleSetAccept(identity.venue_id, e.target.checked ? 'true' : 'false')}
                  disabled={!effectiveAllowDirectInvites || venuePending === identity.venue_id}
                  style={{ margin: 0 }}
                />
                <span style={{ fontSize: '0.9rem' }}>{identity.venue.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block' }}>
          <strong>Shared Group join preference</strong>
        </label>
        <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {SHARED_GROUP_JOIN_PREFERENCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              style={{
                display: 'flex',
                gap: '0.65rem',
                alignItems: 'flex-start',
                border: groupJoinPreference === option.value ? '1px solid #1f2937' : '1px solid #e5e7eb',
                background: groupJoinPreference === option.value ? '#f8fafc' : '#fff',
                borderRadius: '14px',
                padding: '0.75rem 0.85rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="shared_group_join_preference"
                value={option.value}
                checked={groupJoinPreference === option.value}
                onChange={() => setGroupJoinPreference(option.value)}
                style={{ marginTop: '0.2rem' }}
              />
              <span style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#111827' }}>
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'red', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{error}</p>}
      <p style={{ color: globalSaveState === 'error' ? '#e11d48' : '#94a3b8', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
        {statusLabel}
      </p>
    </div>
  )
}
