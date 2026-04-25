import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { Resend } from 'resend'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(workspaceRoot, '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'PlayerHoods <onboarding@resend.dev>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

if (!RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY in .env.local')
}

const resend = new Resend(RESEND_API_KEY)

function getArg(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.find((arg) => arg.startsWith(prefix))
  if (!value) return fallback
  return value.slice(prefix.length)
}

const batchSize = Math.max(1, Number.parseInt(getArg('batch-size', '10'), 10) || 10)
const maxBatches = Math.max(1, Number.parseInt(getArg('max-batches', '5'), 10) || 5)

async function callRpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`${name} failed: ${response.status} ${await response.text()}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function buildMatchSummaryText(payload) {
  const source = payload.match_summary ?? payload
  const gameType = source?.game_type ?? 'match'
  const matchDate = source?.match_date ?? 'TBD'
  const clubName = source?.club_name ?? 'TBD venue'
  return `${gameType} on ${matchDate} at ${clubName}`
}

function buildEmail(delivery) {
  const payload = delivery.payload ?? {}
  const templateType = payload.template_type ?? (payload.invitation_id ? 'invitation' : 'guest_nominated')
  const inviterName = payload.inviter_display_name ?? payload.nominator_display_name ?? 'Someone'
  const summaryText = buildMatchSummaryText(payload)

  switch (templateType) {
    case 'invitation': {
      const invitationId = payload.invitation_id ?? ''
      return {
        subject: `${inviterName} invited you to a match`,
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <h2 style="margin-bottom: 12px;">You're invited to a PlayerHoods match</h2>
            <p><strong>${inviterName}</strong> invited you to ${summaryText}.</p>
            <p style="margin: 20px 0;">
              <a href="${SITE_URL}/invitations/${invitationId}" style="display:inline-block;background:#1e293b;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;">Open invitation</a>
            </p>
            <p style="color:#64748b;font-size:12px;">If the button does not work, open ${SITE_URL}/invitations/${invitationId}</p>
          </div>
        `,
      }
    }
    case 'guest_nominated':
      return {
        subject: "You're nominated for a match",
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <h2 style="margin-bottom: 12px;">You're nominated for a match</h2>
            <p><strong>${inviterName}</strong> nominated you for ${summaryText}.</p>
            <p>Open PlayerHoods to review the invitation.</p>
          </div>
        `,
      }
    case 'guest_org_approved':
      return {
        subject: 'Match approval',
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <h2 style="margin-bottom: 12px;">Your match spot was approved</h2>
            <p>Your invitation for ${summaryText} has been approved.</p>
          </div>
        `,
      }
    case 'guest_delegate_confirmed':
      return {
        subject: "You're confirmed for a match",
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <h2 style="margin-bottom: 12px;">You're confirmed for a match</h2>
            <p>Your spot for ${summaryText} is now confirmed.</p>
          </div>
        `,
      }
    case 'match_formed':
      return {
        subject: 'Game formed',
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <h2 style="margin-bottom: 12px;">Your game is formed</h2>
            <p>${summaryText} is now formed.</p>
          </div>
        `,
      }
    default:
      return {
        subject: 'PlayerHoods update',
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
            <h2 style="margin-bottom: 12px;">PlayerHoods update</h2>
            <p>You have a new update in PlayerHoods.</p>
          </div>
        `,
      }
  }
}

async function processDelivery(delivery) {
  const { subject, html } = buildEmail(delivery)

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: delivery.destination,
      subject,
      html,
    })

    if (result.error) {
      await callRpc('rpc_update_delivery_result', {
        p_delivery_id: delivery.id,
        p_status: 'failed',
        p_error_message: result.error.message,
      })
      return { status: 'failed', destination: delivery.destination, error: result.error.message }
    }

    await callRpc('rpc_update_delivery_result', {
      p_delivery_id: delivery.id,
      p_status: 'sent',
      p_provider_message_id: result.data?.id ?? null,
    })
    return { status: 'sent', destination: delivery.destination }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await callRpc('rpc_update_delivery_result', {
      p_delivery_id: delivery.id,
      p_status: 'failed',
      p_error_message: message,
    })
    return { status: 'failed', destination: delivery.destination, error: message }
  }
}

async function main() {
  let totalProcessed = 0
  let totalSent = 0
  let totalFailed = 0

  for (let index = 0; index < maxBatches; index += 1) {
    const deliveries = await callRpc('rpc_get_queued_deliveries', { p_limit: batchSize })
    if (!Array.isArray(deliveries) || deliveries.length === 0) break

    for (const delivery of deliveries) {
      const result = await processDelivery(delivery)
      totalProcessed += 1
      if (result.status === 'sent') {
        totalSent += 1
        console.log(`sent ${result.destination}`)
      } else {
        totalFailed += 1
        console.log(`failed ${result.destination}: ${result.error}`)
      }
    }

    if (deliveries.length < batchSize) break
  }

  console.log(`processed=${totalProcessed} sent=${totalSent} failed=${totalFailed}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
