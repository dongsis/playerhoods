/**
 * Email sending via Resend.
 * Set RESEND_API_KEY in env. Local dev: use Inbucket or Resend test domain.
 */

import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'PlayerHoods <onboarding@resend.dev>'

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string }

/** Send a single email. Returns ok/error. Does not throw. */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options?: { replyTo?: string }
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set, skipping send')
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      ...(options?.replyTo && { reply_to: options.replyTo }),
    })

    if (error) {
      console.error('[email] Resend error:', error)
      return { ok: false, error: error.message }
    }

    return { ok: true, id: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] Send failed:', msg)
    return { ok: false, error: msg }
  }
}
