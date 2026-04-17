import Link from 'next/link'
import { MatchActions } from './MatchActions'
import { ParticipantGroups } from './ParticipantGroups'
import { ActivityFeed } from './ActivityFeed'
import { MatchEditForm } from './MatchEditForm'
import { MatchToolsSection } from './MatchToolsSection'
import { MatchCommunicationSection } from './MatchCommunicationSection'
import { MatchCourtInfoButton } from './MatchCourtInfoButton'
import type { MatchDetailPageViewModel } from './match-detail.view-model'
import type { MatchCourtPlanUpdateInput, MatchUpdateInput } from './match-detail.actions'

function IconCalendar({ size = 12, color = '#f97316' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke={color} strokeWidth="1.8" />
      <path d="M8 3V7M16 3V7M3 10H21" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconMapPin({ size = 12, color = '#f97316' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21C15.5 17.4 18 14.7 18 11.5A6 6 0 0 0 6 11.5C6 14.7 8.5 17.4 12 21Z" stroke={color} strokeWidth="1.8" />
      <circle cx="12" cy="11" r="2.5" stroke={color} strokeWidth="1.8" />
    </svg>
  )
}

function IconUsers({ size = 12, color = '#0f172a' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke={color} strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.5" stroke={color} strokeWidth="1.8" />
      <path d="M4 19C4.8 16.7 6.8 15.5 9 15.5C11.2 15.5 13.2 16.7 14 19" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 16.5C16 16.6 17.5 17.3 18.4 18.7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconMessageCircle({ size = 12, color = '#0f172a' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18L3.5 20L4.4 16.1A8 8 0 1 1 20 12A8 8 0 0 1 7 18Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconInfo({ size = 10, color = '#f97316' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <path d="M12 10V16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.2" r="1" fill={color} />
    </svg>
  )
}

function IconSend({ size = 14, color = '#cbd5e1' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 3L10 14" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M21 3L14 21L10 14L3 10L21 3Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

type MatchDetailPageViewProps = {
  viewModel: MatchDetailPageViewModel
  onUpdateMatchDetails: (data: MatchUpdateInput) => Promise<void>
  onUpdateOrganizerNote: (organizerNote: string | null) => Promise<void>
  onPostMessage: (body: string) => Promise<void>
  onCancelMatch: (reason: string) => Promise<void>
  onSaveCourtPlan: (data: MatchCourtPlanUpdateInput) => Promise<void>
  onRemoveParticipant: (participantId: string) => Promise<void>
}

function MatchHeaderSection({
  viewModel,
  onUpdateMatchDetails,
  onCancelMatch,
  onSaveCourtPlan,
}: Pick<MatchDetailPageViewProps, 'viewModel' | 'onUpdateMatchDetails' | 'onCancelMatch' | 'onSaveCourtPlan'>) {
  const {
    match,
    sportName,
    confirmedCount,
    timeLabel,
    venueName,
    organizerName,
    showOrganizerEditSection,
    myParticipant,
    userId,
    participants,
    isOrganizer,
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
  const showUpdateCourtInfo =
    Boolean(userId)
    && match.status === 'active'
    && match.court_plan_mode === 'needs_help_booking'
    && (isOrganizer || myParticipant?.status === 'confirmed')

  return (
    <>
      <nav style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: '#94a3b8',
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          &lt; Matches
        </Link>
      </nav>

      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <div
            style={{
              padding: '1rem',
              border: '1px solid #e8eef6',
              borderRadius: '24px',
              background: '#fff',
              boxShadow: '0 14px 32px -28px rgba(15, 23, 42, 0.28)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.7rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
                  <h1 style={{ margin: 0, fontSize: '1.55rem', color: '#0f172a', lineHeight: 1, fontWeight: 800, letterSpacing: '-0.03em' }}>
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
                  {rosterInsight.formatLabel ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.18rem 0.4rem',
                        borderRadius: '999px',
                        background: '#fff7ed',
                        color: '#ea580c',
                        fontSize: '0.5rem',
                        fontWeight: 800,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {rosterInsight.formatLabel.replace(/\s+/g, ' ')}
                    </span>
                  ) : null}
                </div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8', fontWeight: 500 }}>
                  Hosted by {organizerName}
                </p>
                {match.recurring_series_id ? (
                  <Link
                    href={`/recurring-matches/${match.recurring_series_id}`}
                    style={{
                      display: 'inline-flex',
                      marginTop: '0.35rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#4f46e5',
                      textDecoration: 'none',
                    }}
                  >
                    Part of recurring series →
                  </Link>
                ) : null}
              </div>

              {showOrganizerEditSection || showUpdateCourtInfo ? (
                <div style={{ flexShrink: 0, display: 'grid', justifyItems: 'end', gap: '0.45rem' }}>
                  {showOrganizerEditSection ? (
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
                      onCancelMatch={onCancelMatch}
                      onSaveCourtPlan={onSaveCourtPlan}
                    />
                  ) : null}
                  {showUpdateCourtInfo && userId ? (
                    <MatchCourtInfoButton
                      matchId={viewModel.matchId}
                      currentUserId={userId}
                      organizerUserId={match.organizer_id}
                      organizerName={organizerName}
                      participants={participants}
                      venueCourts={venueCourts}
                      showSelectAction={isOrganizer}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              style={{
                background: '#f8fafc',
                borderRadius: '18px',
                padding: '0.7rem 0.8rem',
                display: 'grid',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem' }}>
                <IconCalendar />
                <span style={{ fontWeight: 700, color: '#64748b', fontSize: '0.76rem' }}>
                  {timeLabel.split(' ').slice(0, 3).join(' ')}
                </span>
                <span style={{ color: '#0f172a', fontSize: '0.98rem', fontWeight: 800 }}>
                  {timeLabel.split(' ').slice(3).join(' ')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                <IconMapPin />
                {venueName ? <span style={{ fontWeight: 800, color: '#0f172a' }}>{venueName}</span> : null}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    borderRadius: '999px',
                    padding: '0.22rem 0.55rem',
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    background: courtBadgeColors.background,
                    color: courtBadgeColors.color,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '0.35rem',
                      height: '0.35rem',
                      borderRadius: '999px',
                      background: courtBadgeColors.dot,
                    }}
                  />
                  {courtState.badgeLabel}
                </span>
              </div>
            </div>
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
    <section
      style={{
        marginBottom: '1.1rem',
        background: '#fff',
        borderRadius: '38px',
        padding: '1.15rem 1.45rem 1rem',
        border: '1px solid #edf2f7',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.035)',
      }}
    >
      <div style={{ marginBottom: '0.95rem' }}>
        <h2
          style={{
            margin: '0 0 0.28rem',
            fontSize: '0.7rem',
            fontWeight: 900,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#0f172a',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.38rem',
          }}
        >
          <IconUsers />
          Players
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
          Each spot is confirmed when both host and player confirm.
        </p>
      </div>
      <ParticipantGroups
        matchId={viewModel.matchId}
        matchStatus={viewModel.match.status}
        participants={viewModel.participantsForDisplay}
        isOrganizer={viewModel.isOrganizer}
        pendingCount={viewModel.pendingCount}
        requiredCount={viewModel.match.required_count}
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

function MatchChatSection({
  viewModel,
  onUpdateOrganizerNote,
  onPostMessage,
}: Pick<MatchDetailPageViewProps, 'viewModel' | 'onUpdateOrganizerNote' | 'onPostMessage'>) {
  return (
    <MatchCommunicationSection
      organizerNoteText={viewModel.match.organizer_note}
      organizerName={viewModel.organizerName}
      messages={viewModel.messages}
      viewerUserId={viewModel.userId}
      canAccessCommunication={viewModel.canAccessCommunication}
      canPostCommunication={viewModel.canPostCommunication}
      canEditOrganizerNote={viewModel.canEditOrganizerNote}
      onUpdateOrganizerNote={onUpdateOrganizerNote}
      onPostMessage={onPostMessage}
    />
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
  onUpdateOrganizerNote,
  onPostMessage,
  onCancelMatch,
  onSaveCourtPlan,
  onRemoveParticipant,
}: MatchDetailPageViewProps) {
  const showManagePanel =
    viewModel.showOrganizerAdminSection ||
    viewModel.showNominateSection ||
    viewModel.showNominateGuestSection
  const confirmedParticipants = viewModel.participants.filter((participant) => participant.status === 'confirmed')
  const activeInviteParticipants = viewModel.participants.filter((participant) =>
    participant.status === 'pending' &&
    (participant.join_method === 'invited' || participant.join_method === 'nominated'),
  )
  const currentRequestUserMap = new Map<string, string>()
  viewModel.scopeUsersForInvite.forEach((user) => currentRequestUserMap.set(user.id, user.display_name))
  viewModel.participants.forEach((participant) => {
    if (participant.user_id) {
      currentRequestUserMap.set(participant.user_id, participant.display_name)
    }
  })
  const activeRequestUsers = (viewModel.match.invitation_scope_user_ids ?? []).map((id) => ({
    id,
    name: currentRequestUserMap.get(id) ?? `User ${id.slice(0, 6)}`,
  }))
  const showRoundRobinTools = viewModel.match.status === 'active'
  const showToolsSection = showManagePanel || showRoundRobinTools
  const pageMaxWidth = showToolsSection ? '920px' : '720px'

  return (
    <div style={{ maxWidth: pageMaxWidth, margin: '0 auto', padding: '0.75rem 1rem' }}>
      <MatchHeaderSection
        viewModel={viewModel}
        onUpdateMatchDetails={onUpdateMatchDetails}
        onCancelMatch={onCancelMatch}
        onSaveCourtPlan={onSaveCourtPlan}
      />
      <MatchSelfActionsSection viewModel={viewModel} />
      <MatchParticipantsSection viewModel={viewModel} onRemoveParticipant={onRemoveParticipant} />
      <MatchChatSection
        viewModel={viewModel}
        onUpdateOrganizerNote={onUpdateOrganizerNote}
        onPostMessage={onPostMessage}
      />
      {showToolsSection ? (
        <MatchToolsSection
          showInviteTools={showManagePanel}
          showRoundRobinTools={showRoundRobinTools}
          matchId={viewModel.matchId}
          matchStatus={viewModel.match.status}
          gameType={viewModel.match.game_type}
          finalCourtLabel={viewModel.match.final_court_label}
          matchCourts={viewModel.matchCourts}
          isOrganizer={viewModel.isOrganizer}
          organizerUserId={viewModel.match.organizer_id}
          requiredCount={viewModel.match.required_count}
          confirmedParticipants={confirmedParticipants}
          activeInviteParticipants={activeInviteParticipants}
          activeGroupInvites={viewModel.groupInvitations}
          activeRequestUsers={viewModel.isOrganizer ? activeRequestUsers : []}
          activeRequestGroups={viewModel.isOrganizer ? viewModel.scopeGroups : []}
          candidateUsers={viewModel.isOrganizer ? viewModel.scopeUsersForInvite : viewModel.scopeUsersForNominate}
          contactTargets={viewModel.contactTargets}
          candidateGroups={viewModel.allGroups.filter((group) =>
            group.primary_sport_id == null || group.primary_sport_id === viewModel.match.sport_id,
          )}
          onUpdateMatchDetails={onUpdateMatchDetails}
          onRemoveParticipant={onRemoveParticipant}
        />
      ) : null}
    </div>
  )
}
