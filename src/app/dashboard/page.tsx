import {
  archiveDashboardGearItemAction,
  cancelDashboardMatchAction,
  createDashboardGearImageAction,
  createDashboardGearItemAction,
  createDashboardGearStringJobAction,
  deleteDashboardGearImageAction,
  deleteDashboardGearItemAction,
  deleteDashboardGearShowcaseEntryAction,
  deleteDashboardGearStringJobAction,
  importDashboardWishlistLinkAction,
  importDashboardScreenshotContactsAction,
  leaveDashboardVenueAction,
  joinDashboardVenueAction,
  moveDashboardWishlistItemToOwnedAction,
  removeDashboardVenuePreferenceAction,
  refreshDashboardAction,
  saveDashboardGlobalPreferencesAction,
  saveDashboardSportProfileAction,
  upsertDashboardGearShowcaseEntryAction,
  updateDashboardGearImageAction,
  updateDashboardGearItemAction,
  setDashboardVenuePreferencesAction,
  setDashboardDisplayNameAction,
  setDashboardPrimaryVenueAction,
  setDashboardSportsAction,
  updateDashboardProfileAction,
  parseDashboardContactScreenshotAction,
} from './dashboard.actions'
import { DashboardPageView } from './DashboardPageView'
import { loadDashboardPageData } from './dashboard.loader'
import { buildDashboardPageViewModel } from './dashboard.view-model'

export default async function DashboardPage() {
  const loaderData = await loadDashboardPageData()
  const viewModel = buildDashboardPageViewModel(loaderData)

  return (
    <DashboardPageView
      viewModel={viewModel}
      onUpdateProfile={updateDashboardProfileAction}
      onSetDisplayName={setDashboardDisplayNameAction}
      onAvatarSaved={refreshDashboardAction}
      onSetPrimaryVenue={setDashboardPrimaryVenueAction}
      onLeaveVenue={leaveDashboardVenueAction}
      onRemoveVenuePreference={removeDashboardVenuePreferenceAction}
      onJoinVenue={joinDashboardVenueAction}
      onSaveGlobalPreferences={saveDashboardGlobalPreferencesAction}
      onSetVenuePreferences={setDashboardVenuePreferencesAction}
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
