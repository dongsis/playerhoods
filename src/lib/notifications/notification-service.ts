import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { CriticalChangeSet } from './notification-policy'

type RpcClient = SupabaseClient<Database> & {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

function asRpcClient(supabase: SupabaseClient<Database>): RpcClient {
  return supabase as unknown as RpcClient
}

async function callRpc<T>(
  supabase: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await asRpcClient(supabase).rpc(fn, args)
  if (error) throw error
  return data as T
}

export const NotificationService = {
  enqueueInviteNotificationIfNeeded(
    supabase: SupabaseClient<Database>,
    participantId: string,
  ): Promise<string | null> {
    return callRpc<string | null>(supabase, 'notification_enqueue_invite_if_needed', {
      p_participant_id: participantId,
    })
  },

  enqueueConfirmedLineupNotificationIfNeeded(
    supabase: SupabaseClient<Database>,
    participantId: string,
  ): Promise<string | null> {
    return callRpc<string | null>(supabase, 'notification_enqueue_confirmed_lineup_if_needed', {
      p_participant_id: participantId,
    })
  },

  enqueueConfirmedLineupNotificationsForMatch(
    supabase: SupabaseClient<Database>,
    matchId: string,
  ): Promise<number> {
    return callRpc<number>(supabase, 'notification_enqueue_confirmed_lineup_notifications_for_match', {
      p_match_id: matchId,
    })
  },

  enqueueCriticalUpdateNotifications(
    supabase: SupabaseClient<Database>,
    matchId: string,
    changeSet: CriticalChangeSet,
  ): Promise<number> {
    return callRpc<number>(supabase, 'notification_enqueue_critical_update_notifications', {
      p_match_id: matchId,
      p_change_set: changeSet,
    })
  },

  enqueueParticipantNotification(
    supabase: SupabaseClient<Database>,
    participantId: string,
    notificationType: 'invite' | 'confirmed_lineup' | 'critical_update' | 'cancellation',
    dedupeKey: string,
    changeSet: CriticalChangeSet = {},
  ): Promise<string | null> {
    return callRpc<string | null>(supabase, 'notification_enqueue_for_participant', {
      p_participant_id: participantId,
      p_notification_type: notificationType,
      p_dedupe_key: dedupeKey,
      p_change_set: changeSet,
    })
  },

  createOrGetSmsReplyCode(
    supabase: SupabaseClient<Database>,
    participantId: string,
    purpose: 'invite' | 'confirmed_lineup' | 'critical_update' = 'invite',
  ): Promise<string | null> {
    return callRpc<string | null>(supabase, 'notification_create_or_get_sms_reply_code', {
      p_participant_id: participantId,
      p_purpose: purpose,
    })
  },

  createOrGetSmsReplyCodeForInvitation(
    supabase: SupabaseClient<Database>,
    invitationId: string,
    purpose: 'invite' | 'confirmed_lineup' | 'critical_update' = 'invite',
  ): Promise<string | null> {
    return callRpc<string | null>(supabase, 'rpc_match_participant_sms_reply_code_for_invitation', {
      p_invitation_id: invitationId,
      p_purpose: purpose,
    })
  },

  maybeAutoFormMatch(supabase: SupabaseClient<Database>, matchId: string): Promise<boolean> {
    return callRpc<boolean>(supabase, 'notification_maybe_auto_form_match', {
      p_match_id: matchId,
    })
  },

  confirmMatchAndNotify(supabase: SupabaseClient<Database>, matchId: string): Promise<number> {
    return callRpc<number>(supabase, 'rpc_match_confirm_and_notify', {
      p_match_id: matchId,
    })
  },
}
