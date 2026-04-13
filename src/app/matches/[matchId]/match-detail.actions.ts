'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  rebalanceMatchRosterAfterEdit,
  removeParticipant,
  setMatchCourts,
  updateMatchCourtPlan,
  updateMatchDetails,
} from '@/lib/api/matches'
import { sendMatchTimeChangeEmails } from '@/lib/email/send-participant-notifications'
import {
  notifyMatchCourtPlanUpdated,
} from '@/lib/notifications/match-court'
import type { MatchCourtPlanMode, MatchDoublesFormat } from '@/lib/types/database'

export type MatchUpdateInput = {
  match_date?: string | null
  start_time?: string | null
  duration_minutes?: number | null
  required_count?: number | null
  invitation_scope_group_ids?: string[] | null
  doubles_format?: MatchDoublesFormat | null
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

function revalidateMatchSurfaces(matchId: string) {
  revalidatePath(`/matches/${matchId}`)
  revalidatePath('/matches')
  revalidatePath('/dashboard')
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

  if (
    data.match_date !== undefined ||
    data.start_time !== undefined ||
    data.duration_minutes !== undefined
  ) {
    await sendMatchTimeChangeEmails(
      supabase,
      {
        ...matchSnapshot,
        ...data,
      },
      venueName,
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

export async function removeMatchParticipantAction(matchId: string, participantId: string) {
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
    .select('organizer_id')
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

  await removeParticipant(supabase, participantId)
  revalidateMatchSurfaces(matchId)
}
