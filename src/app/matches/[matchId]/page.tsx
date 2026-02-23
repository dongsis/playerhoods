import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMatchDetailData, getMatchCourts, isCallerInMatchScope, getOrganizerGroupUsers, getNominatorGroupUsers, getCourts, updateMatchDetails, setMatchSingleCourt } from '@/lib/api/matches'
import { formatMatchTime } from '@/lib/utils/format-time'
import { MatchActions } from './MatchActions'
import { ParticipantGroups } from './ParticipantGroups'
import { ActivityFeed } from './ActivityFeed'
import { InviteUserForm } from './InviteUserForm'
import { NominateUserForm } from './NominateUserForm'
import { AddGuestForm } from './AddGuestForm'
import { MatchEditForm } from './MatchEditForm'

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

  const { match, clubTimezone, clubName, participants, myParticipant, isOrganizer, confirmedCount, pendingCount, activities, organizerName } = detail

  // Active non-removed participant user IDs — exclude from invite/nominate dropdowns
  const activeParticipantIds = participants
    .filter(p => p.status !== 'removed' && p.user_id)
    .map(p => p.user_id as string)

  // v1.5 permission gates
  // Nominate: participant-only (active = not removed), not organizer, flag must be on
  const canNominate =
    !isOrganizer &&
    myParticipant !== null &&
    myParticipant.removed_at === null &&
    match.can_participants_invite_users === true

  const [matchCourts, inScope, scopeUsers, clubCourts] = await Promise.all([
    getMatchCourts(supabase, matchId).catch(() => []),
    user ? isCallerInMatchScope(supabase, matchId).catch(() => false) : false,
    // Organizer gets invite scope; participant (canNominate) gets nominate scope.
    // Both use invitation_scope_group_ids — same underlying list, semantically distinct.
    match.status === 'active' && isOrganizer
      ? getOrganizerGroupUsers(supabase, match, activeParticipantIds).catch(() => [])
      : match.status === 'active' && canNominate
        ? getNominatorGroupUsers(supabase, match, activeParticipantIds).catch(() => [])
        : Promise.resolve([]),
    match.club_id ? getCourts(supabase, match.club_id).catch(() => []) : Promise.resolve([]),
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

      {/* ── 4a. Nominate (participant-only, when flag enabled) ───────────── */}
      {/* Organizer never sees Nominate. Participant sees it only when:        */}
      {/*   - active (removed_at IS NULL) AND                                  */}
      {/*   - match.can_participants_invite_users = true                        */}
      {/* Nominate flow: nominee Accepts → organizer Approves → confirmed      */}
      {match.status === 'active' && canNominate && (
        <section style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Nominate a Player</h3>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.75rem' }}>
            They must accept, then the organizer approves to confirm.
          </p>
          <NominateUserForm matchId={matchId} scopeUsers={scopeUsers} />
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
            <InviteUserForm matchId={matchId} scopeUsers={scopeUsers} />
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
