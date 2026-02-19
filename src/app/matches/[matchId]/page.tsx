import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchDetailData, getMatchCourts, isUserInMatchScope, getMatchScopeUsers } from '@/lib/api/matches'
import { formatMatchTime } from '@/lib/utils/format-time'
import { MatchActions } from './MatchActions'
import { ParticipantGroups } from './ParticipantGroups'
import { ActivityFeed } from './ActivityFeed'
import { InviteUserForm } from './InviteUserForm'
import { NominateUserForm } from './NominateUserForm'
import { AddGuestForm } from './AddGuestForm'

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

  const { match, clubTimezone, clubName, participants, myParticipant, isOrganizer, confirmedCount, activities, organizerName } = detail

  // Active non-removed participant user IDs — exclude from invite/nominate dropdowns
  const activeParticipantIds = participants
    .filter(p => p.status !== 'removed' && p.user_id)
    .map(p => p.user_id as string)

  const [matchCourts, inScope, scopeUsers] = await Promise.all([
    getMatchCourts(supabase, matchId).catch(() => []),
    user ? isUserInMatchScope(supabase, matchId, user.id).catch(() => false) : false,
    (match.status === 'active' && (isOrganizer || myParticipant?.status === 'confirmed'))
      ? getMatchScopeUsers(supabase, match, activeParticipantIds).catch(() => [])
      : Promise.resolve([]),
  ])

  const isConfirmed  = myParticipant?.status === 'confirmed'
  const canInvite    = isOrganizer || (isConfirmed && match.can_participants_invite_users)
  const canAddGuests = isOrganizer || (isConfirmed && match.can_participants_add_guests)
  const canManage    = isOrganizer || (isConfirmed && match.can_participants_manage_participants)

  const time = formatMatchTime(match.start_at_utc, match.match_date, match.start_time, clubTimezone)
  const need = Math.max(match.required_count - confirmedCount, 0)

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem' }}>
      <nav style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        <Link href="/matches">← Matches</Link>
      </nav>

      {/* Header */}
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

      {/* Self-actions (accept/withdraw/request) */}
      {match.status === 'active' && (
        <section style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #e0e0e0', borderRadius: '6px' }}>
          <MatchActions
            matchId={matchId}
            isOrganizer={isOrganizer}
            myParticipation={myParticipant}
            inScope={inScope}
          />
        </section>
      )}

      {/* Participant groups */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Participants</h2>
        <ParticipantGroups
          matchId={matchId}
          matchStatus={match.status}
          participants={participants}
          isOrganizer={isOrganizer}
          canManage={canManage}
          myUserId={user?.id ?? null}
        />
      </section>

      {/* Add participants (organizer/allowed) */}
      {match.status === 'active' && (canInvite || canAddGuests) && (
        <section id="invite" style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem' }}>Add Participants</h3>

          {isOrganizer && (
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Invite User</h4>
              <InviteUserForm matchId={matchId} scopeUsers={scopeUsers} />
            </div>
          )}

          {canInvite && !isOrganizer && (
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Nominate User</h4>
              <NominateUserForm matchId={matchId} scopeUsers={scopeUsers} />
            </div>
          )}

          {canAddGuests && (
            <div id="guest">
              <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Add Nonregistered Player</h4>
              <AddGuestForm matchId={matchId} isOrganizer={isOrganizer} />
            </div>
          )}
        </section>
      )}

      {/* Activity feed */}
      <section>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Activity</h2>
        <ActivityFeed activities={activities} />
      </section>
    </div>
  )
}
