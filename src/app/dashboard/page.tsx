import {
  archiveDashboardGearItemAction,
  acceptDashboardIdentityLinkAction,
  cancelDashboardMatchAction,
  createDashboardGearImageAction,
  createDashboardGearItemAction,
  createDashboardGearStringJobAction,
  deleteDashboardGearImageAction,
  deleteDashboardGearItemAction,
  deleteDashboardGearShowcaseEntryAction,
  deleteDashboardGearStringJobAction,
  importDashboardWishlistLinkAction,
  keepSeparateDashboardIdentityLinkAction,
  importDashboardScreenshotContactsAction,
  leaveDashboardVenueAction,
  joinDashboardVenueAction,
  saveDashboardVenuePreferenceAction,
  moveDashboardWishlistItemToOwnedAction,
  removeDashboardVenuePreferenceAction,
  refreshDashboardAction,
  saveDashboardGlobalPreferencesAction,
  saveDashboardSportProfileAction,
  upsertDashboardGearShowcaseEntryAction,
  updateDashboardGearImageAction,
  updateDashboardGearItemAction,
  setDashboardVenueMemberDiscoveryAction,
  setDashboardDisplayNameAction,
  setDashboardPrimaryVenueAction,
  setDashboardSportsAction,
  updateDashboardProfileAction,
  parseDashboardContactScreenshotAction,
} from './dashboard.actions'
import { DashboardPageView } from './DashboardPageView'
import { loadDashboardPageData } from './dashboard.loader'
import { buildDashboardPageViewModel } from './dashboard.view-model'
import {
  acceptMatchIdentityLinkAction,
  cancelMatchWithReasonAction,
  confirmMatchAndNotifyAction,
  keepSeparateMatchIdentityLinkAction,
  removeMatchParticipantAction,
  postMatchMessageAction,
  saveMatchLineupAction,
  updateMatchCourtPlanAction,
  updateMatchDetailsAction,
  updateMatchOrganizerNoteAction,
} from '../matches/[matchId]/match-detail.actions'
import { MatchDetailPageView } from '../matches/[matchId]/MatchDetailPageView'
import { loadMatchDetailPageData, type MatchDetailLoaderData } from '../matches/[matchId]/match-detail.loader'
import { buildMatchDetailPageViewModel } from '../matches/[matchId]/match-detail.view-model'
import type { MatchListItem } from '@/lib/api/matches'

interface Props {
  searchParams: Promise<{ notice?: string; matchId?: string; tab?: string }>
}

function getMatchMinutes(item: MatchListItem): { start: number; end: number } | null {
  if (!item.match.start_time) return null
  const [hour, minute] = item.match.start_time.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  const start = hour * 60 + minute
  const duration = Math.max(item.match.duration_minutes ?? 60, 30)
  return { start, end: start + duration }
}

function hasSelectedMatchConflict(items: MatchListItem[], selectedMatchId: string): boolean {
  const selected = items.find((item) => item.match.id === selectedMatchId)
  if (!selected || selected.match.status === 'cancelled' || !selected.match.match_date) return false

  const selectedMinutes = getMatchMinutes(selected)
  if (!selectedMinutes) return false

  return items.some((item) => {
    if (item.match.id === selectedMatchId || item.match.status === 'cancelled') return false
    if (item.myParticipant?.status === 'removed') return false
    if (item.match.match_date !== selected.match.match_date) return false

    const otherMinutes = getMatchMinutes(item)
    if (!otherMinutes) return false

    return selectedMinutes.start < otherMinutes.end && otherMinutes.start < selectedMinutes.end
  })
}

function alignSelectedMatchDetailWithBoard(
  loaderData: MatchDetailLoaderData,
  boardItem: MatchListItem | undefined,
): MatchDetailLoaderData {
  if (!boardItem || loaderData.detail.isOrganizer) {
    return loaderData
  }

  const boardConfirmedParticipants = boardItem.participants.filter(
    (participant) => participant.status === 'confirmed' && participant.removed_at === null,
  )
  const shouldAlign =
    boardItem.confirmedCount > loaderData.detail.confirmedCount ||
    boardConfirmedParticipants.some(
      (participant) => !loaderData.detail.participants.some((detailParticipant) => detailParticipant.id === participant.id),
    )

  if (!shouldAlign) {
    return loaderData
  }

  const participantsById = new Map(
    loaderData.detail.participants.map((participant) => [participant.id, participant]),
  )
  for (const participant of boardConfirmedParticipants) {
    if (!participantsById.has(participant.id)) {
      participantsById.set(participant.id, participant)
    }
  }

  const participants = Array.from(participantsById.values()).sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  )

  return {
    ...loaderData,
    detail: {
      ...loaderData.detail,
      participants,
      confirmedCount: Math.max(
        loaderData.detail.confirmedCount,
        boardItem.confirmedCount,
        boardConfirmedParticipants.length,
      ),
    },
  }
}

