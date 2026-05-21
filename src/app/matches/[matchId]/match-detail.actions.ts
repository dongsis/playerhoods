'use server'

import { revalidatePath } from 'next/cache'
import { acceptIdentityLinkCandidate, keepSeparateIdentityLinkCandidate } from '@/lib/api/identity-links'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  cancelMatch,
  rebalanceMatchRosterAfterEdit,
  removeParticipant,
  sendMatchMessage,
  setMatchCourts,
  updateMatchCourtPlan,
  updateMatchDetails,
} from '@/lib/api/matches'
import type { MatchLineupSnapshot } from '@/lib/match-lineup'
import { sendParticipantRemovedNotification } from '@/lib/email/send-participant-notifications'
import {
  notifyMatchCourtPlanUpdated,
} from '@/lib/notifications/match-court'
import { NotificationService } from '@/lib/notifications/notification-service'
import { drainQueuedNotificationDeliveries } from '@/lib/notifications/workers/process-queued-notification-deliveries'
import type { MatchCourtPlanMode, MatchDoublesFormat } from '@/lib/types/database'

export type MatchUpdateInput = {
  match_date?: string | null
  start_time?: string | null
  duration_minutes?: number | null
  required_count?: number | null
  invitation_scope_group_ids?: string[] | null
  invitation_scope_user_ids?: string[] | null
  doubles_format?: MatchDoublesFormat | null
  organizer_note?: string | null
}

export type MatchCourtPlanUpdateInput = {
  court_plan_mode: MatchCourtPlanMode
  court_note?: string | null
  final_court_label?: string | null
}

type MatchNotificationSnapshot = {
  id: string
  game_type: string | null
  match_date: string | null
  start_time: string | null
}

type MatchRemovalNotificationSnapshot = MatchNotificationSnapshot & {
  organizer_id: string
  venue_id: string | null
}

type IdentityLinkActionResult = { ok: true } | { ok: false; error: string }

function buildCriticalChangeSet(
  previous: MatchNotificationSnapshot,
  next: MatchUpdateInput,
) {
  const changeSet: Record<string, { old: unknown; new: unknown }> = {}

  if (next.match_date !== undefined && next.match_date !== previous.match_date) {
    changeSet.match_date = { old: previous.match_date, new: next.match_date }
  }
  if (next.start_time !== undefined && next.start_time !== previous.start_time) {
    changeSet.start_time = { old: previous.start_time, new: next.start_time }
  }
  if (next.duration_minutes !== undefined) {
    changeSet.duration_minutes = { old: null, new: next.duration_minutes }
  }

  return changeSet
}

function getIdentityLinkActionError(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('not_authenticated')) return 'Please log in again.'
  if (message.includes('review_required')) return 'Please verify your contact information before linking.'
  if (message.includes('guest_not_found')) return 'This invitation is no longer available to link.'
  return 'Could not link this invitation. Please try again.'
}

function revalidateMatchSurfaces(matchId: string) {
  revalidatePath(`/matches/${matchId}`)
  revalidatePath('/matches')
  revalidatePath('/dashboard')
  revalidatePath('/profile')
  revalidatePath('/onboarding/next-steps')
}

export async function updateMatchDetailsAction(
  matchId: string,
  venueName: string | null,
  matchSnapshot: MatchNotificationSnapshot,
  data: MatchUpdateInput,
) {
  const supabase = await createSupabaseServerClient()
  await updateMatchDetails(supabase, matchId, data)
  if (data.required_count !== undefined || data.doubles_format !== undefined) {
    await rebalanceMatchRosterAfterEdit(supabase, matchId)
  }

  const criticalChangeSet = buildCriticalChangeSet(matchSnapshot, data)
  if (Object.keys(criticalChangeSet).length > 0) {
    await NotificationService.enqueueCriticalUpdateNotifications(
      supabase,
      matchId,
      criticalChangeSet,
    )
  }

  revalidateMatchSurfaces(matchId)
}

export async function updateMatchScopeGroupsAction(
  matchId: string,
  venueName: string | null,
  matchSnapshot: MatchNotificationSnapshot,
  invitationScopeGroupIds: string[],
) {
  await updateMatchDetailsAction(matchId, venueName, matchSnapshot, {
    invitation_scope_group_ids: invitationScopeGroupIds,
  })
}

export async function setMatchCourtsAction(matchId: string, courtLabels: string[]) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  await setMatchCourts(supabase, matchId, courtLabels, user.id)
  revalidateMatchSurfaces(matchId)
}

