'use client'

import type { ReactNode } from 'react'
import { Avatar } from './Avatar'

type DetailIcon = 'venue' | 'matches' | 'times' | 'play' | 'groups' | 'mail' | 'phone' | 'linked' | 'award'

export type DetailConnection = {
  key: string
  icon: DetailIcon
  text: string
  iconClassName?: string
}

export type DetailValue = {
  key: string
  label: string
  value: string
}

interface Props {
  open: boolean
  displayName: string
  avatarUrl?: string | null
  avatarFallback?: 'initial' | 'contact'
  statusClassName?: string | null
  headerBadges?: ReactNode
  level?: string | null
  formatLabels?: string[]
  connections?: DetailConnection[]
  playStyles?: string[]
  experience?: string | null
  preferredTimes?: string[]
  detailTitle?: string | null
  detailItems?: DetailValue[]
  extraContent?: ReactNode
  footer?: ReactNode
  onClose: () => void
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function InlineIcon({
  kind,
  className,
}: {
  kind: DetailIcon
  className?: string
}) {
  const shared = `h-4 w-4 ${className ?? 'text-slate-400'}`

  if (kind === 'venue') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <path d="M12 21s-6-5.7-6-11a6 6 0 1 1 12 0c0 5.3-6 11-6 11Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (kind === 'matches') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <path d="M7 4h10l2 3-7 13L5 7l2-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 9h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'times') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (kind === 'play') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <path d="M13 3 5 14h5l-1 7 8-11h-5l1-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }

  if (kind === 'groups') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.5" cy="8.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.5 18a4.5 4.5 0 0 1 9 0M13.5 18a3.5 3.5 0 0 1 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'mail') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m6 8 6 5 6-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (kind === 'phone') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <path d="M7.5 4.5h2l1.2 3.4-1.6 1.6a13.7 13.7 0 0 0 5.4 5.4l1.6-1.6 3.4 1.2v2a1.5 1.5 0 0 1-1.5 1.5A13.5 13.5 0 0 1 4.5 6a1.5 1.5 0 0 1 1.5-1.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }

  if (kind === 'award') {
    return (
      <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9.5 12.5 8 20l4-2.4 4 2.4-1.5-7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
      <path d="M10 14a5 5 0 1 1 4 0v5l-2-1.6L10 19v-5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function SectionTitle({
  icon,
  children,
}: {
  icon?: DetailIcon
  children: ReactNode
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
      {icon ? <InlineIcon kind={icon} className="text-slate-400" /> : null}
      {children}
    </h3>
  )
}

export function ParticipantDetailPanel({
  open,
  displayName,
  avatarUrl,
  avatarFallback = 'initial',
  statusClassName,
  headerBadges,
  level,
  formatLabels = [],
  connections = [],
  playStyles = [],
  experience,
  preferredTimes = [],
  detailTitle,
  detailItems = [],
  extraContent,
  footer,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Close player details"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30"
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-[-18px_0_40px_-24px_rgba(15,23,42,0.32)] sm:p-8">
        <div className="flex items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar
                src={avatarUrl ?? null}
                displayName={displayName}
                size="md"
                fallback={avatarFallback}
                className="h-14 w-14 border-2 border-white text-lg shadow-sm"
              />
              {statusClassName ? (
                <span
                  className={`absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-white ${statusClassName}`}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <h2 className="text-[2rem] font-black tracking-tight text-slate-900">
                {displayName}
              </h2>
              {headerBadges ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {headerBadges}
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
            aria-label="Close player details"
          >
            <XIcon />
          </button>
        </div>

        <div className="space-y-6 pb-4">
          {(level || formatLabels.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {level ? (
                <div className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5">
                  <InlineIcon kind="award" className="text-indigo-500" />
                  <span className="text-[11px] font-bold text-slate-600">{level}</span>
                </div>
              ) : null}
              {formatLabels.map((format) => (
                <div key={format} className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5">
                  <span className="text-[11px] font-bold text-indigo-600">{format}</span>
                </div>
              ))}
            </div>
          )}

          {connections.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle>Shared Connections</SectionTitle>
              <div className="space-y-3">
                {connections.map((connection) => (
                  <div key={connection.key} className="flex items-center gap-3">
                    <InlineIcon kind={connection.icon} className={connection.iconClassName ?? 'text-slate-400'} />
                    <p className="text-sm font-medium text-slate-600">{connection.text}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {playStyles.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle icon="play">Play Style</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {playStyles.map((style) => (
                  <span key={style} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                    {style}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {experience ? (
            <section className="space-y-3">
              <SectionTitle>Experience</SectionTitle>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm italic leading-relaxed text-slate-500">&quot;{experience}&quot;</p>
              </div>
            </section>
          ) : null}

          {preferredTimes.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle icon="times">Preferred Times</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {preferredTimes.map((time) => (
                  <span key={time} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                    {time}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {detailTitle && detailItems.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle>{detailTitle}</SectionTitle>
              <div className="grid gap-3">
                {detailItems.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                    <div className="mt-1 text-sm font-medium text-slate-700">{item.value}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {extraContent ? extraContent : null}

          {footer ? <div className="pt-2">{footer}</div> : null}
        </div>
      </aside>
    </div>
  )
}
