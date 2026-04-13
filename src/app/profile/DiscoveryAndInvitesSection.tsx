'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { VenueIdentity, Venue } from '@/lib/types/database'

interface Props {
  showTitle?: boolean
  showInVenueMemberDiscovery: boolean
  allowNonGroupInvites: boolean
  identities: (VenueIdentity & { venue: Venue })[]
  onSaveGlobal: (params: {
    show_in_venue_member_discovery?: boolean
    allow_non_group_invites?: boolean
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
  identities,
  onSaveGlobal,
  onSetVenuePreferences,
}: Props) {
  const router = useRouter()
  const [showInDiscovery, setShowInDiscovery] = useState(showInVenueMemberDiscovery)
  const [allowDirectInvites, setAllowDirectInvites] = useState(allowNonGroupInvites)
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
    lastSavedSnapshotRef.current = JSON.stringify({
      show_in_venue_member_discovery: showInVenueMemberDiscovery,
      allow_non_group_invites: allowNonGroupInvites,
    })
    setGlobalSaveState('idle')
  }, [allowNonGroupInvites, showInVenueMemberDiscovery])

  const effectiveAllowDirectInvites = showInDiscovery ? allowDirectInvites : false

  const currentSnapshot = JSON.stringify({
    show_in_venue_member_discovery: showInDiscovery,
    allow_non_group_invites: effectiveAllowDirectInvites,
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
  }, [currentSnapshot, effectiveAllowDirectInvites, onSaveGlobal, router, showInDiscovery, startTransition])

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
          : 'Changes save automatically'

  return (
    <div>
      {showTitle && <h2 style={{ marginTop: 0 }}>Discovery & Invites</h2>}

      {/* Capability 1: Show me in Venue Members */}
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
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#666' }}>
              Show or hide yourself in Venue Members.
            </p>
          </div>
        </label>
        {!showInDiscovery && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn this on first to set venues individually.
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

      {/* Capability 2: Allow direct invites */}
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
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#666' }}>
              Let venue members outside your groups invite you.
            </p>
          </div>
        </label>
        {!showInDiscovery && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn on Venue Members first.
          </p>
        )}
        {showInDiscovery && !allowDirectInvites && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn this on first to set venues individually.
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

      {error && <p style={{ color: 'red', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{error}</p>}
      <p style={{ color: globalSaveState === 'error' ? '#e11d48' : '#94a3b8', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
        {statusLabel}
      </p>
    </div>
  )
}
