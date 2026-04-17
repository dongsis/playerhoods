'use client'

import { useMemo, useState } from 'react'
import { MatchManagePanel } from './MatchManagePanel'
import { MatchRoundRobinPanel } from './MatchRoundRobinPanel'
import type { MatchParticipantEnriched, MatchGroupInvite, ScopeUser } from '@/lib/api/matches'
import type { Group, MatchCourt, MatchStatus } from '@/lib/types/database'
import type { MatchUpdateInput } from './match-detail.actions'

type CurrentRequestTarget = {
  id: string
  name: string
}

type Props = {
  showInviteTools: boolean
  showRoundRobinTools: boolean
  matchId: string
  matchStatus: MatchStatus
  gameType: string | null
  finalCourtLabel: string | null
  matchCourts: MatchCourt[]
  isOrganizer: boolean
  organizerUserId: string | null
  requiredCount: number
  confirmedParticipants: MatchParticipantEnriched[]
  activeInviteParticipants: MatchParticipantEnriched[]
  activeGroupInvites: MatchGroupInvite[]
  activeRequestUsers: CurrentRequestTarget[]
  activeRequestGroups: CurrentRequestTarget[]
  candidateUsers: ScopeUser[]
  contactTargets: { guest_id: string; display_name: string; sourceLabel: string; email: string | null }[]
  candidateGroups: Group[]
  onUpdateMatchDetails: (data: MatchUpdateInput) => Promise<void>
  onRemoveParticipant: (participantId: string) => Promise<void>
}

export function MatchToolsSection({
  showInviteTools,
  showRoundRobinTools,
  matchId,
  matchStatus,
  gameType,
  finalCourtLabel,
  matchCourts,
  isOrganizer,
  organizerUserId,
  requiredCount,
  confirmedParticipants,
  activeInviteParticipants,
  activeGroupInvites,
  activeRequestUsers,
  activeRequestGroups,
  candidateUsers,
  contactTargets,
  candidateGroups,
  onUpdateMatchDetails,
  onRemoveParticipant,
}: Props) {
  const tabs = useMemo(() => {
    const nextTabs: Array<{ key: 'invite' | 'round_robin'; label: string }> = []
    if (showInviteTools) nextTabs.push({ key: 'invite', label: 'Invite Players' })
    if (showRoundRobinTools) nextTabs.push({ key: 'round_robin', label: 'Round Robin' })
    return nextTabs
  }, [showInviteTools, showRoundRobinTools])

  const [activeTab, setActiveTab] = useState<'invite' | 'round_robin'>(tabs[0]?.key ?? 'round_robin')

  if (tabs.length === 0) {
    return null
  }

  const inviteMeta = `${confirmedParticipants.length} / ${requiredCount}${confirmedParticipants.length >= requiredCount ? ' Full' : ''}`

  return (
    <section className="mt-5 overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition',
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="text-[12px]">{tab.key === 'invite' ? '+' : '[]'}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <span className="text-sm font-bold text-teal-600">
          {activeTab === 'invite' ? inviteMeta : `${confirmedParticipants.length} players`}
        </span>
      </div>

      {activeTab === 'invite' && showInviteTools ? (
        <MatchManagePanel
          embedded
          matchId={matchId}
          isOrganizer={isOrganizer}
          organizerUserId={organizerUserId}
          requiredCount={requiredCount}
          confirmedParticipants={confirmedParticipants}
          activeInviteParticipants={activeInviteParticipants}
          activeGroupInvites={activeGroupInvites}
          activeRequestUsers={activeRequestUsers}
          activeRequestGroups={activeRequestGroups}
          candidateUsers={candidateUsers}
          contactTargets={contactTargets}
          candidateGroups={candidateGroups}
          onUpdateMatchDetails={onUpdateMatchDetails}
          onRemoveParticipant={onRemoveParticipant}
        />
      ) : null}

      {activeTab === 'round_robin' && showRoundRobinTools ? (
        <MatchRoundRobinPanel
          gameType={gameType}
          matchStatus={matchStatus}
          isOrganizer={isOrganizer}
          confirmedParticipants={confirmedParticipants}
          matchCourts={matchCourts}
          finalCourtLabel={finalCourtLabel}
        />
      ) : null}
    </section>
  )
}
