'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

export type AddPlayersMode = 'invite' | 'playerCall' | 'shareLink'

export type AddPlayersFilterOption = {
  value: string
  label: string
}

export type AddPlayersCandidate = {
  key: string
  name: string
  kind: 'person' | 'contact' | 'group'
  filterTags: string[]
  selected: boolean
  disabled?: boolean
  title?: string
  searchText?: string
  leadingNode?: ReactNode
  labelNode?: ReactNode
  supportingNode?: ReactNode
  trailingNode?: ReactNode
  previewTitle?: string
  previewSubtitle?: string
  previewDetails?: ReactNode
  payload?: unknown
}

type Props = {
  mode: AddPlayersMode
  onModeChange: (mode: AddPlayersMode) => void
  searchValue: string
  onSearchChange: (value: string) => void
  filterValue: string
  onFilterChange: (value: string) => void
  filterOptions: AddPlayersFilterOption[]
  candidates: AddPlayersCandidate[]
  onToggleCandidate: (candidate: AddPlayersCandidate) => void
  inviteSummary?: ReactNode
  playerCallSummary?: ReactNode
  addContactSlot?: ReactNode
  shareLinkRow?: ReactNode
  availableModes?: AddPlayersMode[]
  footerSlot?: ReactNode
  inviteEmptyLabel?: ReactNode
  playerCallEmptyLabel?: ReactNode
  searchPlaceholder?: string
  playerCallSummaryLabel?: string
  playerCallHelperText?: ReactNode
  expandModeButtonsOnMobile?: boolean
  compactPreviewRows?: boolean
  renderPreview?: (
    candidate: AddPlayersCandidate,
    actions: {
      closePreview: () => void
      toggleCandidate: () => void
    },
  ) => ReactNode
}

function modeButtonClass(selected: boolean, tone: AddPlayersMode) {
  const selectedClass = tone === 'playerCall'
    ? 'bg-white text-[#15803D] shadow-sm ring-1 ring-[#22C55E]/20'
    : tone === 'shareLink'
      ? 'bg-white text-[#475569] shadow-sm ring-1 ring-slate-300'
    : 'bg-white text-[#0d6efd] shadow-sm ring-1 ring-[#0d6efd]/15'
  const idleClass = tone === 'playerCall'
    ? 'text-[#334155] hover:bg-white/70 hover:text-[#15803D]'
    : tone === 'shareLink'
      ? 'text-[#334155] hover:bg-white/70 hover:text-[#475569]'
    : 'text-[#334155] hover:bg-white/70 hover:text-[#0d6efd]'

  return [
    'flex h-11 w-full min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-center text-[11px] font-black leading-tight transition active:scale-[0.98] min-[380px]:gap-1.5 min-[380px]:px-1.5 min-[380px]:text-[12px] sm:px-3 sm:text-body-main',
    selected ? selectedClass : idleClass,
  ].join(' ')
}

function InviteIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="7" r="3" />
      <path d="M3.5 16c.7-2.8 2.2-4.2 4.5-4.2s3.8 1.4 4.5 4.2" />
      <path d="M15 6v5" />
      <path d="M12.5 8.5h5" />
    </svg>
  )
}

function BoardIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5h7.5l4-2.2v11.4l-4-2.2H4z" />
      <path d="M7 13.5l1 3" />
      <path d="M14.8 8.2c.7.5.7 2.1 0 2.6" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.8 6.2l.9-.9a3 3 0 0 1 4.3 4.2l-1.4 1.4a3 3 0 0 1-4.2 0" />
      <path d="M11.2 13.8l-.9.9A3 3 0 0 1 6 10.5l1.4-1.4a3 3 0 0 1 4.2 0" />
    </svg>
  )
}

function candidateClass(candidate: AddPlayersCandidate, mode: AddPlayersMode) {
  const selectedClass = mode === 'playerCall'
    ? 'border-green-500 bg-green-600 text-white shadow-sm'
    : 'border-[#0d6efd] bg-[#0d6efd] text-white shadow-sm'
  const idleClass = mode === 'playerCall'
    ? 'border-[#E2E8F0] bg-white text-[#334155] hover:border-green-300 hover:bg-green-50 hover:text-green-600'
    : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#0d6efd]/35 hover:bg-[#eff6ff] hover:text-[#0d6efd]'
  const disabledClass = 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-75'

  return [
    'text-body-main inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-left font-semibold transition active:scale-[0.98]',
    candidate.disabled ? disabledClass : candidate.selected ? selectedClass : idleClass,
  ].join(' ')
}

function compactCandidateClass(candidate: AddPlayersCandidate, mode: AddPlayersMode) {
  const selectedClass = mode === 'playerCall'
    ? 'border-green-500 bg-green-50 text-green-700'
    : 'border-[#0d6efd]/35 bg-[#eff6ff] text-[#0d6efd]'
  const idleClass = 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
  const disabledClass = 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-75'

  return [
    'text-body-main inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-left font-semibold transition active:scale-[0.98]',
    candidate.disabled ? disabledClass : candidate.selected ? selectedClass : idleClass,
  ].join(' ')
}

