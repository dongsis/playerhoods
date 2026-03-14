import type { SupabaseClient } from '@supabase/supabase-js'

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

/** Fetch notifications for the current user, newest first. */
export async function getNotifications(
  supabase: SupabaseClient,
  limit = 50
): Promise<NotificationWithActor[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  const rows = (data || []) as Notification[]

  if (rows.length === 0) return []

  const actorIds = [...new Set(rows.map(r => r.actor_user_id).filter(Boolean))] as string[]
  let actorMap = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profile_display')
      .select('id, display_name')
      .in('id', actorIds)
    const profilesList = (profiles || []) as { id: string; display_name: string }[]
    actorMap = new Map(profilesList.map(p => [p.id, p.display_name || p.id.slice(0, 8)]))
  }

  return rows.map(r => ({
    ...r,
    actor_name: r.actor_user_id ? actorMap.get(r.actor_user_id) : undefined,
  }))
}

/** Count unread notifications. */
export async function getUnreadNotificationCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)

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
