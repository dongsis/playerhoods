'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { PendingGroupInvite, GroupWithMembers } from '@/lib/api/players'
import type { Sport } from '@/lib/types/database'

type Props = {
  groups: GroupWithMembers[]
  pendingInvites: PendingGroupInvite[]
  sports: Sport[]
}

export function GroupsPanel({ groups, pendingInvites, sports }: Props) {
  const [keeperNames, setKeeperNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    const keeperIds = Array.from(new Set(groups.map((group) => group.group.boundary_keeper_id)))
    if (keeperIds.length === 0) {
      setKeeperNames(new Map())
      return
    }

    const supabase = createSupabaseBrowserClient()
    let cancelled = false

    void supabase
      .from('profile_display')
      .select('id, display_name')
      .in('id', keeperIds)
      .then(({ data, error }) => {
        if (cancelled || error) return
        setKeeperNames(
          new Map(
            ((data ?? []) as { id: string; display_name: string }[]).map((row) => [row.id, row.display_name]),
          ),
        )
      })

    return () => {
      cancelled = true
    }
  }, [groups])

  const sportNameById = useMemo(
    () => new Map(sports.map((sport) => [sport.id, sport.display_name])),
    [sports],
  )

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.34)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Groups</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Shared Groups are the place for membership, communication, and longer-term organization. They are separate from Hoods, which stay focused on the people pool.
            </p>
          </div>
          <Link
            href="/groups/new"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            New Shared Group
          </Link>
        </div>
      </section>

      {pendingInvites.length > 0 && (
        <section className="rounded-[30px] border border-amber-200 bg-amber-50 p-5 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.18)]">
          <h2 className="text-lg font-semibold tracking-tight text-amber-950">Pending group invites</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {pendingInvites.map((invite) => (
              <div
                key={invite.groupId}
                className="rounded-[24px] border border-amber-200 bg-white/85 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">{invite.groupName}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {invite.primarySportId ? sportNameById.get(invite.primarySportId) ?? 'Shared Group' : 'Shared Group'}
                    </div>
                    {invite.invitedByName && (
                      <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                        Invited by {invite.invitedByName}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/groups/${invite.groupId}`}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                  >
                    Review
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <section className="rounded-[30px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No Shared Groups yet. Create one when you need a shared space for members, discussion, and match coordination.
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(({ group, members }) => {
            const sportName = group.primary_sport_id
              ? sportNameById.get(group.primary_sport_id) ?? 'Shared Group'
              : 'Shared Group'
            const keeperName = keeperNames.get(group.boundary_keeper_id) ?? 'Keeper'

            return (
              <section
                key={group.id}
                className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.34)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900">
                        {group.name}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        Shared Group
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {group.description?.trim() || 'A shared space for members, communication, and group-level match coordination.'}
                    </p>
                  </div>
                </div>

                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Sport</dt>
                    <dd className="mt-1 text-sm text-slate-700">{sportName}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Members</dt>
                    <dd className="mt-1 text-sm text-slate-700">
                      {members.length} member{members.length === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Keeper</dt>
                    <dd className="mt-1 text-sm text-slate-700">{keeperName}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Latest summary</dt>
                    <dd className="mt-1 text-sm text-slate-700">
                      Open the group to manage announcements, members, and shared details.
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={`/groups/${group.id}`}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    Open Group
                  </Link>
                  <Link
                    href={`/groups/${group.id}`}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Manage Group
                  </Link>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
