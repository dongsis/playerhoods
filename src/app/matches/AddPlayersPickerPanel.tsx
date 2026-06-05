'use client'

import type { ReactNode } from 'react'

export type AddPlayersMode = 'invite' | 'playerCall'

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

function modeButtonClass(selected: boolean, tone: 'invite' | 'playerCall') {
  const selectedClass = tone === 'playerCall'
    ? 'bg-white text-[#15803D] shadow-sm ring-1 ring-[#22C55E]/20'
    : 'bg-white text-[#0d6efd] shadow-sm ring-1 ring-[#0d6efd]/15'
  const idleClass = tone === 'playerCall'
    ? 'text-[#334155] hover:bg-white/70 hover:text-[#15803D]'
    : 'text-[#334155] hover:bg-white/70 hover:text-[#0d6efd]'

  return [
    'flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-body-sub font-black transition active:scale-[0.98]',
    selected ? selectedClass : idleClass,
  ].join(' ')
}

function candidateClass(candidate: AddPlayersCandidate, mode: AddPlayersMode) {
  const selectedClass = mode === 'playerCall'
    ? 'border-green-300 bg-green-50 text-green-700'
    : 'border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]'
  const idleClass = mode === 'playerCall'
    ? 'border-[#E2E8F0] bg-white text-[#334155] hover:border-green-300 hover:bg-green-50 hover:text-green-600'
    : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#0d6efd]/35 hover:bg-[#eff6ff] hover:text-[#0d6efd]'
  const disabledClass = 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-75'

  return [
    'text-body-main flex w-full max-w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
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
  const filteredCandidates = candidates.filter((candidate) => candidateMatches(candidate, searchValue, filterValue))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#EEF4FB] p-1">
        <button
          type="button"
          onClick={() => onModeChange('invite')}
          className={modeButtonClass(mode === 'invite', 'invite')}
        >
          <span className="text-base leading-none">+</span>
          <span className="truncate">Invite</span>
        </button>
        <button
          type="button"
          onClick={() => onModeChange('playerCall')}
          className={modeButtonClass(mode === 'playerCall', 'playerCall')}
        >
          <span className="text-base leading-none">+</span>
          <span className="truncate">Post Player Call</span>
        </button>
      </div>

      {shareLinkRow ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5">
          {shareLinkRow}
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

        <div className="grid max-h-[390px] gap-1.5 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
          {filteredCandidates.length === 0 ? (
            <div className="text-body-main w-full px-1 py-6 text-center font-semibold text-[#94A3B8]">
              {mode === 'invite' ? inviteEmptyLabel : playerCallEmptyLabel}
            </div>
          ) : (
            filteredCandidates.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                onClick={() => onToggleCandidate(candidate)}
                aria-pressed={candidate.selected}
                disabled={candidate.disabled}
                title={candidate.title}
                className={candidateClass(candidate, mode)}
              >
                {candidate.leadingNode}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {candidate.labelNode ?? candidate.name}
                  </span>
                  {candidate.supportingNode ? (
                    <span className="mt-0.5 block truncate text-body-sub font-semibold text-current opacity-65">
                      {candidate.supportingNode}
                    </span>
                  ) : null}
                </span>
                {candidate.trailingNode}
                <span
                  className={[
                    'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition',
                    candidate.selected
                      ? mode === 'playerCall'
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-[#0d6efd] bg-[#0d6efd] text-white'
                      : 'border-[#E2E8F0] bg-white text-transparent',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  &#10003;
                </span>
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

      {mode === 'invite' && addContactSlot ? (
        <div className="px-1">
          {addContactSlot}
        </div>
      ) : null}

      {footerSlot}
    </div>
  )
}
