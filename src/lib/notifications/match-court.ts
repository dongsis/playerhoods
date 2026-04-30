import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Match, MatchCourtPlanMode } from '@/lib/types/database'

type Client = SupabaseClient<Database>

type MatchCourtNotificationContext = {
  match: Pick<Match, 'id' | 'organizer_id' | 'venue_id'>
  participantUserIds: string[]
}

type NotificationInsert = {
  recipient_user_id: string
  kind: string
  match_id: string
  actor_user_id?: string | null
  note?: string | null
}

function dedupeUserIds(userIds: Array<string | null | undefined>): string[] {
  return Array.from(new Set(userIds.filter((value): value is string => Boolean(value))))
}

async function getMatchCourtNotificationContext(
  supabase: Client,
  matchId: string,
): Promise<MatchCourtNotificationContext> {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, organizer_id, venue_id')
    .eq('id', matchId)
    .single()
  if (matchError) throw matchError

  const { data: participants, error: participantsError } = await supabase
    .from('match_participants')
    .select('user_id, status, removed_at')
    .eq('match_id', matchId)
    .in('status', ['pending', 'confirmed', 'waiting_list'])

  if (participantsError) throw participantsError

  return {
    match,
    participantUserIds: dedupeUserIds(
      ((participants ?? []) as { user_id: string | null; removed_at: string | null }[])
        .filter((participant) => participant.removed_at == null)
        .map((participant) => participant.user_id),
    ),
  }
}

async function insertNotifications(
  supabase: Client,
  notifications: NotificationInsert[],
): Promise<void> {
  const deduped = Array.from(
    new Map(
      notifications
        .filter((notification) => notification.recipient_user_id)
        .map((notification) => [
          [
            notification.recipient_user_id,
            notification.kind,
            notification.match_id,
            notification.actor_user_id ?? '',
            notification.note ?? '',
          ].join(':'),
          notification,
        ]),
    ).values(),
  )

  if (deduped.length === 0) return

  const { error } = await supabase.from('notifications').insert(deduped)
  if (error) throw error
}

function describeCourtPlan(
  courtPlanMode: MatchCourtPlanMode,
  finalCourtLabel?: string | null,
  courtNote?: string | null,
): string {
  const trimmedCourt = finalCourtLabel?.trim() || null
  const trimmedNote = courtNote?.trim() || null

  let base: string
  switch (courtPlanMode) {
    case 'secured':
      base = trimmedCourt ? `Court secured: ${trimmedCourt}.` : 'Court secured.'
      break
    case 'walk_in':
      base = 'Court plan: Walk-in / no advance booking.'
      break
    case 'self_book_later':
      base = 'Court plan: Host will book it later.'
      break
    case 'needs_help_booking':
      base = 'Court plan: Court needed.'
      break
  }

  return trimmedNote ? `${base} Note: ${trimmedNote}` : base
}

export async function notifyMatchCourtPlanUpdated(
  supabase: Client,
  params: {
    matchId: string
    actorUserId: string
    courtPlanMode: MatchCourtPlanMode
    finalCourtLabel?: string | null
    courtNote?: string | null
  },
): Promise<void> {
  const context = await getMatchCourtNotificationContext(supabase, params.matchId)
  const recipients = context.participantUserIds.filter((userId) => userId !== params.actorUserId)

  await insertNotifications(
    supabase,
    recipients.map((recipientUserId) => ({
      recipient_user_id: recipientUserId,
      kind: 'court_plan_updated',
      match_id: params.matchId,
      actor_user_id: params.actorUserId,
      note: describeCourtPlan(params.courtPlanMode, params.finalCourtLabel, params.courtNote),
    })),
  )
}
