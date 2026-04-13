import Link from 'next/link'
import { MatchActions } from './MatchActions'
import { ParticipantGroups } from './ParticipantGroups'
import { ActivityFeed } from './ActivityFeed'
import { InviteUserForm } from './InviteUserForm'
import { NominateUserForm } from './NominateUserForm'
import { AddGuestForm } from './AddGuestForm'
import { MatchEditForm } from './MatchEditForm'
import { InviteGuestForm } from './InviteGuestForm'
import { InviteGroupForm } from './InviteGroupForm'
import type { MatchDetailPageViewModel } from './match-detail.view-model'
import type { MatchCourtPlanUpdateInput, MatchUpdateInput } from './match-detail.actions'

type MatchDetailPageViewProps = {
  viewModel: MatchDetailPageViewModel
  onUpdateMatchDetails: (data: MatchUpdateInput) => Promise<void>
  onSaveCourtPlan: (data: MatchCourtPlanUpdateInput) => Promise<void>
  onRemoveParticipant: (participantId: string) => Promise<void>
}

function MatchHeaderSection({
  viewModel,
  onUpdateMatchDetails,
  onSaveCourtPlan,
}: Pick<MatchDetailPageViewProps, 'viewModel' | 'onUpdateMatchDetails' | 'onSaveCourtPlan'>) {
  const {
    match,
    sportName,
    confirmedCount,
    timeLabel,
    venueName,
    organizerName,
    showOrganizerEditSection,
    venueCourts,
    courtState,
    rosterInsight,
  } = viewModel
  const gameTypeLabel = match.game_type
    ? `${match.game_type.charAt(0).toUpperCase()}${match.game_type.slice(1)}`
    : null
  const courtBadgeColors =
    courtState.status === 'secured'
      ? { background: '#dcfce7', color: '#166534', dot: '#22c55e' }
      : courtState.status === 'walk_in'
        ? { background: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' }
        : { background: '#fef3c7', color: '#b45309', dot: '#f59e0b' }

  return (
    <>
      <nav style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        <Link href="/dashboard">&larr; Matches</Link>
      </nav>

      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: '1rem',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: '0.35rem', minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#111827', lineHeight: 1.1, fontWeight: 600 }}>
                {sportName}
                {gameTypeLabel && (
                  <>
                    {' '}
                    <span aria-hidden="true">&middot;</span>
                    {' '}
                    {gameTypeLabel}
                  </>
                )}
              </h1>
              {rosterInsight.formatLabel && (
                <span style={{ fontSize: '1rem', color: '#667085', fontWeight: 500 }}>
                  {rosterInsight.formatLabel}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.18rem', justifyItems: 'end', textAlign: 'right' }}>
              <span style={{ fontSize: '0.88rem', color: '#475467', fontWeight: 500 }}>
                Hosted by {organizerName}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: '1rem',
              alignItems: 'center',
              padding: '1rem 1.1rem',
              border: '1px solid #d9e2ec',
              borderRadius: '20px',
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
              boxShadow: '0 18px 44px -34px rgba(15, 23, 42, 0.38)',
            }}
          >
            <div style={{ display: 'grid', gap: '0.42rem', minWidth: 0 }}>
              <span style={{ fontSize: '0.98rem', color: '#344054', fontWeight: 600 }}>
                {timeLabel}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem 0.8rem' }}>
                {venueName && <span style={{ fontSize: '0.92rem', color: '#667085' }}>{venueName}</span>}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    borderRadius: '999px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: courtBadgeColors.background,
                    color: courtBadgeColors.color,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '0.45rem',
                      height: '0.45rem',
                      borderRadius: '999px',
                      background: courtBadgeColors.dot,
                      boxShadow: '0 0 0 3px rgba(255,255,255,0.65)',
                    }}
                  />
                  {courtState.badgeLabel}
                </span>
              </div>
            </div>

            {showOrganizerEditSection ? (
              <div style={{ justifySelf: 'end' }}>
                <MatchEditForm
                  requiredCount={match.required_count}
                  minRequiredCount={Math.max(confirmedCount, 1)}
                  gameType={match.game_type}
                  doublesFormat={match.doubles_format}
                  matchDate={match.match_date}
                  startTime={match.start_time}
                  durationMinutes={match.duration_minutes}
                  courtPlanMode={match.court_plan_mode}
                  courtNote={match.court_note}
                  finalCourtLabel={match.final_court_label}
                  venueCourts={venueCourts}
                  onSaveMatchDetails={onUpdateMatchDetails}
                  onSaveCourtPlan={onSaveCourtPlan}
                />
              </div>
            ) : null}
          </div>
        </div>
      </header>
    </>
  )
}

function MatchSelfActionsSection({
  viewModel,
}: Pick<MatchDetailPageViewProps, 'viewModel'>) {
  if (!viewModel.showSelfActionsSection) {
    return null
  }

  return (
    <section style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #e0e0e0', borderRadius: '6px' }}>
      <MatchActions
        matchId={viewModel.matchId}
        isOrganizer={viewModel.isOrganizer}
        myParticipation={viewModel.myParticipant}
        needsReconfirm={viewModel.myParticipantNeedsReconfirm}
        inScope={viewModel.inScope}
        myGroupInvites={viewModel.myGroupInvites}
      />
    </section>
  )
}

