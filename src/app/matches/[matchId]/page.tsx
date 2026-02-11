import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatch, getMatchFormed, getMatchParticipants, getMyParticipation, isUserInMatchScope } from '@/lib/api/matches'
import { MatchActions } from './MatchActions'
import { ParticipantsList } from './ParticipantsList'
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

  let match
  try {
    match = await getMatch(supabase, matchId)
  } catch (e) {
    console.error('getMatch error for matchId:', matchId, e)
    notFound()
  }

  const [formed, participants, myParticipation, inScope] = await Promise.all([
    getMatchFormed(supabase, matchId).catch((e) => { console.error('getMatchFormed error:', e); return null }),
    getMatchParticipants(supabase, matchId).catch((e) => { console.error('getMatchParticipants error:', e); return [] }),
    user ? getMyParticipation(supabase, matchId, user.id).catch((e) => { console.error('getMyParticipation error:', e); return null }) : null,
    user ? isUserInMatchScope(supabase, matchId, user.id).catch((e) => { console.error('isUserInMatchScope error:', e); return false }) : false,
  ])

  const isOrganizer = user?.id === match.organizer_id
  const myStatus = myParticipation?.status
  const isConfirmed = myStatus === 'confirmed'
  const isPending = myStatus === 'pending'

  // Check if user can perform actions
  const canInvite = isOrganizer || (isConfirmed && match.can_participants_invite_users)
  const canAddGuests = isOrganizer || (isConfirmed && match.can_participants_add_guests)
  const canManage = isOrganizer || (isConfirmed && match.can_participants_manage_participants)

  // Group participants by status
  const pendingParticipants = participants.filter((p) => p.status === 'pending')
  const confirmedParticipants = participants.filter((p) => p.status === 'confirmed')
  const removedParticipants = participants.filter((p) => p.status === 'removed')

  return (
    <div>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/matches">Back to Matches</Link>
      </nav>

      <header style={{ marginBottom: '2rem' }}>
        <h1>{match.game_type || 'Match'}</h1>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span><strong>Status:</strong> {match.status}</span>
          <span><strong>Date:</strong> {match.match_date || 'TBD'}</span>
          {match.start_time && <span><strong>Time:</strong> {match.start_time}</span>}
        </div>
      </header>

      {/* Formation status */}
      <section style={{
        marginBottom: '2rem',
        padding: '1rem',
        border: formed?.is_formed ? '2px solid green' : '1px solid #ccc',
        background: formed?.is_formed ? '#e6ffe6' : 'transparent'
      }}>
        <h2>Formation Status</h2>
        <p>
          <strong>{formed?.confirmed_count || 0}</strong> / {match.required_count} confirmed
          {formed?.is_formed && <strong style={{ color: 'green', marginLeft: '1rem' }}>FORMED</strong>}
        </p>
        {match.formed_at && (
          <small>Formed at: {new Date(match.formed_at).toLocaleString()}</small>
        )}
      </section>

      {/* User's participation status and actions */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h3>Your Status</h3>
        {isOrganizer && <p><strong>You are the organizer</strong></p>}
        {!myParticipation && !isOrganizer && <p>Not participating</p>}
        {isPending && <p>Status: <strong style={{ color: 'orange' }}>Pending</strong></p>}
        {isConfirmed && <p>Status: <strong style={{ color: 'green' }}>Confirmed</strong></p>}
        {myStatus === 'removed' && <p>Status: <strong style={{ color: 'red' }}>Removed</strong></p>}

        {match.status === 'active' && (
          <MatchActions
            matchId={matchId}
            isOrganizer={isOrganizer}
            myParticipation={myParticipation}
            inScope={inScope}
          />
        )}
      </section>

      {/* Participants list with management */}
      <section style={{ marginBottom: '2rem' }}>
        <h2>Participants</h2>

        <ParticipantsList
          title="Confirmed"
          matchId={matchId}
          participants={confirmedParticipants}
          canManage={canManage}
          isOrganizer={isOrganizer}
          matchStatus={match.status}
          color="green"
        />

        <ParticipantsList
          title="Pending"
          matchId={matchId}
          participants={pendingParticipants}
          canManage={canManage}
          isOrganizer={isOrganizer}
          matchStatus={match.status}
          color="orange"
          showApproveButton
        />

        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer' }}>Removed ({removedParticipants.length})</summary>
          <ParticipantsList
            title=""
            matchId={matchId}
            participants={removedParticipants}
            canManage={false}
            isOrganizer={isOrganizer}
            matchStatus={match.status}
            color="gray"
          />
        </details>
      </section>

      {/* Invite/Nominate/Add forms (only for active matches) */}
      {match.status === 'active' && (canInvite || canAddGuests) && (
        <section style={{ padding: '1rem', border: '1px solid #ccc' }}>
          <h3>Add Participants</h3>

          {/* v1.3: Invite (ORG only) */}
          {isOrganizer && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4>Invite User</h4>
              <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                Invite a user directly. Not restricted by scope groups.
              </p>
              <InviteUserForm matchId={matchId} />
            </div>
          )}

          {/* v1.3: Nominate (confirmed participant with invite permission) */}
          {canInvite && !isOrganizer && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4>Nominate User</h4>
              <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                Nominate a user to join. Requires both user acceptance and organizer approval.
              </p>
              <NominateUserForm matchId={matchId} />
            </div>
          )}

          {canAddGuests && (
            <div>
              <h4>Add Guest</h4>
              <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                {isOrganizer
                  ? 'Guest will be added as confirmed immediately.'
                  : 'Guest will be pending until organizer approves.'}
              </p>
              <AddGuestForm matchId={matchId} isOrganizer={isOrganizer} />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
