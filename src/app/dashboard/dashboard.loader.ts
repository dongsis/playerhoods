import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData, type MatchListItem } from '@/lib/api/matches'
import { getUnreadNotificationCount } from '@/lib/api/notifications'
import { getAllPlayersGroupedByVenue, type PlayersData } from '@/lib/api/players'
import { getMyPlayCities } from '@/lib/api/discovery'
import { getIdentityLinkCandidates, reconcileIdentityGuestParticipants } from '@/lib/api/identity-links'
import { getMyVenueMemberships, getMyVenuePreferences, type VenueMembership } from '@/lib/api/identities'
import { getAllVenues, isSuperAdmin, getMyAdminVenues, listVenueSports } from '@/lib/api/venues'
import { listSports, getMySports } from '@/lib/api/sports'
import { getInviteCircleList, type InviteCircleRow } from '@/lib/api/play-network'
import { listLocationCityOptions, type LocationCityOption } from '@/lib/api/location-municipalities'
import { getMySportProfiles } from '@/lib/api/player-profiles'
import { listMyGearImages, listMyGearItems, listMyGearShowcaseEntries, listMyGearStringJobs } from '@/lib/api/gear'
import type { GearImage, GearItem, GearShowcaseEntry, GearStringJob, IdentityLinkCandidate, Profile, UserPlayCity, UserVerifiedEmail, Venue, VenueAdmin, VenueSport, Sport, UserSport, UserSportProfile } from '@/lib/types/database'

type DashboardUser = NonNullable<Awaited<ReturnType<typeof getUser>>>
type DashboardSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type DashboardLoaderData = {
  user: DashboardUser
  items: MatchListItem[]
  inboxUnreadCount: number
  playersData: PlayersData
  inviteCircle: InviteCircleRow[]
  verifiedEmails: UserVerifiedEmail[]
  identityLinkCandidates: IdentityLinkCandidate[]
  myVenueMemberships: VenueMembership[]
  joinableVenues: Venue[]
  venueSports: VenueSport[]
  sports: Sport[]
  mySports: UserSport[]
  mySportProfiles: UserSportProfile[]
  myPlayCities: UserPlayCity[]
  availablePlayCities: LocationCityOption[]
  gearItems: GearItem[]
  gearImages: GearImage[]
  gearStringJobs: GearStringJob[]
  gearShowcaseEntries: GearShowcaseEntry[]
  isSuperAdmin: boolean
  myAdminVenues: (VenueAdmin & { venue: Venue })[]
  profile: Pick<
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
    | 'discovery_volume'
    | 'accepting_new_invites'
    | 'allow_non_group_invites'
    | 'shared_group_join_preference'
    | 'looking_to_play'
      | 'preferred_play_times'
  > | null
  myVenuePrefs: Venue[]
}

function isMissingVerifiedEmailRpcError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown }
  const code = typeof candidate?.code === 'string' ? candidate.code : ''
  const message = typeof candidate?.message === 'string' ? candidate.message : ''
  const details = typeof candidate?.details === 'string' ? candidate.details : ''
  const text = `${message}\n${details}`.toLowerCase()

  return code === 'PGRST202'
    || code === '42883'
    || (
      text.includes('rpc_my_verified_emails')
      && (
        text.includes('could not find')
        || text.includes('does not exist')
        || text.includes('undefined function')
      )
    )
}

async function loadVerifiedEmails(
  supabase: DashboardSupabaseClient,
  userId: string,
): Promise<UserVerifiedEmail[]> {
  const rpcResult = await supabase.rpc('rpc_my_verified_emails')

  if (!rpcResult.error) {
    return (rpcResult.data ?? []) as UserVerifiedEmail[]
  }

  if (!isMissingVerifiedEmailRpcError(rpcResult.error)) {
    console.error('[Dashboard] verified emails rpc:', rpcResult.error)
    return []
  }

  // Temporary server-side fallback for the merge-before-migration window.
  const fallbackResult = await supabase
    .from('v_user_verified_emails')
    .select('*')
    .eq('user_id', userId)

  if (fallbackResult.error) {
    console.error('[Dashboard] verified emails fallback:', fallbackResult.error)
    return []
  }

  return (fallbackResult.data ?? []) as UserVerifiedEmail[]
}

