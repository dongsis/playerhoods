const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_MESSAGE_SERVICE_SID = process.env.TWILIO_MESSAGE_SERVICE_SID

export type SendSmsResult = { ok: true; id?: string } | { ok: false; error: string }

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_MESSAGE_SERVICE_SID) {
    console.warn('[sms] Twilio env not configured, skipping send')
    return { ok: false, error: 'TWILIO env not configured' }
  }

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          Body: body,
          MessagingServiceSid: TWILIO_MESSAGE_SERVICE_SID,
        }),
      },
    )

    const payload = (await response.json().catch(() => null)) as
      | { sid?: string; message?: string }
      | null

    if (!response.ok) {
      const message = payload?.message ?? `Twilio HTTP ${response.status}`
      console.error('[sms] Twilio error:', message)
      return { ok: false, error: message }
    }

    return { ok: true, id: payload?.sid }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sms] Send failed:', message)
    return { ok: false, error: message }
  }
}
