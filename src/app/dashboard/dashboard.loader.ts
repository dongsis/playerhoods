import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData, type MatchListItem } from '@/lib/api/matches'
import { getUnreadNotificationCount } from '@/lib/api/notifications'
import { getAllPlayersGroupedByVenue, type PlayersData } from '@/lib/api/players'
import { getMyPlayCities } from '@/lib/api/discovery'
import { getIdentityLinkCandidates, reconcileIdentityGuestParticipants } from '@/lib/api/identity-links'
import { getMyVenueIdentities, getJoinableVenues, getMyVenuePreferences } from '@/lib/api/identities'
import { isSuperAdmin, getMyAdminVenues } from '@/lib/api/venues'
import { listSports, getMySports } from '@/lib/api/sports'
import { getInviteCircleList, type InviteCircleRow } from '@/lib/api/play-network'
import { getMySportProfiles } from '@/lib/api/player-profiles'
import { listMyGearImages, listMyGearItems, listMyGearShowcaseEntries, listMyGearStringJobs } from '@/lib/api/gear'
import type { GearImage, GearItem, GearShowcaseEntry, GearStringJob, IdentityLinkCandidate, Profile, UserPlayCity, UserVerifiedEmail, VenueIdentity, Venue, VenueAdmin, Sport, UserSport, UserSportProfile } from '@/lib/types/database'

type DashboardUser = NonNullable<Awaited<ReturnType<typeof getUser>>>

export type DashboardLoaderData = {
  user: DashboardUser
  items: MatchListItem[]
  inboxUnreadCount: number
  playersData: PlayersData
  inviteCircle: InviteCircleRow[]
  verifiedEmails: UserVerifiedEmail[]
  identityLinkCandidates: IdentityLinkCandidate[]
  myIdentities: (VenueIdentity & { venue: Venue })[]
  joinableVenues: Venue[]
  sports: Sport[]
  mySports: UserSport[]
  mySportProfiles: UserSportProfile[]
  myPlayCities: UserPlayCity[]
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
    | 'allow_non_group_invites'
    | 'shared_group_join_preference'
    | 'looking_to_play'
      | 'preferred_play_times'
  > | null
  myVenuePrefs: Venue[]
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
    myIdentities,
    joinableVenues,
    sports,
    mySports,
    mySportProfiles,
    myPlayCities,
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
    supabase.from('v_user_verified_emails').select('*').eq('user_id', user.id),
    getIdentityLinkCandidates(supabase).catch(() => [] as IdentityLinkCandidate[]),
    getMyVenueIdentities(supabase, user.id).catch(() => [] as (VenueIdentity & { venue: Venue })[]),
    getJoinableVenues(supabase, user.id).catch(() => [] as Venue[]),
    listSports(supabase).catch(() => [] as Sport[]),
    getMySports(supabase).catch(() => [] as UserSport[]),
    getMySportProfiles(supabase, user.id).catch(() => [] as UserSportProfile[]),
    getMyPlayCities(supabase, user.id).catch(() => [] as UserPlayCity[]),
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
    verifiedEmails: verifiedEmails.error ? [] : (verifiedEmails.data ?? []),
    identityLinkCandidates,
    myIdentities,
    joinableVenues,
    sports,
    mySports,
    mySportProfiles,
    myPlayCities,
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
          | 'allow_non_group_invites'
          | 'shared_group_join_preference'
          | 'looking_to_play'
          | 'preferred_play_times'
        > | null),
    myVenuePrefs,
  }
}
