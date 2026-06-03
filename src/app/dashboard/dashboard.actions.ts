'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { cancelMatch } from '@/lib/api/matches'
import { replaceMyPlayCities } from '@/lib/api/discovery'
import { acceptIdentityLinkCandidate, keepSeparateIdentityLinkCandidate } from '@/lib/api/identity-links'
import {
  updateProfile,
  setDisplayName,
  setPrimaryVenue,
  setVenueRelationshipMemberDiscovery,
  addVenuePreference,
  joinVenue,
  leaveVenue,
  removeVenuePreference,
} from '@/lib/api/identities'
import { setUserSports } from '@/lib/api/sports'
import { saveMySportProfile } from '@/lib/api/player-profiles'
import {
  archiveGearItem,
  createGearImage,
  createGearItem,
  createGearStringJob,
  deleteGearImage,
  deleteGearItem,
  deleteGearShowcaseEntry,
  deleteGearStringJob,
  moveWishlistItemToOwned,
  updateGearImage,
  updateGearItem,
  upsertGearShowcaseEntry,
  type GearImageInput,
  type GearItemInput,
  type GearShowcaseEntryInput,
  type GearStringJobInput,
} from '@/lib/api/gear'
import { importGearDraftFromLink } from '@/lib/gear-link-import'
import { createRosterGuest, getContactPlayerResolution } from '@/lib/api/roster'
import { normalizePlayCities } from '@/lib/profile/basic-profile'
import type { DiscoveryVolume } from '@/lib/types/database'
import {
  parseContactScreenshotUploads,
  type ContactImportDraft,
  type ContactScreenshotImportCreatedContact,
  type ContactScreenshotImportResult,
  type ContactScreenshotUpload,
} from '@/lib/contact-screenshot-import'

function revalidateProfileSurfaces() {
  revalidatePath('/dashboard')
  revalidatePath('/profile')
}

export type DashboardPreferenceSaveResult =
  | { ok: true }
  | { ok: false; error: string }

export type IdentityLinkActionResult =
  | { ok: true }
  | { ok: false; error: string }

function getActionErrorMessage(error: unknown, fallback: string): string {
  const normalize = (message: string) => {
    if (message.includes('invalid_play_city') || message.includes('invalid_group_city')) {
      return 'Choose a city from the approved city list.'
    }
    return message
  }
  if (error instanceof Error && error.message.trim()) return normalize(error.message)
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string' &&
    (error as { message: string }).message.trim()
  ) {
    return normalize((error as { message: string }).message)
  }
  return fallback
}

function getIdentityLinkActionError(error: unknown): string {
  const message = getActionErrorMessage(error, '')
  if (message.includes('not_authenticated')) return 'Please log in again.'
  if (message.includes('review_required')) return 'Please verify your contact information before linking.'
  if (message.includes('guest_not_found')) return 'This invitation is no longer available to link.'
  return 'Could not link this invitation. Please try again.'
}

export async function cancelDashboardMatchAction(matchId: string) {
  const supabase = await createSupabaseServerClient()
  await cancelMatch(supabase, matchId)
  revalidatePath('/dashboard')
}

export async function refreshDashboardAction() {
  revalidateProfileSurfaces()
}

export async function acceptDashboardIdentityLinkAction(guestId: string): Promise<IdentityLinkActionResult> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  try {
    const supabase = await createSupabaseServerClient()
    await acceptIdentityLinkCandidate(supabase, guestId)
    revalidateProfileSurfaces()
    revalidatePath('/onboarding/next-steps')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}

export async function keepSeparateDashboardIdentityLinkAction(guestId: string): Promise<IdentityLinkActionResult> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  try {
    const supabase = await createSupabaseServerClient()
    await keepSeparateIdentityLinkCandidate(supabase, guestId)
    revalidateProfileSurfaces()
    revalidatePath('/onboarding/next-steps')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}

