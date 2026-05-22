'use client'

import { useMemo, useRef, useState, type ComponentType } from 'react'
import { MatchManagePanel } from './MatchManagePanel'
import { MatchRoundRobinPanel, type MatchRoundRobinPanelProps } from './MatchRoundRobinPanel'
import type { MatchParticipantEnriched, MatchGroupInvite, ScopeUser, ContactPersonAdmissionTarget } from '@/lib/api/matches'
import type { Group, MatchCourt, MatchStatus } from '@/lib/types/database'
import type { MatchUpdateInput } from './match-detail.actions'
import type { MatchLineupSnapshot } from '@/lib/match-lineup'

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
  contactTargets: ContactPersonAdmissionTarget[]
  candidateGroups: Group[]
  savedLineup: MatchLineupSnapshot | null
  onUpdateMatchDetails: (data: MatchUpdateInput) => Promise<void>
  onRemoveParticipant: (participantId: string, note?: string | null) => Promise<void>
  onSaveLineup: (lineup: MatchLineupSnapshot | null) => Promise<void>
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
  savedLineup,
  onUpdateMatchDetails,
  onRemoveParticipant,
  onSaveLineup,
}: Props) {
  const RoundRobinPanel = MatchRoundRobinPanel as ComponentType<MatchRoundRobinPanelProps>
  const sectionRef = useRef<HTMLElement | null>(null)
  const tabs = useMemo(() => {
    const nextTabs: Array<{ key: 'invite' | 'remove' | 'round_robin'; label: string }> = []
    if (showInviteTools) nextTabs.push({ key: 'invite', label: 'Invite Players' })
    if (showInviteTools && isOrganizer) nextTabs.push({ key: 'remove', label: 'Remove Players' })
    if (showRoundRobinTools) nextTabs.push({ key: 'round_robin', label: 'Lineup' })
    return nextTabs
  }, [isOrganizer, showInviteTools, showRoundRobinTools])

  const [activeTab, setActiveTab] = useState<'invite' | 'remove' | 'round_robin' | null>(null)

  if (tabs.length === 0) {
    return null
  }

  const inviteMeta = `${confirmedParticipants.length} / ${requiredCount}${confirmedParticipants.length >= requiredCount ? ' Full' : ''}`

  return (
    <section
      ref={sectionRef}
      className="mt-5 overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab((current) => {
                    const next = current === tab.key ? null : tab.key
                    if (next) {
                      requestAnimationFrame(() => {
                        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      })
                    }
                    return next
                  })
                }}
                className={[
                  'text-label inline-flex items-center gap-2 rounded-full border px-4 py-2 transition',
                  isActive
                    ? tab.key === 'remove'
                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="text-body-main">
                  {tab.key === 'invite' ? '+' : tab.key === 'remove' ? '-' : '[]'}
                </span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <span className="text-title-main text-teal-600">
          {activeTab === 'invite' || activeTab === 'remove'
            ? inviteMeta
            : savedLineup
              ? `${savedLineup.playersCount} players`
              : `${confirmedParticipants.length} players`}
        </span>
      </div>

      {(activeTab === 'invite' || activeTab === 'remove') && showInviteTools ? (
        <MatchManagePanel
          embedded
          panelMode={activeTab === 'remove' ? 'remove' : 'invite'}
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
          onRequestPanelMode={setActiveTab}
        />
      ) : null}

      {activeTab === 'round_robin' && showRoundRobinTools ? (
        <RoundRobinPanel
          gameType={gameType}
          matchStatus={matchStatus}
          isOrganizer={isOrganizer}
          confirmedParticipants={confirmedParticipants}
          matchCourts={matchCourts}
          finalCourtLabel={finalCourtLabel}
          savedLineup={savedLineup}
          onSaveLineup={onSaveLineup}
        />
      ) : null}
    </section>
  )
}
