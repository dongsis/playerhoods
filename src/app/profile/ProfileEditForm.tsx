'use client'

import { useState, useTransition } from 'react'

interface Props {
  firstName: string | null
  lastName: string | null
  onSubmit: (formData: FormData) => Promise<void>
}

export function ProfileEditForm({ firstName, lastName, onSubmit }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await onSubmit(formData)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2000)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to update profile')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
      {error && <p style={{ width: '100%', color: 'red', margin: 0 }}>{error}</p>}
      {success && <p style={{ width: '100%', color: 'green', margin: 0 }}>Saved.</p>}
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>First Name</label>
        <input name="first_name" defaultValue={firstName ?? ''} style={{ padding: '0.4rem', width: '160px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.2rem' }}>Last Name</label>
        <input name="last_name" defaultValue={lastName ?? ''} style={{ padding: '0.4rem', width: '160px' }} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        style={{ padding: '0.4rem 1rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
