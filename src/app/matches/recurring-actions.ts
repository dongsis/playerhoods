'use server'

import { revalidatePath } from 'next/cache'
import {
  createRecurringMatchSeries,
  type CreateRecurringMatchSeriesInput,
} from '@/lib/api/recurring-matches'
import { drainQueuedNotificationDeliveries } from '@/lib/notifications/workers/process-queued-notification-deliveries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function createRecurringMatchSeriesAction(input: CreateRecurringMatchSeriesInput) {
  const supabase = await createSupabaseServerClient()
  const result = await createRecurringMatchSeries(supabase, input)

  if (result.hasQueuedGuestDeliveries) {
    await drainQueuedNotificationDeliveries(supabase, { batchSize: 10, maxBatches: 5 })
  }

  revalidatePath('/dashboard')
  revalidatePath('/matches')
  revalidatePath(`/recurring-matches/${result.series.id}`)

  return {
    seriesId: result.series.id,
  }
}
