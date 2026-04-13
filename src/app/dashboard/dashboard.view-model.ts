import type { Profile } from '@/lib/types/database'
import type { DashboardLoaderData } from './dashboard.loader'

type DashboardProfile = Pick<
  Profile,
  | 'display_name'
  | 'first_name'
  | 'last_name'
  | 'gender'
  | 'primary_venue_id'
  | 'contact_channel'
  | 'contact_email'
  | 'contact_phone'
  | 'avatar_url'
  | 'show_in_venue_member_discovery'
  | 'allow_non_group_invites'
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
  profile: DashboardProfile
  myIdentities: DashboardLoaderData['myIdentities']
  myVenuePrefs: DashboardLoaderData['myVenuePrefs']
  joinableVenues: DashboardLoaderData['joinableVenues']
  sports: DashboardLoaderData['sports']
  mySports: DashboardLoaderData['mySports']
  mySportProfiles: DashboardLoaderData['mySportProfiles']
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
  primary_venue_id: null,
  contact_channel: 'email',
  contact_email: null,
  contact_phone: null,
  avatar_url: null,
  show_in_venue_member_discovery: true,
  allow_non_group_invites: true,
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
    profile: loaderData.profile ?? {
      ...EMPTY_PROFILE,
      display_name: loaderData.user.email ?? '',
    },
    myIdentities: loaderData.myIdentities,
    myVenuePrefs: loaderData.myVenuePrefs,
    joinableVenues: loaderData.joinableVenues,
    sports: loaderData.sports,
    mySports: loaderData.mySports,
    mySportProfiles: loaderData.mySportProfiles,
    gearItems: loaderData.gearItems,
    gearImages: loaderData.gearImages,
    gearStringJobs: loaderData.gearStringJobs,
    gearShowcaseEntries: loaderData.gearShowcaseEntries,
    myAdminVenues: loaderData.myAdminVenues,
    isSuperAdmin: loaderData.isSuperAdmin,
  }
}
