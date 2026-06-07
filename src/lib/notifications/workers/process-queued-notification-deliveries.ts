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
  renderHostOfflineConfirmationSms,
  renderInvitationSms,
  renderMatchInviteSms,
  renderMatchReminderSms,
} from '@/lib/notifications/channels/sms/render-notification-sms'
import {
  cancellationEmail,
  confirmedLineupEmail,
  criticalUpdateEmail,
  guestParticipantInviteEmail,
  guestOrgApprovedEmail,
  guestDelegateConfirmedEmail,
  gameFormedEmail,
  hostOfflineConfirmationEmail,
  matchReminderEmail,
  playerhoodsMatchInviteEmail,
  publicMatchSignupVerificationEmail,
} from '@/lib/email/templates'
import { formatInvitationToken } from '@/lib/invitations/invitation-token'
import { NotificationService } from '@/lib/notifications/notification-service'
import { resolvePublicJoinPathForMatch, type PublicJoinIntent } from '@/lib/notifications/public-join-links'
import { getSiteOrigin } from '@/lib/site-url'

function normalizeConfiguredOrigin(value: string | null | undefined): string | null {
  if (!value || value === 'undefined') return null

  try {
    const origin = new URL(value).origin
    const hostname = new URL(origin).hostname.toLowerCase()
    const isProductionBuild = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

    if (isProductionBuild && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      return null
    }

    return origin
  } catch {
    return null
  }
}

const SITE_URL = getSiteOrigin()
const SMS_SITE_URL = normalizeConfiguredOrigin(process.env.NEXT_PUBLIC_SMS_SITE_URL) ?? SITE_URL
const DEFAULT_INVITE_FROM = process.env.EMAIL_INVITE_FROM ?? process.env.EMAIL_FROM ?? 'Playerhoods <invites@send.playerhoods.com>'

export type DeliveryRow = {
  id: string
  channel: 'email' | 'sms'
  provider: string | null
  destination: string
  payload: Record<string, unknown>
  attempt_count: number
}

export type ReminderDrainPreview = {
  dueReminderCandidates: {
    total: number
    byChannel: Array<{ channel: string | null; count: number }>
  }
  queuedReminderDeliveries: {
    total: number
    byChannel: Array<{ channel: string | null; count: number }>
  }
  wouldProcess: {
    total: number
    byNotificationType: Array<{ notificationType: string; channel: string | null; count: number }>
  }
  skippedNonReminderQueuedDeliveries: {
    total: number
    byNotificationType: Array<{ notificationType: string; channel: string | null; count: number }>
  }
}

export type PublicMatchSignupVerificationEmailInput = {
  destination: string
  recipientName: string | null
  publicToken: string
  signupId: string
  verificationToken: string
  matchInfo: {
    matchId: string
    gameType: string
    matchDate: string | null
    startTime: string | null
    venueName: string | null
    siteUrl?: string | null
  }
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
  isFormed: boolean
  recipientName: string | null
  sportName: string | null
  venueTimezone: string | null
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
    isFormed: Boolean(payload.is_formed),
    recipientName: (payload.recipient_name as string) ?? null,
    sportName: (payload.sport_name as string) ?? null,
    venueTimezone: (payload.venue_timezone as string) ?? null,
  }
}

export async function sendPublicMatchSignupVerificationEmail(
  input: PublicMatchSignupVerificationEmailInput,
) {
  const verificationUrl = new URL(`/join/${encodeURIComponent(input.publicToken)}/verify`, SITE_URL)
  verificationUrl.searchParams.set('signup', input.signupId)
  verificationUrl.searchParams.set('verification_token', input.verificationToken)

  return sendEmail(
    input.destination,
    'Verify your email to request a spot',
    publicMatchSignupVerificationEmail(
      {
        matchId: input.matchInfo.matchId,
        gameType: input.matchInfo.gameType,
        matchDate: input.matchInfo.matchDate,
        startTime: input.matchInfo.startTime,
        venueName: input.matchInfo.venueName,
        siteUrl: input.matchInfo.siteUrl || SITE_URL,
      },
      input.recipientName,
      verificationUrl.toString(),
    ),
  )
}

