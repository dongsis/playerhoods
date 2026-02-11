'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createGroupAction } from './actions'

export default function NewGroupPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const group = await createGroupAction({ name, description })
      console.log('[NewGroupPage] Created group:', JSON.stringify(group))
      const url = `/groups/${group.id}`
      console.log('[NewGroupPage] Redirecting to:', url)
      router.push(url)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Failed to create group'
      setError(message)
      console.error('Create group error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1>Create New Group</h1>

      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/groups">Back to Groups</Link>
      </nav>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Group Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="description" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </div>

        {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ padding: '0.75rem 1.5rem' }}>
          {loading ? 'Creating...' : 'Create Group'}
        </button>
      </form>
    </div>
  )
}
