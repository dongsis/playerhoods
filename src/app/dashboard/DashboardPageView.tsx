import { DashboardShell } from './DashboardShell'
import type { DashboardPageViewModel } from './dashboard.view-model'
import type { GearImageInput, GearItemInput, GearShowcaseEntryInput, GearStringJobInput } from '@/lib/api/gear'
import type { GearImage, GearItem, GearShowcaseEntry, GearStringJob } from '@/lib/types/database'
import type { GearLinkImportDraft } from '@/lib/gear-link-import'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import type { DashboardPreferenceSaveResult, IdentityLinkActionResult } from './dashboard.actions'

type DashboardPageViewProps = {
  viewModel: DashboardPageViewModel
  notice?: string | null
  onUpdateProfile: (formData: FormData) => Promise<void>
  onAcceptIdentityLink: (guestId: string) => Promise<IdentityLinkActionResult>
  onKeepSeparateIdentityLink: (guestId: string) => Promise<IdentityLinkActionResult>
  onSetDisplayName: (newName: string) => Promise<void>
  onAvatarSaved: () => Promise<void>
  onSetPrimaryVenue: (venueId: string) => Promise<void>
  onLeaveVenue: (venueId: string) => Promise<void>
  onSaveVenuePreference: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onRemoveVenuePreference: (venueId: string) => Promise<void>
  onJoinVenue: (venueId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onSaveGlobalPreferences: (params: {
    visible_in_city_discovery?: boolean
    searchable_by_email_or_phone?: boolean
    play_cities?: Array<{ city_name: string; region?: string | null; country?: string | null }>
    allow_non_group_invites?: boolean
    shared_group_join_preference?: 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
  }) => Promise<DashboardPreferenceSaveResult>
  onSetVenueMemberDiscovery: (venueId: string, visibleInVenueMemberDiscovery: boolean) => Promise<DashboardPreferenceSaveResult>
  onSetSports: (codes: string[]) => Promise<void>
  onSaveSportProfile: (input: {
    sport_id: number
    level?: string | null
    years_playing?: number | null
    preferred_formats?: string[]
    current_frequency?: string | null
    play_style?: string | null
    competition_experience?: string | null
    teams_played_on?: string | null
    line_played?: string | null
    highlights?: string | null
    gear_primary?: string | null
    gear_secondary?: string | null
    gear_shoes?: string | null
  }) => Promise<void>
  onCreateGearItem: (input: GearItemInput) => Promise<GearItem>
  onUpdateGearItem: (itemId: string, input: Partial<GearItemInput>) => Promise<GearItem>
  onDeleteGearItem: (itemId: string) => Promise<void>
  onArchiveGearItem: (itemId: string, archived: boolean) => Promise<GearItem>
  onMoveWishlistItemToOwned: (itemId: string) => Promise<GearItem>
  onCreateGearImage: (input: GearImageInput) => Promise<GearImage>
  onUpdateGearImage: (imageId: string, input: Partial<GearImageInput>) => Promise<GearImage>
  onDeleteGearImage: (imageId: string) => Promise<void>
  onCreateGearStringJob: (input: GearStringJobInput) => Promise<GearStringJob>
  onDeleteGearStringJob: (jobId: string) => Promise<void>
  onUpsertGearShowcaseEntry: (input: GearShowcaseEntryInput) => Promise<GearShowcaseEntry>
  onDeleteGearShowcaseEntry: (entryId: string) => Promise<void>
  onImportWishlistLink: (url: string) => Promise<GearLinkImportDraft>
  onParseContactScreenshots: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
  onCancelMatch: (matchId: string) => Promise<void>
}

export function DashboardPageView({
  viewModel,
  notice,
  onUpdateProfile,
  onAcceptIdentityLink,
  onKeepSeparateIdentityLink,
  onSetDisplayName,
  onAvatarSaved,
  onSetPrimaryVenue,
  onLeaveVenue,
  onSaveVenuePreference,
  onRemoveVenuePreference,
  onJoinVenue,
  onSaveGlobalPreferences,
  onSetVenueMemberDiscovery,
  onSetSports,
  onSaveSportProfile,
  onCreateGearItem,
  onUpdateGearItem,
  onDeleteGearItem,
  onArchiveGearItem,
  onMoveWishlistItemToOwned,
  onCreateGearImage,
  onUpdateGearImage,
  onDeleteGearImage,
  onCreateGearStringJob,
  onDeleteGearStringJob,
  onUpsertGearShowcaseEntry,
  onDeleteGearShowcaseEntry,
  onImportWishlistLink,
  onParseContactScreenshots,
  onImportScreenshotContacts,
  onCancelMatch,
}: DashboardPageViewProps) {
  return (
    <DashboardShell
      userId={viewModel.userId}
      items={viewModel.items}
      notice={notice ?? null}
      userEmail={viewModel.userEmail}
      inboxUnreadCount={viewModel.inboxUnreadCount}
      playersData={viewModel.playersData}
      inviteCircle={viewModel.inviteCircle}
      verifiedEmails={viewModel.verifiedEmails}
      identityLinkCandidates={viewModel.identityLinkCandidates}
      profile={viewModel.profile}
      myIdentities={viewModel.myIdentities}
      myVenuePrefs={viewModel.myVenuePrefs}
      joinableVenues={viewModel.joinableVenues}
      sports={viewModel.sports}
      mySports={viewModel.mySports}
      mySportProfiles={viewModel.mySportProfiles}
      myPlayCities={viewModel.myPlayCities}
      gearItems={viewModel.gearItems}
      gearImages={viewModel.gearImages}
      gearStringJobs={viewModel.gearStringJobs}
      gearShowcaseEntries={viewModel.gearShowcaseEntries}
      myAdminVenues={viewModel.myAdminVenues}
      isSuperAdmin={viewModel.isSuperAdmin}
      onUpdateProfile={onUpdateProfile}
      onAcceptIdentityLink={onAcceptIdentityLink}
      onKeepSeparateIdentityLink={onKeepSeparateIdentityLink}
      onSetDisplayName={onSetDisplayName}
      onAvatarSaved={onAvatarSaved}
      onSetPrimaryVenue={onSetPrimaryVenue}
      onLeaveVenue={onLeaveVenue}
      onSaveVenuePreference={onSaveVenuePreference}
      onRemoveVenuePreference={onRemoveVenuePreference}
      onJoinVenue={onJoinVenue}
      onSaveGlobalPreferences={onSaveGlobalPreferences}
      onSetVenueMemberDiscovery={onSetVenueMemberDiscovery}
      onSetSports={onSetSports}
      onSaveSportProfile={onSaveSportProfile}
      onCreateGearItem={onCreateGearItem}
      onUpdateGearItem={onUpdateGearItem}
      onDeleteGearItem={onDeleteGearItem}
      onArchiveGearItem={onArchiveGearItem}
      onMoveWishlistItemToOwned={onMoveWishlistItemToOwned}
      onCreateGearImage={onCreateGearImage}
      onUpdateGearImage={onUpdateGearImage}
      onDeleteGearImage={onDeleteGearImage}
      onCreateGearStringJob={onCreateGearStringJob}
      onDeleteGearStringJob={onDeleteGearStringJob}
      onUpsertGearShowcaseEntry={onUpsertGearShowcaseEntry}
      onDeleteGearShowcaseEntry={onDeleteGearShowcaseEntry}
      onImportWishlistLink={onImportWishlistLink}
      onParseContactScreenshots={onParseContactScreenshots}
      onImportScreenshotContacts={onImportScreenshotContacts}
      onCancelMatch={onCancelMatch}
    />
  )
}
