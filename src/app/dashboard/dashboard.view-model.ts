import type { Profile } from '@/lib/types/database'
import type { DashboardLoaderData } from './dashboard.loader'

type DashboardProfile = Pick<
  Profile,
  | 'display_name'
  | 'first_name'
  | 'last_name'
  | 'gender'
  | 'availability_status'
  | 'availability_note'
  | 'availability_until'
  | 'primary_venue_id'
  | 'contact_channel'
  | 'contact_email'
  | 'profile_contact_email_normalized'
  | 'profile_contact_email_verified_at'
  | 'contact_phone'
  | 'avatar_url'
  | 'visible_in_city_discovery'
  | 'searchable_by_contact_info'
  | 'allow_non_group_invites'
  | 'shared_group_join_preference'
  | 'looking_to_play'
  | 'preferred_play_times'
>

export type DashboardPageViewModel = {
  userId: string
  userEmail: string | null
  items: DashboardLoaderData['items']
  inboxUnreadCount: number
  playersData: DashboardLoaderData['playersData']
  inviteCircle: DashboardLoaderData['inviteCircle']
  verifiedEmails: DashboardLoaderData['verifiedEmails']
  identityLinkCandidates: DashboardLoaderData['identityLinkCandidates']
  profile: DashboardProfile
  myIdentities: DashboardLoaderData['myIdentities']
  myVenuePrefs: DashboardLoaderData['myVenuePrefs']
  joinableVenues: DashboardLoaderData['joinableVenues']
  venueSports: DashboardLoaderData['venueSports']
  sports: DashboardLoaderData['sports']
  mySports: DashboardLoaderData['mySports']
  mySportProfiles: DashboardLoaderData['mySportProfiles']
  myPlayCities: DashboardLoaderData['myPlayCities']
  availablePlayCities: DashboardLoaderData['availablePlayCities']
  gearItems: DashboardLoaderData['gearItems']
  gearImages: DashboardLoaderData['gearImages']
  gearStringJobs: DashboardLoaderData['gearStringJobs']
  gearShowcaseEntries: DashboardLoaderData['gearShowcaseEntries']
  myAdminVenues: DashboardLoaderData['myAdminVenues']
  isSuperAdmin: boolean
}

const EMPTY_PROFILE: DashboardProfile = {
  display_name: '',
  first_name: null,
  last_name: null,
  gender: 'unspecified',
  availability_status: 'available',
  availability_note: null,
  availability_until: null,
  primary_venue_id: null,
  contact_channel: 'email',
  contact_email: null,
  profile_contact_email_normalized: null,
  profile_contact_email_verified_at: null,
  contact_phone: null,
  avatar_url: null,
  visible_in_city_discovery: false,
  searchable_by_contact_info: false,
  allow_non_group_invites: true,
  shared_group_join_preference: 'auto_join_saved_players',
  looking_to_play: null,
  preferred_play_times: [],
}

export function buildDashboardPageViewModel(loaderData: DashboardLoaderData): DashboardPageViewModel {
  return {
    userId: loaderData.user.id,
    userEmail: loaderData.user.email ?? null,
    items: loaderData.items,
    inboxUnreadCount: loaderData.inboxUnreadCount,
    playersData: loaderData.playersData,
    inviteCircle: loaderData.inviteCircle,
    verifiedEmails: loaderData.verifiedEmails,
    identityLinkCandidates: loaderData.identityLinkCandidates,
    profile: loaderData.profile ?? {
      ...EMPTY_PROFILE,
      display_name: loaderData.user.email ?? '',
    },
    myIdentities: loaderData.myIdentities,
    myVenuePrefs: loaderData.myVenuePrefs,
    joinableVenues: loaderData.joinableVenues,
    venueSports: loaderData.venueSports,
    sports: loaderData.sports,
    mySports: loaderData.mySports,
    mySportProfiles: loaderData.mySportProfiles,
    myPlayCities: loaderData.myPlayCities,
    availablePlayCities: loaderData.availablePlayCities,
    gearItems: loaderData.gearItems,
    gearImages: loaderData.gearImages,
    gearStringJobs: loaderData.gearStringJobs,
    gearShowcaseEntries: loaderData.gearShowcaseEntries,
    myAdminVenues: loaderData.myAdminVenues,
    isSuperAdmin: loaderData.isSuperAdmin,
  }
}