function candidateMatches(candidate: AddPlayersCandidate, query: string, filter: string) {
  if (filter !== 'all' && !candidate.filterTags.includes(filter)) return false

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return (candidate.searchText ?? candidate.name).toLowerCase().includes(normalizedQuery)
}

const COMPACT_PREVIEW_CLICK_DELAY_MS = 300
const COMPACT_PREVIEW_DOUBLE_TAP_MS = 280
const DEFAULT_AVAILABLE_MODES: AddPlayersMode[] = ['invite', 'playerCall', 'shareLink']

export function AddPlayersPickerPanel({
  mode,
  onModeChange,
  searchValue,
  onSearchChange,
  filterValue,
  onFilterChange,
  filterOptions,
  candidates,
  onToggleCandidate,
  inviteSummary,
  playerCallSummary,
  addContactSlot,
  shareLinkRow,
  availableModes = DEFAULT_AVAILABLE_MODES,
  footerSlot,
  inviteEmptyLabel = 'No matching players, contacts, or groups.',
  playerCallEmptyLabel = 'Choose who can see this on their Match Board.',
  searchPlaceholder = 'Search player or group...',
  playerCallSummaryLabel = 'Call targets',
  playerCallHelperText = 'Only selected players and groups will see this on their Match Board.',
  expandModeButtonsOnMobile = false,
  compactPreviewRows = false,
  renderPreview,
}: Props) {
  const [previewCandidate, setPreviewCandidate] = useState<AddPlayersCandidate | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const clickTimerRef = useRef<number | null>(null)
  const lastTapRef = useRef<{ key: string; at: number } | null>(null)
  const suppressNextClickRef = useRef(false)
  const longPressOpenedRef = useRef(false)
  const filteredCandidates = candidates.filter((candidate) => candidateMatches(candidate, searchValue, filterValue))
  const visibleModes = availableModes.length > 0 ? availableModes : DEFAULT_AVAILABLE_MODES
  const modeGridClass = visibleModes.length === 1 ? 'grid-cols-1' : visibleModes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  const clearClickTimer = () => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => () => {
    clearClickTimer()
    clearLongPressTimer()
  }, [])

  useEffect(() => {
    if (visibleModes.includes(mode)) return
    onModeChange(visibleModes[0] ?? 'invite')
  }, [mode, onModeChange, visibleModes])

  const openCandidatePreview = (candidate: AddPlayersCandidate) => {
    clearClickTimer()
    setPreviewCandidate(candidate)
  }

  const startLongPressPreview = (candidate: AddPlayersCandidate) => {
    clearLongPressTimer()
    longPressOpenedRef.current = false
    longPressTimerRef.current = window.setTimeout(() => {
      longPressOpenedRef.current = true
      suppressNextClickRef.current = true
      openCandidatePreview(candidate)
    }, 550)
  }

  const handleCandidateClick = (candidate: AddPlayersCandidate) => {
    if (longPressOpenedRef.current || suppressNextClickRef.current) {
      longPressOpenedRef.current = false
      suppressNextClickRef.current = false
      return
    }

    if (!compactPreviewRows) {
      onToggleCandidate(candidate)
      return
    }

    clearClickTimer()
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      onToggleCandidate(candidate)
    }, COMPACT_PREVIEW_CLICK_DELAY_MS)
  }

  const handleCandidateTouchEnd = (candidate: AddPlayersCandidate) => {
    clearLongPressTimer()
    if (!compactPreviewRows || longPressOpenedRef.current) return

    const now = Date.now()
    const lastTap = lastTapRef.current
    if (lastTap?.key === candidate.key && now - lastTap.at <= COMPACT_PREVIEW_DOUBLE_TAP_MS) {
      lastTapRef.current = null
      suppressNextClickRef.current = true
      openCandidatePreview(candidate)
      return
    }

    lastTapRef.current = { key: candidate.key, at: now }
  }

  return (
    <div className="space-y-4">
      <div
        className={[
          `grid ${modeGridClass} gap-1 rounded-xl bg-[#EEF4FB] p-1`,
          expandModeButtonsOnMobile ? '-mx-5 sm:mx-0' : '',
        ].filter(Boolean).join(' ')}
      >
        {visibleModes.includes('invite') ? (
          <button
            type="button"
            onClick={() => onModeChange('invite')}
            className={modeButtonClass(mode === 'invite', 'invite')}
          >
            <InviteIcon />
            <span className="whitespace-nowrap">Invite</span>
          </button>
        ) : null}
        {visibleModes.includes('playerCall') ? (
          <button
            type="button"
            onClick={() => onModeChange('playerCall')}
            className={modeButtonClass(mode === 'playerCall', 'playerCall')}
          >
            <BoardIcon />
            <span className="whitespace-nowrap">Post to Board</span>
          </button>
        ) : null}
        {visibleModes.includes('shareLink') ? (
          <button
            type="button"
            onClick={() => onModeChange('shareLink')}
            className={modeButtonClass(mode === 'shareLink', 'shareLink')}
          >
            <LinkIcon />
            <span className="whitespace-nowrap">Share Link</span>
          </button>
        ) : null}
      </div>

      {mode === 'shareLink' ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-3">
          {shareLinkRow ?? (
            <p className="text-body-main font-semibold text-[#64748B]">
              Share link is not available right now.
            </p>
          )}
        </div>
      ) : null}

      {mode === 'playerCall' ? (
        <div className="space-y-2 px-1">
          {playerCallHelperText ? (
            <p className="m-0 text-body-sub font-semibold leading-relaxed text-[#64748B]">
              {playerCallHelperText}
            </p>
          ) : null}
          <div className="text-[9px] font-extrabold leading-[1.2] tracking-normal text-[#64748B]">
            {playerCallSummaryLabel}
          </div>
          {playerCallSummary}
        </div>
      ) : null}

      {mode !== 'shareLink' ? (
        <div className="w-full space-y-3">
          <div className="flex flex-row gap-2">
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-0 min-w-0 flex-[1_1_70%] rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-body-main font-semibold text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
            />
            <select
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              className="min-w-[104px] flex-[0_0_30%] rounded-lg border border-[#E2E8F0] bg-white px-2 py-2.5 text-[12px] font-bold text-[#334155] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10 sm:min-w-[140px] sm:flex-none sm:px-3 sm:text-body-main"
              aria-label="Filter players"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex max-h-[390px] flex-wrap content-start gap-2 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            {filteredCandidates.length === 0 ? (
              <div className="text-body-main w-full px-1 py-6 text-center font-semibold text-[#94A3B8]">
                {mode === 'invite' ? inviteEmptyLabel : playerCallEmptyLabel}
              </div>
            ) : (
              filteredCandidates.map((candidate) => (
                <button
                  key={candidate.key}
                  type="button"
                  onClick={() => handleCandidateClick(candidate)}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    openCandidatePreview(candidate)
                  }}
                  onTouchStart={() => startLongPressPreview(candidate)}
                  onTouchEnd={() => handleCandidateTouchEnd(candidate)}
                  onTouchCancel={clearLongPressTimer}
                  aria-pressed={candidate.selected}
                  disabled={candidate.disabled}
                  title={candidate.title}
                  className={compactPreviewRows ? compactCandidateClass(candidate, mode) : candidateClass(candidate, mode)}
                >
                  {candidate.leadingNode}
                  <span className="min-w-0">
                    <span className={`${compactPreviewRows ? 'max-w-[10rem]' : 'max-w-[12rem]'} block truncate`}>
                      {candidate.labelNode ?? candidate.name}
                    </span>
                    {!compactPreviewRows && candidate.supportingNode ? (
                      <span className="mt-0.5 block truncate text-body-sub font-semibold text-current opacity-65">
                        {candidate.supportingNode}
                      </span>
                    ) : null}
                  </span>
                  {compactPreviewRows ? (
                    <span className="shrink-0 text-[14px] font-black text-slate-300" aria-hidden="true">
                      &rsaquo;
                    </span>
                  ) : candidate.trailingNode}
                </button>
              ))
            )}
          </div>

          {mode === 'invite' && inviteSummary ? (
            <div className="px-1">
              {inviteSummary}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'invite' && addContactSlot ? (
        <div className="px-1">
          {addContactSlot}
        </div>
      ) : null}

      {mode !== 'shareLink' ? footerSlot : null}

      {previewCandidate ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close player preview"
            onClick={() => setPreviewCandidate(null)}
          />
          <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_55px_rgba(15,23,42,0.22)] sm:bottom-5 sm:left-auto sm:right-5 sm:w-[320px]">
            {renderPreview ? (
              renderPreview(previewCandidate, {
                closePreview: () => setPreviewCandidate(null),
                toggleCandidate: () => onToggleCandidate(previewCandidate),
              })
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-title-main text-slate-900">
                      {previewCandidate.previewTitle ?? previewCandidate.name}
                    </p>
                    {previewCandidate.previewSubtitle ? (
                      <p className="mt-1 text-body-sub font-semibold text-slate-500">
                        {previewCandidate.previewSubtitle}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewCandidate(null)}
                    className="text-body-sub rounded-full border border-slate-200 bg-white px-2 py-1 font-bold text-slate-500 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                {previewCandidate.previewDetails ? (
                  <div className="mt-3 text-body-sub font-semibold text-slate-600">
                    {previewCandidate.previewDetails}
                  </div>
                ) : (
                  <p className="mt-3 text-body-sub font-semibold text-slate-500">
                    Compact player preview.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
