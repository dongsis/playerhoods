'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  BasicProfileValidationError,
  normalizeCompleteFirstOnboardingInput,
  type CompleteFirstOnboardingInput,
} from '@/lib/profile/basic-profile'

function mapOnboardingError(error: unknown) {
  const code =
    error instanceof BasicProfileValidationError
      ? error.code
      : error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : error instanceof Error
          ? error.message
          : 'Failed to save your profile.'

  switch (code) {
    case 'display_name_required':
      return 'Please enter your display name.'
    case 'sports_required':
      return 'Choose at least one sport.'
    case 'invalid_sport_id':
      return 'One of the selected sports is no longer available.'
    case 'city_required':
      return 'Each play city needs a name.'
    case 'too_many_play_cities':
    case 'play_cities_limit_exceeded':
      return 'You can add up to 8 play cities.'
    case 'duplicate_play_city':
      return 'A play city is listed more than once.'
    case 'invalid_club_or_venue':
      return 'One of the selected venues could not be found.'
    case 'club_city_mismatch':
      return 'One of the selected venues does not match your chosen play cities.'
    case 'relationship_not_allowed_for_venue_kind':
      return 'One of the selected venues can be saved, but not joined as a club membership.'
    case 'not_authenticated':
      return 'Please log in again.'
    default:
      return code && !code.startsWith('{') ? code : 'Failed to save your profile.'
  }
}

export async function completeFirstOnboardingAction(input: CompleteFirstOnboardingInput) {
  try {
    const normalized = normalizeCompleteFirstOnboardingInput(input)
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase.rpc('rpc_complete_first_onboarding', {
      p_display_name: normalized.display_name,
      p_sport_ids: normalized.sport_ids,
      p_play_cities: normalized.play_cities,
      p_venue_ids: normalized.club_or_venue_ids,
      p_visible_in_city_discovery: normalized.visible_in_city_discovery,
      p_visible_in_club_member_discovery: normalized.visible_in_club_member_discovery,
    })

    if (error) throw error

    revalidatePath('/dashboard')
    revalidatePath('/onboarding/profile')
    revalidatePath('/onboarding/next-steps')
    revalidatePath('/profile')

    return {
      ok: true as const,
      primarySportId: normalized.sport_ids[0] ?? null,
      summary: data,
    }
  } catch (error) {
    return {
      ok: false as const,
      error: mapOnboardingError(error),
    }
  }
}
