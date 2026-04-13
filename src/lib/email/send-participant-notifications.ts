/**
 * Send participant notifications by email.
 * Fetches recipients via rpc_match_participant_emails_for_notification.
 * For contact_channel=sms: skip email (SMS to be implemented later).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './send'
import { gameFormedEmail, matchTimeChangePendingEmail, type MatchInfo } from './templates'

export type ParticipantEmailRow = {
  user_id: string
  email: string | null
  contact_channel: string | null
}

/** Fetch participant emails for a match (confirmed users, excl. organizer). */
export async function getParticipantEmails(
  supabase: SupabaseClient,
  matchId: string
): Promise<ParticipantEmailRow[]> {
  const { data, error } = await supabase.rpc('rpc_match_participant_emails_for_notification', {
    p_match_id: matchId,
  })
  if (error) throw error
  return (data ?? []) as ParticipantEmailRow[]
}

function buildMatchInfo(
  match: { id: string; game_type: string | null; match_date: string | null; start_time: string | null },
  venueName: string | null
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

/** Send "match time change pending" emails to all confirmed participants (excl. organizer). */
export async function sendMatchTimeChangeEmails(
  supabase: SupabaseClient,
  match: { id: string; game_type: string | null; match_date: string | null; start_time: string | null },
  venueName: string | null
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  let rows: ParticipantEmailRow[]
  try {
    rows = await getParticipantEmails(supabase, match.id)
  } catch (err) {
    console.error('[email] getParticipantEmails failed:', err)
    throw err
  }

  const m = buildMatchInfo(match, venueName)
  const html = matchTimeChangePendingEmail(m)
  const subject = 'Match time changed — please confirm'

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const r of rows) {
    if (r.contact_channel === 'sms') {
      skipped++
      continue
    }
    const email = r.email?.trim()
    if (!email) {
      skipped++
      continue
    }
    const result = await sendEmail(email, subject, html)
    if (result.ok) sent++
    else errors.push(`${email}: ${result.error}`)
  }

  if (errors.length > 0) console.error('[email] send errors:', errors)

  return { sent, skipped, errors }
}

/** Send "game formed" emails to all confirmed participants (excl. organizer). */
export async function sendGameFormedEmails(
  supabase: SupabaseClient,
  match: { id: string; game_type: string | null; match_date: string | null; start_time: string | null },
  venueName: string | null
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const rows = await getParticipantEmails(supabase, match.id)
  const m = buildMatchInfo(match, venueName)
  const html = gameFormedEmail(m)
  const subject = 'Game formed'

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const r of rows) {
    if (r.contact_channel === 'sms') {
      skipped++
      continue
    }
    const email = r.email?.trim()
    if (!email) {
      skipped++
      continue
    }
    const result = await sendEmail(email, subject, html)
    if (result.ok) sent++
    else errors.push(`${email}: ${result.error}`)
  }

  return { sent, skipped, errors }
}
