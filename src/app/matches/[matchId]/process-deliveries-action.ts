'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { processQueuedNotificationDeliveries } from '@/lib/notifications/workers/process-queued-notification-deliveries'

/** Run delivery worker for queued emails. Call after nominate/approve/confirm actions. */
export async function processDeliveriesAction() {
  const supabase = await createSupabaseServerClient()
  await processQueuedNotificationDeliveries(supabase, 10)
}
