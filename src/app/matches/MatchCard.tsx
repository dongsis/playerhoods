'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  acceptMatchInvite,
  userWithdraw,
  requestJoinMatch,
  orgApproveParticipant,
} from '@/lib/api/matches'
import type { MatchListItem } from '@/lib/api/matches'
import { computeCardCTA, CTA_LABEL, CTA_COLOR } from '@/lib/utils/match-cta'
import { formatTimeWindow } from '@/lib/format-time'

interface Props {
  item: MatchListItem
  userId: string | null
}

function StatusBadge({
  label,
  tone,
}: {
  label: string
  tone: 'green' | 'amber' | 'blue' | 'red' | 'slate'
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-[#ECFDF5] text-[#22C55E] ring-[#DCFCE7]'
      : tone === 'blue'
        ? 'bg-[#EFF6FF] text-[#3B82F6] ring-[#DBEAFE]'
        : tone === 'red'
          ? 'bg-[#FEF2F2] text-[#EF4444] ring-[#FECACA]'
          : tone === 'slate'
            ? 'bg-[#F8FAFC] text-[#64748B] ring-[#E2E8F0]'
            : 'bg-[#FFF7ED] text-[#F97316] ring-[#FFEDD5]'

  return (
    <span
      className={[
        'text-label inline-flex items-center rounded-full px-2.5 py-1 ring-1',
        toneClass,
      ].join(' ')}
    >
      {label}
    </span>
  )
}

export function MatchCard({ item, userId }: Props) {
  const {
    match,
    venueTimezone,
    venueName,
    courtState,
    confirmedCount,
    pendingCount,
    isFormed,
    participants,
    myParticipant,
    rosterInsight,
    sportName,
  } = item

  const isOrganizer = userId === match.organizer_id
  const isCancelled = match.status === 'cancelled'

  const [menuOpen, setMenuOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const pendingApprovals = participants.filter(
    (p) =>
      p.status === 'pending'
      && p.participant_accepted_at !== null
      && p.org_approved_at === null,
  )

  const cta = computeCardCTA({
    matchStatus: match.status,
    hasScope:
      (match.invitation_scope_group_ids ?? []).length > 0
      || (match.invitation_scope_user_ids ?? []).length > 0,
    myParticipant,
    isOrganizer,
    pendingApprovals,
  })

  const confirmedList = participants
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => {
      const aIsHost = a.user_id === match.organizer_id
      const bIsHost = b.user_id === match.organizer_id
      if (aIsHost === bIsHost) return 0
      return aIsHost ? -1 : 1
    })
  const detailsHref = `/matches/${match.id}`

  const timeStr = formatTimeWindow(
    match.start_at_utc,
    match.match_date,
    match.start_time,
    match.duration_minutes,
    venueTimezone,
  )

  const handleCTA = () => {
    setError(null)
    startTransition(async () => {
      try {
        if (!cta) return
        if (cta.kind === 'accept') await acceptMatchInvite(supabase, match.id)
        if (cta.kind === 'withdraw') await userWithdraw(supabase, match.id)
        if (cta.kind === 'request') await requestJoinMatch(supabase, match.id)
        if (cta.kind === 'approve') await orgApproveParticipant(supabase, cta.participantId)
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Action failed')
      }
    })
  }

  const visiblePlayers = confirmedList.slice(0, 4)
  const extraPlayers = confirmedCount > visiblePlayers.length ? confirmedCount - visiblePlayers.length : 0

  const summaryMeta = useMemo(() => {
    const parts: string[] = []
    if (pendingCount > 0) parts.push(`${pendingCount} pending`)
    if (rosterInsight.summaryLabel) parts.push(rosterInsight.summaryLabel.replace(/Â·/g, '·'))
    return parts
  }, [pendingCount, rosterInsight.summaryLabel])

  const primaryBadge = isCancelled
    ? <StatusBadge label="Match cancelled" tone="red" />
    : isFormed
      ? <StatusBadge label="Formed" tone="green" />
      : <StatusBadge label={`${confirmedCount}/${match.required_count}`} tone="amber" />

  const courtTone =
    courtState.status === 'secured'
      ? 'green'
      : courtState.status === 'walk_in'
        ? 'blue'
        : 'amber'

  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {sportName ? (
              <span className="text-label text-[#94A3B8]">
                {sportName}
              </span>
            ) : null}
            {match.game_type ? (
              <span className="text-label rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[#64748B]">
                {match.game_type}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-title-main tracking-tight text-[#1E293B]">
              {timeStr || 'No time set'}
            </h3>
            {venueName ? <p className="text-body-sub text-[#64748B]">{venueName}</p> : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {primaryBadge}
            {!isCancelled ? <StatusBadge label={courtState.badgeLabel} tone={courtTone} /> : null}
            {myParticipant?.status === 'waiting_list' ? (
              <StatusBadge label="Waiting list" tone="slate" />
            ) : null}
          </div>

          {visiblePlayers.length > 0 ? (
            <div className="mt-4">
              <div className="text-title-main flex flex-wrap items-center gap-x-2 gap-y-1 text-[#1E293B]">
              {visiblePlayers.map((participant) => (
                <span key={participant.id} className="inline-flex min-w-0 items-center gap-1">
                  <span
                    className={
                      participant.user_id === match.organizer_id
                        ? 'truncate font-semibold text-[#0F172A]'
                        : 'truncate'
                    }
                  >
                    {participant.display_name}
                  </span>
                  {participant.user_id === match.organizer_id ? (
                    <span className="text-label rounded-full bg-[#FFF1EB] px-1.5 py-0.5 text-[#C25E46]">
                      Host
                    </span>
                  ) : null}
                  {!participant.user_id ? (
                    <span className="rounded-full bg-[#F8FAFC] px-1 py-[2px] text-[7px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                      Contact
                    </span>
                  ) : null}
                </span>
              ))}
              {extraPlayers > 0 ? (
                <span className="text-body-sub text-slate-500">
                  +{extraPlayers}
                </span>
              ) : null}
              </div>
            </div>
          ) : (
            <p className="text-body-main mt-4 text-[#94A3B8]">No confirmed players yet.</p>
          )}

          {summaryMeta.length > 0 ? (
            <div className="text-body-sub mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[#64748B]">
              {summaryMeta.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-start gap-2">
          {cta && cta.kind !== 'withdraw' ? (
            <button
              onClick={handleCTA}
              disabled={isPending}
              className="text-body-main rounded-full px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor:
                  cta.kind === 'accept' || cta.kind === 'approve'
                    ? '#C25E46'
                    : CTA_COLOR[cta.kind],
              }}
            >
              {isPending
                ? 'Working...'
                : cta.kind === 'approve'
                  ? `${CTA_LABEL.approve} (${cta.count})`
                  : CTA_LABEL[cta.kind]}
            </button>
          ) : null}

          <Link
            href={detailsHref}
            className="text-body-main rounded-full border border-[#E2E8F0] bg-white px-4 py-2 font-semibold text-[#1E293B] transition hover:border-[#C25E46]/30 hover:bg-[#FFF8F5]"
          >
            Details
          </Link>

          {(isOrganizer || (myParticipant && myParticipant.status !== 'removed')) ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#94A3B8] transition hover:border-[#CBD5E1] hover:text-[#1E293B]"
              >
                <span className="text-base leading-none">···</span>
              </button>

              {menuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[180px] overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white p-1 shadow-[0_20px_44px_-28px_rgba(15,23,42,0.18)]">
                    {isOrganizer ? (
                      <>
                        <Link
                          href={`${detailsHref}#invite`}
                          onClick={() => setMenuOpen(false)}
                          className="text-body-main block rounded-2xl px-3 py-2 text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#1E293B]"
                        >
                          Invite user
                        </Link>
                        <Link
                          href={`${detailsHref}#guest`}
                          onClick={() => setMenuOpen(false)}
                          className="text-body-main block rounded-2xl px-3 py-2 text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#1E293B]"
                        >
                          Add contact player
                        </Link>
                        {myParticipant && myParticipant.status !== 'removed' ? (
                          <div className="my-1 border-t border-[#F1F5F9]" />
                        ) : null}
                      </>
                    ) : null}

                    {myParticipant && myParticipant.status !== 'removed' ? (
                      <button
                        onClick={() => {
                          setMenuOpen(false)
                          handleCTA()
                        }}
                        className="text-body-main block w-full rounded-2xl px-3 py-2 text-left text-[#EF4444] transition hover:bg-[#FEF2F2]"
                      >
                        Withdraw
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-body-sub mt-3 text-[#EF4444]">{error}</p> : null}
    </div>
  )
}
