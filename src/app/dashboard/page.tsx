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
import { loadMatchDetailPageData } from '../matches/[matchId]/match-detail.loader'
import { buildMatchDetailPageViewModel } from '../matches/[matchId]/match-detail.view-model'

interface Props {
  searchParams: Promise<{ notice?: string; matchId?: string; tab?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const { notice, matchId } = await searchParams
  const loaderData = await loadDashboardPageData()
  const viewModel = buildDashboardPageViewModel(loaderData)
  const selectedMatchId = matchId?.trim() || null
  let selectedMatchDetail = null

  if (selectedMatchId) {
    const matchDetailLoaderData = await loadMatchDetailPageData(selectedMatchId)
    const matchDetailViewModel = buildMatchDetailPageViewModel(matchDetailLoaderData)
    const matchSnapshot = {
      id: matchDetailViewModel.match.id,
      game_type: matchDetailViewModel.match.game_type,
      match_date: matchDetailViewModel.match.match_date,
      start_time: matchDetailViewModel.match.start_time,
    }

    selectedMatchDetail = (
      <MatchDetailPageView
        embedded
        viewModel={matchDetailViewModel}
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
