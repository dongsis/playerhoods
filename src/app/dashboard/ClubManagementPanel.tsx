'use client'

import Link from 'next/link'
import type { ClubAdmin, Club } from '@/lib/types/database'

interface Props {
  myAdminClubs: (ClubAdmin & { club: Club })[]
  isSuperAdmin: boolean
}

export function ClubManagementPanel({ myAdminClubs, isSuperAdmin }: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Club Management</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {isSuperAdmin ? 'Super admin' : 'Club admin'} access
          </p>
        </div>
        {isSuperAdmin && (
          <Link
            href="/admin/clubs"
            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-xl hover:bg-gray-800 transition-colors"
          >
            All Clubs →
          </Link>
        )}
      </div>

      {/* Clubs list */}
      {myAdminClubs.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No clubs assigned yet.</p>
      ) : (
        <div className="space-y-3">
          {myAdminClubs.map(({ club }) => (
            <div
              key={club.id}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
            >
              {/* Club header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-800">{club.name}</div>
                  {club.location_text && (
                    <div className="text-xs text-gray-400">
                      {club.location_text} · {club.timezone}
                    </div>
                  )}
                </div>
                <Link
                  href={`/admin/clubs/${club.id}`}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Manage →
                </Link>
              </div>

              {/* Tab skeleton */}
              <div className="flex gap-0 px-4 py-2 bg-gray-50">
                {['Info', 'Courts', 'Admins'].map(label => (
                  <Link
                    key={label}
                    href={`/admin/clubs/${club.id}`}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-gray-700 rounded-lg hover:bg-white transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Full club management is available at{' '}
        <Link href="/admin/clubs" className="text-blue-500 hover:underline">
          /admin/clubs
        </Link>
        .
      </p>
    </div>
  )
}