function extractEmailAddress(from: string): string {
  const bracketMatch = from.match(/<([^>]+)>/)
  return (bracketMatch?.[1] ?? from).trim()
}

function sanitizeSenderName(value: string): string {
  return value.replace(/[\r\n"<>]/g, '').trim() || 'Someone'
}

function inviteSenderFrom(organizerName: string): string {
  return `${sanitizeSenderName(organizerName)} via Playerhoods <${extractEmailAddress(DEFAULT_INVITE_FROM)}>`
}

function invitationSubject(organizerName: string, venueName: string | null | undefined): string {
  const name = sanitizeSenderName(organizerName)
  const venue = venueName?.trim()
  return venue ? `${name} invited you to play at ${venue}` : `${name} invited you to play`
}

function emailUnsubscribeHeaders(unsubscribeUrl: string | null | undefined): Record<string, string> | undefined {
  if (!unsubscribeUrl) return undefined
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
  }
}

async function getProfileDisplayName(supabase: SupabaseClient, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  const displayName = (data as { display_name?: string | null } | null)?.display_name?.trim()
  return displayName || null
}

async function getMatchOrganizerName(supabase: SupabaseClient, matchId: string | null | undefined): Promise<string | null> {
  if (!matchId) return null
  const { data: match } = await supabase
    .from('matches')
    .select('organizer_id')
    .eq('id', matchId)
    .maybeSingle()
  const organizerId = (match as { organizer_id?: string | null } | null)?.organizer_id
  return getProfileDisplayName(supabase, organizerId)
}

async function withEmailJoinPath(
  supabase: SupabaseClient,
  matchInfo: ReturnType<typeof buildMatchInfo>,
  intent: PublicJoinIntent,
): Promise<ReturnType<typeof buildMatchInfo>> {
  const joinPath = await resolvePublicJoinPathForMatch(supabase, matchInfo.matchId, intent)
  return joinPath ? { ...matchInfo, magicLinkPath: joinPath } : matchInfo
}

async function resolveEmailJoinUrl(
  supabase: SupabaseClient,
  matchId: string | null | undefined,
  intent: PublicJoinIntent,
): Promise<string | null> {
  const joinPath = await resolvePublicJoinPathForMatch(supabase, matchId, intent)
  return joinPath ? new URL(joinPath, SITE_URL).toString() : null
}

async function enrichInvitationContext(
  supabase: SupabaseClient,
  invitationId: string,
  fallback: {
    inviterDisplayName: string
    recipientName: string | null
    matchId: string | null
    matchSummary: { game_type: string | null; sport_name?: string | null; match_date: string | null; start_time?: string | null; club_name: string | null } | null
  },
): Promise<typeof fallback> {
  if (!invitationId) return fallback

  const { data: invitation } = await supabase
    .from('email_invitations')
    .select('inviter_user_id, target_name, related_type, related_id')
    .eq('id', invitationId)
    .maybeSingle()

  const invitationRow = invitation as {
    inviter_user_id?: string | null
    target_name?: string | null
    related_type?: string | null
    related_id?: string | null
  } | null

  const inviterDisplayName =
    (await getProfileDisplayName(supabase, invitationRow?.inviter_user_id)) ??
    fallback.inviterDisplayName
  const recipientName = invitationRow?.target_name?.trim() || fallback.recipientName

  if (
    fallback.matchSummary?.club_name
    && fallback.matchSummary.match_date
    && fallback.matchSummary.start_time
    && fallback.matchSummary.sport_name
  ) {
    return {
      inviterDisplayName,
      recipientName,
      matchId: invitationRow?.related_type === 'match' ? invitationRow.related_id ?? fallback.matchId : fallback.matchId,
      matchSummary: fallback.matchSummary,
    }
  }

  if (invitationRow?.related_type !== 'match' || !invitationRow.related_id) {
    return { inviterDisplayName, recipientName, matchId: fallback.matchId, matchSummary: fallback.matchSummary }
  }

  const { data: match } = await supabase
    .from('matches')
    .select('game_type, sport_id, match_date, start_time, venue_id')
    .eq('id', invitationRow.related_id)
    .maybeSingle()

  const matchRow = match as {
    game_type?: string | null
    sport_id?: number | null
    match_date?: string | null
    start_time?: string | null
    venue_id?: string | null
  } | null

  let sportName = fallback.matchSummary?.sport_name ?? null
  if (!sportName && matchRow?.sport_id != null) {
    const { data: sport } = await supabase
      .from('sports')
      .select('display_name')
      .eq('id', matchRow.sport_id)
      .maybeSingle()
    sportName = (sport as { display_name?: string | null } | null)?.display_name ?? null
  }

  let venueName = fallback.matchSummary?.club_name ?? null
  if (!venueName && matchRow?.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name')
      .eq('id', matchRow.venue_id)
      .maybeSingle()
    venueName = (venue as { name?: string | null } | null)?.name ?? null
  }

  return {
    inviterDisplayName,
    recipientName,
    matchId: invitationRow.related_id,
    matchSummary: {
      game_type: matchRow?.game_type ?? fallback.matchSummary?.game_type ?? null,
      sport_name: sportName,
      match_date: matchRow?.match_date ?? fallback.matchSummary?.match_date ?? null,
      start_time: matchRow?.start_time ?? fallback.matchSummary?.start_time ?? null,
      club_name: venueName,
    },
  }
}

async function processNotificationDeliveryRows(
  supabase: SupabaseClient,
  deliveries: DeliveryRow[],
): Promise<{ processed: number; sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const d of deliveries) {
    const payload = d.payload as Record<string, unknown> & {
      template_type?: string
      invitation_id?: string
      inviter_display_name?: string
      target_email?: string
      target_name?: string
      recipient_name?: string
      match_summary?: { game_type?: string | null; sport_name?: string | null; match_date?: string | null; start_time?: string | null; club_name?: string | null }
      nominator_display_name?: string
      match_id?: string
      match_participant_id?: string
      game_type?: string
      sport_name?: string
      match_date?: string
      start_time?: string
      club_name?: string
      venue_name?: string
      reply_code?: string
      magic_link_path?: string
      venue_timezone?: string
      change_set?: Record<string, unknown>
      public_token?: string
      signup_id?: string
      verification_token?: string
    }

    let subject = ''
    let html = ''
    let smsBody = ''
    let emailFrom: string | undefined
    let emailHeaders: Record<string, string> | undefined

    const templateType = payload.template_type ?? (payload.invitation_id ? 'invitation' : 'guest_nominated')

    if (templateType === 'invitation') {
      const ms = payload.match_summary
      const fallbackMatchSummary = ms
        ? { game_type: ms.game_type ?? null, sport_name: ms.sport_name ?? null, match_date: ms.match_date ?? null, start_time: ms.start_time ?? null, club_name: ms.club_name ?? null }
        : null
      const invitationId = (payload.invitation_id as string) ?? ''
      const context = await enrichInvitationContext(supabase, invitationId, {
        inviterDisplayName: (payload.inviter_display_name as string) ?? 'Someone',
        recipientName: ((payload.recipient_name as string) ?? (payload.target_name as string) ?? null)?.trim() || null,
        matchId: null,
        matchSummary: fallbackMatchSummary,
      })
      const inviterDisplayName = context.inviterDisplayName
      const recipientName = context.recipientName
      const matchId = context.matchId
      const matchSummary = context.matchSummary
      const unsubscribeUrl = `${SITE_URL}/unsubscribe?invitation=${encodeURIComponent(invitationId)}&channel=email&scope=contact_invites`
      subject = invitationSubject(inviterDisplayName, matchSummary?.club_name)
      emailFrom = inviteSenderFrom(inviterDisplayName)
      emailHeaders = emailUnsubscribeHeaders(unsubscribeUrl)
      const replyCode =
        d.channel === 'sms' && invitationId
          ? await NotificationService.createOrGetSmsReplyCodeForInvitation(supabase as never, invitationId, 'invite').catch(() => null)
          : null
      html = renderInvitationEmail({
        inviterDisplayName,
        targetEmail: (payload.target_email as string) ?? d.destination,
        invitationId,
        responseUrl: d.channel === 'email' ? await resolveEmailJoinUrl(supabase, matchId, 'respond') : null,
        matchSummary,
        siteUrl: SITE_URL,
        unsubscribeUrl,
      })
      smsBody = renderInvitationSms({
        inviterDisplayName,
        recipientName,
        invitationId,
        matchSummary,
        siteUrl: SMS_SITE_URL,
        unsubscribeUrl: `${SMS_SITE_URL}/stop/${formatInvitationToken(invitationId)}`,
        replyCode,
      })
    } else if (templateType === 'guest_nominated') {
      const m = buildMatchInfo(payload)
      subject = "You're invited to a match"
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'respond') : m
      html = guestParticipantInviteEmail(emailMatch, (payload.nominator_display_name as string) ?? 'Someone')
      smsBody = renderGuestParticipantInviteSms(m, (payload.nominator_display_name as string) ?? 'Someone')
    } else if (templateType === 'guest_org_approved') {
      const m = buildMatchInfo(payload)
      const inviterDisplayName = (payload.nominator_display_name as string) ?? 'Someone'
      subject = invitationSubject(inviterDisplayName, m.venueName)
      emailFrom = inviteSenderFrom(inviterDisplayName)
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'respond') : m
      html = guestOrgApprovedEmail(emailMatch, inviterDisplayName)
      smsBody = renderGuestOrgApprovedSms(m, inviterDisplayName)
    } else if (templateType === 'guest_delegate_confirmed') {
      const m = buildMatchInfo(payload)
      subject = "You're confirmed for a match"
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'view') : m
      html = guestDelegateConfirmedEmail(emailMatch)
      smsBody = renderGuestDelegateConfirmedSms(m)
    } else if (templateType === 'match_formed') {
      const m = buildMatchInfo(payload)
      subject = 'Game formed'
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'view') : m
      html = gameFormedEmail(emailMatch)
      smsBody = renderGameFormedSms(m)
    } else if (templateType === 'match_invite') {
      const m = buildMatchInfo(payload)
      const organizerDisplayName = (payload.inviter_display_name as string) ?? (await getMatchOrganizerName(supabase, m.matchId)) ?? 'Someone'
      subject = invitationSubject(organizerDisplayName, m.venueName)
      emailFrom = inviteSenderFrom(organizerDisplayName)
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'respond') : m
      html = playerhoodsMatchInviteEmail(emailMatch, organizerDisplayName)
      smsBody = renderMatchInviteSms(m, organizerDisplayName)
    } else if (templateType === 'confirmed_lineup') {
      const m = buildMatchInfo(payload)
      const organizerDisplayName = (payload.inviter_display_name as string) ?? (await getMatchOrganizerName(supabase, m.matchId)) ?? 'Someone'
      const venue = m.venueName ? sanitizeSenderName(m.venueName) : null
      subject = venue
        ? `Game on: ${sanitizeSenderName(organizerDisplayName)} confirmed your match at ${venue}`
        : `Game on: ${sanitizeSenderName(organizerDisplayName)} confirmed your match`
      emailFrom = inviteSenderFrom(organizerDisplayName)
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'view') : m
      html = confirmedLineupEmail(emailMatch, organizerDisplayName)
      smsBody = renderConfirmedLineupSms(m)
    } else if (templateType === 'match_reminder') {
      const m = buildMatchInfo(payload)
      const organizerDisplayName = (payload.inviter_display_name as string) ?? (await getMatchOrganizerName(supabase, m.matchId)) ?? 'Someone'
      subject = 'Reminder: your PlayerHoods match is coming up'
      emailFrom = inviteSenderFrom(organizerDisplayName)
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'view') : m
      html = matchReminderEmail(emailMatch)
      smsBody = renderMatchReminderSms(m)
    } else if (templateType === 'host_managed_confirmation') {
      const m = buildMatchInfo(payload)
      const organizerDisplayName =
        (payload.organizer_display_name as string)
        ?? (payload.inviter_display_name as string)
        ?? (await getMatchOrganizerName(supabase, m.matchId))
        ?? 'Someone'
      const venue = m.venueName ? sanitizeSenderName(m.venueName) : null
      subject = venue
        ? `${sanitizeSenderName(organizerDisplayName)} added you as confirmed at ${venue}`
        : `${sanitizeSenderName(organizerDisplayName)} added you as confirmed`
      emailFrom = inviteSenderFrom(organizerDisplayName)
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'view') : m
      html = hostOfflineConfirmationEmail(emailMatch, organizerDisplayName)
      smsBody = renderHostOfflineConfirmationSms(m, organizerDisplayName)
    } else if (templateType === 'critical_update') {
      const m = buildMatchInfo(payload)
      subject = 'PlayerHoods match update'
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'review-changes') : m
      html = criticalUpdateEmail(emailMatch)
      smsBody = renderCriticalUpdateSms(m)
    } else if (templateType === 'cancellation') {
      const m = buildMatchInfo(payload)
      subject = 'PlayerHoods match cancelled'
      const emailMatch = d.channel === 'email' ? await withEmailJoinPath(supabase, m, 'view') : m
      html = cancellationEmail(emailMatch)
      smsBody = renderCancellationSms(m)
    } else {
      continue
    }

    const result =
      d.channel === 'sms'
        ? await sendSms(d.destination, smsBody)
        : await sendEmail(d.destination, subject, html, {
            from: emailFrom,
            headers: emailHeaders,
          })

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

