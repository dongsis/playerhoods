'use client'

import type { ReactNode } from 'react'
import { useRef, useState } from 'react'

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
  footerSlot?: ReactNode
  inviteEmptyLabel?: ReactNode
  playerCallEmptyLabel?: ReactNode
  searchPlaceholder?: string
  playerCallSummaryLabel?: string
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
    'flex h-10 w-full min-w-0 items-center justify-center rounded-lg px-1 text-center text-[11px] font-black leading-tight transition active:scale-[0.98] sm:px-2 sm:text-body-sub',
    selected ? selectedClass : idleClass,
  ].join(' ')
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

function candidateMatches(candidate: AddPlayersCandidate, query: string, filter: string) {
  if (filter !== 'all' && !candidate.filterTags.includes(filter)) return false

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return (candidate.searchText ?? candidate.name).toLowerCase().includes(normalizedQuery)
}

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
  footerSlot,
  inviteEmptyLabel = 'No matching players, contacts, or groups.',
  playerCallEmptyLabel = 'No matching players or groups.',
  searchPlaceholder = 'Search player or group...',
  playerCallSummaryLabel = 'Call targets',
}: Props) {
  const [previewCandidate, setPreviewCandidate] = useState<AddPlayersCandidate | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressOpenedRef = useRef(false)
  const filteredCandidates = candidates.filter((candidate) => candidateMatches(candidate, searchValue, filterValue))

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const startLongPressPreview = (candidate: AddPlayersCandidate) => {
    clearLongPressTimer()
    longPressOpenedRef.current = false
    longPressTimerRef.current = window.setTimeout(() => {
      longPressOpenedRef.current = true
      setPreviewCandidate(candidate)
    }, 550)
  }

  const handleCandidateClick = (candidate: AddPlayersCandidate) => {
    if (longPressOpenedRef.current) {
      longPressOpenedRef.current = false
      return
    }
    onToggleCandidate(candidate)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#EEF4FB] p-1">
        <button
          type="button"
          onClick={() => onModeChange('invite')}
          className={modeButtonClass(mode === 'invite', 'invite')}
        >
          <span className="whitespace-nowrap">Invite</span>
        </button>
        <button
          type="button"
          onClick={() => onModeChange('playerCall')}
          className={modeButtonClass(mode === 'playerCall', 'playerCall')}
        >
          <span className="whitespace-nowrap">Post to Board</span>
        </button>
        <button
          type="button"
          onClick={() => onModeChange('shareLink')}
          className={modeButtonClass(mode === 'shareLink', 'shareLink')}
        >
          <span className="whitespace-nowrap">Share Link</span>
        </button>
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
          <div className="text-[9px] font-extrabold leading-[1.2] tracking-normal text-[#64748B]">
            {playerCallSummaryLabel}
          </div>
          {playerCallSummary}
        </div>
      ) : null}

      {mode !== 'shareLink' ? (
        <div className="w-full space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-body-main font-semibold text-[#1E293B] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
            />
            <select
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-body-main font-bold text-[#334155] outline-none transition focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10 sm:w-[140px]"
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
                    setPreviewCandidate(candidate)
                  }}
                  onTouchStart={() => startLongPressPreview(candidate)}
                  onTouchEnd={clearLongPressTimer}
                  onTouchCancel={clearLongPressTimer}
                  aria-pressed={candidate.selected}
                  disabled={candidate.disabled}
                  title={candidate.title}
                  className={candidateClass(candidate, mode)}
                >
                  {candidate.leadingNode}
                  <span className="min-w-0">
                    <span className="block max-w-[12rem] truncate">
                      {candidate.labelNode ?? candidate.name}
                    </span>
                    {candidate.supportingNode ? (
                      <span className="mt-0.5 block truncate text-body-sub font-semibold text-current opacity-65">
                        {candidate.supportingNode}
                      </span>
                    ) : null}
                  </span>
                  {candidate.trailingNode}
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
          </div>
        </>
      ) : null}
    </div>
  )
}
