import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { sendSms } from '@/lib/sms/send'
import { renderInvitationEmail } from '@/lib/notifications/channels/email/render-invitation-email'
import {
  renderGameFormedSms,
  renderGuestDelegateConfirmedSms,
  renderGuestNominatedSms,
  renderGuestOrgApprovedSms,
  renderInvitationSms,
} from '@/lib/notifications/channels/sms/render-notification-sms'
import {
  guestNominatedEmail,
  guestOrgApprovedEmail,
  guestDelegateConfirmedEmail,
  gameFormedEmail,
} from '@/lib/email/templates'

const raw =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
const SITE_URL = raw && raw !== 'undefined' ? raw : 'http://localhost:3000'

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
} {
  return {
    matchId: (payload.match_id as string) ?? '',
    gameType: (payload.game_type as string) ?? 'Match',
    matchDate: (payload.match_date as string) ?? null,
    startTime: null,
    venueName: (payload.club_name as string) ?? null,
    siteUrl: SITE_URL,
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
      match_summary?: { game_type?: string | null; match_date?: string | null; club_name?: string | null }
      nominator_display_name?: string
      match_id?: string
      game_type?: string
      match_date?: string
      club_name?: string
    }

    let subject = ''
    let html = ''
    let smsBody = ''

    const templateType = payload.template_type ?? (payload.invitation_id ? 'invitation' : 'guest_nominated')

    if (templateType === 'invitation') {
      const ms = payload.match_summary
      const matchSummary = ms
        ? { game_type: ms.game_type ?? null, match_date: ms.match_date ?? null, club_name: ms.club_name ?? null }
        : null
      const inviterDisplayName = (payload.inviter_display_name as string) ?? 'Someone'
      subject = `${inviterDisplayName} invited you to a match`
      html = renderInvitationEmail({
        inviterDisplayName,
        targetEmail: (payload.target_email as string) ?? d.destination,
        invitationId: (payload.invitation_id as string) ?? '',
        matchSummary,
        siteUrl: SITE_URL,
      })
      smsBody = renderInvitationSms({
        inviterDisplayName,
        invitationId: (payload.invitation_id as string) ?? '',
        matchSummary,
        siteUrl: SITE_URL,
      })
    } else if (templateType === 'guest_nominated') {
      const m = buildMatchInfo(payload)
      subject = "You're nominated for a match"
      html = guestNominatedEmail(m, (payload.nominator_display_name as string) ?? 'Someone')
      smsBody = renderGuestNominatedSms(m, (payload.nominator_display_name as string) ?? 'Someone')
    } else if (templateType === 'guest_org_approved') {
      const m = buildMatchInfo(payload)
      subject = 'Match approval'
      html = guestOrgApprovedEmail(m)
      smsBody = renderGuestOrgApprovedSms(m)
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
