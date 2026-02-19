'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ClubAdminWithDetails, AdminUserSearchResult } from '@/lib/types/database'

interface Props {
  admins: ClubAdminWithDetails[]
  onSearch: (query: string) => Promise<AdminUserSearchResult[]>
  onGrant: (userId: string) => Promise<void>
  onRevoke: (userId: string) => Promise<void>
}

export function ClubAdminsDrawer({ admins, onSearch, onGrant, onRevoke }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminUserSearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

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
        router.refresh()
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
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to revoke admin')
      }
    })
  }

  return (
    <>
      {/* Current admins list */}
      {admins.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          No admins assigned.
        </p>
      ) : (
        <div style={{ marginBottom: '0.75rem' }}>
          {admins.map(a => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.45rem 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <span style={{ flex: 1 }}>
                <strong style={{ fontSize: '0.9rem' }}>
                  {a.profile?.display_name || a.user_id.slice(0, 8)}
                </strong>
                <span style={{ color: '#aaa', fontSize: '0.78rem', marginLeft: '0.5rem' }}>
                  since {new Date(a.granted_at).toLocaleDateString()}
                </span>
              </span>
              <button
                onClick={() => handleRevoke(a.user_id)}
                disabled={isPending}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.2rem 0.5rem',
                  color: '#c0392b',
                  border: '1px solid #f5c6c6',
                  background: 'none',
                  cursor: 'pointer',
                  borderRadius: '3px',
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '0.35rem 0.85rem',
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        + Add Admin
      </button>

      {/* Drawer */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
          {/* Backdrop */}
          <div
            onClick={() => !isPending && setOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }}
          />
          {/* Panel */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '380px',
              maxWidth: '90vw',
              background: '#fff',
              overflow: 'auto',
              padding: '1.5rem',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.12)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Add Admin</h3>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: '#888',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSearch}
              style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}
            >
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                style={{ flex: 1, padding: '0.4rem' }}
              />
              <button
                type="submit"
                disabled={isPending}
                style={{
                  padding: '0.4rem 0.8rem',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {isPending ? '…' : 'Search'}
              </button>
            </form>

            {error && (
              <p style={{ color: 'red', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>{error}</p>
            )}

            {results.length > 0 && (
              <div>
                {results.map(r => (
                  <div
                    key={r.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.45rem 0',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.9rem' }}>{r.display_name}</strong>
                      <span style={{ color: '#999', fontSize: '0.8rem', marginLeft: '0.4rem' }}>
                        {r.email}
                      </span>
                    </span>
                    {adminUserIds.has(r.user_id) ? (
                      <span style={{ fontSize: '0.78rem', color: '#aaa' }}>already admin</span>
                    ) : (
                      <button
                        onClick={() => handleGrant(r.user_id)}
                        disabled={isPending}
                        style={{
                          fontSize: '0.78rem',
                          padding: '0.2rem 0.6rem',
                          background: '#111',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                      >
                        Grant
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {results.length === 0 && query && !isPending && (
              <p style={{ color: '#aaa', fontSize: '0.85rem' }}>No users found.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
