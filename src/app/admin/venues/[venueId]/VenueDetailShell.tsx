'use client'

import { useState } from 'react'
import type { Venue, Court, Sport, VenueAdminWithDetails, AdminUserSearchResult } from '@/lib/types/database'
import { VenueOverviewForm } from './VenueOverviewForm'
import { CourtsManager } from './CourtsManager'
import { VenueAdminsDrawer } from './VenueAdminsDrawer'

type Tab = 'overview' | 'courts' | 'admins'

interface Props {
  venue: Venue
  courts: Court[]
  sports: Sport[]
  admins: VenueAdminWithDetails[]
  isSuperAdmin: boolean
  onUpdateVenue: (formData: FormData) => Promise<void>
  onCreateCourt: (formData: FormData) => Promise<void>
  onUpdateCourt: (courtId: string, formData: FormData) => Promise<void>
  onDeleteCourt: (courtId: string) => Promise<void>
  onSearchUsers: (query: string) => Promise<AdminUserSearchResult[]>
  onGrantAdmin: (userId: string) => Promise<void>
  onRevokeAdmin: (userId: string) => Promise<void>
}

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'courts', label: 'Courts' },
  { key: 'admins', label: 'Admins' },
]

export function VenueDetailShell({
  venue,
  courts,
  sports,
  admins,
  isSuperAdmin,
  onUpdateVenue,
  onCreateCourt,
  onUpdateCourt,
  onDeleteCourt,
  onSearchUsers,
  onGrantAdmin,
  onRevokeAdmin,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')

  const tabs = TAB_LABELS.filter(t => t.key !== 'admins' || isSuperAdmin)

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '2px solid #e0e0e0',
          marginBottom: '1.5rem',
        }}
      >
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.55rem 1.1rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#111' : '#888',
              borderBottom: tab === t.key ? '2px solid #111' : '2px solid transparent',
              marginBottom: '-2px',
              transition: 'color 0.1s',
            }}
          >
            {t.label}
            {t.key === 'courts' && (
              <span
                style={{
                  marginLeft: '0.35rem',
                  fontSize: '0.75rem',
                  color: tab === 'courts' ? '#555' : '#bbb',
                }}
              >
                ({courts.length})
              </span>
            )}
            {t.key === 'admins' && (
              <span
                style={{
                  marginLeft: '0.35rem',
                  fontSize: '0.75rem',
                  color: tab === 'admins' ? '#555' : '#bbb',
                }}
              >
                ({admins.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <section>
          <VenueOverviewForm venue={venue} onSubmit={onUpdateVenue} />
        </section>
      )}

      {tab === 'courts' && (
        <section>
          <CourtsManager
            courts={courts}
            sports={sports}
            onCreateCourt={onCreateCourt}
            onUpdateCourt={onUpdateCourt}
            onDeleteCourt={onDeleteCourt}
          />
        </section>
      )}

      {tab === 'admins' && isSuperAdmin && (
        <section>
          <VenueAdminsDrawer
            admins={admins}
            onSearch={onSearchUsers}
            onGrant={onGrantAdmin}
            onRevoke={onRevokeAdmin}
          />
        </section>
      )}
    </div>
  )
}
