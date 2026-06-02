import type { SupabaseClient } from '@supabase/supabase-js'
import type { Guest, Match, MatchParticipant, Profile } from '@/lib/types/database'

export type Notification = {
  id: string
  recipient_user_id: string
  kind: string
  match_id: string | null
  match_participant_id: string | null
  actor_user_id: string | null
  note: string | null
  created_at: string
  read_at: string | null
}

export type NotificationWithActor = Notification & { actor_name?: string }
export type NotificationParticipantSnapshot = Pick<
  MatchParticipant,
  | 'id'
  | 'match_id'
  | 'join_method'
  | 'participant_accepted_at'
  | 'org_approved_at'
  | 'removed_at'
  | 'removed_by'
  | 'user_id'
  | 'guest_id'
  | 'removal_note'
>
export type NotificationMatchSnapshot = Pick<Match, 'id' | 'required_count' | 'formed_at' | 'status'>
export type NotificationWithContext = NotificationWithActor & {
  participant_snapshot?: NotificationParticipantSnapshot
  participant_display_name?: string
  match_snapshot?: NotificationMatchSnapshot
  match_confirmed_count?: number
}

async function getViewerUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user?.id ?? null
}

function getNotificationParticipantDisplayName(
  participant: NotificationParticipantSnapshot,
  profileMap: Map<string, Pick<Profile, 'id' | 'display_name'>>,
  guestMap: Map<string, Pick<Guest, 'id' | 'display_name'>>,
): string {
  if (participant.guest_id) {
    return guestMap.get(participant.guest_id)?.display_name?.trim() || 'Contact Player'
  }
  if (participant.user_id) {
    return profileMap.get(participant.user_id)?.display_name?.trim() || participant.user_id.slice(0, 8)
  }
  return 'Player'
}

/** Fetch notifications for the current user, newest first. */
export async function getNotifications(
  supabase: SupabaseClient,
  limit = 50
): Promise<NotificationWithContext[]> {
  const viewerUserId = await getViewerUserId(supabase)

  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (viewerUserId) {
    query = query.or(`actor_user_id.is.null,actor_user_id.neq.${viewerUserId},kind.eq.delegate_target_removed`)
  }

  const { data, error } = await query

  if (error) throw error
  const rows = (data || []) as Notification[]

  if (rows.length === 0) return []

  const actorIds = [...new Set(rows.map(r => r.actor_user_id).filter(Boolean))] as string[]
  const participantIds = [...new Set(rows.map(r => r.match_participant_id).filter(Boolean))] as string[]
  const matchIds = [...new Set(rows.map(r => r.match_id).filter(Boolean))] as string[]
  let actorMap = new Map<string, string>()
  let participantMap = new Map<string, NotificationParticipantSnapshot>()
  let participantNameMap = new Map<string, string>()
  let matchMap = new Map<string, NotificationMatchSnapshot>()
  let matchConfirmedCountMap = new Map<string, number>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profile_display')
      .select('id, display_name')
      .in('id', actorIds)
    const profilesList = (profiles || []) as { id: string; display_name: string }[]
    actorMap = new Map(profilesList.map(p => [p.id, p.display_name || p.id.slice(0, 8)]))
  }

  if (participantIds.length > 0) {
    const { data: participants, error: participantsError } = await supabase
      .from('match_participants')
      .select('id, match_id, join_method, participant_accepted_at, org_approved_at, removed_at, removed_by, user_id, guest_id, removal_note')
      .in('id', participantIds)

    if (participantsError) throw participantsError

    const participantList = (participants || []) as NotificationParticipantSnapshot[]
    participantMap = new Map(participantList.map((participant) => [participant.id, participant]))

    const participantUserIds = [...new Set(participantList.map((p) => p.user_id).filter(Boolean))] as string[]
    const participantProfilesRes = participantUserIds.length > 0
      ? await supabase.from('profiles').select('id, display_name').in('id', participantUserIds)
      : { data: [], error: null }

    if (participantProfilesRes.error) throw participantProfilesRes.error

    const participantProfileMap = new Map(
      ((participantProfilesRes.data ?? []) as Array<Pick<Profile, 'id' | 'display_name'>>)
        .map((profile) => [profile.id, profile]),
    )
    participantNameMap = new Map(
      participantList.map((participant) => [
        participant.id,
        getNotificationParticipantDisplayName(participant, participantProfileMap, new Map()),
      ]),
    )

    const participantsByMatch = new Map<string, string[]>()
    for (const participant of participantList) {
      const ids = participantsByMatch.get(participant.match_id) ?? []
      ids.push(participant.id)
      participantsByMatch.set(participant.match_id, ids)
    }

    await Promise.all(
      Array.from(participantsByMatch.entries()).map(async ([matchId, ids]) => {
        try {
          const { data: namesData, error: namesError } = await supabase.rpc('rpc_match_participant_display_names', {
            p_match_id: matchId,
            p_participant_ids: ids,
          })
          if (namesError) return
          for (const row of (namesData ?? []) as { participant_id: string; display_name: string }[]) {
            participantNameMap.set(row.participant_id, row.display_name)
          }
        } catch {
          // Keep the profile/contact fallback when the display-name RPC is unavailable.
        }
      }),
    )
  }

  if (matchIds.length > 0) {
    const [{ data: matches, error: matchesError }, { data: matchParticipants, error: matchParticipantsError }] = await Promise.all([
      supabase
        .from('matches')
        .select('id, required_count, formed_at, status')
        .in('id', matchIds),
      supabase
        .from('match_participants')
        .select('match_id, status, removed_at')
        .in('match_id', matchIds),
    ])

    if (matchesError) throw matchesError
    if (matchParticipantsError) throw matchParticipantsError

    matchMap = new Map(
      ((matches ?? []) as NotificationMatchSnapshot[]).map((match) => [match.id, match]),
    )
    for (const participant of (matchParticipants ?? []) as Array<Pick<MatchParticipant, 'match_id' | 'status' | 'removed_at'>>) {
      if (participant.status !== 'confirmed' || participant.removed_at !== null) continue
      matchConfirmedCountMap.set(
        participant.match_id,
        (matchConfirmedCountMap.get(participant.match_id) ?? 0) + 1,
      )
    }
  }

  return rows.map(r => ({
    ...r,
    actor_name: r.actor_user_id ? actorMap.get(r.actor_user_id) : undefined,
    participant_snapshot: r.match_participant_id ? participantMap.get(r.match_participant_id) : undefined,
    participant_display_name: r.match_participant_id ? participantNameMap.get(r.match_participant_id) : undefined,
    match_snapshot: r.match_id ? matchMap.get(r.match_id) : undefined,
    match_confirmed_count: r.match_id ? matchConfirmedCountMap.get(r.match_id) ?? 0 : undefined,
  }))
}

/** Count unread notifications. */
export async function getUnreadNotificationCount(supabase: SupabaseClient): Promise<number> {
  const viewerUserId = await getViewerUserId(supabase)

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)

  if (viewerUserId) {
    query = query.or(`actor_user_id.is.null,actor_user_id.neq.${viewerUserId},kind.eq.delegate_target_removed`)
  }

  const { count, error } = await query

  if (error) throw error
  return count ?? 0
}

/** Mark a notification as read. */
export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)

  if (error) throw error
}

/** Mark all notifications as read. */
export async function markAllNotificationsRead(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)

  if (error) throw error
}
