'use client'

import { useState, useTransition } from 'react'
import type { ClubAdminWithDetails, AdminUserSearchResult } from '@/lib/types/database'

interface Props {
  admins: ClubAdminWithDetails[]
  onSearch: (query: string) => Promise<AdminUserSearchResult[]>
  onGrant: (userId: string) => Promise<void>
  onRevoke: (userId: string) => Promise<void>
}

export function AdminManager({ admins, onSearch, onGrant, onRevoke }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminUserSearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const adminUserIds = new Set(admins.map(a => a.user_id))

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        const r = await onSearch(query.trim())
        setResults(r)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Search failed')
      }
    })
  }

  const handleGrant = (userId: string) => {
    setError(null)
    startTransition(async () => {
      try {
        await onGrant(userId)
        setResults([])
        setQuery('')
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to grant admin')
      }
    })
  }

  const handleRevoke = (userId: string) => {
    setError(null)
    startTransition(async () => {
      try {
        await onRevoke(userId)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to revoke admin')
      }
    })
  }

  return (
    <div>
      {/* Current admins */}
      {admins.length === 0 ? (
        <p style={{ color: '#888' }}>No admins assigned.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1rem' }}>
          {admins.map(a => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid #eee' }}>
              <span style={{ flex: 1 }}>
                <strong>{a.profile?.display_name || a.user_id.slice(0, 8)}</strong>
                <span style={{ color: '#888', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                  since {new Date(a.granted_at).toLocaleDateString()}
                </span>
              </span>
              <button
                onClick={() => handleRevoke(a.user_id)}
                disabled={isPending}
                style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', color: 'red' }}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Grant admin: user search */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or email..."
          style={{ padding: '0.4rem', width: '240px' }}
        />
        <button type="submit" disabled={isPending} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          {isPending ? '...' : 'Search'}
        </button>
      </form>

      {error && <p style={{ color: 'red', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{error}</p>}

      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.75rem' }}>
          {results.map(r => (
            <li key={r.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.35rem 0', borderBottom: '1px solid #eee' }}>
              <span style={{ flex: 1 }}>
                <strong>{r.display_name}</strong>
                <span style={{ color: '#888', fontSize: '0.85rem', marginLeft: '0.5rem' }}>{r.email}</span>
              </span>
              {adminUserIds.has(r.user_id) ? (
                <span style={{ fontSize: '0.8rem', color: '#aaa' }}>already admin</span>
              ) : (
                <button
                  onClick={() => handleGrant(r.user_id)}
                  disabled={isPending}
                  style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                  Grant Admin
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {results.length === 0 && query && !isPending && (
        <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem' }}>No users found.</p>
      )}
    </div>
  )
}