export async function updateDashboardProfileAction(formData: FormData) {
  const supabase = await createSupabaseServerClient()
  const contactChannel = formData.get('contact_channel') as string | null
  const preferredPlayTimesPresent = formData.get('preferred_play_times_present') === '1'
  const preferredPlayTimes = formData.getAll('preferred_play_times')
    .filter((value): value is string => typeof value === 'string')

  await updateProfile(supabase, {
    first_name: (formData.get('first_name') as string) || undefined,
    last_name: (formData.get('last_name') as string) || undefined,
    gender: formData.has('gender') ? ((formData.get('gender') as 'male' | 'female' | 'unspecified') ?? 'unspecified') : undefined,
    contact_channel: contactChannel === 'email' || contactChannel === 'sms' ? contactChannel : undefined,
    contact_email: formData.has('contact_email') ? (formData.get('contact_email') as string) ?? '' : undefined,
    contact_phone: formData.has('contact_phone') ? (formData.get('contact_phone') as string) ?? '' : undefined,
    looking_to_play: formData.has('looking_to_play') ? ((formData.get('looking_to_play') as string) ?? '') : undefined,
    preferred_play_times: preferredPlayTimesPresent ? preferredPlayTimes : undefined,
    availability_status: formData.has('availability_status') ? ((formData.get('availability_status') as 'available' | 'busy' | 'away' | 'inactive') ?? 'available') : undefined,
    availability_note: formData.has('availability_note') ? ((formData.get('availability_note') as string) ?? '') : undefined,
    availability_until: formData.has('availability_until') ? ((formData.get('availability_until') as string) ?? '') : undefined,
  })

  revalidateProfileSurfaces()
}

export async function setDashboardDisplayNameAction(newName: string) {
  const supabase = await createSupabaseServerClient()
  await setDisplayName(supabase, newName)
  revalidateProfileSurfaces()
}

export async function setDashboardPrimaryVenueAction(venueId: string) {
  const supabase = await createSupabaseServerClient()
  await setPrimaryVenue(supabase, venueId)
  revalidateProfileSurfaces()
}

function mapJoinVenueError(error: unknown): string {
  const message = (error as { message?: string })?.message ?? String(error ?? '')
  if (message.includes('already_member')) return 'You have already joined this venue.'
  if (message.includes('venue_not_found') || message.includes('club_not_found')) return 'That venue could not be found.'
  if (message.includes('relationship_not_allowed_for_venue_kind')) return 'This venue cannot be joined in that way.'
  if (message.includes('not_authenticated')) return 'Please log in again.'
  return message || 'Failed to join venue.'
}

export async function joinDashboardVenueAction(venueId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  try {
    await joinVenue(supabase, venueId)
    revalidateProfileSurfaces()
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: mapJoinVenueError(error) }
  }
}

export async function leaveDashboardVenueAction(venueId: string) {
  const supabase = await createSupabaseServerClient()
  await leaveVenue(supabase, venueId)
  revalidateProfileSurfaces()
}

export async function saveDashboardVenuePreferenceAction(venueId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  try {
    await addVenuePreference(supabase, user.id, venueId)
    revalidateProfileSurfaces()
    return { ok: true }
  } catch (error: unknown) {
    const message = (error as { message?: string })?.message ?? String(error ?? '')
    if (message.includes('already') || message.includes('duplicate')) {
      return { ok: false, error: 'This venue is already saved.' }
    }
    if (message.includes('relationship_not_allowed_for_venue_kind')) {
      return { ok: false, error: 'This venue cannot be saved in that way.' }
    }
    if (message.includes('not_authenticated')) {
      return { ok: false, error: 'Please log in again.' }
    }
    return { ok: false, error: message || 'Failed to save venue.' }
  }
}

export async function saveDashboardGlobalPreferencesAction(params: {
  visible_in_city_discovery?: boolean
  searchable_by_email_or_phone?: boolean
  discovery_volume?: DiscoveryVolume
  accepting_new_invites?: boolean
  play_cities?: Array<{ city_name: string; region?: string | null; country?: string | null }>
  allow_non_group_invites?: boolean
  shared_group_join_preference?: 'auto_join_saved_players' | 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
}): Promise<DashboardPreferenceSaveResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { play_cities: playCities, ...profileParams } = params
    if (playCities !== undefined) {
      const normalizedCities = normalizePlayCities(playCities)
      await replaceMyPlayCities(supabase, normalizedCities)
      const nextProfileParams = {
        ...profileParams,
        ...(normalizedCities.length === 0 ? { visible_in_city_discovery: false } : {}),
      }
      await updateProfile(supabase, {
        ...nextProfileParams,
      })
    } else {
      await updateProfile(supabase, profileParams)
    }
    revalidateProfileSurfaces()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error, 'Failed to update discovery settings.') }
  }
}

export async function setDashboardVenueMemberDiscoveryAction(
  venueId: string,
  visibleInVenueMemberDiscovery: boolean,
): Promise<DashboardPreferenceSaveResult> {
  try {
    const supabase = await createSupabaseServerClient()
    await setVenueRelationshipMemberDiscovery(supabase, venueId, visibleInVenueMemberDiscovery)
    revalidateProfileSurfaces()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error, 'Failed to update venue discovery visibility.') }
  }
}

export async function removeDashboardVenuePreferenceAction(venueId: string) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) return
  await removeVenuePreference(supabase, user.id, venueId)
  revalidateProfileSurfaces()
}

