import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './send'
import { sendSms } from '@/lib/sms/send'
import { renderGameFormedSms, renderMatchRemovedSms, renderMatchTimeChangeSms } from '@/lib/notifications/channels/sms/render-notification-sms'
import { gameFormedEmail, matchRemovedEmail, matchTimeChangePendingEmail, type MatchInfo } from './templates'

export type ParticipantNotificationTarget = {
  participant_id: string | null
  channel: 'email' | 'sms'
  destination: string
}

async function getParticipantNotificationTargets(
  supabase: SupabaseClient,
  matchId: string,
): Promise<ParticipantNotificationTarget[]> {
  const { data, error } = await supabase.rpc('rpc_match_participant_notification_targets', {
    p_match_id: matchId,
  })
  if (error) throw error
  return (data ?? []) as ParticipantNotificationTarget[]
}

async function getConfirmedParticipantNotificationTargets(
  supabase: SupabaseClient,
  matchId: string,
): Promise<ParticipantNotificationTarget[]> {
  const { data, error } = await supabase.rpc('rpc_match_confirmed_participant_notification_targets', {
    p_match_id: matchId,
  })
  if (error) throw error
  return (data ?? []) as ParticipantNotificationTarget[]
}

async function getRemovedParticipantNotificationTargets(
  supabase: SupabaseClient,
  participantId: string,
): Promise<ParticipantNotificationTarget[]> {
  const { data, error } = await supabase.rpc('rpc_match_removed_participant_notification_targets', {
    p_match_participant_id: participantId,
  })
  if (error) throw error
  return (data ?? []) as ParticipantNotificationTarget[]
}

function buildMatchInfo(
  match: { id: string; game_type: string | null; match_date: string | null; start_time: string | null },
  venueName: string | null,
): MatchInfo {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000')
  return {
    matchId: match.id,
    gameType: match.game_type ?? 'Match',
    matchDate: match.match_date,
    startTime: match.start_time,
    venueName,
    siteUrl,
  }
}

async function sendMatchNotificationByChannel(
  targets: ParticipantNotificationTarget[],
  payload: { emailSubject: string; emailHtml: string; smsBody: string },
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const target of targets) {
    const destination = target.destination?.trim()
    if (!destination) {
      skipped++
      continue
    }

    const result =
      target.channel === 'sms'
        ? await sendSms(destination, payload.smsBody)
        : await sendEmail(destination, payload.emailSubject, payload.emailHtml)

    if (result.ok) {
      sent++
    } else {
      errors.push(`${target.channel}:${destination}: ${result.error}`)
    }
  }

  if (errors.length > 0) console.error('[notifications] send errors:', errors)

  return { sent, skipped, errors }
}

export async function sendMatchTimeChangeEmails(
  supabase: SupabaseClient,
  match: { id: string; game_type: string | null; match_date: string | null; start_time: string | null },
  venueName: string | null,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  let targets: ParticipantNotificationTarget[]
  try {
    targets = await getParticipantNotificationTargets(supabase, match.id)
  } catch (error) {
    console.error('[notifications] getParticipantNotificationTargets failed:', error)
    throw error
  }

  const matchInfo = buildMatchInfo(match, venueName)
  return sendMatchNotificationByChannel(targets, {
    emailSubject: 'Match time changed - please confirm',
    emailHtml: matchTimeChangePendingEmail(matchInfo),
    smsBody: renderMatchTimeChangeSms(matchInfo),
  })
}

export async function sendGameFormedEmails(
  supabase: SupabaseClient,
  match: { id: string; game_type: string | null; match_date: string | null; start_time: string | null },
  venueName: string | null,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const targets = await getConfirmedParticipantNotificationTargets(supabase, match.id)
  const matchInfo = buildMatchInfo(match, venueName)
  return sendMatchNotificationByChannel(targets, {
    emailSubject: 'Game formed',
    emailHtml: gameFormedEmail(matchInfo),
    smsBody: renderGameFormedSms(matchInfo),
  })
}

export async function sendParticipantRemovedNotification(
  supabase: SupabaseClient,
  participantId: string,
  match: { id: string; game_type: string | null; match_date: string | null; start_time: string | null },
  venueName: string | null,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const targets = await getRemovedParticipantNotificationTargets(supabase, participantId)
  const matchInfo = buildMatchInfo(match, venueName)
  return sendMatchNotificationByChannel(targets, {
    emailSubject: 'Removed from match',
    emailHtml: matchRemovedEmail(matchInfo),
    smsBody: renderMatchRemovedSms(matchInfo),
  })
}
