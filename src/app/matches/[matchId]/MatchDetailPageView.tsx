import Link from 'next/link'
import { BrandLogo } from '@/app/components/BrandLogo'
import { IdentityLinkReviewCard } from '@/app/components/IdentityLinkReviewCard'
import { MatchActions } from './MatchActions'
import { ParticipantGroups } from './ParticipantGroups'
import { ActivityFeed } from './ActivityFeed'
import { MatchEditForm } from './MatchEditForm'
import { MatchToolsSection } from './MatchToolsSection'
import { MatchCommunicationSection } from './MatchCommunicationSection'
import { MatchCourtInfoButton } from './MatchCourtInfoButton'
import type { MatchDetailPageViewModel } from './match-detail.view-model'
import type { MatchCourtPlanUpdateInput, MatchUpdateInput } from './match-detail.actions'
import type { MatchLineupSnapshot } from '@/lib/match-lineup'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import { AutoRefresh } from '@/app/components/AutoRefresh'

function IconCalendar({ size = 12, color = '#0d6efd' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke={color} strokeWidth="1.8" />
      <path d="M8 3V7M16 3V7M3 10H21" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconMapPin({ size = 12, color = '#0d6efd' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21C15.5 17.4 18 14.7 18 11.5A6 6 0 0 0 6 11.5C6 14.7 8.5 17.4 12 21Z" stroke={color} strokeWidth="1.8" />
      <circle cx="12" cy="11" r="2.5" stroke={color} strokeWidth="1.8" />
    </svg>
  )
}

function IconUsers({ size = 12, color = '#1E293B' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke={color} strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.5" stroke={color} strokeWidth="1.8" />
      <path d="M4 19C4.8 16.7 6.8 15.5 9 15.5C11.2 15.5 13.2 16.7 14 19" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 16.5C16 16.6 17.5 17.3 18.4 18.7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconMessageCircle({ size = 12, color = '#1E293B' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18L3.5 20L4.4 16.1A8 8 0 1 1 20 12A8 8 0 0 1 7 18Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconInfo({ size = 10, color = '#0d6efd' }: { size?: number; color?: string }) {
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
  embedded?: boolean
  onUpdateMatchDetails: (data: MatchUpdateInput) => Promise<void>
  onUpdateOrganizerNote: (organizerNote: string | null) => Promise<void>
  onPostMessage: (body: string) => Promise<void>
  onSaveLineup: (lineup: MatchLineupSnapshot | null) => Promise<void>
  onConfirmMatch: () => Promise<void>
  onCancelMatch: (reason: string) => Promise<void>
  onSaveCourtPlan: (data: MatchCourtPlanUpdateInput) => Promise<void>
  onRemoveParticipant: (participantId: string, note?: string | null) => Promise<void>
  onAcceptIdentityLink: (guestId: string) => Promise<void | { ok: boolean; error?: string }>
  onKeepSeparateIdentityLink: (guestId: string) => Promise<void | { ok: boolean; error?: string }>
}

function MatchHeaderSection({
  viewModel,
  embedded = false,
  onUpdateMatchDetails,
  onCancelMatch,
  onSaveCourtPlan,
  onConfirmMatch,
}: Pick<MatchDetailPageViewProps, 'viewModel' | 'embedded' | 'onUpdateMatchDetails' | 'onCancelMatch' | 'onSaveCourtPlan' | 'onConfirmMatch'>) {
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
  const showMatchFormedBanner =
    match.status === 'active' &&
    Boolean(match.formed_at)
  const showReadyToConfirm =
    isOrganizer &&
    match.status === 'active' &&
    !match.formed_at &&
    confirmedCount >= match.required_count
  const gameTypeLabel = match.game_type
    ? `${match.game_type.charAt(0).toUpperCase()}${match.game_type.slice(1)}`
    : null
  const courtBadgeColors =
    courtState.status === 'secured'
      ? { background: '#F0FDF4', color: '#166534', dot: '#22C55E' }
      : courtState.status === 'walk_in'
        ? { background: '#eff6ff', color: '#0b5ed7', dot: '#0d6efd' }
        : { background: '#eff6ff', color: '#0d6efd', dot: '#F97316' }
  const showUpdateCourtInfo =
    Boolean(userId)
    && match.status === 'active'
    && match.court_plan_mode === 'needs_help_booking'
    && (isOrganizer || myParticipant?.status === 'confirmed')

  return (
    <>
      {embedded ? (
        <nav className="mb-3 flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8] transition hover:text-[#0d6efd]"
          >
            &lt; Matches
          </Link>
        </nav>
      ) : null}

      {!embedded ? (
      <div className="mb-4 flex items-center justify-between md:hidden">
        <Link
          href="/dashboard"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[26px] font-light text-[#1E293B] shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
          aria-label="Back to matches"
        >
          <span aria-hidden="true">&lt;</span>
        </Link>
        <h2 className="text-h2 text-[#1E293B]">Match Detail</h2>
        <span className="h-11 w-11" />
      </div>
      ) : null}

      {!embedded ? (
      <nav style={{ marginBottom: '1rem', fontSize: '0.85rem' }} className="hidden items-center justify-between gap-4 md:flex">
        <BrandLogo variant="horizontal" href="/dashboard" imageClassName="h-12 w-[218px]" />
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: '#94A3B8',
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          &lt; Matches
        </Link>
      </nav>
      ) : null}

      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <div
            style={{
              padding: '1rem',
              border: '1px solid #E2E8F0',
              borderRadius: '24px',
              background: '#fff',
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.7rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
                  <h1 style={{ margin: 0, fontSize: '1.55rem', color: '#1E293B', lineHeight: 1, fontWeight: 900, letterSpacing: '-0.03em' }}>
                    {sportName}
                    {gameTypeLabel && (
                      <>
                        {' '}
                        <span aria-hidden="true">&middot;</span>
                        {' '}
                        {gameTypeLabel}
                        {rosterInsight.formatLabel ? (
                          <span
                            style={{
                              marginLeft: '0.38rem',
                              fontSize: '0.62em',
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: '#1E293B',
                              verticalAlign: 'middle',
                            }}
                          >
                            {' - '}
                            {rosterInsight.formatLabel.replace(/\s+/g, ' ')}
                          </span>
                        ) : null}
                      </>
                    )}
                  </h1>
                </div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: '#94A3B8', fontWeight: 500 }}>
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
                      color: '#0d6efd',
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

            {showMatchFormedBanner ? (
              <div
                style={{
                  marginBottom: '0.8rem',
                  borderRadius: '18px',
                  overflow: 'hidden',
                }}
              >
                <img
                  src="/match-formed-confirmation.png"
                  alt="Match formed confirmation"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                  }}
                />
              </div>
            ) : null}

            {showReadyToConfirm ? (
              <div className="mb-4 rounded-[18px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#0d6efd]">Ready to confirm</p>
                    <p className="mt-1 text-[14px] font-semibold text-[#0F172A]">
                      {confirmedCount} of {match.required_count} players confirmed
                    </p>
                  </div>
                  <form action={onConfirmMatch}>
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-full bg-[#0B1F47] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(11,31,71,0.18)]"
                    >
                      Confirm and Notify
                    </button>
                  </form>
                </div>
              </div>
            ) : null}

            <div
              style={{
                background: '#F8FAFC',
                borderRadius: '18px',
                padding: '0.7rem 0.8rem',
                display: 'grid',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem' }}>
                <IconCalendar />
                <span style={{ fontWeight: 700, color: '#64748B', fontSize: '0.76rem' }}>
                  {timeLabel.split(' ').slice(0, 3).join(' ')}
                </span>
                <span style={{ color: '#1E293B', fontSize: '1.1rem', fontWeight: 900 }}>
                  {timeLabel.split(' ').slice(3).join(' ')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                <IconMapPin />
                {venueName ? <span style={{ fontWeight: 800, color: '#1E293B' }}>{venueName}</span> : null}
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
    <section
      style={{
        marginBottom: '1.1rem',
        padding: '0.95rem 1.1rem',
        border: '1px solid #E2E8F0',
        borderRadius: '24px',
        background: '#fff',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
      }}
    >
      <MatchActions
        matchId={viewModel.matchId}
        isOrganizer={viewModel.isOrganizer}
        myParticipation={viewModel.myParticipant}
        needsReconfirm={viewModel.myParticipantNeedsReconfirm}
        inScope={viewModel.inScope}
        myGroupInvites={viewModel.myGroupInvites}
        organizerName={viewModel.organizerName}
      />
    </section>
  )
}

function LinkedContactNotice({
  viewModel,
}: Pick<MatchDetailPageViewProps, 'viewModel'>) {
  if (!viewModel.hasLinkedGuestIdentity || viewModel.identityLinkCandidates.length > 0) {
    return null
  }

  return (
    <section
      style={{
        marginBottom: '1rem',
        padding: '0.85rem 1rem',
        border: '1px solid #D9E5F4',
        borderRadius: '20px',
        background: '#F8FBFF',
      }}
    >
      <p style={{ margin: 0, color: '#5B6B84', fontSize: '0.82rem', lineHeight: 1.5 }}>
        This contact invite is already linked to your account. If match details still look limited,
        the match is using older visibility rules for linked contact participants.
      </p>
    </section>
  )
}

function MatchParticipantsSection({
  viewModel,
  onRemoveParticipant,
}: Pick<MatchDetailPageViewProps, 'viewModel' | 'onRemoveParticipant'>) {
  const playersTitle = viewModel.isOrganizer
    ? 'Players'
    : viewModel.isFormed
      ? 'Players'
      : 'Confirmed Lineup'
  const playersHelper = viewModel.isOrganizer
    ? 'Confirmed lineup players count toward forming the match. Invited players confirm themselves. Players who want to join are added by the organizer.'
    : viewModel.myParticipant?.status === 'waiting_list'
      ? 'The organizer will let you know if a spot opens.'
      : viewModel.isFormed
        ? 'Players in this match.'
        : 'Confirmed lineup players count toward forming the match.'

  const safeConfirmedParticipants = viewModel.participantsForDisplay.filter((participant) =>
    participant.status === 'confirmed' &&
    participant.removed_at === null)

  return (
    <section
      style={{
        marginBottom: '1.1rem',
        background: '#fff',
        borderRadius: '38px',
        padding: '1.15rem 1.45rem 1rem',
        border: '1px solid #E2E8F0',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
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
            color: '#1E293B',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.38rem',
          }}
        >
          <IconUsers />
          {playersTitle}
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
          {playersHelper}
        </p>
      </div>
      {viewModel.isOrganizer ? (
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
      ) : (
        <SafeConfirmedPlayersList
          participants={safeConfirmedParticipants}
          confirmedCount={viewModel.confirmedCount}
          requiredCount={viewModel.match.required_count}
          myUserId={viewModel.userId}
          organizerUserId={viewModel.match.organizer_id}
        />
      )}
    </section>
  )
}

function SafeConfirmedPlayersList({
  participants,
  confirmedCount,
  requiredCount,
  myUserId,
  organizerUserId,
}: {
  participants: MatchParticipantEnriched[]
  confirmedCount: number
  requiredCount: number
  myUserId: string | null
  organizerUserId: string | null
}) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {participants.length === 0 ? (
        <div
          style={{
            border: '1px dashed #D9E5F4',
            borderRadius: '18px',
            background: '#F8FBFF',
            padding: '0.9rem 1rem',
            color: '#64748b',
            fontSize: '0.86rem',
            fontWeight: 700,
          }}
        >
          No lineup players yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {participants.map((participant) => (
            <div
              key={participant.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.7rem',
                border: '1px solid #E2E8F0',
                borderRadius: '18px',
                background: '#fff',
                padding: '0.72rem 0.82rem',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: '2.1rem',
                  height: '2.1rem',
                  borderRadius: '999px',
                  background: '#EEF6FF',
                  color: '#1E3A5F',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  border: '1px solid #D9E5F4',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                {participant.avatar_url ? (
                  <img src={participant.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  participant.display_name.charAt(0).toUpperCase() || '?'
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#0F172A', fontSize: '0.9rem', fontWeight: 850 }}>
                    {participant.display_name}
                  </span>
                  {participant.user_id === myUserId ? (
                    <span style={safePlayerBadgeStyle}>You</span>
                  ) : null}
                  {participant.user_id === organizerUserId ? (
                    <span style={safePlayerBadgeStyle}>Host</span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', fontWeight: 800 }}>
        {confirmedCount} of {requiredCount} lineup spots filled
      </p>
    </div>
  )
}

const safePlayerBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '999px',
  background: '#F1F5F9',
  color: '#64748B',
  padding: '0.12rem 0.45rem',
  fontSize: '0.62rem',
  fontWeight: 800,
} as const

function MatchChatSection({
  viewModel,
  onUpdateOrganizerNote,
  onPostMessage,
}: Pick<MatchDetailPageViewProps, 'viewModel' | 'onUpdateOrganizerNote' | 'onPostMessage'>) {
  return (
    <MatchCommunicationSection
      organizerNoteText={viewModel.match.organizer_note}
      messages={viewModel.messages}
      viewerUserId={viewModel.userId}
      canAccessCommunication={viewModel.canAccessCommunication}
      canPostCommunication={viewModel.canPostCommunication}
      canEditOrganizerNote={viewModel.canEditOrganizerNote}
      isOrganizer={viewModel.isOrganizer}
      showFormedNotice={viewModel.isFormed}
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
  embedded = false,
  onUpdateMatchDetails,
  onUpdateOrganizerNote,
  onPostMessage,
  onCancelMatch,
  onSaveCourtPlan,
  onRemoveParticipant,
  onSaveLineup,
  onConfirmMatch,
  onAcceptIdentityLink,
  onKeepSeparateIdentityLink,
}: MatchDetailPageViewProps) {
  const showManagePanel =
    viewModel.showOrganizerAdminSection ||
    viewModel.showParticipantInviteSection ||
    viewModel.showParticipantInviteContactSection
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
  const showRoundRobinTools = viewModel.match.status === 'active' && (viewModel.isOrganizer || viewModel.canViewLineup)
  const showToolsSection = showManagePanel || showRoundRobinTools
  const pageMaxWidth = showToolsSection ? '920px' : '720px'

  return (
    <div
      style={{
        maxWidth: embedded ? 'none' : pageMaxWidth,
        margin: embedded ? 0 : '0 auto',
        padding: embedded ? 0 : '0.75rem 1rem 1.5rem',
        background: embedded ? 'transparent' : '#F0F7FF',
      }}
      className="pb-24 md:pb-6"
    >
      <AutoRefresh />
      <MatchHeaderSection
        viewModel={viewModel}
        embedded={embedded}
        onUpdateMatchDetails={onUpdateMatchDetails}
        onCancelMatch={onCancelMatch}
        onSaveCourtPlan={onSaveCourtPlan}
        onConfirmMatch={onConfirmMatch}
      />
      {viewModel.identityLinkCandidates.length > 0 ? (
        <div style={{ marginBottom: '1.1rem' }}>
          <IdentityLinkReviewCard
            title="Link your contact profile"
            body="We found matches linked to your contact information."
            candidates={viewModel.identityLinkCandidates}
            onAccept={onAcceptIdentityLink}
            onKeepSeparate={onKeepSeparateIdentityLink}
            acceptLabel="Link and continue"
            keepSeparateLabel="Keep separate for now"
          />
        </div>
      ) : null}
      <LinkedContactNotice viewModel={viewModel} />
      <MatchSelfActionsSection viewModel={viewModel} />
      <MatchParticipantsSection viewModel={viewModel} onRemoveParticipant={onRemoveParticipant} />
      <MatchChatSection
        viewModel={viewModel}
        onUpdateOrganizerNote={onUpdateOrganizerNote}
        onPostMessage={onPostMessage}
      />
      {showToolsSection ? (
        <>
          <details className="mb-4 md:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-white px-5 py-4 text-[17px] font-black uppercase tracking-[0.12em] text-[#0d6efd] shadow-[0_16px_36px_rgba(15,23,42,0.06)] marker:hidden">
              <span className="text-[28px] leading-none">+</span>
              Invite Players
            </summary>
            <div className="mt-4">
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
                candidateUsers={viewModel.isOrganizer ? viewModel.scopeUsersForInvite : viewModel.scopeUsersForParticipantInvite}
                contactTargets={viewModel.contactTargets}
                candidateGroups={viewModel.allGroups.filter((group) =>
                  group.primary_sport_id == null || group.primary_sport_id === viewModel.match.sport_id,
                )}
                savedLineup={viewModel.savedLineup}
                onUpdateMatchDetails={onUpdateMatchDetails}
                onRemoveParticipant={onRemoveParticipant}
                onSaveLineup={onSaveLineup}
              />
            </div>
          </details>
          <div className="hidden md:block">
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
              candidateUsers={viewModel.isOrganizer ? viewModel.scopeUsersForInvite : viewModel.scopeUsersForParticipantInvite}
              contactTargets={viewModel.contactTargets}
              candidateGroups={viewModel.allGroups.filter((group) =>
                group.primary_sport_id == null || group.primary_sport_id === viewModel.match.sport_id,
              )}
              savedLineup={viewModel.savedLineup}
              onUpdateMatchDetails={onUpdateMatchDetails}
              onRemoveParticipant={onRemoveParticipant}
              onSaveLineup={onSaveLineup}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