function MatchParticipantsSection({
  viewModel,
  onRemoveParticipant,
}: Pick<MatchDetailPageViewProps, 'viewModel' | 'onRemoveParticipant'>) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>Participants</h2>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#667085' }}>
        Each spot is confirmed when both host and participant confirm. Waiting list is separate from pending confirmation.
      </p>
      <ParticipantGroups
        matchId={viewModel.matchId}
        matchStatus={viewModel.match.status}
        participants={viewModel.participantsForDisplay}
        isOrganizer={viewModel.isOrganizer}
        pendingCount={viewModel.pendingCount}
        myUserId={viewModel.userId}
        organizerUserId={viewModel.match.organizer_id}
        organizerName={viewModel.organizerName}
        savedPlayerIds={viewModel.savedPlayerIds}
        waitingCount={viewModel.waitingCount}
        onRemoveParticipant={onRemoveParticipant}
      />
    </section>
  )
}

function MatchNominationSection({ viewModel }: Pick<MatchDetailPageViewProps, 'viewModel'>) {
  return (
    <>
      {viewModel.showNominateSection && (
        <section style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Nominate a Player</h3>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.75rem' }}>
            They must accept, then the host confirms the spot.
          </p>
          <NominateUserForm matchId={viewModel.matchId} scopeUsers={viewModel.scopeUsersForNominate} />
        </section>
      )}

      {viewModel.showNominateGuestSection && (
        <section style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Direct Invite Contact Player</h3>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.75rem' }}>
            Send a direct invite to a specific Contact Player. Confirmation still requires both participant acceptance and host confirmation.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>From saved and trusted Contact Players</h4>
              <InviteGuestForm matchId={viewModel.matchId} contactTargets={viewModel.contactTargets} />
            </div>
            <div>
              <h4 style={{ margin: '0.75rem 0 0.3rem', fontSize: '0.85rem' }}>Create a new Contact Player</h4>
              <AddGuestForm matchId={viewModel.matchId} />
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function MatchOrganizerAdminSection({ viewModel }: Pick<MatchDetailPageViewProps, 'viewModel'>) {
  if (!viewModel.showOrganizerAdminSection) {
    return null
  }

  return (
    <section id="organizer-admin" style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '2rem' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem' }}>Host actions</h3>

      <div style={{ marginBottom: '1.25rem' }}>
        <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Invite player</h4>
        <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem' }}>
          Invite a player directly to this match. They only need to accept to confirm.
        </p>
        <InviteUserForm matchId={viewModel.matchId} scopeUsers={viewModel.scopeUsersForInvite} />
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Invite group</h4>
        <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem' }}>
          Invite a whole registered group without creating participant rows up front. Only registered members can accept, and a member only becomes a participant when they accept the group invite themselves.
        </p>
        <InviteGroupForm
          matchId={viewModel.matchId}
          groups={viewModel.allGroups.filter((group) => group.primary_sport_id === viewModel.match.sport_id)}
          invitedGroups={viewModel.groupInvitations}
        />
      </div>

      <div id="guest">
        <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>Direct Invite Contact Player</h4>
        <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.75rem' }}>
          Send a direct invite to a specific Contact Player. Confirmation still requires both participant acceptance and host confirmation.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <h5 style={{ margin: '0 0 0.3rem', fontSize: '0.8rem' }}>From saved and trusted Contact Players</h5>
            <InviteGuestForm matchId={viewModel.matchId} contactTargets={viewModel.contactTargets} />
          </div>
          <div>
            <h5 style={{ margin: '0.75rem 0 0.3rem', fontSize: '0.8rem' }}>Create a new Contact Player</h5>
            <AddGuestForm matchId={viewModel.matchId} />
          </div>
        </div>
      </div>
    </section>
  )
}

function MatchActivitySection({ viewModel }: Pick<MatchDetailPageViewProps, 'viewModel'>) {
  return (
    <section>
      <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Activity</h2>
      <ActivityFeed activities={viewModel.activities} />
    </section>
  )
}

export function MatchDetailPageView({
  viewModel,
  onUpdateMatchDetails,
  onSaveCourtPlan,
  onRemoveParticipant,
}: MatchDetailPageViewProps) {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem' }}>
      <MatchHeaderSection
        viewModel={viewModel}
        onUpdateMatchDetails={onUpdateMatchDetails}
        onSaveCourtPlan={onSaveCourtPlan}
      />
      <MatchSelfActionsSection viewModel={viewModel} />
      <MatchParticipantsSection viewModel={viewModel} onRemoveParticipant={onRemoveParticipant} />
      <MatchNominationSection viewModel={viewModel} />
      <MatchOrganizerAdminSection viewModel={viewModel} />
      <MatchActivitySection viewModel={viewModel} />
    </div>
  )
}
