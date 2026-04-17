'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { cancelMatch } from '@/lib/api/matches'
import {
  updateProfile,
  setDisplayName,
  setVenueHandle,
  setPrimaryVenue,
  setVenueIdentityPreferences,
  checkVenueHandle,
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
import {
  parseContactScreenshotUploads,
  type ContactImportDraft,
  type ContactScreenshotUpload,
} from '@/lib/contact-screenshot-import'

function revalidateProfileSurfaces() {
  revalidatePath('/dashboard')
  revalidatePath('/profile')
}

export async function cancelDashboardMatchAction(matchId: string) {
  const supabase = await createSupabaseServerClient()
  await cancelMatch(supabase, matchId)
  revalidatePath('/dashboard')
}

export async function refreshDashboardAction() {
  revalidateProfileSurfaces()
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

export async function setDashboardVenueHandleAction(venueId: string, newHandle: string) {
  const supabase = await createSupabaseServerClient()
  await setVenueHandle(supabase, venueId, newHandle)
  revalidateProfileSurfaces()
}

export async function setDashboardPrimaryVenueAction(venueId: string) {
  const supabase = await createSupabaseServerClient()
  await setPrimaryVenue(supabase, venueId)
  revalidateProfileSurfaces()
}

export async function checkDashboardVenueHandleAction(venueId: string, handle: string) {
  const supabase = await createSupabaseServerClient()
  return checkVenueHandle(supabase, venueId, handle)
}

function mapJoinVenueError(error: unknown): string {
  const message = (error as { message?: string })?.message ?? String(error ?? '')
  if (message.includes('already_member')) return 'You have already joined this venue.'
  if (message.includes('club_not_found')) return 'That venue could not be found.'
  if (message.includes('invalid_handle')) {
    if (message.includes('at least 2 characters')) return 'Your display name must be at least 2 characters before joining a venue.'
    if (message.includes('at most 30 characters')) return 'Your display name must be 30 characters or fewer before joining a venue.'
    if (message.includes('must not contain @')) return 'Your display name cannot contain @ if it is used as a venue handle.'
    return 'Your display name cannot be used as a venue handle yet.'
  }
  if (message.includes('handle_taken')) return 'Your display name is already taken in this venue. Try changing your display name first.'
  if (message.includes('P0001')) return 'We could not join this venue with your current display name. Try a different display name first.'
  return message || 'Failed to join venue.'
}

export async function joinDashboardVenueAction(venueId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()
  if (profileError) return { ok: false, error: 'Could not load your profile.' }

  const displayName = profile?.display_name?.trim() ?? ''
  if (!displayName) {
    return { ok: false, error: 'Set your display name first, then you can join venues.' }
  }

  let availability
  try {
    availability = await checkVenueHandle(supabase, venueId, displayName)
  } catch (error: unknown) {
    return { ok: false, error: mapJoinVenueError(error) }
  }
  const candidates = availability.available
    ? [displayName]
    : availability.suggestions?.length
      ? availability.suggestions
      : [displayName]

  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      await joinVenue(supabase, venueId, candidate)
      revalidateProfileSurfaces()
      return { ok: true }
    } catch (error: unknown) {
      lastError = error
      const message = (error as { message?: string })?.message ?? ''
      if (!message.includes('handle_taken')) {
        break
      }
    }
  }

  return { ok: false, error: mapJoinVenueError(lastError) }
}

export async function leaveDashboardVenueAction(venueId: string) {
  const supabase = await createSupabaseServerClient()
  await leaveVenue(supabase, venueId)
  revalidateProfileSurfaces()
}

export async function saveDashboardGlobalPreferencesAction(params: {
  show_in_venue_member_discovery?: boolean
  allow_non_group_invites?: boolean
  shared_group_join_preference?: 'approval_required_all' | 'auto_join_enabled_sports' | 'auto_join_all'
}) {
  const supabase = await createSupabaseServerClient()
  await updateProfile(supabase, params)
  revalidateProfileSurfaces()
}

export async function setDashboardVenuePreferencesAction(venueId: string, params: {
  visible_in_venue_member_discovery?: 'true' | 'false' | 'inherit'
  accept_non_group_invites_in_venue?: 'true' | 'false' | 'inherit'
}) {
  const supabase = await createSupabaseServerClient()
  await setVenueIdentityPreferences(supabase, venueId, params)
  revalidateProfileSurfaces()
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
): Promise<{ created: number; skipped: number }> {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) throw new Error('not_authenticated')

  let created = 0
  let skipped = 0

  for (const draft of drafts) {
    const displayName = draft.display_name.trim()
    const phone = (draft.phone ?? '').trim() || null
    const email = (draft.email ?? '').trim().toLowerCase() || null

    if (!displayName || (!phone && !email)) {
      skipped++
      continue
    }

    await createRosterGuest(supabase, {
      display_name: displayName,
      phone,
      email,
      notes: draft.source_file_name?.trim()
        ? `Imported from screenshot (${draft.source_file_name.trim()})`
        : 'Imported from screenshot',
    })
    created++
  }

  revalidateContactSurfaces()
  return { created, skipped }
}