export async function loadDashboardPageData(): Promise<DashboardLoaderData> {
  noStore()

  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = await createSupabaseServerClient()
  await reconcileIdentityGuestParticipants(supabase).catch((error) => {
    console.error('[Dashboard] reconcile identity:', error)
  })

  const [
    items,
    inboxUnreadCount,
    playersData,
    inviteCircle,
    verifiedEmails,
    identityLinkCandidates,
    myVenueMemberships,
    joinableVenues,
    venueSports,
    sports,
    mySports,
    mySportProfiles,
    myPlayCities,
    availablePlayCities,
    gearItems,
    gearImages,
    gearStringJobs,
    gearShowcaseEntries,
    superAdmin,
    myAdminVenues,
    profileRes,
    myVenuePrefs,
  ] = await Promise.all([
    getMatchListData(supabase, user.id).catch((error) => {
      console.error('[Dashboard] match list:', error)
      return [] as MatchListItem[]
    }),
    getUnreadNotificationCount(supabase).catch(() => 0),
    getAllPlayersGroupedByVenue(supabase, user.id).catch(() => ({
      venues: [],
      groups: [],
      noVenue: [],
      pendingGroupInvites: [],
      proxyPendingCount: 0,
    }) as PlayersData),
    getInviteCircleList(supabase).catch(() => [] as InviteCircleRow[]),
    loadVerifiedEmails(supabase, user.id),
    getIdentityLinkCandidates(supabase).catch(() => [] as IdentityLinkCandidate[]),
    getMyVenueMemberships(supabase, user.id).catch(() => [] as VenueMembership[]),
    getAllVenues(supabase).catch(() => [] as Venue[]),
    listVenueSports(supabase).catch(() => [] as VenueSport[]),
    listSports(supabase).catch(() => [] as Sport[]),
    getMySports(supabase).catch(() => [] as UserSport[]),
    getMySportProfiles(supabase, user.id).catch(() => [] as UserSportProfile[]),
    getMyPlayCities(supabase, user.id).catch(() => [] as UserPlayCity[]),
    listLocationCityOptions(supabase, { countryCode: 'CA', provinceCode: 'ON' }).catch(() => [] as LocationCityOption[]),
    listMyGearItems(supabase, user.id).catch(() => [] as GearItem[]),
    listMyGearImages(supabase, user.id).catch(() => [] as GearImage[]),
    listMyGearStringJobs(supabase, user.id).catch(() => [] as GearStringJob[]),
    listMyGearShowcaseEntries(supabase, user.id).catch(() => [] as GearShowcaseEntry[]),
    isSuperAdmin(supabase),
    getMyAdminVenues(supabase).catch(() => [] as (VenueAdmin & { venue: Venue })[]),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getMyVenuePreferences(supabase, user.id).catch(() => [] as Venue[]),
  ])

  return {
    user,
    items,
    inboxUnreadCount,
    playersData,
    inviteCircle,
    verifiedEmails,
    identityLinkCandidates,
    myVenueMemberships,
    joinableVenues,
    venueSports,
    sports,
    mySports,
    mySportProfiles,
    myPlayCities,
    availablePlayCities,
    gearItems,
    gearImages,
    gearStringJobs,
    gearShowcaseEntries,
    isSuperAdmin: superAdmin,
    myAdminVenues,
    profile: profileRes.error
      ? null
      : (profileRes.data as Pick<
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
          | 'discovery_volume'
          | 'accepting_new_invites'
          | 'allow_non_group_invites'
          | 'shared_group_join_preference'
          | 'looking_to_play'
          | 'preferred_play_times'
        > | null),
    myVenuePrefs,
  }
}
