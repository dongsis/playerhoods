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

const INVITE_TARGET_LOAD_TIMEOUT_MS = 15000

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
  savedPlayerIds: string[]
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
  savedPlayerIds,
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
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null)
  const [isPublicSignupLinkBusy, setIsPublicSignupLinkBusy] = useState(false)
  const [publicSignupLinkError, setPublicSignupLinkError] = useState<string | null>(null)

  useEffect(() => {
    setLoadedInviteMatchId(null)
    setLazyCandidateUsers(candidateUsers)
    setLazyContactTargets(contactTargets)
    setTargetLoadError(null)
    setApplySuccessMessage(null)
    setPublicSignupLinkError(null)
  }, [matchId, candidateUsers, contactTargets])

  useEffect(() => {
    if (!applySuccessMessage) return

    const timeout = window.setTimeout(() => {
      setApplySuccessMessage(null)
    }, 5000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [applySuccessMessage])

  useEffect(() => {
    if (activeTab !== 'invite' || !showInviteTools || matchStatus !== 'active') return
    if (loadedInviteMatchId === matchId) return

    let cancelled = false
    let timedOut = false
    setIsLoadingInviteTargets(true)
    setTargetLoadError(null)

    const loadTimeout = window.setTimeout(() => {
      if (cancelled) return
      timedOut = true
      console.error('[MatchToolsSection] load invite targets timed out')
      setTargetLoadError('Invite options are taking too long to load. Close and reopen this panel to try again.')
      setIsLoadingInviteTargets(false)
    }, INVITE_TARGET_LOAD_TIMEOUT_MS)

    const supabase = createSupabaseBrowserClient()
    Promise.all([
      getAdmissionTargets(supabase, matchId),
      getContactPersonAdmissionTargets(supabase, matchId),
    ])
      .then(([admissionTargets, nextContactTargets]) => {
        if (cancelled || timedOut) return
        window.clearTimeout(loadTimeout)
        const savedPlayerIdSet = new Set(savedPlayerIds)
        const savedTargets = admissionTargets.filter((target) =>
          target.source === 'invite_circle' || savedPlayerIdSet.has(target.target_id),
        )
        setLazyCandidateUsers(admissionTargetsToScopeUsers(savedTargets, { requireCanAdmit: true }))
        setLazyContactTargets(nextContactTargets)
        setLoadedInviteMatchId(matchId)
      })
      .catch((error) => {
        if (cancelled || timedOut) return
        window.clearTimeout(loadTimeout)
        console.error('[MatchToolsSection] load invite targets:', error)
        setTargetLoadError((error as { message?: string })?.message ?? 'Could not load invite options.')
      })
      .finally(() => {
        if (!cancelled && !timedOut) setIsLoadingInviteTargets(false)
      })

    return () => {
      cancelled = true
      window.clearTimeout(loadTimeout)
    }
  }, [activeTab, loadedInviteMatchId, matchId, matchStatus, savedPlayerIds, showInviteTools])

  if (!showInviteTools && !showRoundRobinTools) {
    return null
  }

  const isLineupFull = confirmedParticipants.length >= requiredCount
  const toolsTitle = isFormed
    ? 'Match formed'
    : isLineupFull
      ? 'Lineup is full.'
      : 'Need more players?'
  const addMoreIsPrimary = !isFormed && !isLineupFull

  const togglePanel = (nextTab: 'invite' | 'round_robin') => {
    setActiveTab((current) => {
      const next = current === nextTab ? null : nextTab
      if (next) {
        setApplySuccessMessage(null)
        requestAnimationFrame(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
      return next
    })
  }

  const copyPublicSignupLink = async () => {
    if (!isOrganizer || matchStatus !== 'active') return

    setIsPublicSignupLinkBusy(true)
    setPublicSignupLinkError(null)
    setApplySuccessMessage(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.rpc('rpc_public_match_signup_link_get_or_create', {
        p_match_id: matchId,
      })
      if (error) throw error

      const link = Array.isArray(data) ? data[0] : null
      if (!link?.public_token) {
        throw new Error('Could not create the public signup link.')
      }

      const url = `${window.location.origin}/join/${link.public_token}`
      try {
        await navigator.clipboard.writeText(url)
        setApplySuccessMessage('Share link copied.')
      } catch {
        setApplySuccessMessage('Share link ready.')
      }
    } catch (error) {
      console.error('[MatchToolsSection] public signup link:', error)
      setPublicSignupLinkError((error as { message?: string })?.message ?? 'Could not create the public signup link.')
    } finally {
      setIsPublicSignupLinkBusy(false)
    }
  }

  return (
    <section
      ref={sectionRef}
      className={[
        showInviteTools ? 'mt-3' : 'hidden',
        'rounded-[18px] md:mt-5 md:block md:overflow-hidden md:rounded-[24px] md:border md:border-slate-100 md:bg-white md:shadow-[0_4px_20px_rgba(0,0,0,0.04)]',
      ].join(' ')}
    >
      {showInviteTools && activeTab !== 'invite' ? (
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => togglePanel('invite')}
            className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[#CBD5E1] bg-white px-3 text-[13px] font-black text-[#0F172A] transition active:scale-95"
          >
            Add players
          </button>
        </div>
      ) : null}

      <div className="hidden flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 md:flex">
        <div>
          <p className="m-0 text-[1rem] font-black text-slate-900">
            {formedActionsCollapsed ? 'Match formed · Players notified' : toolsTitle}
          </p>
          {formedActionsCollapsed ? (
            <p className="mt-1 text-[0.82rem] font-semibold leading-relaxed text-slate-500">
              {confirmedParticipants.length}/{requiredCount} confirmed
            </p>
          ) : null}
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

          {!formedActionsCollapsed && showInviteTools ? (
            <button
              type="button"
              onClick={() => togglePanel('invite')}
              className={[
                'inline-flex items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-black transition active:scale-95',
                isFormed
                  ? activeTab === 'invite'
                    ? 'border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]'
                    : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAFC]'
                  : activeTab === 'invite'
                    ? addMoreIsPrimary
                      ? 'border-[#B7D7FF] bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'border-[#BFD1F8] bg-[#F5F8FF] text-[#2554D9]'
                    : addMoreIsPrimary
                      ? 'border-[#B7D7FF] bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]'
                      : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAFC]',
              ].join(' ')}
            >
              {addMoreIsPrimary ? (
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-base leading-none text-[#1D4ED8]"
                >
                  +
                </span>
              ) : null}
              <span>{isFormed ? 'Adjust Lineup' : 'Add More Players'}</span>
            </button>
          ) : null}
        </div>

        {isFormed && !formedActionsCollapsed && activeTab !== 'invite' ? (
          <p className="basis-full text-body-sub font-semibold text-slate-400">
            Lineup is full. Use Adjust Lineup if you need to add or replace players.
          </p>
        ) : null}

        {applySuccessMessage ? (
          <p className="basis-full rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-body-main font-semibold text-emerald-700">
            {applySuccessMessage}
          </p>
        ) : null}

        {publicSignupLinkError ? (
          <p className="basis-full rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-body-main font-semibold text-red-600">
            {publicSignupLinkError}
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
          onApplied={() => {
            setLoadedInviteMatchId(null)
            setActiveTab(null)
            setApplySuccessMessage('Changes applied.')
          }}
          shareLinkRow={isOrganizer && matchStatus === 'active' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-body-main font-black text-slate-900">Share link</div>
                <div className="text-body-sub font-semibold text-slate-500">Let someone request a spot from the match link.</div>
              </div>
              <button
                type="button"
                onClick={copyPublicSignupLink}
                disabled={isPublicSignupLinkBusy}
                className="text-body-sub inline-flex shrink-0 items-center justify-center rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5 font-bold text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-wait disabled:opacity-60"
              >
                {isPublicSignupLinkBusy ? 'Preparing Link' : 'Copy Link'}
              </button>
            </div>
          ) : null}
        />
      ) : null}

      {!formedActionsCollapsed && activeTab === 'invite' && targetLoadError ? (
        <p className="px-6 pb-5 text-body-sub font-semibold text-red-500">{targetLoadError}</p>
      ) : null}

      {!formedActionsCollapsed && activeTab === 'round_robin' && showRoundRobinTools ? (
        <div className="hidden md:block">
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
        </div>
      ) : null}
    </section>
  )
}
