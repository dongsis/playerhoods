'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { drainQueuedNotificationDeliveries } from '@/lib/notifications/workers/process-queued-notification-deliveries'

/** Run delivery worker for queued notifications. Call after invite/approve/confirm actions. */
export async function processDeliveriesAction() {
  const supabase = await createSupabaseServerClient()
  return drainQueuedNotificationDeliveries(supabase, { batchSize: 10, maxBatches: 5 })
}
