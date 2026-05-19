import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { sendSms } from '@/lib/sms/send'
import { renderInvitationEmail } from '@/lib/notifications/channels/email/render-invitation-email'
import {
  renderCancellationSms,
  renderConfirmedLineupSms,
  renderCriticalUpdateSms,
  renderGameFormedSms,
  renderGuestDelegateConfirmedSms,
  renderGuestParticipantInviteSms,
  renderGuestOrgApprovedSms,
  renderInvitationSms,
  renderMatchInviteSms,
} from '@/lib/notifications/channels/sms/render-notification-sms'
import {
  cancellationEmail,
  confirmedLineupEmail,
  criticalUpdateEmail,
  guestParticipantInviteEmail,
  guestOrgApprovedEmail,
  guestDelegateConfirmedEmail,
  gameFormedEmail,
  playerhoodsMatchInviteEmail,
} from '@/lib/email/templates'
import { formatInvitationToken } from '@/lib/invitations/invitation-token'
import { NotificationService } from '@/lib/notifications/notification-service'

const raw =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
const SITE_URL = raw && raw !== 'undefined' ? raw : 'http://localhost:3000'
const smsRaw = process.env.NEXT_PUBLIC_SMS_SITE_URL ?? raw
const SMS_SITE_URL = smsRaw && smsRaw !== 'undefined' ? smsRaw : SITE_URL

export type DeliveryRow = {
  id: string
  channel: 'email' | 'sms'
  provider: string | null
  destination: string
  payload: Record<string, unknown>
  attempt_count: number
}

function buildMatchInfo(payload: Record<string, unknown>): {
  matchId: string
  gameType: string
  matchDate: string | null
  startTime: string | null
  venueName: string | null
  siteUrl: string
  replyCode: string | null
  magicLinkPath: string | null
  changeSet: Record<string, unknown> | null
} {
  return {
    matchId: (payload.match_id as string) ?? '',
    gameType: (payload.game_type as string) ?? 'Match',
    matchDate: (payload.match_date as string) ?? null,
    startTime: (payload.start_time as string) ?? null,
    venueName: ((payload.venue_name as string) ?? (payload.club_name as string)) ?? null,
    siteUrl: SITE_URL,
    replyCode: (payload.reply_code as string) ?? null,
    magicLinkPath: (payload.magic_link_path as string) ?? null,
    changeSet: (payload.change_set as Record<string, unknown>) ?? null,
  }
}

