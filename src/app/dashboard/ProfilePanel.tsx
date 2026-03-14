'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Profile, ClubIdentity, Club } from '@/lib/types/database'
import { AvatarUpload } from './AvatarUpload'

interface Props {
  userId: string
  profile: Pick<Profile, 'display_name' | 'first_name' | 'last_name' | 'primary_club_id' | 'contact_channel' | 'contact_email' | 'contact_phone' | 'avatar_url'>
  userEmail?: string | null
  myIdentities: (ClubIdentity & { club: Club })[]
  joinableCount: number
  onUpdateProfile: (formData: FormData) => Promise<void>
  onAvatarSaved: () => Promise<void>
}

export function ProfilePanel({ userId, profile, userEmail, myIdentities, joinableCount, onUpdateProfile, onAvatarSaved }: Props) {
  const router = useRouter()
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

  const handleAvatarSaved = async () => {
    await onAvatarSaved()
    router.refresh()
  }

  return (
    <div className="space-y-8 max-w-md">
      {/* Avatar */}
      <section>
        <AvatarUpload
          userId={userId}
          currentAvatarUrl={profile.avatar_url ?? null}
          onSaved={handleAvatarSaved}
        />
      </section>

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

          {/* Contact preferences */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Contact preference
            </h3>
            <p className="text-xs text-gray-500 mb-2">
              How you prefer to receive notifications (email or SMS).
            </p>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="contact_channel"
                  value="email"
                  defaultChecked={(profile.contact_channel ?? 'email') === 'email'}
                  className="text-gray-900"
                />
                <span className="text-sm">Email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="contact_channel"
                  value="sms"
                  defaultChecked={profile.contact_channel === 'sms'}
                  className="text-gray-900"
                />
                <span className="text-sm">SMS</span>
              </label>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact email</label>
                <input
                  type="email"
                  name="contact_email"
                  placeholder={userEmail ?? 'Your registered email'}
                  defaultValue={profile.contact_email ?? ''}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Leave empty to use your registered email ({userEmail ?? '—'})
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact phone (for SMS)</label>
                <input
                  type="tel"
                  name="contact_phone"
                  placeholder="+1 234 567 8900"
                  defaultValue={profile.contact_phone ?? ''}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
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