export async function setDashboardSportsAction(codes: string[]) {
  const supabase = await createSupabaseServerClient()
  await setUserSports(supabase, codes)
  revalidateProfileSurfaces()
}

export async function saveDashboardSportProfileAction(input: {
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
}) {
  const supabase = await createSupabaseServerClient()
  await saveMySportProfile(supabase, input)
  revalidateProfileSurfaces()
}

export async function createDashboardGearItemAction(input: GearItemInput) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) throw new Error('not_authenticated')
  const item = await createGearItem(supabase, user.id, input)
  revalidateProfileSurfaces()
  return item
}

export async function updateDashboardGearItemAction(itemId: string, input: Partial<GearItemInput>) {
  const supabase = await createSupabaseServerClient()
  const item = await updateGearItem(supabase, itemId, input)
  revalidateProfileSurfaces()
  return item
}

export async function deleteDashboardGearItemAction(itemId: string) {
  const supabase = await createSupabaseServerClient()
  await deleteGearItem(supabase, itemId)
  revalidateProfileSurfaces()
}

export async function archiveDashboardGearItemAction(itemId: string, archived: boolean) {
  const supabase = await createSupabaseServerClient()
  const item = await archiveGearItem(supabase, itemId, archived)
  revalidateProfileSurfaces()
  return item
}

export async function moveDashboardWishlistItemToOwnedAction(itemId: string) {
  const supabase = await createSupabaseServerClient()
  const item = await moveWishlistItemToOwned(supabase, itemId)
  revalidateProfileSurfaces()
  return item
}

export async function createDashboardGearImageAction(input: GearImageInput) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) throw new Error('not_authenticated')
  const image = await createGearImage(supabase, user.id, input)
  revalidateProfileSurfaces()
  return image
}

export async function updateDashboardGearImageAction(imageId: string, input: Partial<GearImageInput>) {
  const supabase = await createSupabaseServerClient()
  const image = await updateGearImage(supabase, imageId, input)
  revalidateProfileSurfaces()
  return image
}

export async function deleteDashboardGearImageAction(imageId: string) {
  const supabase = await createSupabaseServerClient()
  await deleteGearImage(supabase, imageId)
  revalidateProfileSurfaces()
}

export async function createDashboardGearStringJobAction(input: GearStringJobInput) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) throw new Error('not_authenticated')
  const job = await createGearStringJob(supabase, user.id, input)
  revalidateProfileSurfaces()
  return job
}

export async function deleteDashboardGearStringJobAction(jobId: string) {
  const supabase = await createSupabaseServerClient()
  await deleteGearStringJob(supabase, jobId)
  revalidateProfileSurfaces()
}

export async function upsertDashboardGearShowcaseEntryAction(input: GearShowcaseEntryInput) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) throw new Error('not_authenticated')
  const entry = await upsertGearShowcaseEntry(supabase, user.id, input)
  revalidateProfileSurfaces()
  return entry
}

export async function deleteDashboardGearShowcaseEntryAction(entryId: string) {
  const supabase = await createSupabaseServerClient()
  await deleteGearShowcaseEntry(supabase, entryId)
  revalidateProfileSurfaces()
}

export async function importDashboardWishlistLinkAction(url: string) {
  return importGearDraftFromLink(url)
}

function revalidateContactSurfaces() {
  revalidatePath('/dashboard')
  revalidatePath('/profile')
}

export async function parseDashboardContactScreenshotAction(
  uploads: ContactScreenshotUpload[],
): Promise<ContactImportDraft[]> {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) throw new Error('not_authenticated')
  if (!uploads.length) return []

  const existingContacts = await getContactPlayerResolution(supabase)
  return parseContactScreenshotUploads(supabase, uploads, existingContacts)
}

export async function importDashboardScreenshotContactsAction(
  drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>,
): Promise<ContactScreenshotImportResult> {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) throw new Error('not_authenticated')

  let created = 0
  let skipped = 0
  const createdContacts: ContactScreenshotImportCreatedContact[] = []

  for (const draft of drafts) {
    const displayName = draft.display_name.trim()
    const phone = (draft.phone ?? '').trim() || null
    const email = (draft.email ?? '').trim().toLowerCase() || null

    if (!displayName || (!phone && !email)) {
      skipped++
      continue
    }

    const newGuest = await createRosterGuest(supabase, {
      display_name: displayName,
      phone,
      email,
      notes: draft.source_file_name?.trim()
        ? `Imported from screenshot (${draft.source_file_name.trim()})`
        : 'Imported from screenshot',
    })
    created++
    createdContacts.push({
      guest_id: newGuest.id,
      display_name: displayName,
      phone,
      email,
    })
  }

  revalidateContactSurfaces()
  return { created, skipped, createdContacts }
}