export async function updateMatchCourtPlanAction(matchId: string, data: MatchCourtPlanUpdateInput) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  await updateMatchCourtPlan(supabase, matchId, user.id, data)
  await notifyMatchCourtPlanUpdated(supabase, {
    matchId,
    actorUserId: user.id,
    courtPlanMode: data.court_plan_mode,
    finalCourtLabel: data.final_court_label ?? null,
    courtNote: data.court_note ?? null,
  })
  revalidateMatchSurfaces(matchId)
}

export async function updateMatchOrganizerNoteAction(matchId: string, organizerNote: string | null) {
  const supabase = await createSupabaseServerClient()
  await updateMatchDetails(supabase, matchId, {
    organizer_note: organizerNote?.trim() || null,
  })
  revalidateMatchSurfaces(matchId)
}

export async function postMatchMessageAction(matchId: string, body: string) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  await sendMatchMessage(supabase, matchId, user.id, body)
  revalidateMatchSurfaces(matchId)
}

export async function saveMatchLineupAction(matchId: string, lineup: MatchLineupSnapshot | null) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('organizer_id, game_type, match_date, start_time, venue_id')
    .eq('id', matchId)
    .maybeSingle<MatchRemovalNotificationSnapshot>()

  if (matchError) {
    throw matchError
  }
  if (!match) {
    throw new Error('match_not_found')
  }
  if (match.organizer_id !== user.id) {
    throw new Error('only_organizer_can_manage_lineup')
  }

  const { error } = await supabase
    .from('matches')
    .update({ lineup_snapshot: lineup })
    .eq('id', matchId)

  if (error) {
    throw error
  }

  revalidateMatchSurfaces(matchId)
}

export async function confirmMatchAndNotifyAction(matchId: string) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  await NotificationService.confirmMatchAndNotify(supabase, matchId)
  await drainQueuedNotificationDeliveries(supabase, { batchSize: 10, maxBatches: 5 })
  revalidateMatchSurfaces(matchId)
}

export async function cancelMatchWithReasonAction(matchId: string, reason: string) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  const trimmedReason = reason.trim()
  if (!trimmedReason) {
    throw new Error('cancel_reason_required')
  }

  await cancelMatch(supabase, matchId)
  await NotificationService.enqueueCriticalUpdateNotifications(
    supabase,
    matchId,
    {
      status: { old: 'active', new: 'cancelled' },
    },
  )
  await sendMatchMessage(
    supabase,
    matchId,
    user.id,
    `Match cancelled by organizer. Reason: ${trimmedReason}`,
  )
  revalidateMatchSurfaces(matchId)
}

export async function removeMatchParticipantAction(
  matchId: string,
  participantId: string,
  note?: string | null,
) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser()
  if (!user) {
    throw new Error('not_authenticated')
  }

  const { data: participant, error: participantError } = await supabase
    .from('match_participants')
    .select('id, match_id, status, manual_confirmed_by, removed_at')
    .eq('id', participantId)
    .maybeSingle()

  if (participantError) {
    throw participantError
  }
  if (!participant || participant.match_id !== matchId) {
    throw new Error('participant_not_found')
  }
  if (participant.removed_at) {
    throw new Error('participant_already_removed')
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('organizer_id, game_type, match_date, start_time, venue_id')
    .eq('id', matchId)
    .maybeSingle()

  if (matchError) {
    throw matchError
  }
  if (!match) {
    throw new Error('match_not_found')
  }

  const organizerId = match.organizer_id
  const isOrganizer = organizerId === user.id

  if (!isOrganizer) {
    throw new Error('only_organizer_can_remove_participant')
  }

  await removeParticipant(supabase, participantId, note ?? null)
  let venueName: string | null = null
  if (match.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name')
      .eq('id', match.venue_id)
      .maybeSingle()
    venueName = venue?.name ?? null
  }
  await sendParticipantRemovedNotification(
    supabase,
    participantId,
    {
      id: matchId,
      game_type: match.game_type,
      match_date: match.match_date,
      start_time: match.start_time,
    },
    venueName,
  )
  revalidateMatchSurfaces(matchId)
}

export async function acceptMatchIdentityLinkAction(matchId: string, guestId: string): Promise<IdentityLinkActionResult> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  try {
    const supabase = await createSupabaseServerClient()
    await acceptIdentityLinkCandidate(supabase, guestId)
    revalidateMatchSurfaces(matchId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}

export async function keepSeparateMatchIdentityLinkAction(matchId: string, guestId: string): Promise<IdentityLinkActionResult> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Please log in again.' }

  try {
    const supabase = await createSupabaseServerClient()
    await keepSeparateIdentityLinkCandidate(supabase, guestId)
    revalidateMatchSurfaces(matchId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: getIdentityLinkActionError(error) }
  }
}
