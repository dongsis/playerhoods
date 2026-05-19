import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { handleInboundSms } from '@/lib/sms/inbound'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'

function twiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function getPublicRequestUrl(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const url = new URL(request.url)

  if (forwardedProto) url.protocol = `${forwardedProto}:`
  if (forwardedHost) url.host = forwardedHost

  return url.toString()
}

function isValidTwilioSignature(request: Request, form: FormData): boolean {
  if (process.env.TWILIO_VALIDATE_INBOUND_SIGNATURE !== 'true') return true

  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = request.headers.get('x-twilio-signature')
  if (!authToken || !signature) return false

  const url = getPublicRequestUrl(request)
  const params = Array.from(form.entries())
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join('')

  const expected = createHmac('sha1', authToken)
    .update(`${url}${params}`)
    .digest('base64')

  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  let from: string | null = null
  let body: string | null = null

  if (contentType.includes('application/json')) {
    const payload = (await request.json().catch(() => null)) as { From?: string; from?: string; Body?: string; body?: string } | null
    from = payload?.From ?? payload?.from ?? null
    body = payload?.Body ?? payload?.body ?? null
  } else {
    const form = await request.formData()
    if (!isValidTwilioSignature(request, form)) {
      return new NextResponse(twiml('Invalid SMS signature.'), {
        status: 403,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
        },
      })
    }
    from = String(form.get('From') ?? form.get('from') ?? '')
    body = String(form.get('Body') ?? form.get('body') ?? '')
  }

  const supabase = createSupabasePublicServerClient()
  const message = await handleInboundSms(supabase, { from, body })

  return new NextResponse(twiml(message), {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
  })
}
