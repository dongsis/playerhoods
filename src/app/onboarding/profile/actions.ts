'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LEGAL_AGREEMENT_VERSION } from '@/lib/legal'
import {
  BasicProfileValidationError,
  normalizeCompleteFirstOnboardingInput,
  type CompleteFirstOnboardingInput,
} from '@/lib/profile/basic-profile'

type CompleteFirstOnboardingActionInput = CompleteFirstOnboardingInput & {
  legal_confirmed?: boolean
}

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
    case 'invalid_play_city':
      return 'Choose a city from the approved city list.'
    case 'invalid_club_or_venue':
      return 'One of the selected venues could not be found.'
    case 'club_city_mismatch':
      return 'One of the selected venues does not match your chosen play cities.'
    case 'relationship_not_allowed_for_venue_kind':
      return 'One of the selected venues can be saved, but not joined as a club membership.'
    case 'legal_confirmation_required':
      return 'Please confirm before continuing.'
    case 'not_authenticated':
      return 'Please log in again.'
    default:
      return code && !code.startsWith('{') ? code : 'Failed to save your profile.'
  }
}

export async function completeFirstOnboardingAction(input: CompleteFirstOnboardingActionInput) {
  try {
    if (!input.legal_confirmed) {
      throw new BasicProfileValidationError('legal_confirmation_required', 'Please confirm before continuing.')
    }

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

    const { error: discoveryError } = await supabase.rpc('rpc_profile_update_discovery_preferences', {
      p_discovery_volume: normalized.discovery_volume,
      p_accepting_new_invites: normalized.accepting_new_invites,
    })

    if (discoveryError) throw discoveryError

    const { error: legalError } = await supabase.rpc('rpc_complete_onboarding_legal_agreement', {
      p_age_confirmation_version: LEGAL_AGREEMENT_VERSION,
      p_terms_version: LEGAL_AGREEMENT_VERSION,
      p_privacy_version: LEGAL_AGREEMENT_VERSION,
      p_responsible_use_version: LEGAL_AGREEMENT_VERSION,
    })

    if (legalError) throw legalError

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