/** Process queued notification deliveries. Call after invitation create or via the generic drain route. */
export async function processQueuedNotificationDeliveries(
  supabase: SupabaseClient,
  limit = 10
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: rows, error } = await supabase.rpc('rpc_get_queued_deliveries', {
    p_limit: limit,
  })
  if (error) throw error

  return processNotificationDeliveryRows(supabase, (rows ?? []) as DeliveryRow[])
}

export async function processQueuedConfirmedLineupDeliveriesForMatch(
  supabase: SupabaseClient,
  matchId: string,
  limit = 10,
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: rows, error } = await supabase.rpc(
    'rpc_get_queued_confirmed_lineup_deliveries_for_match',
    {
      p_match_id: matchId,
      p_limit: limit,
    },
  )
  if (error) throw error

  return processNotificationDeliveryRows(supabase, (rows ?? []) as DeliveryRow[])
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

export async function previewReminderDeliveryDrain(
  supabase: SupabaseClient,
  limit = 10,
): Promise<ReminderDrainPreview> {
  const { data, error } = await supabase.rpc('notification_reminder_drain_preview', {
    p_limit: limit,
  })
  if (error) throw error

  return data as ReminderDrainPreview
}

export async function processQueuedReminderDeliveries(
  supabase: SupabaseClient,
  limit = 10,
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: rows, error } = await supabase.rpc('rpc_get_queued_reminder_deliveries', {
    p_limit: limit,
  })
  if (error) throw error

  return processNotificationDeliveryRows(supabase, (rows ?? []) as DeliveryRow[])
}

export async function drainQueuedReminderDeliveries(
  supabase: SupabaseClient,
  options?: { batchSize?: number; maxBatches?: number },
): Promise<{ processed: number; sent: number; failed: number }> {
  const batchSize = Math.max(1, options?.batchSize ?? 10)
  const maxBatches = Math.max(1, options?.maxBatches ?? 5)
  let processed = 0
  let sent = 0
  let failed = 0

  for (let index = 0; index < maxBatches; index += 1) {
    const result = await processQueuedReminderDeliveries(supabase, batchSize)
    processed += result.processed
    sent += result.sent
    failed += result.failed

    if (result.processed < batchSize) {
      break
    }
  }

  return { processed, sent, failed }
}
