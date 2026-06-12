'use client'

import type { ReactNode } from 'react'

type AddPlayersMethodPanelProps = {
  title?: string
  className?: string
  linkDisabled?: boolean
  linkBusy?: boolean
  linkActionLabel?: string
  linkDescription?: string
  linkFeedback?: ReactNode
  linkError?: string | null
  onCopyLink?: () => void
  savedPlayersExpanded: boolean
  savedPlayersDescription?: string
  savedPlayersPanel?: ReactNode
  onToggleSavedPlayers: () => void
}

export function AddPlayersMethodPanel({
  title,
  className,
  linkDisabled = false,
  linkBusy = false,
  linkActionLabel,
  linkDescription = 'Share by text, WhatsApp, WeChat, or other chats.',
  linkFeedback,
  linkError,
  onCopyLink,
  savedPlayersExpanded,
  savedPlayersDescription = 'Choose saved players and send invites by SMS or email.',
  savedPlayersPanel,
  onToggleSavedPlayers,
}: AddPlayersMethodPanelProps) {
  const copyDisabled = linkDisabled || linkBusy || !onCopyLink

  return (
    <div className={['rounded-[22px] border border-[#D7E3F4] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)] md:p-4', className ?? ''].join(' ')}>
      {title ? (
        <p className="m-0 px-1 pb-3 text-[1rem] font-black text-slate-900">{title}</p>
      ) : null}
      <div className="space-y-3">
        <div>
          <button
            type="button"
            onClick={onCopyLink}
            disabled={copyDisabled}
            className={[
              'group flex min-h-[76px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-[#0F172A] transition active:scale-[0.99]',
              copyDisabled
                ? 'cursor-not-allowed border-[#D7E3F4] bg-[#F8FAFC] opacity-70'
                : 'border-[#D7E3F4] bg-white hover:border-[#B7D7FF] hover:bg-[#F8FBFF]',
            ].join(' ')}
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-black leading-5">Invite by Link</span>
              <span className="mt-1 block text-[12px] font-semibold leading-relaxed text-[#64748B] group-hover:text-[#475569]">
                {linkDescription}
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-[#B7D7FF] bg-[#EFF6FF] px-3 py-1 text-[12px] font-black text-[#1D4ED8]">
              {linkBusy ? 'Preparing...' : (linkActionLabel ?? 'Copy Link')}
            </span>
          </button>
          {linkFeedback}
          {linkError ? (
            <p className="mt-2 px-1 text-[11px] font-semibold leading-snug text-red-600">
              {linkError}
            </p>
          ) : null}
        </div>

        <div
          className={[
            'overflow-hidden rounded-2xl border transition',
            savedPlayersExpanded
              ? 'border-[#B7D7FF] bg-[#F8FBFF]'
              : 'border-[#D7E3F4] bg-white hover:border-[#B7D7FF] hover:bg-[#F8FBFF]',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={onToggleSavedPlayers}
            className="group flex min-h-[76px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-[#0F172A] transition active:scale-[0.99]"
            aria-expanded={savedPlayersExpanded}
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-black leading-5">Invite Saved Players</span>
              <span className="mt-1 block text-[12px] font-semibold leading-relaxed text-[#64748B] group-hover:text-[#475569]">
                {savedPlayersDescription}
              </span>
            </span>
            <span
              className={`shrink-0 text-[18px] font-black text-[#94A3B8] transition-transform ${savedPlayersExpanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            >
              {'>'}
            </span>
          </button>
          {savedPlayersExpanded && savedPlayersPanel ? (
            <div className="border-t border-[#DCE9FA] px-2 pb-2 md:px-3 md:pb-3">
              {savedPlayersPanel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
