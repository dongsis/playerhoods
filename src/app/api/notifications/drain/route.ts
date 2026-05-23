import { NextResponse } from 'next/server'
import { drainQueuedNotificationDeliveries } from '@/lib/notifications/workers/process-queued-notification-deliveries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_DRAIN_SECRET
  const authorization = request.headers.get('authorization')

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = await createSupabaseServerClient()
  const result = await drainQueuedNotificationDeliveries(supabase, {
    batchSize: 10,
    maxBatches: 5,
  })

  return NextResponse.json({ ok: true, ...result })
}
