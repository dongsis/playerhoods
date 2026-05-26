'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'
import { MatchManagePanel } from './MatchManagePanel'
import { MatchRoundRobinPanel, type MatchRoundRobinPanelProps } from './MatchRoundRobinPanel'
import {
  admissionTargetsToScopeUsers,
  getAdmissionTargets,
  getContactPersonAdmissionTargets,
  type MatchParticipantEnriched,
  type MatchGroupInvite,
  type ScopeUser,
  type ContactPersonAdmissionTarget,
} from '@/lib/api/matches'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Group, MatchCourt, MatchStatus } from '@/lib/types/database'
import type { MatchUpdateInput } from './match-detail.actions'
import type { MatchLineupSnapshot } from '@/lib/match-lineup'

type CurrentRequestTarget = {
  id: string
  name: string
}

function TeamsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2" />
      <circle cx="14" cy="5.5" r="2" />
      <path d="M3.5 13.8c.6-2.2 1.8-3.3 3.5-3.3s2.9 1.1 3.5 3.3" />
      <path d="M9.5 13.8c.6-2.2 1.8-3.3 3.5-3.3s2.9 1.1 3.5 3.3" />
    </svg>
  )
}

type Props = {
  showInviteTools: boolean
  showRoundRobinTools: boolean
  isFormed: boolean
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
  isFormed,
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
  const [activeTab, setActiveTab] = useState<'invite' | 'round_robin' | null>(null)
  const [formedActionsCollapsed, setFormedActionsCollapsed] = useState(false)
  const [loadedInviteMatchId, setLoadedInviteMatchId] = useState<string | null>(null)
  const [lazyCandidateUsers, setLazyCandidateUsers] = useState<ScopeUser[]>(candidateUsers)
  const [lazyContactTargets, setLazyContactTargets] = useState<ContactPersonAdmissionTarget[]>(contactTargets)
  const [isLoadingInviteTargets, setIsLoadingInviteTargets] = useState(false)
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null)

  useEffect(() => {
    setLoadedInviteMatchId(null)
    setLazyCandidateUsers(candidateUsers)
    setLazyContactTargets(contactTargets)
    setTargetLoadError(null)
  }, [matchId, candidateUsers, contactTargets])

  useEffect(() => {
    if (activeTab !== 'invite' || !showInviteTools || matchStatus !== 'active') return
    if (loadedInviteMatchId === matchId || isLoadingInviteTargets) return

    let cancelled = false
    setIsLoadingInviteTargets(true)
    setTargetLoadError(null)

    const supabase = createSupabaseBrowserClient()
    Promise.all([
      getAdmissionTargets(supabase, matchId),
      getContactPersonAdmissionTargets(supabase, matchId),
    ])
      .then(([admissionTargets, nextContactTargets]) => {
        if (cancelled) return
        const savedTargets = admissionTargets.filter((target) => target.source === 'invite_circle')
        setLazyCandidateUsers(admissionTargetsToScopeUsers(savedTargets, { requireCanAdmit: true }))
        setLazyContactTargets(nextContactTargets)
        setLoadedInviteMatchId(matchId)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[MatchToolsSection] load invite targets:', error)
        setTargetLoadError((error as { message?: string })?.message ?? 'Could not load invite options.')
        setLoadedInviteMatchId(matchId)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingInviteTargets(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, isLoadingInviteTargets, loadedInviteMatchId, matchId, matchStatus, showInviteTools])

  if (!showInviteTools && !showRoundRobinTools) {
    return null
  }

  const remainingSpots = Math.max(requiredCount - confirmedParticipants.length, 0)
  const isLineupFull = confirmedParticipants.length >= requiredCount
  const playersLabel = `${confirmedParticipants.length} confirmed ${confirmedParticipants.length === 1 ? 'player' : 'players'}`
  const toolsTitle = isFormed
    ? 'Match formed'
    : isLineupFull
      ? 'Ready to set teams'
      : 'Need more players?'
  const toolsCopy = isFormed
    ? 'Players have been notified. You can set teams now.'
    : isLineupFull
      ? `${playersLabel}. Set teams now, or invite backup players if you want options.`
      : `${remainingSpots} more ${remainingSpots === 1 ? 'spot is' : 'spots are'} open. Invite saved players, add a contact, or open this match to join.`
  const enoughPlayersForTeams = confirmedParticipants.length >= Math.max(requiredCount, 4)
  const setTeamsHelper = enoughPlayersForTeams
    ? `Ready to set teams from ${confirmedParticipants.length} confirmed ${confirmedParticipants.length === 1 ? 'player' : 'players'}.`
    : 'Need 4 confirmed players to set doubles teams.'

  const togglePanel = (nextTab: 'invite' | 'round_robin') => {
    setActiveTab((current) => {
      const next = current === nextTab ? null : nextTab
      if (next) {
        requestAnimationFrame(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
      return next
    })
  }

  return (
    <section
      ref={sectionRef}
      className="mt-5 overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div>
          <p className="m-0 text-[1rem] font-black text-slate-900">
            {formedActionsCollapsed ? 'Match formed · Players notified' : toolsTitle}
          </p>
          <p className="mt-1 text-[0.82rem] font-semibold leading-relaxed text-slate-500">
            {formedActionsCollapsed
              ? `${confirmedParticipants.length}/${requiredCount} confirmed`
              : toolsCopy}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isFormed ? (
            <button
              type="button"
              onClick={() => setFormedActionsCollapsed((value) => !value)}
              className="inline-flex items-center justify-center rounded-full border border-[#E2E8F0] bg-white px-3 py-2 text-[12px] font-black text-[#64748B] transition hover:bg-[#F8FAFC]"
            >
              {formedActionsCollapsed ? 'Show actions' : 'Hide'}
            </button>
          ) : null}

          {!formedActionsCollapsed && showRoundRobinTools && isLineupFull ? (
            <button
              type="button"
              onClick={() => togglePanel('round_robin')}
              disabled={!enoughPlayersForTeams}
              title={setTeamsHelper}
              className={[
                'inline-flex items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-55',
                activeTab === 'round_robin'
                  ? 'border-[#2F63F6] bg-[#2F63F6] text-white shadow-[0_10px_24px_rgba(47,99,246,0.22)]'
                  : 'border-[#2F63F6] bg-[#2F63F6] text-white shadow-[0_10px_24px_rgba(47,99,246,0.16)] hover:bg-[#2554D9]',
              ].join(' ')}
            >
              <TeamsIcon />
              <span>Set Teams</span>
            </button>
          ) : null}

          {!formedActionsCollapsed && showInviteTools ? (
            <button
              type="button"
              onClick={() => togglePanel('invite')}
              className={[
                'inline-flex items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-black transition active:scale-95',
                isFormed
                  ? activeTab === 'invite'
                    ? 'border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]'
                    : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAFC]'
                  : activeTab === 'invite'
                  ? isLineupFull
                    ? 'border-[#BFD1F8] bg-[#F5F8FF] text-[#2554D9]'
                    : 'border-[#7fd300] bg-[#7fd300] text-[#0f2a00] shadow-[0_10px_24px_rgba(127,211,0,0.26)]'
                  : isLineupFull
                    ? 'border-[#BFD1F8] bg-white text-[#2554D9] hover:bg-[#F5F8FF]'
                    : 'border-[#9CE600] bg-[#9CE600] text-[#102A00] shadow-[0_10px_24px_rgba(127,211,0,0.18)] hover:bg-[#8CDA00]',
              ].join(' ')}
            >
              {!isFormed ? (
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-xl leading-none text-[#5fa900] shadow-sm"
                >
                  +
                </span>
              ) : null}
              <span>{isFormed ? 'Adjust Lineup' : 'Add More Players'}</span>
            </button>
          ) : null}

          {!formedActionsCollapsed && showRoundRobinTools && !isLineupFull ? (
            <button
              type="button"
              onClick={() => togglePanel('round_robin')}
              disabled={!enoughPlayersForTeams}
              title={setTeamsHelper}
              className={[
                'inline-flex items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-sm font-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-55',
                activeTab === 'round_robin'
                  ? 'border-[#2F63F6] bg-[#2F63F6] text-white shadow-[0_10px_24px_rgba(47,99,246,0.22)]'
                  : 'border-[#BFD1F8] bg-white text-[#2554D9] hover:bg-[#F5F8FF]',
              ].join(' ')}
            >
              <TeamsIcon />
              <span>Set Teams</span>
            </button>
          ) : null}
        </div>

        {isFormed && !formedActionsCollapsed && activeTab !== 'invite' ? (
          <p className="basis-full text-body-sub font-semibold text-slate-400">
            Lineup is full. Use Adjust Lineup if you need to add or replace players.
          </p>
        ) : showRoundRobinTools ? (
          <p className="basis-full text-body-sub font-semibold text-slate-400">
            {setTeamsHelper}
          </p>
        ) : null}
      </div>

      {!formedActionsCollapsed && activeTab === 'invite' && showInviteTools && isLoadingInviteTargets ? (
        <div className="border-t border-slate-100 px-6 py-8">
          <div className="rounded-2xl border border-dashed border-[#BFD7FF] bg-[#F8FBFF] px-5 py-6 text-center">
            <p className="m-0 text-sm font-black text-slate-800">Loading invite options...</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Saved players and contacts are loaded only when you adjust the lineup.
            </p>
          </div>
        </div>
      ) : null}

      {!formedActionsCollapsed && activeTab === 'invite' && showInviteTools && !isLoadingInviteTargets ? (
        <MatchManagePanel
          embedded
          panelMode="invite"
          matchId={matchId}
          isOrganizer={isOrganizer}
          organizerUserId={organizerUserId}
          requiredCount={requiredCount}
          confirmedParticipants={confirmedParticipants}
          activeInviteParticipants={activeInviteParticipants}
          activeGroupInvites={activeGroupInvites}
          activeRequestUsers={activeRequestUsers}
          activeRequestGroups={activeRequestGroups}
          candidateUsers={lazyCandidateUsers}
          contactTargets={lazyContactTargets}
          candidateGroups={candidateGroups}
          onUpdateMatchDetails={onUpdateMatchDetails}
          onRemoveParticipant={onRemoveParticipant}
        />
      ) : null}

      {!formedActionsCollapsed && activeTab === 'invite' && targetLoadError ? (
        <p className="px-6 pb-5 text-body-sub font-semibold text-red-500">{targetLoadError}</p>
      ) : null}

      {!formedActionsCollapsed && activeTab === 'round_robin' && showRoundRobinTools ? (
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
