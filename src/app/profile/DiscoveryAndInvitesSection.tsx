'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ClubIdentity, Club } from '@/lib/types/database'

interface Props {
  showInClubMemberDiscovery: boolean
  allowNonGroupInvites: boolean
  identities: (ClubIdentity & { club: Club })[]
  onSaveGlobal: (params: {
    show_in_club_member_discovery?: boolean
    allow_non_group_invites?: boolean
  }) => Promise<void>
  onSetClubPreferences: (clubId: string, params: {
    visible_in_club_member_discovery?: 'true' | 'false' | 'inherit'
    accept_non_group_invites_in_club?: 'true' | 'false' | 'inherit'
  }) => Promise<void>
}

export function DiscoveryAndInvitesSection({
  showInClubMemberDiscovery,
  allowNonGroupInvites,
  identities,
  onSaveGlobal,
  onSetClubPreferences,
}: Props) {
  const router = useRouter()
  const [showInDiscovery, setShowInDiscovery] = useState(showInClubMemberDiscovery)
  const [allowDirectInvites, setAllowDirectInvites] = useState(allowNonGroupInvites)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clubPending, setClubPending] = useState<string | null>(null)

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

  const handleSaveGlobal = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await onSaveGlobal({
          show_in_club_member_discovery: showInDiscovery,
          allow_non_group_invites: allowDirectInvites,
        })
        router.refresh()
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      }
    })
  }

  const handleSetVisible = (clubId: string, value: 'true' | 'false') => {
    setClubPending(clubId)
    setError(null)
    onSetClubPreferences(clubId, { visible_in_club_member_discovery: value })
      .then(() => router.refresh())
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setClubPending(null))
  }

  const handleSetAccept = (clubId: string, value: 'true' | 'false') => {
    setClubPending(clubId)
    setError(null)
    onSetClubPreferences(clubId, { accept_non_group_invites_in_club: value })
      .then(() => router.refresh())
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setClubPending(null))
  }

  const getVisibleValue = (identity: ClubIdentity) => {
    const v = identity.visible_in_club_member_discovery
    if (v === true) return true
    if (v === false) return false
    return showInDiscovery
  }

  const getAcceptValue = (identity: ClubIdentity) => {
    const a = identity.accept_non_group_invites_in_club
    if (a === true) return true
    if (a === false) return false
    return allowDirectInvites
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Discovery & Invites</h2>

      {/* Capability 1: Show me in Club Members */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInDiscovery}
            onChange={e => setShowInDiscovery(e.target.checked)}
            style={{ marginTop: '0.2rem' }}
          />
          <div>
            <strong>Show me in Club Members</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#666' }}>
              Controls whether you appear in Club Members discovery.
            </p>
          </div>
        </label>
        {!showInDiscovery && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn on the global setting above to configure clubs individually.
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
                  onChange={e => handleSetVisible(identity.club_id, e.target.checked ? 'true' : 'false')}
                  disabled={!showInDiscovery || clubPending === identity.club_id}
                  style={{ margin: 0 }}
                />
                <span style={{ fontSize: '0.9rem' }}>{identity.club.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Capability 2: Allow direct invites */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allowDirectInvites}
            onChange={e => setAllowDirectInvites(e.target.checked)}
            style={{ marginTop: '0.2rem' }}
          />
          <div>
            <strong>Allow direct invites from club members</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#666' }}>
              Controls whether club members outside your existing groups can invite you.
            </p>
          </div>
        </label>
        {!allowDirectInvites && identities.length > 0 && (
          <p style={{ margin: '0.5rem 0 0 1.75rem', fontSize: '0.82rem', color: '#888' }}>
            Turn on the global setting above to configure clubs individually.
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
                  cursor: allowDirectInvites ? 'pointer' : 'default',
                  opacity: allowDirectInvites ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={getAcceptValue(identity)}
                  onChange={e => handleSetAccept(identity.club_id, e.target.checked ? 'true' : 'false')}
                  disabled={!allowDirectInvites || clubPending === identity.club_id}
                  style={{ margin: 0 }}
                />
                <span style={{ fontSize: '0.9rem' }}>{identity.club.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ color: 'red', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{error}</p>}
      {saved && <p style={{ color: 'green', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>Saved.</p>}

      <button
        type="button"
        onClick={handleSaveGlobal}
        disabled={isPending}
        style={{
          marginTop: '0.25rem',
          padding: '0.4rem 0.9rem',
          background: '#333',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