/** Process queued notification deliveries. Call after invitation create or via cron. */
export async function processQueuedNotificationDeliveries(
  supabase: SupabaseClient,
  limit = 10
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: rows, error } = await supabase.rpc('rpc_get_queued_deliveries', {
    p_limit: limit,
  })
  if (error) throw error

  const deliveries = (rows ?? []) as DeliveryRow[]
  let sent = 0
  let failed = 0

  for (const d of deliveries) {
    const payload = d.payload as Record<string, unknown> & {
      template_type?: string
      invitation_id?: string
      inviter_display_name?: string
      target_email?: string
      match_summary?: { game_type?: string | null; match_date?: string | null; start_time?: string | null; club_name?: string | null }
      nominator_display_name?: string
      match_id?: string
      match_participant_id?: string
      game_type?: string
      match_date?: string
      start_time?: string
      club_name?: string
      venue_name?: string
      reply_code?: string
      magic_link_path?: string
      change_set?: Record<string, unknown>
    }

    let subject = ''
    let html = ''
    let smsBody = ''

    const templateType = payload.template_type ?? (payload.invitation_id ? 'invitation' : 'guest_nominated')

    if (templateType === 'invitation') {
      const ms = payload.match_summary
      const matchSummary = ms
        ? { game_type: ms.game_type ?? null, match_date: ms.match_date ?? null, start_time: ms.start_time ?? null, club_name: ms.club_name ?? null }
        : null
      const inviterDisplayName = (payload.inviter_display_name as string) ?? 'Someone'
      subject = `${inviterDisplayName} invited you to a match`
      const invitationId = (payload.invitation_id as string) ?? ''
      const replyCode =
        d.channel === 'sms' && invitationId
          ? await NotificationService.createOrGetSmsReplyCodeForInvitation(supabase as never, invitationId, 'invite').catch(() => null)
          : null
      html = renderInvitationEmail({
        inviterDisplayName,
        targetEmail: (payload.target_email as string) ?? d.destination,
        invitationId,
        matchSummary,
        siteUrl: SITE_URL,
        unsubscribeUrl: `${SITE_URL}/unsubscribe?invitation=${encodeURIComponent(invitationId)}&channel=email&scope=contact_invites`,
      })
      smsBody = renderInvitationSms({
        inviterDisplayName,
        invitationId,
        matchSummary,
        siteUrl: SMS_SITE_URL,
        unsubscribeUrl: `${SMS_SITE_URL}/stop/${formatInvitationToken(invitationId)}`,
        replyCode,
      })
    } else if (templateType === 'guest_nominated') {
      const m = buildMatchInfo(payload)
      subject = "You're invited to a match"
      html = guestParticipantInviteEmail(m, (payload.nominator_display_name as string) ?? 'Someone')
      smsBody = renderGuestParticipantInviteSms(m, (payload.nominator_display_name as string) ?? 'Someone')
    } else if (templateType === 'guest_org_approved') {
      const m = buildMatchInfo(payload)
      const inviterDisplayName = (payload.nominator_display_name as string) ?? 'Someone'
      subject = `${inviterDisplayName} invited you to a match`
      html = guestOrgApprovedEmail(m, inviterDisplayName)
      smsBody = renderGuestOrgApprovedSms(m, inviterDisplayName)
    } else if (templateType === 'guest_delegate_confirmed') {
      const m = buildMatchInfo(payload)
      subject = "You're confirmed for a match"
      html = guestDelegateConfirmedEmail(m)
      smsBody = renderGuestDelegateConfirmedSms(m)
    } else if (templateType === 'match_formed') {
      const m = buildMatchInfo(payload)
      subject = 'Game formed'
      html = gameFormedEmail(m)
      smsBody = renderGameFormedSms(m)
    } else if (templateType === 'match_invite') {
      const m = buildMatchInfo(payload)
      subject = "You're invited to a PlayerHoods match"
      html = playerhoodsMatchInviteEmail(m)
      smsBody = renderMatchInviteSms(m)
    } else if (templateType === 'confirmed_lineup') {
      const m = buildMatchInfo(payload)
      subject = "Game on - you're confirmed to play"
      html = confirmedLineupEmail(m)
      smsBody = renderConfirmedLineupSms(m)
    } else if (templateType === 'critical_update') {
      const m = buildMatchInfo(payload)
      subject = 'PlayerHoods match update'
      html = criticalUpdateEmail(m)
      smsBody = renderCriticalUpdateSms(m)
    } else if (templateType === 'cancellation') {
      const m = buildMatchInfo(payload)
      subject = 'PlayerHoods match cancelled'
      html = cancellationEmail(m)
      smsBody = renderCancellationSms(m)
    } else {
      continue
    }

    const result =
      d.channel === 'sms'
        ? await sendSms(d.destination, smsBody)
        : await sendEmail(d.destination, subject, html)

    if (result.ok) {
      await supabase.rpc('rpc_update_delivery_result', {
        p_delivery_id: d.id,
        p_status: 'sent',
        p_provider_message_id: result.id ?? null,
      })
      sent++
    } else {
      await supabase.rpc('rpc_update_delivery_result', {
        p_delivery_id: d.id,
        p_status: 'failed',
        p_error_message: result.error,
      })
      failed++
    }
  }

  return { processed: deliveries.length, sent, failed }
}

export async function drainQueuedNotificationDeliveries(
  supabase: SupabaseClient,
  options?: { batchSize?: number; maxBatches?: number },
): Promise<{ processed: number; sent: number; failed: number }> {
  const batchSize = Math.max(1, options?.batchSize ?? 10)
  const maxBatches = Math.max(1, options?.maxBatches ?? 5)
  let processed = 0
  let sent = 0
  let failed = 0

  for (let index = 0; index < maxBatches; index += 1) {
    const result = await processQueuedNotificationDeliveries(supabase, batchSize)
    processed += result.processed
    sent += result.sent
    failed += result.failed

    if (result.processed < batchSize) {
      break
    }
  }

  return { processed, sent, failed }
}
