import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { renderInvitationEmail } from '@/lib/notifications/channels/email/render-invitation-email'
import {
  guestNominatedEmail,
  guestOrgApprovedEmail,
  guestDelegateConfirmedEmail,
  gameFormedEmail,
} from '@/lib/email/templates'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

export type DeliveryRow = {
  id: string
  destination: string
  payload: Record<string, unknown>
  attempt_count: number
}

function buildMatchInfo(payload: Record<string, unknown>): {
  matchId: string
  gameType: string
  matchDate: string | null
  startTime: string | null
  clubName: string | null
  siteUrl: string
} {
  return {
    matchId: (payload.match_id as string) ?? '',
    gameType: (payload.game_type as string) ?? 'Match',
    matchDate: (payload.match_date as string) ?? null,
    startTime: null,
    clubName: (payload.club_name as string) ?? null,
    siteUrl: SITE_URL,
  }
}

/** Process queued email deliveries. Call after invitation create or via cron. */
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

    let subject: string
    let html: string

    const templateType = payload.template_type ?? (payload.invitation_id ? 'invitation' : 'guest_nominated')

    if (templateType === 'invitation') {
      const ms = payload.match_summary
      const matchSummary = ms
        ? { game_type: ms.game_type ?? null, match_date: ms.match_date ?? null, club_name: ms.club_name ?? null }
        : null
      subject = "You're invited to a match"
      html = renderInvitationEmail({
        inviterDisplayName: (payload.inviter_display_name as string) ?? 'Someone',
        targetEmail: (payload.target_email as string) ?? d.destination,
        invitationId: (payload.invitation_id as string) ?? '',
        matchSummary,
        siteUrl: SITE_URL,
      })
    } else if (templateType === 'guest_nominated') {
      const m = buildMatchInfo(payload)
      subject = "You're nominated for a match"
      html = guestNominatedEmail(m, (payload.nominator_display_name as string) ?? 'Someone')
    } else if (templateType === 'guest_org_approved') {
      const m = buildMatchInfo(payload)
      subject = 'Match approval'
      html = guestOrgApprovedEmail(m)
    } else if (templateType === 'guest_delegate_confirmed') {
      const m = buildMatchInfo(payload)
      subject = "You're confirmed for a match"
      html = guestDelegateConfirmedEmail(m)
    } else if (templateType === 'match_formed') {
      const m = buildMatchInfo(payload)
      subject = 'Game formed'
      html = gameFormedEmail(m)
    } else {
      continue
    }

    const result = await sendEmail(d.destination, subject, html)

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