export default async function DashboardPage({ searchParams }: Props) {
  const { notice, matchId } = await searchParams
  const selectedMatchId = matchId?.trim() || null
  const dashboardLoaderPromise = loadDashboardPageData()
  const matchDetailLoaderPromise = selectedMatchId
    ? loadMatchDetailPageData(selectedMatchId)
    : Promise.resolve(null)

  const [loaderData, matchDetailLoaderData] = await Promise.all([
    dashboardLoaderPromise,
    matchDetailLoaderPromise,
  ])
  const viewModel = buildDashboardPageViewModel(loaderData)
  let selectedMatchDetail = null

  if (selectedMatchId && matchDetailLoaderData) {
    const selectedBoardItem = viewModel.items.find((item) => item.match.id === selectedMatchId)
    const alignedMatchDetailLoaderData = alignSelectedMatchDetailWithBoard(matchDetailLoaderData, selectedBoardItem)
    const matchDetailViewModel = buildMatchDetailPageViewModel(alignedMatchDetailLoaderData)
    const hasTimeConflict = hasSelectedMatchConflict(viewModel.items, selectedMatchId)
    const matchSnapshot = {
      id: matchDetailViewModel.match.id,
      game_type: matchDetailViewModel.match.game_type,
      match_date: matchDetailViewModel.match.match_date,
      start_time: matchDetailViewModel.match.start_time,
      duration_minutes: matchDetailViewModel.match.duration_minutes,
    }

    selectedMatchDetail = (
      <MatchDetailPageView
        embedded
        viewModel={matchDetailViewModel}
        hasTimeConflict={hasTimeConflict}
        onUpdateMatchDetails={updateMatchDetailsAction.bind(null, selectedMatchId, matchDetailViewModel.venueName, matchSnapshot)}
        onUpdateOrganizerNote={updateMatchOrganizerNoteAction.bind(null, selectedMatchId)}
        onPostMessage={postMatchMessageAction.bind(null, selectedMatchId)}
        onSaveLineup={saveMatchLineupAction.bind(null, selectedMatchId)}
        onConfirmMatch={confirmMatchAndNotifyAction.bind(null, selectedMatchId)}
        onCancelMatch={cancelMatchWithReasonAction.bind(null, selectedMatchId)}
        onSaveCourtPlan={updateMatchCourtPlanAction.bind(null, selectedMatchId)}
        onRemoveParticipant={removeMatchParticipantAction.bind(null, selectedMatchId)}
        onAcceptIdentityLink={acceptMatchIdentityLinkAction.bind(null, selectedMatchId)}
        onKeepSeparateIdentityLink={keepSeparateMatchIdentityLinkAction.bind(null, selectedMatchId)}
        onParseScreenshots={parseDashboardContactScreenshotAction}
        onImportScreenshotContacts={importDashboardScreenshotContactsAction}
      />
    )
  }

  return (
    <DashboardPageView
      viewModel={viewModel}
      notice={notice ?? null}
      selectedMatchId={selectedMatchId}
      selectedMatchDetail={selectedMatchDetail}
      onUpdateProfile={updateDashboardProfileAction}
      onAcceptIdentityLink={acceptDashboardIdentityLinkAction}
      onKeepSeparateIdentityLink={keepSeparateDashboardIdentityLinkAction}
      onSetDisplayName={setDashboardDisplayNameAction}
      onAvatarSaved={refreshDashboardAction}
      onSetPrimaryVenue={setDashboardPrimaryVenueAction}
      onLeaveVenue={leaveDashboardVenueAction}
      onSaveVenuePreference={saveDashboardVenuePreferenceAction}
      onRemoveVenuePreference={removeDashboardVenuePreferenceAction}
      onJoinVenue={joinDashboardVenueAction}
      onSaveGlobalPreferences={saveDashboardGlobalPreferencesAction}
      onSetVenueMemberDiscovery={setDashboardVenueMemberDiscoveryAction}
      onSetSports={setDashboardSportsAction}
      onSaveSportProfile={saveDashboardSportProfileAction}
      onCreateGearItem={createDashboardGearItemAction}
      onUpdateGearItem={updateDashboardGearItemAction}
      onDeleteGearItem={deleteDashboardGearItemAction}
      onArchiveGearItem={archiveDashboardGearItemAction}
      onMoveWishlistItemToOwned={moveDashboardWishlistItemToOwnedAction}
      onCreateGearImage={createDashboardGearImageAction}
      onUpdateGearImage={updateDashboardGearImageAction}
      onDeleteGearImage={deleteDashboardGearImageAction}
      onCreateGearStringJob={createDashboardGearStringJobAction}
      onDeleteGearStringJob={deleteDashboardGearStringJobAction}
      onUpsertGearShowcaseEntry={upsertDashboardGearShowcaseEntryAction}
      onDeleteGearShowcaseEntry={deleteDashboardGearShowcaseEntryAction}
      onImportWishlistLink={importDashboardWishlistLinkAction}
      onParseContactScreenshots={parseDashboardContactScreenshotAction}
      onImportScreenshotContacts={importDashboardScreenshotContactsAction}
      onCancelMatch={cancelDashboardMatchAction}
    />
  )
}
