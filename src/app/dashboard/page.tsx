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

interface Props {
  searchParams: Promise<{ notice?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const loaderData = await loadDashboardPageData()
  const viewModel = buildDashboardPageViewModel(loaderData)
  const { notice } = await searchParams

  return (
    <DashboardPageView
      viewModel={viewModel}
      notice={notice ?? null}
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
