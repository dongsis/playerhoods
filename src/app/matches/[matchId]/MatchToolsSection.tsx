'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'
import { useSearchParams } from 'next/navigation'
import { MatchManagePanel } from './MatchManagePanel'
import { MatchRoundRobinPanel, type MatchRoundRobinPanelProps } from './MatchRoundRobinPanel'
import { AddPlayersMethodPanel } from '../AddPlayersMethodPanel'
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
import { buildPublicJoinShareText } from '@/lib/public-join-share'
import type { Group, MatchCourt, MatchStatus } from '@/lib/types/database'
import type { MatchUpdateInput } from './match-detail.actions'
import type { MatchLineupSnapshot } from '@/lib/match-lineup'

type CurrentRequestTarget = {
  id: string
  name: string
}

const INVITE_TARGET_LOAD_TIMEOUT_MS = 15000

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the textarea fallback for older browsers or denied clipboard access.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

type Props = {
  showInviteTools: boolean
  showRoundRobinTools: boolean
  isFormed: boolean
  matchId: string
  matchStatus: MatchStatus
  sportId: number | null
  sportName: string | null
  gameType: string | null
  venueName: string | null
  dateTimeLabel: string | null
  finalCourtLabel: string | null
  matchCourts: MatchCourt[]
  isOrganizer: boolean
  organizerUserId: string | null
  organizerName: string | null
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
  sportId,
  sportName,
  gameType,
  venueName,
  dateTimeLabel,
  finalCourtLabel,
  matchCourts,
  isOrganizer,
  organizerUserId,
  organizerName,
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
  const searchParams = useSearchParams()
  const sectionRef = useRef<HTMLElement | null>(null)
  const [activeTab, setActiveTab] = useState<'invite' | 'round_robin' | null>(null)
  const [formedActionsCollapsed, setFormedActionsCollapsed] = useState(false)
  const [loadedInviteMatchId, setLoadedInviteMatchId] = useState<string | null>(null)
  const [lazyCandidateUsers, setLazyCandidateUsers] = useState<ScopeUser[]>(candidateUsers)
  const [lazyContactTargets, setLazyContactTargets] = useState<ContactPersonAdmissionTarget[]>(contactTargets)
  const [isLoadingInviteTargets, setIsLoadingInviteTargets] = useState(false)
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null)
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null)
  const [shareLinkStatusMessage, setShareLinkStatusMessage] = useState<string | null>(null)
  const [shareLinkCopiedText, setShareLinkCopiedText] = useState<string | null>(null)
  const [isPublicSignupLinkBusy, setIsPublicSignupLinkBusy] = useState(false)
  const [publicSignupLinkError, setPublicSignupLinkError] = useState<string | null>(null)

  useEffect(() => {
    setLoadedInviteMatchId(null)
    setLazyCandidateUsers(candidateUsers)
    setLazyContactTargets(contactTargets)
    setTargetLoadError(null)
    setApplySuccessMessage(null)
    setShareLinkStatusMessage(null)
    setShareLinkCopiedText(null)
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
    if (!shareLinkStatusMessage) return

    const timeout = window.setTimeout(() => {
      setShareLinkStatusMessage(null)
      setShareLinkCopiedText(null)
    }, 10000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [shareLinkStatusMessage])

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

  const isLineupFull = confirmedParticipants.length >= requiredCount
  const toolsTitle = isFormed
    ? 'Match formed'
    : isLineupFull
      ? 'Manage players'
      : 'Need more players?'
  const toolsSubcopy = !isFormed && !isLineupFull
    ? 'Choose how you want to invite them.'
    : null
  const canUsePublicSignupLink = showInviteTools && matchStatus === 'active' && !isFormed && !isLineupFull
  const showTopLevelPublicShare = canUsePublicSignupLink
  const manageActionLabel = 'Manage'
  const showCreateInviteLinkPrompt = searchParams.get('inviteLinkReady') === '1'

  useEffect(() => {
    if (!showCreateInviteLinkPrompt || !canUsePublicSignupLink) return

    setActiveTab(null)
    setShareLinkCopiedText(null)
    setShareLinkStatusMessage('Invite link is ready. Use Copy Link when you want to share it.')
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [canUsePublicSignupLink, matchId, showCreateInviteLinkPrompt])

  if (!showInviteTools && !showRoundRobinTools) {
    return null
  }

  const togglePanel = (nextTab: 'invite' | 'round_robin') => {
    setActiveTab((current) => {
      const next = current === nextTab ? null : nextTab
      if (next) {
        setApplySuccessMessage(null)
        setShareLinkStatusMessage(null)
        setShareLinkCopiedText(null)
        requestAnimationFrame(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
      return next
    })
  }

  const closeInvitePanel = () => {
    setActiveTab(null)
    setTargetLoadError(null)
  }

  const dismissShareLinkFeedback = () => {
    setShareLinkStatusMessage(null)
    setShareLinkCopiedText(null)
  }

  const copyPublicSignupLink = async () => {
    if (!canUsePublicSignupLink) return

    setIsPublicSignupLinkBusy(true)
    setPublicSignupLinkError(null)
    setApplySuccessMessage(null)
    setShareLinkStatusMessage(null)
    setShareLinkCopiedText(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.rpc('rpc_public_match_signup_link_get_or_create', {
        p_match_id: matchId,
      })
      if (error) throw error

      const link = Array.isArray(data) ? data[0] : null
      if (!link?.public_token) {
        throw new Error('Could not create the invite link.')
      }

      const url = `${window.location.origin}/join/${link.public_token}`
      const shareText = buildPublicJoinShareText({
        sportName,
        gameType,
        venueName,
        dateTimeLabel,
        hostName: organizerName,
        firstPerson: true,
        url,
      })
      const copied = await copyTextToClipboard(shareText)
      setShareLinkStatusMessage(copied ? 'Invite link copied as follows. Share only with people you want to invite.' : 'Invite text ready. Copy the link if your browser asks.')
      setShareLinkCopiedText(copied ? shareText : null)
    } catch (error) {
      console.error('[MatchToolsSection] public signup link:', error)
      setPublicSignupLinkError((error as { message?: string })?.message ?? 'Could not create the invite link.')
    } finally {
      setIsPublicSignupLinkBusy(false)
    }
  }

  const shareLinkFeedback = shareLinkStatusMessage ? (
    <div
      role="status"
      className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold leading-snug text-emerald-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-black">{shareLinkStatusMessage}</p>
          {shareLinkCopiedText ? (
            <p className="m-0 mt-2 whitespace-pre-wrap break-words pl-3 text-[#0F172A]">
              {shareLinkCopiedText}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismissShareLinkFeedback}
          className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[16px] font-black leading-none text-emerald-800 transition hover:bg-emerald-100"
          aria-label="Dismiss invite link copied message"
        >
          {'x'}
        </button>
      </div>
    </div>
  ) : null

  const shareLinkRow = canUsePublicSignupLink ? (
    <div className="space-y-3">
      <div>
        <p className="m-0 text-body-main font-black text-[#0F172A]">
          Invite by Link
        </p>
        <p className="mt-1 text-body-sub font-semibold leading-relaxed text-[#64748B]">
          Share it only with people you want to invite.
        </p>
      </div>
      <button
        type="button"
        onClick={copyPublicSignupLink}
        disabled={isPublicSignupLinkBusy}
        className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[#B7D7FF] bg-[#EFF6FF] px-3 text-[13px] font-black text-[#1D4ED8] transition active:scale-95 disabled:cursor-wait disabled:opacity-60"
      >
        {isPublicSignupLinkBusy ? 'Preparing...' : 'Copy Link'}
      </button>
      {shareLinkFeedback}
      {publicSignupLinkError ? (
        <p className="text-body-sub font-semibold text-red-600">
          {publicSignupLinkError}
        </p>
      ) : null}
    </div>
  ) : null

  const invitePickerPanel = !formedActionsCollapsed && activeTab === 'invite' && showInviteTools ? (
    <div className="mt-2">
      {isLoadingInviteTargets ? (
        <div className="rounded-xl border border-dashed border-[#BFD7FF] bg-white px-4 py-5 text-center">
          <p className="m-0 text-sm font-black text-slate-800">Loading invite options...</p>
          <p className="mt-2 text-xs font-semibold text-slate-400">
            Saved players are loaded only when you choose to invite them.
          </p>
        </div>
      ) : (
        <MatchManagePanel
          embedded
          panelMode="invite"
          matchId={matchId}
          matchSportId={sportId}
          matchSportName={sportName}
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
          shareLinkRow={shareLinkRow}
          onEmbeddedCancel={closeInvitePanel}
          onApplied={() => {
            setLoadedInviteMatchId(null)
            setActiveTab(null)
            setApplySuccessMessage('Changes applied.')
          }}
        />
      )}
      {targetLoadError ? (
        <p className="mt-3 text-body-sub font-semibold text-red-500">{targetLoadError}</p>
      ) : null}
    </div>
  ) : null

  const inviteMethodCards = showTopLevelPublicShare ? (
    <AddPlayersMethodPanel
      title="Need more players?"
      linkBusy={isPublicSignupLinkBusy}
      linkFeedback={shareLinkFeedback}
      linkError={publicSignupLinkError}
      onCopyLink={copyPublicSignupLink}
      savedPlayersExpanded={activeTab === 'invite'}
      savedPlayersPanel={invitePickerPanel}
      onToggleSavedPlayers={() => togglePanel('invite')}
    />
  ) : null

  return (
    <section
      ref={sectionRef}
      className={[
        showInviteTools ? 'mt-3' : 'hidden',
        'rounded-[18px] md:mt-5 md:block md:overflow-hidden md:rounded-[24px] md:border md:border-slate-100 md:bg-white md:shadow-[0_4px_20px_rgba(0,0,0,0.04)]',
      ].join(' ')}
    >
      {showInviteTools ? (
        <div className="space-y-3 md:hidden">
          {inviteMethodCards ?? (
            <button
              type="button"
              onClick={() => togglePanel('invite')}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-3 text-[13px] font-black text-[#0F172A] transition active:scale-95"
              aria-expanded={activeTab === 'invite'}
            >
              <span>{manageActionLabel}</span>
              <span
                className={`text-[16px] leading-none text-[#94A3B8] transition-transform ${activeTab === 'invite' ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                {'>'}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {!showTopLevelPublicShare ? (
      <div className="hidden flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 md:flex">
        <div>
          <p className="m-0 text-[1rem] font-black text-slate-900">
            {formedActionsCollapsed ? 'Match formed · Players notified' : toolsTitle}
          </p>
          {formedActionsCollapsed ? (
            <p className="mt-1 text-[0.82rem] font-semibold leading-relaxed text-slate-500">
              {confirmedParticipants.length}/{requiredCount} confirmed
            </p>
          ) : toolsSubcopy ? (
            <p className="mt-1 text-[0.82rem] font-semibold leading-relaxed text-slate-500">
              {toolsSubcopy}
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
            <>
              {!showTopLevelPublicShare ? (
                <button
                  type="button"
                  onClick={() => togglePanel('invite')}
                  className={[
                    'inline-flex items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-black transition active:scale-95',
                    activeTab === 'invite'
                      ? 'border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]'
                      : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAFC]',
                  ].join(' ')}
                  aria-expanded={activeTab === 'invite'}
                >
                  <span>{manageActionLabel}</span>
                  <span
                    className={`text-[16px] leading-none text-[#94A3B8] transition-transform ${activeTab === 'invite' ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  >
                    {'>'}
                  </span>
                </button>
              ) : null}
            </>
          ) : null}
        </div>

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

        {!showTopLevelPublicShare && shareLinkStatusMessage ? (
          <div className="basis-full">{shareLinkFeedback}</div>
        ) : null}
      </div>
      ) : null}

      {!formedActionsCollapsed && showInviteTools && showTopLevelPublicShare ? (
        <div className="hidden border-b border-slate-100 px-6 py-5 md:block">
          {inviteMethodCards}
        </div>
      ) : null}

      {!showTopLevelPublicShare && !formedActionsCollapsed && activeTab === 'invite' && showInviteTools && isLoadingInviteTargets ? (
        <div className="border-t border-slate-100 px-6 py-8">
          <div className="rounded-2xl border border-dashed border-[#BFD7FF] bg-[#F8FBFF] px-5 py-6 text-center">
            <p className="m-0 text-sm font-black text-slate-800">Loading invite options...</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Saved players and contacts are loaded only when you adjust the lineup.
            </p>
          </div>
        </div>
      ) : null}

      {!showTopLevelPublicShare && !formedActionsCollapsed && activeTab === 'invite' && showInviteTools && !isLoadingInviteTargets ? (
        <MatchManagePanel
          embedded
          panelMode="invite"
          matchId={matchId}
          matchSportId={sportId}
          matchSportName={sportName}
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
          shareLinkRow={shareLinkRow}
          onEmbeddedCancel={closeInvitePanel}
          onApplied={() => {
            setLoadedInviteMatchId(null)
            setActiveTab(null)
            setApplySuccessMessage('Changes applied.')
          }}
        />
      ) : null}

      {!showTopLevelPublicShare && !formedActionsCollapsed && activeTab === 'invite' && targetLoadError ? (
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
