'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getStatusPath, markPublicParticipantOut } from '@/lib/public-participant-status'

function getPublicStatusOutErrorCode(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (message.includes('match_not_active')) return 'match-not-active'
  if (message.includes('cannot_out_organizer')) return 'cannot-out-organizer'
  return 'out-failed'
}

export async function markStatusTokenOutAction(statusToken: string): Promise<void> {
  let params: Record<string, string> = { notice: 'out' }

  try {
    await markPublicParticipantOut(statusToken)
    revalidatePath(`/status/${encodeURIComponent(statusToken)}`)
  } catch (error) {
    console.error('[public-status] out failed', {
      safe_error_code: getPublicStatusOutErrorCode(error),
      has_error: true,
    })
    params = { error: getPublicStatusOutErrorCode(error) }
  }

  redirect(getStatusPath(statusToken, params))
}
