import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMatchDetailData, getMatchCourts, isCallerInMatchScope, getInviteTargets, getNominateTargets, getDelegateConfirmTargets, getCourts, updateMatchDetails, setMatchSingleCourt, type ScopeUser } from '@/lib/api/matches'
import { formatMatchTime } from '@/lib/utils/format-time'
import { MatchActions } from './MatchActions'
import { ParticipantGroups } from './ParticipantGroups'
import { ActivityFeed } from './ActivityFeed'
import { InviteUserForm } from './InviteUserForm'
import { NominateUserForm } from './NominateUserForm'
import { AddGuestForm } from './AddGuestForm'
import { MatchEditForm } from './MatchEditForm'
import { ManualConfirmUserForm } from './ManualConfirmUserForm'
import { DelegateConfirmUserForm } from './DelegateConfirmUserForm'

interface Props {
  params: Promise<{ matchId: string }>
}

export default async function MatchDetailPage({ params }: Props) {
  const { matchId } = await params
  const user = await getUser()
  const supabase = await createSupabaseServerClient()

  let detail
  try {
    detail = await getMatchDetailData(supabase, matchId, user?.id ?? null)
  } catch {
    notFound()
  }

  const { match, clubTimezone, clubName, participants, myParticipant, isOrganizer, confirmedCount, pendingCount, activities, organizerName, scopeGroups } = detail

  // v1.6.1: MatchAssociated = ANY row in match_participants (matches DB helper).
  // Even removed participants are "associated" — they had prior interaction with this match.
  const isMatchAssociated = myParticipant !== null

  // Fetch inScope, courts, and role-specific roster targets in parallel
  const [matchCourts, inScope, clubCourts] = await Promise.all([
    getMatchCourts(supabase, matchId).catch((e: unknown) => { console.error('[MatchDetail] getMatchCourts:', e); return [] }),
    user ? isCallerInMatchScope(supabase, matchId).catch((e: unknown) => { console.error('[MatchDetail] isCallerInMatchScope:', e); return false }) : false,
    match.club_id ? getCourts(supabase, match.club_id).catch((e: unknown) => { console.error('[MatchDetail] getCourts:', e); return [] }) : Promise.resolve([]),
  ])

  // v1.6.1: canNominate requires can_participants_invite_users
  const canNominate = !isOrganizer && match.can_participants_invite_users && (inScope || isMatchAssociated)
  // v1.6.1: canDelegateConfirm — no can_participants_invite_users requirement
  const canDelegateConfirm = !isOrganizer && (inScope || isMatchAssociated)

  // v1.6.1: 3 parallel roster fetches (each RPC enforces its own caller gate)
  const [inviteTargets, nominateTargets, delegateConfirmTargets] = await Promise.all([
    match.status === 'active' && isOrganizer
      ? getInviteTargets(supabase, matchId).catch((e: unknown) => { console.error('[MatchDetail] inviteTargets:', e); return [] as ScopeUser[] })
      : Promise.resolve([] as ScopeUser[]),
    match.status === 'active' && canNominate
      ? getNominateTargets(supabase, matchId).catch((e: unknown) => { console.error('[MatchDetail] nominateTargets:', e); return [] as ScopeUser[] })
      : Promise.resolve([] as ScopeUser[]),
    match.status === 'active' && canDelegateConfirm
      ? getDelegateConfirmTargets(supabase, matchId).catch((e: unknown) => { console.error('[MatchDetail] delegateConfirmTargets:', e); return [] as ScopeUser[] })
      : Promise.resolve([] as ScopeUser[]),
  ])

  // ── Organizer-only server actions ──────────────────────────────────────────
  async function handleUpdateMatchDetails(data: {
    match_date: string | null
    start_time: string | null
    duration_minutes: number | null
  }) {
    'use server'
    const srv = await createSupabaseServerClient()
    await updateMatchDetails(srv, matchId, data)
    revalidatePath(`/matches/${matchId}`)
  }

  async function handleSetCourt(courtLabel: string | null) {
    'use server'
    const srv = await createSupabaseServerClient()
    const u = await getUser()
    if (!u) throw new Error('not_authenticated')
    await setMatchSingleCourt(srv, matchId, courtLabel, u.id)
    revalidatePath(`/matches/${matchId}`)
  }

  const time = formatMatchTime(match.start_at_utc, match.match_date, match.start_time, clubTimezone)
  const need = Math.max(match.required_count - confirmedCount, 0)

  // v1.5: non-organizer clients only receive confirmed participants.
  // Pending names are private (organizer-only). Removed are organizer-only.
  const participantsForDisplay = isOrganizer
    ? participants
    : participants.filter(p => p.status === 'confirmed')

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem' }}>
      <nav style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        <Link href="/dashboard">← Matches</Link>
      </nav>

      {/* ── 1. Header: Match Summary ─────────────────────────────────────── */}
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.4rem', fontSize: '1.3rem' }}>
          {match.game_type || 'Match'}
          {' '}
          {confirmedCount >= match.required_count ? (
            <span style={{ background: '#2d8a4e', color: 'white', padding: '0.1rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', verticalAlign: 'middle' }}>
              FORMED
            </span>
          ) : (
            <span style={{ background: '#d97706', color: 'white', padding: '0.1rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', verticalAlign: 'middle' }}>
              {confirmedCount}/{match.required_count}
              {need > 0 && ` · need ${need}`}
            </span>
          )}
        </h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.85rem', color: '#555' }}>
          <span>{time}</span>
          {clubName && <span>{clubName}</span>}
          {matchCourts.length > 0 && (
            <span>Court: {matchCourts.map(c => c.court_label).join(', ')}</span>
          )}
          {match.duration_minutes && <span>{match.duration_minutes}min</span>}
          <span>Org: <strong style={{ color: '#333' }}>{organizerName}</strong></span>
        </div>

        {scopeGroups.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#888' }}>Scope:</span>
            {scopeGroups.map(g => (
              <span key={g.id} style={{ background: '#e8f0fe', color: '#1a56db', padding: '0.1rem 0.5rem', borderRadius: '10px' }}>
                {g.name}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Organizer: edit date / time / court */}
      {isOrganizer && match.status === 'active' && (
        <div style={{ marginBottom: '1rem' }}>
          <MatchEditForm
            matchDate={match.match_date}
            startTime={match.start_time}
            durationMinutes={match.duration_minutes}
            currentCourts={matchCourts}
            clubCourts={clubCourts}
            onSave={handleUpdateMatchDetails}
            onSetCourt={handleSetCourt}
          />
        </div>
      )}

      {/* ── 2. CTA: My Actions (non-organizer only) ──────────────────────── */}
      {match.status === 'active' && !isOrganizer && (
        <section style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #e0e0e0', borderRadius: '6px' }}>
          <MatchActions
            matchId={matchId}
            isOrganizer={isOrganizer}
            myParticipation={myParticipant}
            inScope={inScope}
          />
        </section>
      )}

      {/* ── 3. Participants Overview ─────────────────────────────────────── */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Participants</h2>
        <ParticipantGroups
          matchId={matchId}
          matchStatus={match.status}
          participants={participantsForDisplay}
          isOrganizer={isOrganizer}
          pendingCount={pendingCount}
          myUserId={user?.id ?? null}
        />
      </section>

      {/* ── 4a. Nominate (non-org with shared groups, not organizer) ────── */}
      {/* Nominate flow: nominee Accepts → organizer Approves → confirmed      */}
      {match.status === 'active' && canNominate && nominateTargets.length > 0 && (
        <section style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Nominate a Player</h3>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.75rem' }}>
            They must accept, then the organizer approves to confirm.
          </p>
          <NominateUserForm matchId={matchId} scopeUsers={nominateTargets} />
        </section>
      )}

      {/* ── 4a2. Delegate Confirm (non-org with shared groups) ───────────── */}
      {/* Delegate flow: participant confirms on behalf → pending ORG approval  */}
      {match.status === 'active' && canDelegateConfirm && delegateConfirmTargets.length > 0 && (
        <section style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Confirm for a Friend</h3>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.75rem' }}>
            Confirms on their behalf. Organizer approval still required.
          </p>
          <DelegateConfirmUserForm matchId={matchId} scopeUsers={delegateConfirmTargets} />
        </section>
      )}

      {/* ── 4b. Organizer Admin ──────────────────────────────────────────── */}
      {/* Organizer uses Invite (pre-approves; invitee just clicks Accept).    */}
      {/* Organizer never uses Nominate — that is participant-only.            */}
      {match.status === 'active' && isOrganizer && (
        <section id="organizer-admin" style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem' }}>Organizer Admin</h3>

          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Invite User</h4>
            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem' }}>
              Pre-approves the user — they only need to Accept to confirm.
            </p>
            <InviteUserForm matchId={matchId} scopeUsers={inviteTargets} />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Manual Confirm</h4>
            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem' }}>
              Directly confirms participation — no Accept step required.
            </p>
            <ManualConfirmUserForm matchId={matchId} scopeUsers={inviteTargets} />
          </div>

          <div id="guest">
            <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Add Nonregistered Player</h4>
            <AddGuestForm matchId={matchId} isOrganizer={true} />
          </div>
        </section>
      )}

      {/* ── 5. Audit Timeline ────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Activity</h2>
        <ActivityFeed activities={activities} />
      </section>
    </div>
  )
}
