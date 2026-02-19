'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { Profile, ClubIdentity, Club } from '@/lib/types/database'

interface Props {
  profile: Pick<Profile, 'display_name' | 'first_name' | 'last_name' | 'primary_club_id'>
  myIdentities: (ClubIdentity & { club: Club })[]
  joinableCount: number
  onUpdateProfile: (formData: FormData) => Promise<void>
}

export function ProfilePanel({ profile, myIdentities, joinableCount, onUpdateProfile }: Props) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await onUpdateProfile(formData)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to save')
      }
    })
  }

  return (
    <div className="space-y-8 max-w-md">
      {/* Identity */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Display Identity
        </h2>
        <div className="flex items-center gap-3">
          <span className="inline-block px-4 py-2 bg-gray-900 text-white rounded-2xl text-sm font-medium">
            {profile.display_name || '—'}
          </span>
          <span className="text-xs text-gray-400">
            Set via your primary club handle
          </span>
        </div>
      </section>

      {/* Name */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Name
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {saved && <p className="text-sm text-green-600">Saved.</p>}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">First name</label>
              <input
                name="first_name"
                defaultValue={profile.first_name ?? ''}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Last name</label>
              <input
                name="last_name"
                defaultValue={profile.last_name ?? ''}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      {/* Club memberships */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Club Memberships
        </h2>
        {myIdentities.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Not a member of any club yet.</p>
        ) : (
          <div className="space-y-2">
            {myIdentities.map(identity => (
              <div
                key={identity.id}
                className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800">
                    {identity.club_handle}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">@ {identity.club.name}</span>
                  {identity.club_id === profile.primary_club_id && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                      primary
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {joinableCount > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            {joinableCount} club{joinableCount !== 1 ? 's' : ''} available to join.
          </p>
        )}

        <Link
          href="/profile"
          className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-800"
        >
          Manage clubs & handles →
        </Link>
      </section>
    </div>
  )
}
