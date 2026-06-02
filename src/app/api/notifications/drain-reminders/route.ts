import { NextResponse } from 'next/server'
import {
  drainQueuedReminderDeliveries,
  previewReminderDeliveryDrain,
} from '@/lib/notifications/workers/process-queued-notification-deliveries'
import { NotificationService } from '@/lib/notifications/notification-service'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function isDryRun(request: Request): boolean {
  const url = new URL(request.url)
  const value = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run')
  return value === '1' || value === 'true'
}

function isAuthorized(request: Request, secret: string | undefined): boolean {
  const authorization = request.headers.get('authorization')
  return Boolean(secret && authorization === `Bearer ${secret}`)
}

async function handleReminderDrain(request: Request, secret: string | undefined) {
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = await createSupabaseServerClient()
  const dryRun = isDryRun(request)

  if (dryRun) {
    const preview = await previewReminderDeliveryDrain(supabase, 50)
    return NextResponse.json({
      ok: true,
      dryRun: true,
      ...preview,
    })
  }

  const before = await previewReminderDeliveryDrain(supabase, 50)
  const remindersQueued = await NotificationService.enqueueDueMatchReminders(supabase, 50)
  const result = await drainQueuedReminderDeliveries(supabase, {
    batchSize: 10,
    maxBatches: 5,
  })
  const after = await previewReminderDeliveryDrain(supabase, 50)

  return NextResponse.json({
    ok: true,
    dryRun: false,
    remindersQueued,
    ...result,
    before,
    after,
  })
}

export async function POST(request: Request) {
  return handleReminderDrain(request, process.env.NOTIFICATION_DRAIN_SECRET)
}

export async function GET(request: Request) {
  return handleReminderDrain(request, process.env.CRON_SECRET)
}
