'use client'

import { useState, useTransition } from 'react'
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
  } = item

  const isOrganizer = userId === match.organizer_id
  const isCancelled = match.status === 'cancelled'

  const [menuOpen, setMenuOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const pendingApprovals = participants.filter(
    p => p.status === 'pending' &&
         p.participant_accepted_at !== null &&
         p.org_approved_at === null,
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

  const confirmedList = participants.filter(p => p.status === 'confirmed')
  const detailsHref = `/matches/${match.id}`

  // Line 1: full datetime window in club timezone
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
        if (cta.kind === 'accept')   await acceptMatchInvite(supabase, match.id)
        if (cta.kind === 'withdraw') await userWithdraw(supabase, match.id)
        if (cta.kind === 'request')  await requestJoinMatch(supabase, match.id)
        if (cta.kind === 'approve')  await orgApproveParticipant(supabase, cta.participantId)
        router.refresh()
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Action failed')
      }
    })
  }

  // Line 3: people summary
  const nameParts = confirmedList.slice(0, 3).map(p => p.display_name)
  if (confirmedCount > 3) nameParts.push(`+${confirmedCount - 3}`)
  const peopleParts: string[] = [...nameParts]
  if (pendingCount > 0) peopleParts.push(`⏳${pendingCount}`)
  if (rosterInsight.summaryLabel) peopleParts.push(rosterInsight.summaryLabel)
  const peopleSummary = peopleParts.join(' · ')

  const rosterPeopleSummary = [...nameParts, ...(rosterInsight.summaryLabel ? [rosterInsight.summaryLabel] : [])].join(' · ')

  return (
    <div
      style={{
        border: '1px solid #d0d0d0',
        borderRadius: '6px',
        padding: '0.65rem 0.85rem',
        marginBottom: '0.5rem',
        background: match.status !== 'active' ? '#fafafa' : 'white',
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>

        {/* Left: 3-line layout */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Line 1: time window · game type · club */}
          <div
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#222',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {timeStr}
            {match.game_type && (
              <span style={{ fontWeight: 400, color: '#555', marginLeft: '0.5rem' }}>
                {match.game_type}
              </span>
            )}
            {venueName && (
              <span style={{ fontWeight: 400, color: '#999', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                {venueName}
              </span>
            )}
          </div>

          {/* Line 2: formed / forming badge */}
          <div style={{ marginTop: '0.2rem' }}>
            {isFormed ? (
              <span
                style={{
                  background: '#2d8a4e',
                  color: 'white',
                  padding: '0.05rem 0.4rem',
                  fontSize: '0.7rem',
                  borderRadius: '3px',
                  fontWeight: 600,
                }}
              >
                FORMED
              </span>
            ) : (
              <span
                style={{
                  background: '#d97706',
                  color: 'white',
                  padding: '0.05rem 0.4rem',
                  fontSize: '0.7rem',
                  borderRadius: '3px',
                }}
              >
                {confirmedCount}/{match.required_count}
              </span>
            )}
          </div>

          {!isCancelled && (
            <div style={{ marginTop: '0.25rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.05rem 0.4rem',
                  fontSize: '0.7rem',
                  borderRadius: '999px',
                  background:
                    courtState.status === 'secured'
                      ? '#dcfce7'
                      : courtState.status === 'walk_in'
                        ? '#dbeafe'
                        : '#fef3c7',
                  color:
                    courtState.status === 'secured'
                      ? '#166534'
                      : courtState.status === 'walk_in'
                        ? '#1d4ed8'
                        : '#b45309',
                }}
              >
                {courtState.badgeLabel}
              </span>
              {myParticipant?.status === 'waiting_list' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.05rem 0.4rem',
                    fontSize: '0.7rem',
                    borderRadius: '999px',
                    background: '#fef3c7',
                    color: '#b45309',
                    marginLeft: '0.35rem',
                  }}
                >
                  Waiting list
                </span>
              )}
            </div>
          )}

          {/* Line 3: people summary */}
          {rosterPeopleSummary && (
            <div
              style={{
                fontSize: '0.78rem',
                color: '#555',
                marginTop: '0.2rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {rosterPeopleSummary}
            </div>
          )}
        </div>

        {/* Right: primary CTA + Details + ⋯ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {/* Withdraw is menu-only — only show other CTAs as primary button */}
          {cta && cta.kind !== 'withdraw' && (
            <button
              onClick={handleCTA}
              disabled={isPending}
              style={{
                background: CTA_COLOR[cta.kind],
                color: 'white',
                border: 'none',
                padding: '0.3rem 0.7rem',
                fontSize: '0.8rem',
                borderRadius: '4px',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {isPending
                ? '...'
                : cta.kind === 'approve'
                  ? `${CTA_LABEL.approve} (${cta.count})`
                  : CTA_LABEL[cta.kind]}
            </button>
          )}

          <Link
            href={detailsHref}
            style={{
              padding: '0.3rem 0.6rem',
              fontSize: '0.8rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              textDecoration: 'none',
              color: '#333',
              whiteSpace: 'nowrap',
            }}
          >
            Details
          </Link>

          {/* ⋯ overflow menu — only render when there's at least one action */}
          {(isOrganizer || (myParticipant && myParticipant.status !== 'removed')) && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  background: 'none',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '0.3rem 0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ⋯
              </button>

              {menuOpen && (
                <>
                  <div
                    onClick={() => setMenuOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '110%',
                      background: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      zIndex: 10,
                      minWidth: '150px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                  >
                    {isOrganizer && (
                      <>
                        <Link
                          href={`${detailsHref}#invite`}
                          onClick={() => setMenuOpen(false)}
                          style={{ display: 'block', padding: '0.4rem 0.75rem', textDecoration: 'none', color: '#333', fontSize: '0.85rem' }}
                        >
                          Invite User
                        </Link>
                        <Link
                          href={`${detailsHref}#guest`}
                          onClick={() => setMenuOpen(false)}
                          style={{ display: 'block', padding: '0.4rem 0.75rem', textDecoration: 'none', color: '#333', fontSize: '0.85rem' }}
                        >
                          Add Contact Player
                        </Link>
                        {myParticipant && myParticipant.status !== 'removed' && (
                          <hr style={{ margin: '0.2rem 0', border: 'none', borderTop: '1px solid #eee' }} />
                        )}
                      </>
                    )}

                    {myParticipant && myParticipant.status !== 'removed' && (
                      <button
                        onClick={() => { setMenuOpen(false); handleCTA() }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.4rem 0.75rem',
                          background: 'none',
                          border: 'none',
                          color: '#c00',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                        }}
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p style={{ color: 'red', fontSize: '0.75rem', margin: '0.3rem 0 0' }}>{error}</p>
      )}
    </div>
  )
}
